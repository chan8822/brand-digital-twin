import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  deliverySlotsTable,
  pickupLocationsTable,
  packagingReturnsTable,
  addressInstructionsTable,
  ordersTable,
  slotReservationsTable,
  subscriptionsTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { issueCredit } from "../lib/loyaltyEngine";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return req.user.id;
}

function resolveOps(req: Request): boolean {
  const adminToken = process.env["RD_ADMIN_TOKEN"];
  const headerToken = req.header("x-admin-token");
  if (adminToken && headerToken && headerToken === adminToken) return true;
  const allowlist = (process.env["OPS_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (req.isAuthenticated() && allowlist.includes(req.user.id)) return true;
  return false;
}

// ─── Seeding (idempotent, runs lazily on first read) ────────────────────────

let slotsSeeded = false;
async function ensureSlots(zone = "default"): Promise<void> {
  if (slotsSeeded) return;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deliverySlotsTable);
  if (Number(n) > 0) {
    slotsSeeded = true;
    return;
  }
  // Seed the next 7 days × 4 windows at 12:00 / 13:30 / 19:00 / 20:30 IST.
  const windows: Array<[number, number]> = [
    [12, 0],
    [13, 30],
    [19, 0],
    [20, 30],
  ];
  const rows: Array<typeof deliverySlotsTable.$inferInsert> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let d = 0; d < 7; d++) {
    const day = new Date(today);
    day.setDate(today.getDate() + d);
    const dateStr = day.toISOString().slice(0, 10);
    for (const [h, m] of windows) {
      const start = new Date(day);
      start.setHours(h, m, 0, 0);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + 60);
      rows.push({
        slotDate: dateStr,
        startsAt: start,
        endsAt: end,
        zone,
        capacity: 25,
        reservedCount: 0,
      });
    }
  }
  await db.insert(deliverySlotsTable).values(rows).onConflictDoNothing();
  slotsSeeded = true;
}

let pickupSeeded = false;
async function ensurePickupLocations(): Promise<void> {
  if (pickupSeeded) return;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pickupLocationsTable);
  if (Number(n) > 0) {
    pickupSeeded = true;
    return;
  }
  await db
    .insert(pickupLocationsTable)
    .values([
      {
        name: "Tanmatra Café — Koramangala",
        partnerName: "Tanmatra",
        addressLine: "1st Block, 80 Feet Road",
        city: "Bengaluru",
        pincode: "560034",
        lat: 12.9352,
        lng: 77.6245,
        hours: "10:00 — 22:00",
        discountPaise: 4000,
      },
      {
        name: "Bloom Bakery — Indiranagar",
        partnerName: "Bloom",
        addressLine: "12th Main, HAL 2nd Stage",
        city: "Bengaluru",
        pincode: "560008",
        lat: 12.9719,
        lng: 77.6412,
        hours: "08:00 — 21:00",
        discountPaise: 3500,
      },
      {
        name: "Atlas Coffee — MG Road",
        partnerName: "Atlas",
        addressLine: "Brigade Road Junction",
        city: "Bengaluru",
        pincode: "560001",
        lat: 12.9745,
        lng: 77.6093,
        hours: "07:30 — 22:00",
        discountPaise: 3000,
      },
      {
        name: "Greenleaf Kitchen — HSR Layout",
        partnerName: "Greenleaf",
        addressLine: "27th Main, Sector 1",
        city: "Bengaluru",
        pincode: "560102",
        lat: 12.9116,
        lng: 77.6473,
        hours: "11:00 — 22:30",
        discountPaise: 3000,
      },
    ])
    .onConflictDoNothing();
  pickupSeeded = true;
}

// ─── Delivery slots ────────────────────────────────────────────────────────

router.get("/delivery/slots", async (req: Request, res: Response) => {
  await ensureSlots();
  const zone =
    typeof req.query.zone === "string" && req.query.zone.length > 0
      ? req.query.zone
      : "default";
  const fromDate =
    typeof req.query.from === "string" ? req.query.from : undefined;
  const toDate = typeof req.query.to === "string" ? req.query.to : undefined;
  const now = new Date();

  let q = db
    .select()
    .from(deliverySlotsTable)
    .where(
      and(
        eq(deliverySlotsTable.zone, zone),
        gte(deliverySlotsTable.endsAt, now),
        ...(fromDate ? [gte(deliverySlotsTable.slotDate, fromDate)] : []),
        ...(toDate ? [lte(deliverySlotsTable.slotDate, toDate)] : []),
      ),
    )
    .orderBy(asc(deliverySlotsTable.startsAt))
    .limit(100);
  const rows = await q;
  res.json({
    slots: rows.map((r) => ({
      id: r.id,
      slotDate: r.slotDate,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      zone: r.zone,
      capacity: r.capacity,
      reservedCount: r.reservedCount,
      remaining: Math.max(0, r.capacity - r.reservedCount),
      full: r.reservedCount >= r.capacity,
    })),
  });
});

// ─── Pickup locations ──────────────────────────────────────────────────────

router.get("/delivery/pickup-locations", async (req: Request, res: Response) => {
  await ensurePickupLocations();
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));
  const rows = await db
    .select()
    .from(pickupLocationsTable)
    .where(eq(pickupLocationsTable.active, true))
    .limit(50);
  // Cheap haversine; if no coords supplied, return as-is.
  const scored = rows.map((r) => {
    let distanceKm: number | null = null;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const toRad = (d: number) => (d * Math.PI) / 180;
      const R = 6371;
      const dLat = toRad(r.lat - lat);
      const dLng = toRad(r.lng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) *
          Math.cos(toRad(r.lat)) *
          Math.sin(dLng / 2) ** 2;
      distanceKm = 2 * R * Math.asin(Math.sqrt(a));
    }
    return { ...r, distanceKm };
  });
  scored.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });
  res.json({
    locations: scored.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      partnerName: r.partnerName,
      addressLine: r.addressLine,
      city: r.city,
      pincode: r.pincode,
      lat: r.lat,
      lng: r.lng,
      hours: r.hours,
      discountPaise: r.discountPaise,
      distanceKm: r.distanceKm,
    })),
  });
});

// ─── Packaging returns ─────────────────────────────────────────────────────

router.get("/packaging-returns", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db
    .select()
    .from(packagingReturnsTable)
    .where(eq(packagingReturnsTable.userId, userId))
    .orderBy(desc(packagingReturnsTable.createdAt))
    .limit(50);
  res.json({ returns: rows });
});

const confirmReturnBody = z.object({
  orderId: z.number().int().positive().optional(),
  packagingReturnId: z.number().int().positive().optional(),
});

// Marks a packaging return as returned + credited. Allowed for the order
// owner (self-confirm via app QR scan) or for ops (rider-side confirmation
// at the door). Idempotent: a credited row is left untouched.
router.post(
  "/packaging-returns/confirm",
  async (req: Request, res: Response) => {
    const parsed = confirmReturnBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    if (!parsed.data.orderId && !parsed.data.packagingReturnId) {
      res.status(400).json({ error: "orderId or packagingReturnId required" });
      return;
    }
    const isOps = resolveOps(req);
    const userId = req.isAuthenticated() ? req.user.id : null;
    if (!isOps && !userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const where = parsed.data.packagingReturnId
      ? eq(packagingReturnsTable.id, parsed.data.packagingReturnId)
      : eq(packagingReturnsTable.orderId, parsed.data.orderId!);
    const [row] = await db
      .select()
      .from(packagingReturnsTable)
      .where(where)
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "packaging return not found" });
      return;
    }
    if (!isOps && row.userId !== userId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (row.status === "credited") {
      res.json({ ok: true, alreadyCredited: true, packagingReturn: row });
      return;
    }
    // Customers can only self-confirm AFTER the order is delivered. Ops
    // (rider scan / kitchen review) can confirm at any point.
    if (!isOps) {
      const [order] = await db
        .select({ status: ordersTable.status })
        .from(ordersTable)
        .where(eq(ordersTable.id, row.orderId))
        .limit(1);
      if (!order || order.status !== "delivered") {
        res
          .status(409)
          .json({ error: "order not yet delivered" });
        return;
      }
    }
    // Race-safe state transition: only the request that actually flips
    // status from non-"credited" to "credited" gets to issue credit.
    // Concurrent confirms see zero rows updated and short-circuit.
    const now = new Date();
    const flipped = await db
      .update(packagingReturnsTable)
      .set({ status: "credited", returnedAt: now, creditedAt: now })
      .where(
        and(
          eq(packagingReturnsTable.id, row.id),
          sql`${packagingReturnsTable.status} <> 'credited'`,
        ),
      )
      .returning();
    if (flipped.length === 0) {
      const [latest] = await db
        .select()
        .from(packagingReturnsTable)
        .where(eq(packagingReturnsTable.id, row.id))
        .limit(1);
      res.json({ ok: true, alreadyCredited: true, packagingReturn: latest });
      return;
    }
    const updated = flipped[0];
    await issueCredit({
      userId: updated.userId,
      deltaPaise: updated.creditPaise,
      reason: "manual_grant",
      refType: "packaging_return",
      refId: String(updated.id),
      note: `Eco-packaging return for order #${updated.orderId}`,
    });
    res.json({ ok: true, packagingReturn: updated });
  },
);

// ─── Per-address rider instructions ────────────────────────────────────────

router.get("/addresses/instructions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db
    .select()
    .from(addressInstructionsTable)
    .where(eq(addressInstructionsTable.userId, userId))
    .limit(50);
  res.json({
    instructions: rows.map((r) => ({
      addressLabel: r.addressLabel,
      instructions: r.instructions,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
});

const upsertInstructionsBody = z.object({
  addressLabel: z.string().min(1).max(128),
  instructions: z.string().max(512),
});

router.put("/addresses/instructions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = upsertInstructionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const { addressLabel, instructions } = parsed.data;
  const [row] = await db
    .insert(addressInstructionsTable)
    .values({ userId, addressLabel, instructions })
    .onConflictDoUpdate({
      target: [
        addressInstructionsTable.userId,
        addressInstructionsTable.addressLabel,
      ],
      set: { instructions, updatedAt: new Date() },
    })
    .returning();
  res.json({
    instructions: {
      addressLabel: row.addressLabel,
      instructions: row.instructions,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
});

// ─── Subscription preferred slot ───────────────────────────────────────────

const subscriptionSlotBody = z.object({
  subscriptionId: z.number().int().positive(),
  slotId: z.number().int().positive().nullable(),
});

router.put(
  "/subscriptions/preferred-slot",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const parsed = subscriptionSlotBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const { subscriptionId, slotId } = parsed.data;
    try {
      const result = await db.transaction(async (tx) => {
        // Lock the subscription row first to serialize concurrent updates.
        const [sub] = await tx
          .select()
          .from(subscriptionsTable)
          .where(
            and(
              eq(subscriptionsTable.id, subscriptionId),
              eq(subscriptionsTable.userId, userId),
            ),
          )
          .for("update")
          .limit(1);
        if (!sub) throw new Error("subscription not found");
        const previousSlotId = sub.preferredSlotId ?? null;
        if (previousSlotId === slotId) return sub;

        // Release the previous slot's seat (if any) — find the existing
        // subscription reservation and drop it, then decrement the slot.
        if (previousSlotId != null) {
          const removed = await tx
            .delete(slotReservationsTable)
            .where(eq(slotReservationsTable.subscriptionId, subscriptionId))
            .returning({ id: slotReservationsTable.id });
          if (removed.length > 0) {
            await tx
              .update(deliverySlotsTable)
              .set({
                reservedCount: sql`greatest(${deliverySlotsTable.reservedCount} - 1, 0)`,
              })
              .where(eq(deliverySlotsTable.id, previousSlotId));
          }
        }

        // Acquire the new slot atomically with capacity guard. If the slot
        // is full we bail and the subscription's preferred slot stays
        // whatever the previous value was (the transaction rolls back).
        if (slotId != null) {
          const reserved = await tx
            .update(deliverySlotsTable)
            .set({ reservedCount: sql`${deliverySlotsTable.reservedCount} + 1` })
            .where(
              and(
                eq(deliverySlotsTable.id, slotId),
                sql`${deliverySlotsTable.reservedCount} < ${deliverySlotsTable.capacity}`,
              ),
            )
            .returning({ id: deliverySlotsTable.id });
          if (reserved.length === 0) throw new Error("delivery slot full");
          await tx.insert(slotReservationsTable).values({
            slotId,
            userId,
            subscriptionId,
            kind: "subscription",
          });
        }

        const [updated] = await tx
          .update(subscriptionsTable)
          .set({ preferredSlotId: slotId })
          .where(eq(subscriptionsTable.id, subscriptionId))
          .returning();
        return updated;
      });
      res.json({ subscription: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "subscription not found") {
        res.status(404).json({ error: msg });
        return;
      }
      if (msg === "delivery slot full") {
        res.status(409).json({ error: msg });
        return;
      }
      req.log.error({ err }, "preferred slot update failed");
      res.status(500).json({ error: "preferred slot update failed" });
    }
  },
);

// Atomic slot reservation. Returns false if the slot is full so the caller
// can prompt the user to pick another window.
export async function reserveSlot(args: {
  slotId: number;
  userId?: string | null;
  orderId?: number | null;
}): Promise<boolean> {
  const result = await db
    .update(deliverySlotsTable)
    .set({ reservedCount: sql`${deliverySlotsTable.reservedCount} + 1` })
    .where(
      and(
        eq(deliverySlotsTable.id, args.slotId),
        sql`${deliverySlotsTable.reservedCount} < ${deliverySlotsTable.capacity}`,
      ),
    )
    .returning({ id: deliverySlotsTable.id });
  if (result.length === 0) return false;
  await db.insert(slotReservationsTable).values({
    slotId: args.slotId,
    userId: args.userId ?? null,
    orderId: args.orderId ?? null,
    kind: "order",
  });
  return true;
}

export default router;
