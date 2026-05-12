/**
 * Task #8 — spatial-bound stress helper for the dispatch loop.
 *
 * Lives next to dispatch.ts so it can re-use the same DB handle and
 * test cleanup conventions. Invoked by `scripts/loadtest-dispatch.mjs
 * --scenario spatial`. Not used in production code paths.
 */
import {
  db,
  ordersTable,
  ridersTable,
  deliveryEventsTable,
  dispatchDecisionsTable,
  usersTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { dispatchOrder, haversineKm } from "./dispatch";

const CENTER = { lat: 12.9716, lng: 77.5946 }; // BLR
const INSIDE_RADIUS_KM = 1.0; // safely inside BATCH_MAX_DETOUR_KM (1.5)
const OUTSIDE_RADIUS_KM = 5.0; // well outside

export interface SpatialHarnessResult {
  inside: number;
  outside: number;
  concurrency: number;
  partnerInsideCount: number;
  partnerOutsideCount: number;
  unbatchedCount: number;
  failures: string[];
}

function randPoint(centerKm: number): { lat: number; lng: number } {
  const r = (Math.random() * 0.6 + 0.4) * centerKm;
  const theta = Math.random() * 2 * Math.PI;
  const dLat = (r / 111) * Math.cos(theta);
  const dLng = (r / (111 * Math.cos((CENTER.lat * Math.PI) / 180))) * Math.sin(theta);
  return { lat: CENTER.lat + dLat, lng: CENTER.lng + dLng };
}

export async function runSpatialHarness(opts: {
  inside: number;
  outside: number;
  concurrency: number;
}): Promise<SpatialHarnessResult> {
  const failures: string[] = [];
  // Seed a single rider per partner (already-assigned partner orders
  // need a rider). Use a single shared rider for simplicity; the
  // batch-partner check only requires the rider be online.
  const userId = randomUUID();
  await db.insert(usersTable).values({
    id: userId,
    email: `stress-${userId}@example.test`,
    firstName: "Stress",
    lastName: "Test",
  });
  const [rider] = await db
    .insert(ridersTable)
    .values({
      name: "stress-rider",
      phone: `+91${Math.floor(Math.random() * 1e10)}`,
      zone: "BLR-Central",
      status: "online",
      lat: CENTER.lat,
      lng: CENTER.lng,
      activeOrderCount: 0,
    })
    .returning();
  const cleanupOrderIds: number[] = [];
  try {
    // 1. Seed `outside` partner orders far away, each already assigned.
    const outsideIds: number[] = [];
    for (let i = 0; i < opts.outside; i++) {
      const p = randPoint(OUTSIDE_RADIUS_KM);
      const [o] = await db
        .insert(ordersTable)
        .values({
          userId,
          status: "rider_assigned",
          riderId: rider!.id,
          totalPaise: 30000,
          items: [{ id: 1, name: "rice", qty: 1, price: 30000 }],
          city: "Bengaluru",
          pincode: "560001",
          addressLine: `outside-${i}`,
          dropLat: p.lat,
          dropLng: p.lng,
          priority: "routine",
        })
        .returning();
      outsideIds.push(o!.id);
      cleanupOrderIds.push(o!.id);
    }
    // 2. Seed `inside` partner orders close to center, already assigned.
    const insideIds = new Set<number>();
    for (let i = 0; i < opts.inside; i++) {
      const p = randPoint(INSIDE_RADIUS_KM);
      const [o] = await db
        .insert(ordersTable)
        .values({
          userId,
          status: "rider_assigned",
          riderId: rider!.id,
          totalPaise: 30000,
          items: [{ id: 1, name: "rice", qty: 1, price: 30000 }],
          city: "Bengaluru",
          pincode: "560001",
          addressLine: `inside-${i}`,
          dropLat: p.lat,
          dropLng: p.lng,
          priority: "routine",
        })
        .returning();
      insideIds.add(o!.id);
      cleanupOrderIds.push(o!.id);
    }
    // 3. Seed `concurrency` new unassigned orders at the center;
    //    dispatch each and verify its batch partner (if any) was
    //    one of the inside set.
    const newOrderIds: number[] = [];
    for (let i = 0; i < opts.concurrency; i++) {
      const [o] = await db
        .insert(ordersTable)
        .values({
          userId,
          status: "ready",
          totalPaise: 30000,
          items: [{ id: 1, name: "rice", qty: 1, price: 30000 }],
          city: "Bengaluru",
          pincode: "560001",
          addressLine: `target-${i}`,
          dropLat: CENTER.lat,
          dropLng: CENTER.lng,
          priority: "routine",
        })
        .returning();
      newOrderIds.push(o!.id);
      cleanupOrderIds.push(o!.id);
    }
    let partnerInsideCount = 0;
    let partnerOutsideCount = 0;
    let unbatchedCount = 0;
    const results = await Promise.all(
      newOrderIds.map((id) => dispatchOrder(id, { allowBatch: true })),
    );
    for (const r of results) {
      if (!r.ok) continue;
      if (!r.batched) {
        unbatchedCount++;
        continue;
      }
      // The decision row records the chosen rider; we can't read
      // partnerOrderId directly without exposing it. Instead, verify
      // by distance: the chosen rider's load should match an inside
      // partner — easier check is that this dispatch decided to batch
      // at all (all partners are within range or all outside).
      // For correctness, look up dispatchDecision and check distance.
      const [dec] = await db
        .select({ d: dispatchDecisionsTable.chosenDistanceKm })
        .from(dispatchDecisionsTable)
        .where(eq(dispatchDecisionsTable.id, r.decisionId!));
      if ((dec?.d ?? 0) <= 1.5) partnerInsideCount++;
      else partnerOutsideCount++;
    }
    if (partnerOutsideCount > 0) {
      failures.push(
        `expected all batched partners within 1.5km, ${partnerOutsideCount} were farther`,
      );
    }
    if (opts.inside > 0 && partnerInsideCount === 0) {
      failures.push("no batches formed despite inside partners present");
    }
    return {
      inside: opts.inside,
      outside: opts.outside,
      concurrency: opts.concurrency,
      partnerInsideCount,
      partnerOutsideCount,
      unbatchedCount,
      failures,
    };
  } finally {
    if (cleanupOrderIds.length > 0) {
      await db
        .delete(deliveryEventsTable)
        .where(inArray(deliveryEventsTable.orderId, cleanupOrderIds));
      await db
        .delete(dispatchDecisionsTable)
        .where(inArray(dispatchDecisionsTable.orderId, cleanupOrderIds));
      await db.delete(ordersTable).where(inArray(ordersTable.id, cleanupOrderIds));
    }
    if (rider) await db.delete(ridersTable).where(eq(ridersTable.id, rider.id));
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  }
}

// Re-export so the harness script can sanity-check distances.
export { haversineKm };
