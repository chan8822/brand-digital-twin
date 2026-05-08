import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  anomalyAlertsTable,
  ordersTable,
  deliveryEventsTable,
  type AnomalyAlert,
} from "@workspace/db";
import { logger } from "./logger";
import { explainAnomalyWithAI } from "./anomalyExplainer";

// ─── Types & metric registry ───────────────────────────────────────────────

export type MetricKey =
  | "refund_rate"
  | "kitchen_ready_minutes"
  | "rider_acceptance_minutes"
  | "payment_failure_rate"
  | "low_rating_rate";

export interface MetricSample {
  metric: MetricKey;
  value: number;
  // Optional volume so we can require a minimum sample size before alerting.
  sampleSize: number;
}

export interface MetricResult extends MetricSample {
  baseline: number | null;
  baselineStd: number | null;
  // Per-metric thresholding. `value` exceeds when:
  //   - direction === "high" and value > threshold (or > baseline + k*std)
  //   - direction === "low"  and value < threshold (or < baseline - k*std)
  threshold: number;
  direction: "high" | "low";
  windowStart: Date;
  windowEnd: Date;
}

const HOUR_MS = 60 * 60 * 1000;

interface MetricSpec {
  key: MetricKey;
  label: string;
  // Minimum sample size in the current window before we will alert. Avoids
  // noisy alerts during low-volume periods.
  minSamples: number;
  // Floor / ceiling. For high-direction metrics, current value must exceed
  // BOTH (baseline + k*std) AND `floor` to alert. Prevents alerting when
  // baseline noise produces tiny absolute values.
  floor: number;
  // Standard-deviation multiplier for dynamic threshold.
  k: number;
  direction: "high" | "low";
  unit: string;
  // Plain-language template. {value} {baseline} {unit} are substituted.
  summaryTemplate: (s: SummaryArgs) => string;
  suggestedAction: (s: SummaryArgs) => string;
}

interface SummaryArgs {
  value: number;
  baseline: number | null;
  threshold: number;
  windowStart: Date;
  windowEnd: Date;
  sampleSize: number;
}

const fmt = (n: number, digits = 1): string =>
  Number.isFinite(n) ? n.toFixed(digits) : "—";
const fmtPct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const fmtTime = (d: Date): string =>
  d.toISOString().replace("T", " ").slice(11, 16);

const METRICS: Record<MetricKey, MetricSpec> = {
  refund_rate: {
    key: "refund_rate",
    label: "Refund rate",
    minSamples: 10,
    floor: 0.05, // ignore <5% absolute
    k: 2.5,
    direction: "high",
    unit: "%",
    summaryTemplate: (s) =>
      `Refunds ran at ${fmtPct(s.value)} of orders between ${fmtTime(s.windowStart)}–${fmtTime(s.windowEnd)} (${s.sampleSize} orders), versus a recent baseline of ${s.baseline != null ? fmtPct(s.baseline) : "n/a"}.`,
    suggestedAction: () =>
      "Spot-check the last 10 refunded orders for a common SKU, kitchen station, or delivery zone, then 86 the offending dish or pause the route.",
  },
  kitchen_ready_minutes: {
    key: "kitchen_ready_minutes",
    label: "Kitchen ticket-to-ready time",
    minSamples: 8,
    floor: 14, // ignore <14 min average
    k: 2,
    direction: "high",
    unit: "min",
    summaryTemplate: (s) =>
      `Kitchen took ${fmt(s.value)} min on average to mark orders ready in the last hour (${s.sampleSize} orders); baseline is ${s.baseline != null ? `${fmt(s.baseline)} min` : "n/a"}.`,
    suggestedAction: () =>
      "Pull up the live queue, identify the slowest station, and decide whether to add a cook, simplify the menu, or 86 a slow-prep dish.",
  },
  rider_acceptance_minutes: {
    key: "rider_acceptance_minutes",
    label: "Rider pickup lag",
    minSamples: 5,
    floor: 6,
    k: 2,
    direction: "high",
    unit: "min",
    summaryTemplate: (s) =>
      `Riders are taking ${fmt(s.value)} min on average to leave the kitchen after assignment (${s.sampleSize} handoffs); baseline is ${s.baseline != null ? `${fmt(s.baseline)} min` : "n/a"}.`,
    suggestedAction: () =>
      "Check rider availability and online count; consider a smart-dispatch run or escalate to the rider supervisor if drop-offs are clustered in one zone.",
  },
  payment_failure_rate: {
    key: "payment_failure_rate",
    label: "Payment failures",
    minSamples: 8,
    floor: 0.04,
    k: 2.5,
    direction: "high",
    unit: "%",
    summaryTemplate: (s) =>
      `Payment failures hit ${fmtPct(s.value)} of attempts in the last hour (${s.sampleSize} orders); baseline ${s.baseline != null ? fmtPct(s.baseline) : "n/a"}.`,
    suggestedAction: () =>
      "Check the payments dashboard for upstream gateway errors; if isolated to a single PSP, fail over and notify finance.",
  },
  low_rating_rate: {
    key: "low_rating_rate",
    label: "Low ratings (≤2★)",
    minSamples: 5,
    floor: 0.1,
    k: 2,
    direction: "high",
    unit: "%",
    summaryTemplate: (s) =>
      `${fmtPct(s.value)} of rated orders in the last hour scored ≤2★ (${s.sampleSize} ratings); baseline ${s.baseline != null ? fmtPct(s.baseline) : "n/a"}.`,
    suggestedAction: () =>
      "Open the support agent and review the linked orders; cluster by dish or rider before issuing make-good credits.",
  },
};

export function listMetrics(): MetricSpec[] {
  return Object.values(METRICS);
}

// ─── Sampling primitives ───────────────────────────────────────────────────

interface WindowBucket {
  start: Date;
  end: Date;
  value: number;
  sampleSize: number;
}

// Refund rate from orders.status='refunded' over total orders created in window.
async function sampleRefundRate(start: Date, end: Date): Promise<WindowBucket> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      refunded: sql<number>`sum(case when ${ordersTable.status} = 'refunded' then 1 else 0 end)::int`,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, start),
        lt(ordersTable.createdAt, end),
      ),
    );
  const total = row?.total ?? 0;
  const refunded = row?.refunded ?? 0;
  return {
    start,
    end,
    value: total > 0 ? refunded / total : 0,
    sampleSize: total,
  };
}

// Kitchen time = createdAt → first 'ready' delivery_event.
async function sampleKitchenReady(
  start: Date,
  end: Date,
): Promise<WindowBucket> {
  const rows = await db.execute<{ minutes: number }>(sql`
    select extract(epoch from (min(de.created_at) - o.created_at)) / 60.0 as minutes
    from ${ordersTable} o
    join ${deliveryEventsTable} de on de.order_id = o.id and de.event = 'ready'
    where o.created_at >= ${start} and o.created_at < ${end}
    group by o.id
  `);
  const samples = rows.rows
    .map((r) => Number(r.minutes))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 240);
  return {
    start,
    end,
    value: samples.length > 0 ? avg(samples) : 0,
    sampleSize: samples.length,
  };
}

// Rider acceptance = rider_assigned → out_for_delivery, per order.
async function sampleRiderAcceptance(
  start: Date,
  end: Date,
): Promise<WindowBucket> {
  const rows = await db.execute<{ minutes: number }>(sql`
    select extract(epoch from (min(d2.created_at) - min(d1.created_at))) / 60.0 as minutes
    from ${deliveryEventsTable} d1
    join ${deliveryEventsTable} d2
      on d2.order_id = d1.order_id and d2.event = 'out_for_delivery'
    where d1.event = 'rider_assigned'
      and d1.created_at >= ${start} and d1.created_at < ${end}
    group by d1.order_id
  `);
  const samples = rows.rows
    .map((r) => Number(r.minutes))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 120);
  return {
    start,
    end,
    value: samples.length > 0 ? avg(samples) : 0,
    sampleSize: samples.length,
  };
}

// Payment failure rate from delivery_events event='payment_failed'
// versus total orders in window.
async function samplePaymentFailures(
  start: Date,
  end: Date,
): Promise<WindowBucket> {
  const [orderRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, end)),
    );
  const [failRow] = await db
    .select({ failed: sql<number>`count(*)::int` })
    .from(deliveryEventsTable)
    .where(
      and(
        eq(deliveryEventsTable.event, "payment_failed"),
        gte(deliveryEventsTable.createdAt, start),
        lt(deliveryEventsTable.createdAt, end),
      ),
    );
  const total = orderRow?.total ?? 0;
  const failed = failRow?.failed ?? 0;
  return {
    start,
    end,
    value: total > 0 ? failed / total : 0,
    sampleSize: total,
  };
}

// Low ratings: delivery_events event='order_rated' meta.rating <= 2.
async function sampleLowRatings(
  start: Date,
  end: Date,
): Promise<WindowBucket> {
  const rows = await db.execute<{ rating: number }>(sql`
    select (meta->>'rating')::numeric as rating
    from ${deliveryEventsTable}
    where event = 'order_rated'
      and created_at >= ${start} and created_at < ${end}
      and meta ? 'rating'
  `);
  const ratings = rows.rows
    .map((r) => Number(r.rating))
    .filter((n) => Number.isFinite(n));
  if (ratings.length === 0) {
    return { start, end, value: 0, sampleSize: 0 };
  }
  const low = ratings.filter((r) => r <= 2).length;
  return {
    start,
    end,
    value: low / ratings.length,
    sampleSize: ratings.length,
  };
}

const SAMPLERS: Record<
  MetricKey,
  (start: Date, end: Date) => Promise<WindowBucket>
> = {
  refund_rate: sampleRefundRate,
  kitchen_ready_minutes: sampleKitchenReady,
  rider_acceptance_minutes: sampleRiderAcceptance,
  payment_failure_rate: samplePaymentFailures,
  low_rating_rate: sampleLowRatings,
};

// ─── Detector ──────────────────────────────────────────────────────────────

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[], mean: number): number {
  if (xs.length < 2) return 0;
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

// Trailing baseline = same metric over the last `lookbackHours` hourly buckets,
// excluding the current window. We additionally weight by hour-of-day to be
// gently seasonality-aware: prefer same-hour samples from the lookback window
// when we have ≥3 of them, otherwise fall back to the full mean.
const LOOKBACK_HOURS = 24 * 7;

async function buildBaseline(
  metric: MetricKey,
  windowEnd: Date,
): Promise<{ baseline: number | null; std: number | null }> {
  const sampler = SAMPLERS[metric];
  const samples: WindowBucket[] = [];
  for (let h = 1; h <= LOOKBACK_HOURS; h++) {
    const end = new Date(windowEnd.getTime() - h * HOUR_MS);
    const start = new Date(end.getTime() - HOUR_MS);
    samples.push(await sampler(start, end));
  }
  const valid = samples.filter((s) => s.sampleSize > 0);
  if (valid.length < 3) return { baseline: null, std: null };
  const targetHour = new Date(windowEnd.getTime() - HOUR_MS).getUTCHours();
  const seasonal = valid.filter((s) => s.start.getUTCHours() === targetHour);
  const pool = seasonal.length >= 3 ? seasonal : valid;
  const values = pool.map((s) => s.value);
  const mean = avg(values);
  return { baseline: mean, std: stdDev(values, mean) };
}

function severityOf(deviation: number): "low" | "medium" | "high" {
  if (deviation >= 4) return "high";
  if (deviation >= 2.5) return "medium";
  return "low";
}

function fingerprintOf(metric: MetricKey, windowEnd: Date): string {
  // One alert per metric per hour bucket; guarantees idempotency if the
  // detector runs multiple times within a window.
  return `${metric}:${windowEnd.toISOString().slice(0, 13)}`;
}

export interface DetectionResult {
  metric: MetricKey;
  alertId: number | null;
  fired: boolean;
  reason: string;
  value: number;
  baseline: number | null;
  threshold: number;
  severity: "low" | "medium" | "high" | null;
  sampleSize: number;
}

async function evaluateMetric(
  metric: MetricKey,
  now: Date,
): Promise<DetectionResult> {
  const spec = METRICS[metric];
  const windowEnd = new Date(
    Math.floor(now.getTime() / HOUR_MS) * HOUR_MS,
  );
  const windowStart = new Date(windowEnd.getTime() - HOUR_MS);
  const sampler = SAMPLERS[metric];
  const current = await sampler(windowStart, windowEnd);

  if (current.sampleSize < spec.minSamples) {
    return {
      metric,
      alertId: null,
      fired: false,
      reason: `sample size ${current.sampleSize} < min ${spec.minSamples}`,
      value: current.value,
      baseline: null,
      threshold: spec.floor,
      severity: null,
      sampleSize: current.sampleSize,
    };
  }

  const { baseline, std } = await buildBaseline(metric, windowEnd);
  // Dynamic threshold = baseline ± k*std, but never below the absolute floor.
  let threshold: number;
  if (baseline == null || std == null || std === 0) {
    threshold = spec.floor;
  } else {
    threshold =
      spec.direction === "high"
        ? Math.max(spec.floor, baseline + spec.k * std)
        : Math.min(spec.floor, baseline - spec.k * std);
  }

  const breaches =
    spec.direction === "high"
      ? current.value > threshold && current.value >= spec.floor
      : current.value < threshold && current.value <= spec.floor;

  if (!breaches) {
    return {
      metric,
      alertId: null,
      fired: false,
      reason: `within bounds (value=${current.value.toFixed(3)} threshold=${threshold.toFixed(3)})`,
      value: current.value,
      baseline,
      threshold,
      severity: null,
      sampleSize: current.sampleSize,
    };
  }

  const deviation =
    baseline != null && std && std > 0
      ? Math.abs((current.value - baseline) / std)
      : (current.value - threshold) / Math.max(1e-6, threshold);
  const severity = severityOf(deviation);
  const summary = spec.summaryTemplate({
    value: current.value,
    baseline,
    threshold,
    windowStart,
    windowEnd,
    sampleSize: current.sampleSize,
  });
  const suggestedAction = spec.suggestedAction({
    value: current.value,
    baseline,
    threshold,
    windowStart,
    windowEnd,
    sampleSize: current.sampleSize,
  });

  const fingerprint = fingerprintOf(metric, windowEnd);
  // Optionally enrich the explanation with the AI explainer. The function
  // never throws — on any failure it returns null and we keep the template.
  const enriched = await explainAnomalyWithAI({
    metric,
    label: spec.label,
    severity,
    value: current.value,
    baseline,
    threshold,
    sampleSize: current.sampleSize,
    windowStart,
    windowEnd,
    templateSummary: summary,
    templateAction: suggestedAction,
  });
  const finalSummary = enriched?.summary ?? summary;
  const finalAction = enriched?.suggestedAction ?? suggestedAction;

  // Idempotent insert via DB-level UNIQUE(fingerprint) — concurrent scans
  // race onto onConflictDoNothing and at most one row is created.
  const inserted = await db
    .insert(anomalyAlertsTable)
    .values({
      metric,
      severity,
      status: "open",
      windowStart,
      windowEnd,
      value: current.value,
      baseline,
      threshold,
      deviation,
      dimensions: {
        sampleSize: current.sampleSize,
        label: spec.label,
        aiExplained: enriched != null,
      },
      summary: finalSummary,
      suggestedAction: finalAction,
      fingerprint,
    })
    .onConflictDoNothing({ target: anomalyAlertsTable.fingerprint })
    .returning({ id: anomalyAlertsTable.id });

  if (inserted.length === 0) {
    const [existing] = await db
      .select({ id: anomalyAlertsTable.id })
      .from(anomalyAlertsTable)
      .where(eq(anomalyAlertsTable.fingerprint, fingerprint))
      .limit(1);
    return {
      metric,
      alertId: existing?.id ?? null,
      fired: false,
      reason: "already raised this hour",
      value: current.value,
      baseline,
      threshold,
      severity,
      sampleSize: current.sampleSize,
    };
  }

  return {
    metric,
    alertId: inserted[0]?.id ?? null,
    fired: true,
    reason: "alert raised",
    value: current.value,
    baseline,
    threshold,
    severity,
    sampleSize: current.sampleSize,
  };
}

export async function runAnomalyScan(
  now: Date = new Date(),
): Promise<DetectionResult[]> {
  const results: DetectionResult[] = [];
  for (const metric of Object.keys(METRICS) as MetricKey[]) {
    try {
      results.push(await evaluateMetric(metric, now));
    } catch (err) {
      logger.error({ err, metric }, "anomaly evaluator failed");
      results.push({
        metric,
        alertId: null,
        fired: false,
        reason: `error: ${(err as Error).message}`,
        value: 0,
        baseline: null,
        threshold: 0,
        severity: null,
        sampleSize: 0,
      });
    }
  }
  return results;
}

// ─── Alert lifecycle ──────────────────────────────────────────────────────

export interface ListAlertsOpts {
  status?: "open" | "ack" | "snoozed" | "closed" | "active";
  limit?: number;
}

export async function listAlerts(
  opts: ListAlertsOpts = {},
): Promise<AnomalyAlert[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const status = opts.status ?? "active";
  const now = new Date();
  const conditions = [];
  if (status === "active") {
    // Open OR ack'd-but-not-closed OR snooze expired.
    conditions.push(
      or(
        eq(anomalyAlertsTable.status, "open"),
        and(
          eq(anomalyAlertsTable.status, "snoozed"),
          or(
            isNull(anomalyAlertsTable.snoozedUntil),
            lt(anomalyAlertsTable.snoozedUntil, now),
          ),
        ),
      ),
    );
  } else {
    conditions.push(eq(anomalyAlertsTable.status, status));
  }
  return db
    .select()
    .from(anomalyAlertsTable)
    .where(and(...conditions))
    .orderBy(desc(anomalyAlertsTable.createdAt))
    .limit(limit);
}

export async function ackAlert(
  id: number,
  operatorId: string | null,
): Promise<AnomalyAlert | null> {
  const [row] = await db
    .update(anomalyAlertsTable)
    .set({ status: "ack", ackedBy: operatorId, ackedAt: new Date() })
    .where(eq(anomalyAlertsTable.id, id))
    .returning();
  return row ?? null;
}

export async function snoozeAlert(
  id: number,
  minutes: number,
  operatorId: string | null,
): Promise<AnomalyAlert | null> {
  const until = new Date(Date.now() + minutes * 60_000);
  const [row] = await db
    .update(anomalyAlertsTable)
    .set({
      status: "snoozed",
      snoozedUntil: until,
      ackedBy: operatorId,
      ackedAt: new Date(),
    })
    .where(eq(anomalyAlertsTable.id, id))
    .returning();
  return row ?? null;
}

export async function closeAlert(
  id: number,
  operatorId: string | null,
): Promise<AnomalyAlert | null> {
  const [row] = await db
    .update(anomalyAlertsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      ackedBy: operatorId,
      ackedAt: new Date(),
    })
    .where(eq(anomalyAlertsTable.id, id))
    .returning();
  return row ?? null;
}

// Daily digest = alerts raised in the last 24h, grouped by metric+severity.
export interface DigestRow {
  metric: MetricKey;
  severity: "low" | "medium" | "high";
  count: number;
  latestSummary: string;
  latestSuggestedAction: string;
}

export async function buildDailyDigest(): Promise<{
  windowStart: Date;
  windowEnd: Date;
  rows: DigestRow[];
  total: number;
}> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 24 * HOUR_MS);
  const rows = await db
    .select()
    .from(anomalyAlertsTable)
    .where(
      and(
        gte(anomalyAlertsTable.createdAt, windowStart),
        lt(anomalyAlertsTable.createdAt, windowEnd),
      ),
    )
    .orderBy(desc(anomalyAlertsTable.createdAt));
  const grouped = new Map<string, DigestRow>();
  for (const r of rows) {
    const key = `${r.metric}:${r.severity}`;
    const cur = grouped.get(key);
    if (cur) {
      cur.count += 1;
    } else {
      grouped.set(key, {
        metric: r.metric as MetricKey,
        severity: r.severity as "low" | "medium" | "high",
        count: 1,
        latestSummary: r.summary,
        latestSuggestedAction: r.suggestedAction,
      });
    }
  }
  return {
    windowStart,
    windowEnd,
    rows: Array.from(grouped.values()).sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 } as const;
      return order[a.severity] - order[b.severity] || b.count - a.count;
    }),
    total: rows.length,
  };
}
