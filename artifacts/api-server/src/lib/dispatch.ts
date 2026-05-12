import {
  db,
  ordersTable,
  ridersTable,
  deliveryEventsTable,
  dispatchDecisionsTable,
  type Order,
  type Rider,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { logger } from "./logger";
import { recordOpsAction } from "./opsAudit";
import { emitDeliveryEvent } from "./realtime";

export const DISPATCH_MODEL_VERSION = "v1-heuristic";

// Maximum minutes a STAT order may sit unassigned (status in
// placed/preparing/ready, no rider) before the dispatcher emits an
// `sla_breach` event. Kept small because STAT is reserved for
// clinically-urgent meals (e.g. post-procedure, hypoglycaemia
// recovery). The threshold is intentionally low (5 min) — the gain
// is in latency, not throughput.
export const STAT_DISPATCH_SLA_MIN = 5;

export type OrderPriority = "routine" | "urgent" | "stat";

// ─── Geo helpers ───────────────────────────────────────────────────────────

const METRO_CENTERS: Record<string, { lat: number; lng: number }> = {
  "560": { lat: 12.9716, lng: 77.5946 }, // Bengaluru
  "110": { lat: 28.6139, lng: 77.209 }, // Delhi
  "400": { lat: 19.076, lng: 72.8777 }, // Mumbai
  "600": { lat: 13.0827, lng: 80.2707 }, // Chennai
  "700": { lat: 22.5726, lng: 88.3639 }, // Kolkata
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Deterministic synthesis of a (lat,lng) for an address: pick the metro
// center by pincode prefix, then jitter ~±0.06° (~7km) using a stable hash
// of the address. Lets the dispatch service compute pairwise distances
// without a real geocoder.
export function addressLatLng(addr: {
  city?: string | null;
  pincode?: string | null;
  line?: string | null;
}): { lat: number; lng: number } {
  const pin = (addr.pincode ?? "").trim();
  const center = METRO_CENTERS[pin.slice(0, 3)] ?? { lat: 12.97, lng: 77.59 };
  const seed = `${pin}|${addr.line ?? ""}|${addr.city ?? ""}`;
  const h = hash(seed);
  const dLat = (((h >>> 0) % 1200) - 600) / 10000; // ±0.06
  const dLng = ((((h >>> 8) >>> 0) % 1200) - 600) / 10000;
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function riderLatLng(rider: Rider): { lat: number; lng: number } {
  if (typeof rider.lat === "number" && typeof rider.lng === "number") {
    return { lat: rider.lat, lng: rider.lng };
  }
  // Fall back to zone center via metro lookup keyed by zone first 3 chars.
  // Riders are kept short-lived in dev/test, so this is mostly a safety net.
  const seed = `${rider.zone}|${rider.id}`;
  const h = hash(seed);
  const center = { lat: 12.97, lng: 77.59 };
  return {
    lat: center.lat + (((h % 800) - 400) / 10000),
    lng: center.lng + ((((h >>> 8) % 800) - 400) / 10000),
  };
}

// Prefer the real geocoded coordinates persisted on the order at checkout.
// Fall back to the synthetic helper for legacy rows that pre-date Task #46
// (and for the rare case the geocoder was unavailable at checkout time).
export function orderDropLatLng(order: Order): { lat: number; lng: number } {
  if (
    typeof order.dropLat === "number" &&
    typeof order.dropLng === "number" &&
    !Number.isNaN(order.dropLat) &&
    !Number.isNaN(order.dropLng)
  ) {
    return { lat: order.dropLat, lng: order.dropLng };
  }
  return addressLatLng({
    city: order.city,
    pincode: order.pincode,
    line: order.addressLine,
  });
}

// ─── Food group / route compatibility ──────────────────────────────────────

const COLD_KEYWORDS =
  /salad|smoothie|juice|cold|chaas|lassi|raita|yogurt|shake|kombucha|fresh fruit/i;
const HOT_KEYWORDS =
  /curry|dal|rice|biryani|soup|stew|noodle|paratha|roti|gravy|tikka|bowl|pulao|sabzi/i;

export type FoodGroup = "hot" | "cold" | "mixed" | "unknown";

export function orderFoodGroup(order: Order): FoodGroup {
  const items = (order.items ?? []) as Array<{ name?: string }>;
  if (items.length === 0) return "unknown";
  let hot = 0;
  let cold = 0;
  for (const it of items) {
    const n = String(it?.name ?? "");
    if (COLD_KEYWORDS.test(n)) cold++;
    else if (HOT_KEYWORDS.test(n)) hot++;
  }
  if (hot > 0 && cold > 0) return "mixed";
  if (cold > 0) return "cold";
  if (hot > 0) return "hot";
  return "unknown";
}

// Two orders are route-compatible if neither violates the other's
// temperature requirements. Hot+cold should never share a bag.
export function foodGroupsCompatible(a: FoodGroup, b: FoodGroup): boolean {
  if (a === "unknown" || b === "unknown") return true;
  if (a === "mixed" || b === "mixed") return true; // mixed already carries both
  return a === b;
}

// Travel time proxy in minutes for a rider to reach a drop. Used to align
// rider arrival with kitchen-ready time.
const AVG_KMH = 24; // dense-city average
function travelMinutes(distanceKm: number): number {
  return (distanceKm / AVG_KMH) * 60;
}

// Expected minutes from "now" until the order is ready. Uses createdAt +
// a default prep window; orders already in `ready` return 0.
export function readyInMinutes(order: Order, prepMinutes = 12): number {
  if (order.status === "ready") return 0;
  const elapsedMin = (Date.now() - order.createdAt.getTime()) / 60_000;
  return Math.max(0, prepMinutes - elapsedMin);
}

// ─── Scoring ───────────────────────────────────────────────────────────────

export interface ScoreWeights {
  distanceKm: number;
  loadPerOrder: number;
  ratingBonus: number;
  readinessGapMin: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  distanceKm: 1.0,
  loadPerOrder: 2.5,
  ratingBonus: 0.5,
  readinessGapMin: 0.2,
};

export interface ScoreBreakdown {
  distanceKm: number;
  load: number;
  rating: number;
  readinessGapMin: number;
  totalCost: number;
}

// Lower cost = better. Returns negative score so callers can sort desc.
// `kitchenReadyInMin` is how long until the order is ready; we penalize
// the absolute gap between rider arrival and kitchen-ready so neither
// the rider nor the food sits idle for long.
export function scoreRiderForOrder(
  rider: Rider,
  drop: { lat: number; lng: number },
  weights: ScoreWeights = DEFAULT_WEIGHTS,
  kitchenReadyInMin = 0,
): { score: number; breakdown: ScoreBreakdown } {
  const distanceKm = haversineKm(riderLatLng(rider), drop);
  const load = rider.activeOrderCount;
  const rating = rider.rating ?? 5;
  const ratingPenalty = (5 - rating) * weights.ratingBonus;
  const arriveInMin = travelMinutes(distanceKm);
  const readinessGapMin = Math.abs(arriveInMin - kitchenReadyInMin);
  const totalCost =
    distanceKm * weights.distanceKm +
    load * weights.loadPerOrder +
    ratingPenalty +
    readinessGapMin * weights.readinessGapMin;
  return {
    score: -totalCost,
    breakdown: {
      distanceKm: Math.round(distanceKm * 100) / 100,
      load,
      rating,
      readinessGapMin: Math.round(readinessGapMin * 10) / 10,
      totalCost: Math.round(totalCost * 100) / 100,
    },
  };
}

// Naive baseline: nearest online rider, ignoring load/rating.
export function baselineNearest(
  drop: { lat: number; lng: number },
  riders: Rider[],
): { rider: Rider | null; distanceKm: number; score: number } {
  let best: { rider: Rider | null; distanceKm: number; score: number } = {
    rider: null,
    distanceKm: Infinity,
    score: -Infinity,
  };
  for (const r of riders) {
    if (r.status !== "online") continue;
    const d = haversineKm(riderLatLng(r), drop);
    if (d < best.distanceKm) best = { rider: r, distanceKm: d, score: -d };
  }
  return best;
}

// ─── Batching ──────────────────────────────────────────────────────────────

const BATCH_MAX_DETOUR_KM = 1.5;
const BATCH_WINDOW_MIN = 15;

export interface BatchEligibility {
  eligible: boolean;
  reason?: string;
  detourKm?: number;
}

export function checkBatchEligibility(
  baseDrop: {
    lat: number;
    lng: number;
    createdAt: Date;
    foodGroup: FoodGroup;
  },
  candidateDrop: {
    lat: number;
    lng: number;
    createdAt: Date;
    foodGroup: FoodGroup;
  },
): BatchEligibility {
  if (!foodGroupsCompatible(baseDrop.foodGroup, candidateDrop.foodGroup)) {
    return {
      eligible: false,
      reason: `food-type incompatible (${baseDrop.foodGroup} + ${candidateDrop.foodGroup})`,
    };
  }
  const detourKm = haversineKm(baseDrop, candidateDrop);
  if (detourKm > BATCH_MAX_DETOUR_KM) {
    return { eligible: false, reason: "drop too far", detourKm };
  }
  const minutesApart =
    Math.abs(baseDrop.createdAt.getTime() - candidateDrop.createdAt.getTime()) /
    60_000;
  if (minutesApart > BATCH_WINDOW_MIN) {
    return { eligible: false, reason: "outside batching window", detourKm };
  }
  return { eligible: true, detourKm };
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

export interface DispatchResult {
  ok: boolean;
  orderId: number;
  riderId: number | null;
  batched: boolean;
  batchKey: string;
  strategy: "smart" | "baseline" | "override";
  decisionId: number | null;
  reason?: string;
  breakdown?: ScoreBreakdown;
  baseline?: { riderId: number | null; distanceKm: number };
}

function newBatchKey(): string {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function findBatchPartner(
  order: Order,
  drop: { lat: number; lng: number },
): Promise<{ rider: Rider; batchKey: string; partnerOrderId: number } | null> {
  // Patient-safety: a STAT order is single-drop-only. Pairing it with
  // a routine partner would silently extend its delivery time by the
  // detour, defeating the entire point of marking it STAT.
  if (order.priority === "stat") return null;
  // Look for an order in the same zone-ish (same pincode prefix) that has
  // already been assigned to a rider but not yet picked up.
  const partnerStatuses = ["rider_assigned", "ready"];
  const sameZonePrefix = (order.pincode ?? "").slice(0, 3);
  if (!sameZonePrefix) return null;
  const candidates = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        inArray(ordersTable.status, partnerStatuses),
        sql`${ordersTable.pincode} like ${sameZonePrefix + "%"}`,
        sql`${ordersTable.riderId} is not null`,
        // Symmetric guard: a routine order also refuses to share a bag
        // with a STAT order — the STAT order's rider is committed to it
        // exclusively.
        sql`${ordersTable.priority} <> 'stat'`,
      ),
    )
    .limit(20);
  const baseGroup = orderFoodGroup(order);
  for (const partner of candidates) {
    if (partner.id === order.id) continue;
    const partnerDrop = orderDropLatLng(partner);
    const elig = checkBatchEligibility(
      { ...drop, createdAt: order.createdAt, foodGroup: baseGroup },
      {
        ...partnerDrop,
        createdAt: partner.createdAt,
        foodGroup: orderFoodGroup(partner),
      },
    );
    if (!elig.eligible) continue;
    if (partner.riderId == null) continue;
    const [rider] = await db
      .select()
      .from(ridersTable)
      .where(eq(ridersTable.id, partner.riderId))
      .limit(1);
    if (!rider || rider.status !== "online") continue;
    // Reuse partner's batchKey if one exists.
    const [partnerDecision] = await db
      .select({ batchKey: dispatchDecisionsTable.batchKey })
      .from(dispatchDecisionsTable)
      .where(eq(dispatchDecisionsTable.orderId, partner.id))
      .orderBy(desc(dispatchDecisionsTable.createdAt))
      .limit(1);
    return {
      rider,
      batchKey: partnerDecision?.batchKey ?? newBatchKey(),
      partnerOrderId: partner.id,
    };
  }
  return null;
}

export interface DispatchOptions {
  operatorId?: string | null;
  allowBatch?: boolean;
  notes?: string | null;
}

export async function dispatchOrder(
  orderId: number,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const allowBatch = opts.allowBatch ?? true;

  // Pre-flight outside the transaction: cheap existence check and read for
  // the partner search. Authoritative state is re-read with FOR UPDATE
  // inside the transaction to avoid races with concurrent dispatchers.
  const [orderPeek] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!orderPeek) {
    return {
      ok: false,
      orderId,
      riderId: null,
      batched: false,
      batchKey: "",
      strategy: "smart",
      decisionId: null,
      reason: "order not found",
    };
  }
  const drop = orderDropLatLng(orderPeek);

  // 1. Try to batch onto an existing assignment.
  let batchKey = newBatchKey();
  let chosenRider: Rider | null = null;
  let batched = false;
  if (allowBatch) {
    const partner = await findBatchPartner(orderPeek, drop);
    if (partner) {
      chosenRider = partner.rider;
      batchKey = partner.batchKey;
      batched = true;
    }
  }

  // 2. Otherwise, score all online riders and pick the best.
  const allRiders = await db.select().from(ridersTable);
  const readyMin = readyInMinutes(orderPeek);
  if (!chosenRider) {
    const scored = allRiders
      .filter((r) => r.status === "online")
      .map((r) => ({
        rider: r,
        ...scoreRiderForOrder(r, drop, DEFAULT_WEIGHTS, readyMin),
      }))
      .sort((a, b) => b.score - a.score);
    if (scored.length === 0) {
      return {
        ok: false,
        orderId,
        riderId: null,
        batched: false,
        batchKey,
        strategy: "smart",
        decisionId: null,
        reason: "no riders available",
      };
    }
    chosenRider = scored[0]!.rider;
  }

  const chosenScore = scoreRiderForOrder(
    chosenRider,
    drop,
    DEFAULT_WEIGHTS,
    readyMin,
  );
  const baseline = baselineNearest(drop, allRiders);

  // 3. Persist assignment + audit trail under a row lock so concurrent
  //    dispatchers (queue worker + manual API call) don't double-assign.
  const txResult = await db.transaction(async (tx) => {
    const lockedRows = await tx.execute<{
      id: number;
      rider_id: number | null;
      status: string;
    }>(
      sql`select id, rider_id, status from ${ordersTable}
          where id = ${orderId} for update`,
    );
    const locked = (lockedRows.rows ?? lockedRows)[0] as
      | { id: number; rider_id: number | null; status: string }
      | undefined;
    if (!locked) return { ok: false as const, reason: "order not found" };
    if (locked.rider_id != null) {
      return {
        ok: false as const,
        reason: "order already has a rider; use override to reassign",
        existingRiderId: locked.rider_id,
      };
    }
    const before = { riderId: locked.rider_id, status: locked.status };
    await tx
      .update(ordersTable)
      .set({ riderId: chosenRider!.id, status: "rider_assigned" })
      .where(eq(ordersTable.id, orderId));
    await tx
      .update(ridersTable)
      .set({ activeOrderCount: sql`${ridersTable.activeOrderCount} + 1` })
      .where(eq(ridersTable.id, chosenRider!.id));
    await tx.insert(deliveryEventsTable).values({
      orderId,
      riderId: chosenRider!.id,
      event: "rider_assigned",
      meta: {
        strategy: batched ? "smart-batched" : "smart",
        batchKey,
        riderName: chosenRider!.name,
      },
    });
    const [row] = await tx
      .insert(dispatchDecisionsTable)
      .values({
        batchKey,
        orderId,
        chosenRiderId: chosenRider!.id,
        chosenScore: chosenScore.score,
        chosenBreakdown:
          chosenScore.breakdown as unknown as Record<string, number | string>,
        chosenDistanceKm: chosenScore.breakdown.distanceKm,
        baselineRiderId: baseline.rider?.id ?? null,
        baselineScore: baseline.score === -Infinity ? null : baseline.score,
        baselineDistanceKm:
          baseline.distanceKm === Infinity ? null : baseline.distanceKm,
        strategy: "smart",
        batched: batched ? 1 : 0,
        operatorId: opts.operatorId ?? null,
        notes: opts.notes ?? null,
      })
      .returning({ id: dispatchDecisionsTable.id });
    if (opts.operatorId) {
      await recordOpsAction(
        {
          operatorId: opts.operatorId,
          agent: "ops_console",
          action: "dispatch_order",
          params: { orderId, batched },
          beforeState: before,
          afterState: { riderId: chosenRider!.id, status: "rider_assigned" },
          status: "success",
          reasoning: opts.notes ?? "smart dispatch",
        },
        tx,
      );
    }
    return { ok: true as const, decisionId: row?.id ?? null };
  });

  if (!txResult.ok) {
    return {
      ok: false,
      orderId,
      riderId: null,
      batched: false,
      batchKey,
      strategy: "smart",
      decisionId: null,
      reason: txResult.reason,
    };
  }
  const decisionId = txResult.decisionId;

  emitDeliveryEvent(orderId, {
    event: "rider_assigned",
    riderId: chosenRider.id,
    riderName: chosenRider.name,
    batchKey,
    batched,
  });

  return {
    ok: true,
    orderId,
    riderId: chosenRider.id,
    batched,
    batchKey,
    strategy: "smart",
    decisionId,
    breakdown: chosenScore.breakdown,
    baseline: {
      riderId: baseline.rider?.id ?? null,
      distanceKm:
        baseline.distanceKm === Infinity
          ? 0
          : Math.round(baseline.distanceKm * 100) / 100,
    },
  };
}

// Loop dispatch — every order in `placed`/`preparing`/`ready` without a rider.
//
// Ordering rules (priority is a hard pre-emption, not a soft weight):
//   1. Drain every STAT order, FIFO by createdAt, with batching disabled.
//   2. Then drain the urgent/routine queue, FIFO by createdAt, batching on.
// A STAT order placed at T+0 therefore dispatches before a routine order
// placed at T-10min, regardless of the routine order's age.
//
// Side-effect: at loop entry we scan STAT orders that have sat past
// `STAT_DISPATCH_SLA_MIN` without an assigned rider and emit a single
// `sla_breach` delivery event per breach. Idempotency is enforced by
// stamping `orders.sla_breach_at` in the same UPDATE that selected the
// row, so a second pass over the same row is a no-op even if the
// dispatcher loop runs many times per second.
export async function dispatchReadyOrders(opts: {
  operatorId?: string | null;
} = {}): Promise<{
  attempted: number;
  assigned: number;
  slaBreaches: number;
  results: DispatchResult[];
}> {
  const slaBreaches = await scanAndEmitStatSlaBreaches();
  const liveStatuses = ["placed", "preparing", "ready"];
  const results: DispatchResult[] = [];
  let statAttempted = 0;
  let otherAttempted = 0;
  // The single dispatcher decision that means "the rider pool is empty
  // for this order right now". Used as the no-progress sentinel below
  // — see `dispatchOrder` where this string is returned. Hard-coded to
  // catch drift if the message ever changes.
  const NO_RIDERS = "no riders available";
  const PAGE = 50;
  // Drain STAT in pages until the queue is empty. Hard preemption: we
  // must not start any routine dispatch while a single eligible STAT
  // order remains, so there is no upper cap on iterations — only the
  // empty-page break and a no-progress safety. Both are necessary:
  //   - empty-page break: normal exit when all STATs were assigned;
  //   - no-progress break: every STAT in the page failed with
  //     `NO_RIDERS`, meaning the rider pool is exhausted and re-paging
  //     would loop forever over the same rows.
  while (true) {
    const statBatch = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          inArray(ordersTable.status, liveStatuses),
          isNull(ordersTable.riderId),
          eq(ordersTable.priority, "stat"),
        ),
      )
      .orderBy(asc(ordersTable.createdAt))
      .limit(PAGE);
    if (statBatch.length === 0) break;
    statAttempted += statBatch.length;
    let progressed = 0;
    let noRiders = false;
    for (const o of statBatch) {
      try {
        const r = await dispatchOrder(o.id, { ...opts, allowBatch: false });
        results.push(r);
        if (r.ok) progressed += 1;
        else if (r.reason === NO_RIDERS) noRiders = true;
        else progressed += 1; // "order not found" / "already assigned" etc.
      } catch (err) {
        logger.error({ err, orderId: o.id }, "dispatchReadyOrders STAT failed");
        progressed += 1;
      }
    }
    if (progressed === 0 && noRiders) break;
  }
  // Routine pass only after STAT is fully drained. Same paging shape so
  // a saturated routine queue isn't truncated to 50 either.
  while (true) {
    const otherBatch = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          inArray(ordersTable.status, liveStatuses),
          isNull(ordersTable.riderId),
          sql`${ordersTable.priority} <> 'stat'`,
        ),
      )
      .orderBy(asc(ordersTable.createdAt))
      .limit(PAGE);
    if (otherBatch.length === 0) break;
    otherAttempted += otherBatch.length;
    let progressed = 0;
    let noRiders = false;
    for (const o of otherBatch) {
      try {
        const r = await dispatchOrder(o.id, opts);
        results.push(r);
        if (r.ok) progressed += 1;
        else if (r.reason === NO_RIDERS) noRiders = true;
        else progressed += 1;
      } catch (err) {
        logger.error({ err, orderId: o.id }, "dispatchReadyOrders failed");
        progressed += 1;
      }
    }
    if (progressed === 0 && noRiders) break;
  }
  return {
    attempted: statAttempted + otherAttempted,
    assigned: results.filter((r) => r.ok).length,
    slaBreaches,
    results,
  };
}

/**
 * Find every STAT order that is past the dispatch SLA, still without a
 * rider, and has not already been flagged. Stamp `sla_breach_at` and
 * emit one `sla_breach` delivery event per row. Returns the breach count.
 *
 * The UPDATE ... RETURNING runs as a single statement so two competing
 * dispatch loops can't both observe the row as un-flagged — Postgres
 * row locks serialise them and the loser sees zero rows in its RETURNING.
 */
async function scanAndEmitStatSlaBreaches(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STAT_DISPATCH_SLA_MIN * 60_000);
  // Stamp + event-insert MUST commit atomically: if we marked the row
  // and then crashed before inserting the event, the next loop would
  // skip the row (slaBreachAt is set) and the breach would be silently
  // lost. The transaction rolls back the stamp on any insert failure
  // so the next loop will re-detect and re-emit.
  const breached = await db.transaction(async (tx) => {
    const rows = await tx
      .update(ordersTable)
      .set({ slaBreachAt: now })
      .where(
        and(
          eq(ordersTable.priority, "stat"),
          isNull(ordersTable.riderId),
          isNull(ordersTable.slaBreachAt),
          inArray(ordersTable.status, ["placed", "preparing", "ready"]),
          lte(ordersTable.createdAt, cutoff),
        ),
      )
      .returning({
        id: ordersTable.id,
        createdAt: ordersTable.createdAt,
        status: ordersTable.status,
      });
    if (rows.length === 0) return [];
    const eventRows = rows.map((r) => ({
      orderId: r.id,
      event: "sla_breach",
      meta: {
        priority: "stat",
        thresholdMin: STAT_DISPATCH_SLA_MIN,
        ageMin:
          Math.round(
            ((now.getTime() - new Date(r.createdAt).getTime()) / 60_000) * 10,
          ) / 10,
        status: r.status,
      } as Record<string, unknown>,
    }));
    await tx.insert(deliveryEventsTable).values(eventRows);
    return rows.map((r) => ({
      orderId: r.id,
      ageMin:
        Math.round(
          ((now.getTime() - new Date(r.createdAt).getTime()) / 60_000) * 10,
        ) / 10,
    }));
  });
  // Real-time fan-out happens after commit so subscribers never see a
  // breach that has been rolled back.
  for (const b of breached) {
    emitDeliveryEvent(b.orderId, {
      event: "sla_breach",
      priority: "stat",
      thresholdMin: STAT_DISPATCH_SLA_MIN,
      ageMin: b.ageMin,
    });
  }
  return breached.length;
}

/**
 * Promote / demote an order between routine|urgent|stat. Writes an
 * audit row (the only callers should be staff endpoints). Returns the
 * row before and after so the route layer can surface the transition.
 */
export async function setOrderPriority(args: {
  orderId: number;
  priority: OrderPriority;
  operatorId: string;
  reason?: string;
}): Promise<
  | { ok: true; before: OrderPriority; after: OrderPriority }
  | { ok: false; reason: string }
> {
  const validated: OrderPriority = args.priority;
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select({ priority: ordersTable.priority, status: ordersTable.status })
      .from(ordersTable)
      .where(eq(ordersTable.id, args.orderId))
      .limit(1);
    if (!before) return { ok: false as const, reason: "order not found" };
    const set: Record<string, unknown> = { priority: validated };
    // Demoting away from STAT also clears any prior breach flag so a
    // future STAT promotion gets a fresh SLA window.
    if (validated !== "stat" && before.priority === "stat") {
      set["slaBreachAt"] = null;
    }
    await tx
      .update(ordersTable)
      .set(set)
      .where(eq(ordersTable.id, args.orderId));
    await recordOpsAction(
      {
        operatorId: args.operatorId,
        agent: "ops_console",
        action: "set_order_priority",
        params: { orderId: args.orderId, priority: validated },
        beforeState: { priority: before.priority },
        afterState: { priority: validated },
        status: "success",
        reasoning: args.reason ?? `priority -> ${validated}`,
      },
      tx,
    );
    return {
      ok: true as const,
      before: before.priority as OrderPriority,
      after: validated,
    };
  });
}

export async function overrideAssignment(args: {
  orderId: number;
  riderId: number;
  operatorId: string;
  notes?: string;
}): Promise<{ ok: boolean; reason?: string; decisionId?: number }> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, args.orderId))
    .limit(1);
  if (!order) return { ok: false, reason: "order not found" };
  const [rider] = await db
    .select()
    .from(ridersTable)
    .where(eq(ridersTable.id, args.riderId))
    .limit(1);
  if (!rider) return { ok: false, reason: "rider not found" };
  if (rider.status !== "online")
    return { ok: false, reason: `rider is ${rider.status}` };

  const drop = orderDropLatLng(order);
  const chosen = scoreRiderForOrder(rider, drop);

  const decisionId = await db.transaction(async (tx) => {
    const lockedRows = await tx.execute<{
      id: number;
      rider_id: number | null;
      status: string;
    }>(
      sql`select id, rider_id, status from ${ordersTable}
          where id = ${args.orderId} for update`,
    );
    const locked = (lockedRows.rows ?? lockedRows)[0] as
      | { id: number; rider_id: number | null; status: string }
      | undefined;
    if (!locked) throw new Error("order vanished mid-override");
    const before = { riderId: locked.rider_id, status: locked.status };
    if (locked.rider_id !== rider.id) {
      if (locked.rider_id != null) {
        await tx
          .update(ridersTable)
          .set({
            activeOrderCount: sql`GREATEST(${ridersTable.activeOrderCount} - 1, 0)`,
          })
          .where(eq(ridersTable.id, locked.rider_id));
      }
      await tx
        .update(ridersTable)
        .set({ activeOrderCount: sql`${ridersTable.activeOrderCount} + 1` })
        .where(eq(ridersTable.id, rider.id));
    }
    await tx
      .update(ordersTable)
      .set({ riderId: rider.id, status: "rider_assigned" })
      .where(eq(ordersTable.id, args.orderId));
    await tx.insert(deliveryEventsTable).values({
      orderId: args.orderId,
      riderId: rider.id,
      event: "rider_assigned",
      meta: {
        strategy: "override",
        operatorId: args.operatorId,
        riderName: rider.name,
        notes: args.notes,
      },
    });
    const [row] = await tx
      .insert(dispatchDecisionsTable)
      .values({
        batchKey: newBatchKey(),
        orderId: args.orderId,
        chosenRiderId: rider.id,
        chosenScore: chosen.score,
        chosenBreakdown:
          chosen.breakdown as unknown as Record<string, number | string>,
        chosenDistanceKm: chosen.breakdown.distanceKm,
        strategy: "override",
        batched: 0,
        operatorId: args.operatorId,
        notes: args.notes ?? null,
      })
      .returning({ id: dispatchDecisionsTable.id });
    await recordOpsAction(
      {
        operatorId: args.operatorId,
        agent: "ops_console",
        action: "override_dispatch",
        params: { orderId: args.orderId, riderId: rider.id },
        beforeState: before,
        afterState: { riderId: rider.id, status: "rider_assigned" },
        status: "success",
        reasoning: args.notes ?? "manual override",
      },
      tx,
    );
    return row?.id ?? null;
  });

  emitDeliveryEvent(args.orderId, {
    event: "rider_assigned",
    riderId: rider.id,
    riderName: rider.name,
    override: true,
  });
  return { ok: true, decisionId: decisionId ?? undefined };
}

// ─── Reporting ─────────────────────────────────────────────────────────────

export interface DispatchComparisonRow {
  day: string;
  decisions: number;
  smartTotalKm: number;
  baselineTotalKm: number;
  meanSavingsKm: number;
  batchedShare: number; // 0..1
}

export async function dispatchComparison(opts: {
  sinceDays?: number;
}): Promise<DispatchComparisonRow[]> {
  const sinceDays = opts.sinceDays ?? 14;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${dispatchDecisionsTable.createdAt}), 'YYYY-MM-DD')`,
      decisions: sql<number>`count(*)::int`,
      smartTotalKm: sql<number>`coalesce(sum(${dispatchDecisionsTable.chosenDistanceKm}), 0)::float`,
      baselineTotalKm: sql<number>`coalesce(sum(${dispatchDecisionsTable.baselineDistanceKm}), 0)::float`,
      batchedShare: sql<number>`(sum(${dispatchDecisionsTable.batched}))::float / nullif(count(*), 0)`,
    })
    .from(dispatchDecisionsTable)
    .where(
      and(
        gte(dispatchDecisionsTable.createdAt, since),
        eq(dispatchDecisionsTable.strategy, "smart"),
      ),
    )
    .groupBy(sql`date_trunc('day', ${dispatchDecisionsTable.createdAt})`)
    .orderBy(desc(sql`date_trunc('day', ${dispatchDecisionsTable.createdAt})`));
  return rows.map((r) => ({
    day: r.day,
    decisions: r.decisions,
    smartTotalKm: Math.round((r.smartTotalKm ?? 0) * 10) / 10,
    baselineTotalKm: Math.round((r.baselineTotalKm ?? 0) * 10) / 10,
    meanSavingsKm:
      Math.round(
        ((r.baselineTotalKm - r.smartTotalKm) / Math.max(1, r.decisions)) * 100,
      ) / 100,
    batchedShare: Math.round((r.batchedShare ?? 0) * 1000) / 1000,
  }));
}

export async function recentDispatchDecisions(limit = 20): Promise<
  Array<{
    id: number;
    orderId: number;
    chosenRiderId: number | null;
    baselineRiderId: number | null;
    chosenDistanceKm: number | null;
    baselineDistanceKm: number | null;
    strategy: string;
    notes: string | null;
    createdAt: string;
  }>
> {
  const rows = await db
    .select()
    .from(dispatchDecisionsTable)
    .orderBy(desc(dispatchDecisionsTable.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((r) => ({
    id: r.id,
    orderId: r.orderId,
    chosenRiderId: r.chosenRiderId,
    baselineRiderId: r.baselineRiderId,
    chosenDistanceKm: r.chosenDistanceKm,
    baselineDistanceKm: r.baselineDistanceKm,
    strategy: r.strategy,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}
