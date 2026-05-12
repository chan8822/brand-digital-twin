import {
  db,
  ordersTable,
  ridersTable,
  etaPredictionsTable,
  deliveryEventsTable,
} from "@workspace/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { etaBreaker } from "./circuitBreaker";

// Test/admin hook: a synchronous slow-path injector. When set, the
// next gatherFeatures() call sleeps for `ETA_INJECT_DELAY_MS` before
// hitting the DB. Used by the dispatch latency stress harness and
// breaker tests to simulate a degraded ETA model without mocking
// network code. Defaults to 0 (no delay) in production.
const INJECT_DELAY_MS = Number(process.env["ETA_INJECT_DELAY_MS"] ?? 0);

export const ETA_MODEL_VERSION = "v1-heuristic";
export const STATIC_FALLBACK_MINUTES = 25;

export interface EtaAddress {
  city?: string | null;
  pincode?: string | null;
  line?: string | null;
}

export interface EtaCartItem {
  id: number;
  qty: number;
}

export interface EtaFeatures {
  zone: string;
  itemCount: number;
  distanceKm: number;
  kitchenQueueDepth: number;
  ridersOnline: number;
  ridersAvailable: number;
  hourOfDay: number;
  rushHourBumpMin: number;
  weatherBumpMin: number;
  modelVersion: string;
}

export interface EtaResult {
  etaMinutes: number;
  etaAt: string;
  zone: string;
  source: "model" | "static";
  modelVersion: string;
  features?: EtaFeatures;
  reason?: string;
  dropLat?: number | null;
  dropLng?: number | null;
}

const ACTIVE_STATUSES = [
  "placed",
  "preparing",
  "ready",
  "rider_assigned",
  "out_for_delivery",
];

const PINCODE_ZONE_PREFIX: Record<string, string> = {
  "560": "BLR-Central",
  "110": "DEL-Central",
  "400": "MUM-Central",
  "600": "CHE-Central",
  "700": "KOL-Central",
};

const CITY_ZONE: Record<string, string> = {
  bengaluru: "BLR-Central",
  bangalore: "BLR-Central",
  delhi: "DEL-Central",
  mumbai: "MUM-Central",
  chennai: "CHE-Central",
  kolkata: "KOL-Central",
};

export function zoneForAddress(addr: EtaAddress | null | undefined): string {
  if (!addr) return "default";
  const pin = (addr.pincode ?? "").trim();
  if (pin.length >= 3) {
    const z = PINCODE_ZONE_PREFIX[pin.slice(0, 3)];
    if (z) return z;
  }
  const city = (addr.city ?? "").trim().toLowerCase();
  if (city && CITY_ZONE[city]) return CITY_ZONE[city];
  return "default";
}

// Deterministic pseudo-distance (km) from pincode/address — keeps predictions
// stable across calls without a real geocoder. ~3km median, capped 1.5–9.
export function pseudoDistanceKm(addr: EtaAddress | null | undefined): number {
  const seed = `${addr?.pincode ?? ""}|${addr?.line ?? ""}|${addr?.city ?? ""}`;
  if (!seed.trim()) return 4;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const km = 1.5 + (h % 750) / 100; // 1.5..9.0
  return Math.round(km * 10) / 10;
}

function rushHourBump(d: Date): number {
  const h = d.getHours();
  if ((h >= 12 && h < 14) || (h >= 19 && h < 22)) return 5;
  if ((h >= 11 && h < 12) || (h >= 18 && h < 19)) return 2;
  return 0;
}

function weatherBump(): number {
  const env = process.env["ETA_WEATHER_BUMP_MIN"];
  if (!env) return 0;
  const n = Number(env);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function kitchenQueueDepth(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(inArray(ordersTable.status, ACTIVE_STATUSES));
  return row?.n ?? 0;
}

async function riderAvailability(zone: string): Promise<{
  online: number;
  available: number;
}> {
  const rows = await db
    .select({
      status: ridersTable.status,
      activeOrderCount: ridersTable.activeOrderCount,
      zone: ridersTable.zone,
    })
    .from(ridersTable);
  const inZone = rows.filter((r) => zone === "default" || r.zone === zone);
  const pool = inZone.length > 0 ? inZone : rows;
  const online = pool.filter((r) => r.status === "online").length;
  const available = pool.filter(
    (r) => r.status === "online" && r.activeOrderCount === 0,
  ).length;
  return { online, available };
}

export async function gatherFeatures(args: {
  address: EtaAddress | null;
  items: EtaCartItem[];
  now?: Date;
}): Promise<EtaFeatures> {
  if (INJECT_DELAY_MS > 0) {
    await new Promise((r) => setTimeout(r, INJECT_DELAY_MS));
  }
  const now = args.now ?? new Date();
  const zone = zoneForAddress(args.address);
  const distanceKm = pseudoDistanceKm(args.address);
  const itemCount = args.items.reduce((t, i) => t + (i.qty || 0), 0);
  const [queue, riders] = await Promise.all([
    kitchenQueueDepth(),
    riderAvailability(zone),
  ]);
  return {
    zone,
    itemCount,
    distanceKm,
    kitchenQueueDepth: queue,
    ridersOnline: riders.online,
    ridersAvailable: riders.available,
    hourOfDay: now.getHours(),
    rushHourBumpMin: rushHourBump(now),
    weatherBumpMin: weatherBump(),
    modelVersion: ETA_MODEL_VERSION,
  };
}

// Transparent linear baseline. Designed so a learned regressor with the same
// feature vector can swap in later without touching call sites.
export function predictMinutes(f: EtaFeatures): number {
  const PREP_BASE = 12;
  const PER_ITEM = 1.5;
  const QUEUE_FACTOR = 0.4;
  const RIDER_DEFICIT_PENALTY = 3;
  const DISTANCE_MIN_PER_KM = 3; // ~20km/h city avg
  const HANDOFF_BUFFER = 2;

  const prep = PREP_BASE + PER_ITEM * Math.max(0, f.itemCount);
  const queue = QUEUE_FACTOR * Math.max(0, f.kitchenQueueDepth);
  const riderPenalty = f.ridersAvailable === 0 ? RIDER_DEFICIT_PENALTY : 0;
  const transit = DISTANCE_MIN_PER_KM * Math.max(0.5, f.distanceKm);
  const total =
    prep +
    queue +
    riderPenalty +
    transit +
    HANDOFF_BUFFER +
    f.rushHourBumpMin +
    f.weatherBumpMin;
  return Math.round(total);
}

function isModelEnabled(): boolean {
  return (process.env["ETA_MODEL_ENABLED"] ?? "true").toLowerCase() !== "false";
}

function staticFallback(reason: string): EtaResult {
  const minutes = STATIC_FALLBACK_MINUTES;
  return {
    etaMinutes: minutes,
    etaAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    zone: "default",
    source: "static",
    modelVersion: ETA_MODEL_VERSION,
    reason,
  };
}

export async function estimateEtaForCart(args: {
  address: EtaAddress | null;
  items: EtaCartItem[];
}): Promise<EtaResult> {
  if (!isModelEnabled()) return staticFallback("model disabled");
  // Task #8 — circuit breaker. The dispatch loop calls into ETA on
  // every decision; a single slow probe must not stall the loop.
  // Breaker timeouts/errors return the deterministic distance-based
  // fallback so callers never block past the breaker timeout.
  const result = await etaBreaker.call<EtaResult>(
    async () => {
      const f = await gatherFeatures({
        address: args.address,
        items: args.items,
      });
      const minutes = predictMinutes(f);
      return {
        etaMinutes: minutes,
        etaAt: new Date(Date.now() + minutes * 60_000).toISOString(),
        zone: f.zone,
        source: "model",
        modelVersion: ETA_MODEL_VERSION,
        features: f,
      };
    },
    () => deterministicFallback(args.address, args.items),
  );
  if (result.source === "fallback" && result.reason) {
    logger.warn(
      { reason: result.reason, breakerState: result.state },
      "estimateEtaForCart used breaker fallback",
    );
  }
  return result.value;
}

// Distance-based fallback. Pure function of inputs (no DB reads),
// so it cannot itself be slow. Mirrors `predictMinutes` shape but
// uses only static pricing terms — operators can still trust the
// number even when the model is degraded.
function deterministicFallback(
  address: EtaAddress | null,
  items: EtaCartItem[],
): EtaResult {
  const zone = zoneForAddress(address);
  const distanceKm = pseudoDistanceKm(address);
  const itemCount = items.reduce((t, i) => t + (i.qty || 0), 0);
  const minutes = Math.round(15 + 1.2 * itemCount + 3 * distanceKm);
  return {
    etaMinutes: minutes,
    etaAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    zone,
    source: "static",
    modelVersion: ETA_MODEL_VERSION,
    reason: "breaker fallback",
  };
}

export async function getDeliveryEta(orderId: number): Promise<EtaResult | null> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!order) return null;
  const dropCoords = {
    dropLat: typeof order.dropLat === "number" ? order.dropLat : null,
    dropLng: typeof order.dropLng === "number" ? order.dropLng : null,
  };
  if (!isModelEnabled()) return { ...staticFallback("model disabled"), ...dropCoords };
  // Cache reuse runs OUTSIDE the breaker so a tripped breaker still
  // serves the most-recent prediction (<2 min old) — polling clients
  // see a stable ETA during a model outage instead of jumping between
  // the cached number and the deterministic fallback.
  const [latest] = await db
    .select()
    .from(etaPredictionsTable)
    .where(eq(etaPredictionsTable.orderId, orderId))
    .orderBy(desc(etaPredictionsTable.createdAt))
    .limit(1);
  if (
    latest &&
    Date.now() - new Date(latest.createdAt).getTime() < 2 * 60_000
  ) {
    return {
      etaMinutes: Math.round(latest.predictedMinutes),
      etaAt: new Date(latest.predictedEtaAt).toISOString(),
      zone: latest.zone,
      source: "model",
      modelVersion: latest.modelVersion,
      ...dropCoords,
    };
  }
  const result = await etaBreaker.call<EtaResult>(
    async () => predictAndPersist(order),
    () => ({
      ...deterministicFallback(
        { city: order.city, pincode: order.pincode, line: order.addressLine },
        (order.items ?? []).map((it) => ({ id: it.id, qty: it.qty })),
      ),
      ...dropCoords,
    }),
  );
  if (result.source === "fallback" && result.reason) {
    logger.warn(
      { orderId, reason: result.reason, breakerState: result.state },
      "getDeliveryEta used breaker fallback",
    );
  }
  return result.value;
}

// Heavy path inside the breaker: gather features (DB) + predict +
// insert. This is what slows when the model degrades.
async function predictAndPersist(
  order: typeof ordersTable.$inferSelect,
): Promise<EtaResult> {
  const orderId = order.id;
  const dropCoords = {
    dropLat: typeof order.dropLat === "number" ? order.dropLat : null,
    dropLng: typeof order.dropLng === "number" ? order.dropLng : null,
  };
  const f = await gatherFeatures({
    address: { city: order.city, pincode: order.pincode, line: order.addressLine },
    items: (order.items ?? []).map((it) => ({ id: it.id, qty: it.qty })),
  });
  const minutes = predictMinutes(f);
  const etaAt = new Date(Date.now() + minutes * 60_000);
  await db.insert(etaPredictionsTable).values({
    orderId,
    zone: f.zone,
    modelVersion: ETA_MODEL_VERSION,
    predictedMinutes: minutes,
    predictedEtaAt: etaAt,
    features: f as unknown as Record<string, number | string>,
  });
  return {
    etaMinutes: minutes,
    etaAt: etaAt.toISOString(),
    zone: f.zone,
    source: "model",
    modelVersion: ETA_MODEL_VERSION,
    features: f,
    ...dropCoords,
  };
}

// Called when a `delivered` delivery_event is recorded. Computes actual
// minutes from the order's createdAt and updates every prediction row for
// that order so accuracy queries stay consistent.
export async function recordActualDelivery(
  orderId: number,
  deliveredAt: Date = new Date(),
): Promise<{ updated: number; actualMinutes: number } | null> {
  const [order] = await db
    .select({ id: ordersTable.id, createdAt: ordersTable.createdAt })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!order) return null;
  const actualMinutes =
    (deliveredAt.getTime() - new Date(order.createdAt).getTime()) / 60_000;
  if (!Number.isFinite(actualMinutes) || actualMinutes < 0) return null;
  const result = await db
    .update(etaPredictionsTable)
    .set({
      actualMinutes,
      actualDeliveredAt: deliveredAt,
      errorMinutes: sql`${etaPredictionsTable.predictedMinutes} - ${actualMinutes}`,
    })
    .where(eq(etaPredictionsTable.orderId, orderId))
    .returning({ id: etaPredictionsTable.id });
  return { updated: result.length, actualMinutes };
}

export interface ZoneAccuracyRow {
  zone: string;
  day: string;
  predictions: number;
  meanAbsErrorMin: number;
  meanErrorMin: number;
  mape: number; // 0..1
}

export async function etaAccuracyByZone(opts: {
  sinceDays?: number;
  zone?: string;
}): Promise<ZoneAccuracyRow[]> {
  const sinceDays = opts.sinceDays ?? 14;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const filters: ReturnType<typeof and>[] = [];
  filters.push(gte(etaPredictionsTable.createdAt, since));
  filters.push(sql`${etaPredictionsTable.actualMinutes} is not null` as never);
  if (opts.zone) filters.push(eq(etaPredictionsTable.zone, opts.zone));
  const rows = await db
    .select({
      zone: etaPredictionsTable.zone,
      day: sql<string>`to_char(date_trunc('day', ${etaPredictionsTable.createdAt}), 'YYYY-MM-DD')`,
      predictions: sql<number>`count(*)::int`,
      meanAbsErrorMin: sql<number>`avg(abs(${etaPredictionsTable.errorMinutes}))::float`,
      meanErrorMin: sql<number>`avg(${etaPredictionsTable.errorMinutes})::float`,
      mape: sql<number>`avg(abs(${etaPredictionsTable.errorMinutes}) / nullif(${etaPredictionsTable.actualMinutes}, 0))::float`,
    })
    .from(etaPredictionsTable)
    .where(and(...filters))
    .groupBy(
      etaPredictionsTable.zone,
      sql`date_trunc('day', ${etaPredictionsTable.createdAt})`,
    )
    .orderBy(
      desc(sql`date_trunc('day', ${etaPredictionsTable.createdAt})`),
      etaPredictionsTable.zone,
    );
  return rows.map((r) => ({
    zone: r.zone,
    day: r.day,
    predictions: r.predictions,
    meanAbsErrorMin: Math.round((r.meanAbsErrorMin ?? 0) * 10) / 10,
    meanErrorMin: Math.round((r.meanErrorMin ?? 0) * 10) / 10,
    mape: Math.round((r.mape ?? 0) * 1000) / 1000,
  }));
}

// Convenience: hook called from delivery_events POST when a delivered event
// arrives, before any side-effects could fail.
export async function maybeRecordDeliveredFromEvent(
  orderId: number,
  event: string,
): Promise<void> {
  if (event !== "delivered") return;
  try {
    await recordActualDelivery(orderId);
  } catch (err) {
    logger.error({ err, orderId }, "recordActualDelivery hook failed");
  }
}

export async function recordedActualsCount(orderId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deliveryEventsTable)
    .where(
      and(
        eq(deliveryEventsTable.orderId, orderId),
        eq(deliveryEventsTable.event, "delivered"),
      ),
    );
  return row?.n ?? 0;
}
