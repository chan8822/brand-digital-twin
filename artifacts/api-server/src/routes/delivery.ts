import { Router, type IRouter, type Request, type Response } from "express";
import { db, deliveryEventsTable, ordersTable, ridersTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";

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
  res.json({ ok: true });
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
  res.json({ ok: true, rider });
});

export default router;
