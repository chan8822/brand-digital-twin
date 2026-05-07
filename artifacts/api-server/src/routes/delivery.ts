import { Router, type IRouter, type Request, type Response } from "express";
import { db, deliveryEventsTable, ordersTable, ridersTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { emitDeliveryEvent, emitRiderPosition } from "../lib/realtime";
import { scheduleOrderAdvance } from "../lib/queue";

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
  await db.update(ridersTable).set({ lat, lng }).where(eq(ridersTable.id, riderId));
  emitRiderPosition(riderId, { lat, lng, orderId });
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
  res.json({ ok: true, rider });
});

export default router;
