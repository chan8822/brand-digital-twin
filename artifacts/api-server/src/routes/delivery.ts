import { Router, type IRouter, type Request, type Response } from "express";
import { db, deliveryEventsTable, ordersTable, ridersTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { emitDeliveryEvent } from "../lib/realtime";
import { scheduleOrderAdvance } from "../lib/queue";
import {
  estimateEtaForCart,
  getDeliveryEta,
  recordActualDelivery,
  etaAccuracyByZone,
  maybeRecordDeliveredFromEvent,
} from "../lib/etaModel";
import {
  dispatchOrder,
  dispatchReadyOrders,
  dispatchComparison,
  recentDispatchDecisions,
  setOrderPriority,
} from "../lib/dispatch";
import { isOpsRequest } from "../lib/adminGate";
import { recordRiderPosition, startSimulation, stopSimulation } from "../lib/riderSim";

const router: IRouter = Router();

router.get("/delivery/:orderId/timeline", async (req: Request, res: Response) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) {
    res.status(400).json({ error: "invalid orderId" });
    return;
  }
  const events = await db
    .select()
    .from(deliveryEventsTable)
    .where(eq(deliveryEventsTable.orderId, orderId))
    .orderBy(asc(deliveryEventsTable.createdAt));
  res.json(events);
});

const eventBody = z.object({
  orderId: z.number().int().positive(),
  riderId: z.number().int().positive().optional(),
  event: z.string().min(1).max(64),
  meta: z.record(z.string(), z.unknown()).optional(),
});

router.post("/delivery/events", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = eventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const { orderId, riderId, event, meta } = parsed.data;
  await db.insert(deliveryEventsTable).values({ orderId, riderId, event, meta });
  emitDeliveryEvent(orderId, { event, riderId, meta });
  await maybeRecordDeliveredFromEvent(orderId, event);
  if (event === "delivered" || event === "delivery_failed") {
    stopSimulation(orderId);
  }
  res.json({ ok: true });
});

const riderPositionBody = z.object({
  riderId: z.number().int().positive(),
  orderId: z.number().int().positive().optional(),
  lat: z.number(),
  lng: z.number(),
});

router.post("/delivery/rider-position", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = riderPositionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const { riderId, orderId, lat, lng } = parsed.data;
  await recordRiderPosition(riderId, lat, lng, orderId);
  res.json({ ok: true });
});

const advanceBody = z.object({
  orderId: z.number().int().positive(),
  step: z.enum(["preparing", "ready", "out_for_delivery", "delivered"]),
  delayMs: z.number().int().nonnegative().max(60 * 60 * 1000).default(0),
});

router.post("/delivery/schedule-advance", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = advanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const { orderId, step, delayMs } = parsed.data;
  const queued = await scheduleOrderAdvance(orderId, step, delayMs);
  // Without Redis the queue is disabled; for the delivered step we still need
  // to auto-log nutrition so the wellness dashboard stays in sync.
  if (!queued && step === "delivered") {
    try {
      const { autoLogDeliveredOrder } = await import("../lib/wellnessAutoLog");
      await autoLogDeliveredOrder(orderId);
    } catch (err) {
      req.log.error({ err, orderId }, "wellness auto-log fallback failed");
    }
  }
  res.json({ ok: true, queued });
});

const autoAssignBody = z.object({ orderId: z.number().int().positive() });

router.post("/delivery/auto-assign", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = autoAssignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const { orderId } = parsed.data;
  const existing = await db
    .select({ riderId: ordersTable.riderId })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (existing[0]?.riderId) {
    startSimulation(orderId, existing[0].riderId);
    res.json({ ok: true, alreadyAssigned: true, riderId: existing[0].riderId });
    return;
  }
  const candidates = await db
    .select()
    .from(ridersTable)
    .where(eq(ridersTable.status, "online"))
    .orderBy(asc(ridersTable.activeOrderCount), sql`${ridersTable.rating} desc`)
    .limit(1);
  const rider = candidates[0];
  if (!rider) {
    res.status(409).json({ error: "no riders available" });
    return;
  }
  await db.update(ordersTable).set({ riderId: rider.id, status: "rider_assigned" }).where(eq(ordersTable.id, orderId));
  await db
    .update(ridersTable)
    .set({ activeOrderCount: sql`${ridersTable.activeOrderCount} + 1` })
    .where(eq(ridersTable.id, rider.id));
  await db.insert(deliveryEventsTable).values({
    orderId,
    riderId: rider.id,
    event: "rider_assigned",
    meta: { strategy: "auto", riderName: rider.name },
  });
  emitDeliveryEvent(orderId, { event: "rider_assigned", riderId: rider.id, riderName: rider.name });
  startSimulation(orderId, rider.id);
  res.json({ ok: true, rider });
});

// ─── Dynamic ETA model ─────────────────────────────────────────────────────

const estimateBody = z.object({
  items: z
    .array(z.object({ id: z.number().int().positive(), qty: z.number().int().positive() }))
    .default([]),
  address: z
    .object({
      city: z.string().nullable().optional(),
      pincode: z.string().nullable().optional(),
      line: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

router.post("/delivery/eta/estimate", async (req: Request, res: Response) => {
  const parsed = estimateBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const out = await estimateEtaForCart({
    items: parsed.data.items,
    address: parsed.data.address ?? null,
  });
  res.json(out);
});

router.get("/delivery/eta/:orderId", async (req: Request, res: Response) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) {
    res.status(400).json({ error: "invalid orderId" });
    return;
  }
  const out = await getDeliveryEta(orderId);
  if (!out) {
    res.status(404).json({ error: "order not found" });
    return;
  }
  res.json(out);
});

const recordActualBody = z.object({
  orderId: z.number().int().positive(),
  deliveredAt: z.string().datetime().optional(),
});

router.post("/delivery/eta/record-actual", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = recordActualBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const out = await recordActualDelivery(
    parsed.data.orderId,
    parsed.data.deliveredAt ? new Date(parsed.data.deliveredAt) : new Date(),
  );
  if (!out) {
    res.status(404).json({ error: "order not found or no predictions" });
    return;
  }
  res.json({ ok: true, ...out });
});

function resolveOps(req: Request): boolean {
  return isOpsRequest(req).allowed;
}

// ─── Smart dispatch & batching ─────────────────────────────────────────────

const dispatchBody = z.object({
  orderId: z.number().int().positive(),
  allowBatch: z.boolean().optional(),
  notes: z.string().max(256).optional(),
});

router.post("/delivery/dispatch", async (req: Request, res: Response) => {
  if (!resolveOps(req)) {
    res.status(403).json({ error: "ops scope required" });
    return;
  }
  const parsed = dispatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const result = await dispatchOrder(parsed.data.orderId, {
    operatorId: req.user?.id ?? "ops_token",
    allowBatch: parsed.data.allowBatch ?? true,
    notes: parsed.data.notes ?? null,
  });
  if (!result.ok) {
    res.status(409).json(result);
    return;
  }
  res.json(result);
});

const riderAvailabilityBody = z.object({
  riderId: z.number().int().positive(),
  status: z.enum(["online", "offline", "break"]),
});

// Rider availability event — flips a rider's status and, on transition to
// online, kicks off smart dispatch for any unassigned ready orders so the
// new rider immediately picks up backlog.
router.post(
  "/delivery/rider/availability",
  async (req: Request, res: Response) => {
    const parsed = riderAvailabilityBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    if (!resolveOps(req)) {
      res.status(403).json({ error: "ops scope required" });
      return;
    }
    const { riderId, status } = parsed.data;
    const [prev] = await db
      .select({ status: ridersTable.status })
      .from(ridersTable)
      .where(eq(ridersTable.id, riderId))
      .limit(1);
    if (!prev) {
      res.status(404).json({ error: "rider not found" });
      return;
    }
    await db
      .update(ridersTable)
      .set({ status })
      .where(eq(ridersTable.id, riderId));
    let dispatched: Awaited<ReturnType<typeof dispatchReadyOrders>> | null =
      null;
    if (prev.status !== "online" && status === "online") {
      try {
        dispatched = await dispatchReadyOrders({
          operatorId: req.user?.id ?? null,
        });
      } catch (err) {
        req.log.error(
          { err, riderId },
          "auto-dispatch on rider online failed",
        );
      }
    }
    res.json({ ok: true, previous: prev.status, status, dispatched });
  },
);

router.post("/delivery/dispatch/run", async (req: Request, res: Response) => {
  if (!resolveOps(req)) {
    res.status(403).json({ error: "ops scope required" });
    return;
  }
  const out = await dispatchReadyOrders({
    operatorId: req.user?.id ?? null,
  });
  res.json(out);
});

// NOTE: POST /delivery/dispatch/override is now served by the dedicated
// `manualOverride` router mounted at the app level (see app.ts) so the
// clinical override path doesn't share sibling middleware with the rest
// of /delivery. The handler kept here would shadow that mount, so it
// has been removed. The schema/import are kept for the route below if
// needed in future, but currently this aggregate router does not own
// the override endpoint.

router.get(
  "/delivery/dispatch/decisions",
  async (req: Request, res: Response) => {
    if (!resolveOps(req)) {
      res.status(403).json({ error: "ops scope required" });
      return;
    }
    const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
    const rows = await recentDispatchDecisions(limit);
    res.json({ rows });
  },
);

router.get(
  "/delivery/dispatch/comparison",
  async (req: Request, res: Response) => {
    if (!resolveOps(req)) {
      res.status(403).json({ error: "ops scope required" });
      return;
    }
    const sinceDays = parseInt(String(req.query.sinceDays ?? "14"), 10) || 14;
    const rows = await dispatchComparison({ sinceDays });
    res.json({ rows, sinceDays });
  },
);

// Staff-only priority promotion / demotion. Body: `{ priority: 'stat' |
// 'urgent' | 'routine', reason?: string }`. The audit row + dispatcher
// preemption are handled in `setOrderPriority`.
const priorityBody = z.object({
  priority: z.enum(["routine", "urgent", "stat"]),
  reason: z.string().max(256).optional(),
});

router.post(
  "/delivery/orders/:orderId/priority",
  async (req: Request, res: Response) => {
    if (!resolveOps(req)) {
      res.status(403).json({ error: "ops scope required" });
      return;
    }
    const orderId = Number(req.params.orderId);
    if (!Number.isFinite(orderId)) {
      res.status(400).json({ error: "invalid orderId" });
      return;
    }
    const parsed = priorityBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const out = await setOrderPriority({
      orderId,
      priority: parsed.data.priority,
      operatorId: req.user?.id ?? "ops_token",
      reason: parsed.data.reason,
    });
    if (!out.ok) {
      res.status(404).json(out);
      return;
    }
    res.json(out);
  },
);

router.get("/delivery/eta/accuracy/by-zone", async (req: Request, res: Response) => {
  if (!resolveOps(req)) {
    res.status(403).json({ error: "ops scope required" });
    return;
  }
  const sinceDays = parseInt(String(req.query.sinceDays ?? "14"), 10) || 14;
  const zone = typeof req.query.zone === "string" ? req.query.zone : undefined;
  const rows = await etaAccuracyByZone({ sinceDays, zone });
  res.json({ rows, sinceDays });
});

export default router;
