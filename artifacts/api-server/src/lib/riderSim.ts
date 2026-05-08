import { db, ordersTable, ridersTable, deliveryEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { emitRiderPosition, emitDeliveryEta, emitDeliveryEvent } from "./realtime";
import { logger } from "./logger";

const KITCHEN = { lat: 12.9716, lng: 77.5946 } as const;

const TICK_MS = 2000;
const AVG_SPEED_KMH = 28;
const STEPS_TO_DESTINATION = 30;

interface Sim {
  orderId: number;
  riderId: number;
  start: { lat: number; lng: number };
  dest: { lat: number; lng: number };
  step: number;
  timer: NodeJS.Timeout;
}

const active = new Map<number, Sim>();

// Cache resolved destinations per order so recordRiderPosition (called both
// from the simulator tick and from external rider position updates) doesn't
// hit the DB on every tick.
const destCache = new Map<number, { lat: number; lng: number }>();

function syntheticDestinationFor(orderId: number): { lat: number; lng: number } {
  const seed = (orderId * 9301 + 49297) % 233280;
  const r1 = (seed / 233280 - 0.5) * 0.04;
  const r2 = (((seed * 7) % 233280) / 233280 - 0.5) * 0.04;
  return { lat: KITCHEN.lat + r1, lng: KITCHEN.lng + r2 };
}

async function destinationFor(orderId: number): Promise<{ lat: number; lng: number }> {
  const cached = destCache.get(orderId);
  if (cached) return cached;
  try {
    const [row] = await db
      .select({ dropLat: ordersTable.dropLat, dropLng: ordersTable.dropLng })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (
      row &&
      typeof row.dropLat === "number" &&
      typeof row.dropLng === "number" &&
      !Number.isNaN(row.dropLat) &&
      !Number.isNaN(row.dropLng)
    ) {
      const dest = { lat: row.dropLat, lng: row.dropLng };
      destCache.set(orderId, dest);
      return dest;
    }
  } catch (err) {
    logger.warn({ err, orderId }, "could not load order drop coords; using synthetic destination");
  }
  const fallback = syntheticDestinationFor(orderId);
  destCache.set(orderId, fallback);
  return fallback;
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function recordRiderPosition(
  riderId: number,
  lat: number,
  lng: number,
  orderId?: number,
): Promise<void> {
  await db.update(ridersTable).set({ lat, lng }).where(eq(ridersTable.id, riderId));
  emitRiderPosition(riderId, { lat, lng, orderId });
  if (orderId) {
    const dest = await destinationFor(orderId);
    const meters = haversineMeters({ lat, lng }, dest);
    const etaMs = (meters / 1000 / AVG_SPEED_KMH) * 3600 * 1000;
    const etaAt = new Date(Date.now() + etaMs).toISOString();
    emitDeliveryEta(orderId, { etaAt, distanceMeters: Math.round(meters) });
  }
}

export function stopSimulation(orderId: number): void {
  const sim = active.get(orderId);
  if (!sim) return;
  clearInterval(sim.timer);
  active.delete(orderId);
  destCache.delete(orderId);
  logger.info({ orderId }, "rider simulation stopped");
}

export function startSimulation(orderId: number, riderId: number): void {
  if (active.has(orderId)) return;
  // Reserve the slot synchronously so concurrent callers don't double-start.
  const start = { ...KITCHEN };
  const sim: Sim = {
    orderId,
    riderId,
    start,
    // Provisional destination — replaced once the real drop coords resolve.
    dest: syntheticDestinationFor(orderId),
    step: 0,
    timer: setInterval(() => void tick(orderId), TICK_MS),
  };
  active.set(orderId, sim);
  void destinationFor(orderId).then((dest) => {
    const current = active.get(orderId);
    if (current) current.dest = dest;
    logger.info({ orderId, riderId, dest }, "rider simulation started");
  });
  void recordRiderPosition(riderId, start.lat, start.lng, orderId);
}

async function tick(orderId: number): Promise<void> {
  const sim = active.get(orderId);
  if (!sim) return;
  sim.step += 1;
  const t = Math.min(1, sim.step / STEPS_TO_DESTINATION);
  const lat = sim.start.lat + (sim.dest.lat - sim.start.lat) * t;
  const lng = sim.start.lng + (sim.dest.lng - sim.start.lng) * t;
  try {
    await recordRiderPosition(sim.riderId, lat, lng, orderId);
  } catch (err) {
    logger.error({ err, orderId }, "rider simulation tick failed");
  }
  if (t >= 1) {
    stopSimulation(orderId);
    try {
      await db
        .insert(deliveryEventsTable)
        .values({ orderId, riderId: sim.riderId, event: "rider_at_customer" });
      emitDeliveryEvent(orderId, { event: "rider_at_customer", riderId: sim.riderId });
    } catch (err) {
      logger.error({ err, orderId }, "failed to record arrival event");
    }
  }
}

export async function resumeActiveSimulations(): Promise<void> {
  try {
    const orders = await db
      .select({ id: ordersTable.id, riderId: ordersTable.riderId, status: ordersTable.status })
      .from(ordersTable);
    for (const o of orders) {
      if (!o.riderId) continue;
      if (o.status === "rider_assigned" || o.status === "ready" || o.status === "out_for_delivery") {
        startSimulation(o.id, o.riderId);
      }
    }
  } catch (err) {
    logger.warn({ err }, "could not resume rider simulations on boot");
  }
}
