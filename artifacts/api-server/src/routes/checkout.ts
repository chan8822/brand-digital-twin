import { Router, type IRouter, type Request, type Response } from "express";
import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { makeBatchDishResolver } from "../lib/menuResolver";

const router: IRouter = Router();

const placeOrderSchema = z.object({
  externalOrderId: z.string().min(1).max(64),
  items: z
    .array(
      z.object({
        dishId: z.number().int().positive(),
        qty: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(50),
  phone: z.string().min(7).max(20),
  address: z.object({
    label: z.string().max(64).optional(),
    line1: z.string().min(1).max(256),
    line2: z.string().max(256).optional(),
    city: z.string().min(1).max(64),
    pincode: z.string().min(4).max(16),
  }),
});

/**
 * POST /orders
 *
 * Guest checkout — no auth required. Creates a new order with server-side
 * price computation and returns a stable ETA. The client-supplied
 * `externalOrderId` acts as the idempotency key.
 */
router.post("/orders", async (req: Request, res: Response) => {
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }

  const { externalOrderId, items, phone, address } = parsed.data;

  let resolver: Awaited<ReturnType<typeof makeBatchDishResolver>>;
  try {
    resolver = await makeBatchDishResolver();
  } catch (err) {
    req.log.error({ err }, "menuResolver unavailable at checkout");
    res.status(503).json({ error: "menu unavailable, try again" });
    return;
  }

  // Validate every item and build the server-authoritative cart.
  const validatedItems: Array<{ id: number; name: string; qty: number; price: number }> = [];
  for (const item of items) {
    const dish = resolver.byId(item.dishId);
    if (!dish) {
      res.status(422).json({ error: `unknown dish: ${item.dishId}` });
      return;
    }
    if (!dish.isAvailable) {
      res.status(422).json({ error: `dish unavailable: ${dish.name}`, code: "dish_unavailable" });
      return;
    }
    validatedItems.push({ id: dish.id, name: dish.name, qty: item.qty, price: dish.price });
  }

  // Server-side price computation.
  const subtotalPaise = validatedItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const gst = Math.round((subtotalPaise * 500) / 10000);
  const deliveryFee = subtotalPaise >= 50000 ? 0 : 5000;
  const totalPaise = subtotalPaise + gst + deliveryFee;

  let row: { id: number };
  try {
    const inserted = await db
      .insert(ordersTable)
      .values({
        userId: null,
        externalOrderId,
        status: "placed",
        totalPaise,
        addressLabel: address.label ?? "Delivery address",
        addressLine: [address.line1, address.line2].filter(Boolean).join(", "),
        city: address.city,
        pincode: address.pincode,
        phone,
        items: validatedItems,
        fulfillmentType: "delivery",
      })
      .returning({ id: ordersTable.id });
    row = inserted[0]!;
  } catch (err) {
    // Postgres unique-constraint violation: duplicate externalOrderId for
    // the same userId (null for guests). PG error code 23505.
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("23505") || msg.includes("uniq_orders_user_external")) {
      res.status(409).json({ error: "duplicate order id", code: "duplicate_order" });
      return;
    }
    req.log.error({ err, externalOrderId }, "order insert failed");
    res.status(500).json({ error: "order creation failed" });
    return;
  }

  req.log.info({ externalOrderId, serverOrderId: row.id, totalPaise }, "guest order placed");

  res.status(201).json({
    orderId: externalOrderId,
    serverOrderId: row.id,
    status: "placed",
    etaMinutes: 25,
    totalPaise,
  });
});

/**
 * GET /orders/:externalOrderId/status
 *
 * No auth. Guests can poll their own order by the idempotency key they
 * generated at checkout. ETA counts down from the 25-minute SLA window.
 */
router.get("/orders/:externalOrderId/status", async (req: Request, res: Response) => {
  const externalOrderId = String(req.params.externalOrderId ?? "").trim();
  if (!externalOrderId) {
    res.status(400).json({ error: "missing order id" });
    return;
  }

  const rows = await db
    .select({ status: ordersTable.status, createdAt: ordersTable.createdAt })
    .from(ordersTable)
    .where(eq(ordersTable.externalOrderId, externalOrderId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "order not found" });
    return;
  }

  const etaMinutes = Math.max(
    0,
    25 - Math.floor((Date.now() - row.createdAt.getTime()) / 60000),
  );

  res.json({ orderId: externalOrderId, status: row.status, etaMinutes });
});

export default router;
