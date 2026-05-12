import { logger } from "./logger";

/**
 * Task #8 — dispatch-loop budget metric.
 *
 * Tracks per-dispatch-decision wall-clock duration in a fixed-size
 * ring buffer so we can surface live p50/p95/p99 to /healthz/dispatch
 * without a Prometheus dependency. Also fires a throttled alert when
 * p95 over the last `WINDOW` samples exceeds the budget — operators
 * see the dispatch loop slow before STAT SLAs start breaching.
 */
const WINDOW = 256;
const BUDGET_MS = Number(process.env["DISPATCH_P95_BUDGET_MS"] ?? 1500);
const ALERT_INTERVAL_MS = 30_000;

const samples: number[] = [];
let writeIdx = 0;
let total = 0;
let lastAlertAt = 0;

export function recordDispatchDuration(ms: number): void {
  total++;
  if (samples.length < WINDOW) {
    samples.push(ms);
  } else {
    samples[writeIdx % WINDOW] = ms;
    writeIdx = (writeIdx + 1) % WINDOW;
  }
  maybeAlert();
}

function percentile(p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx]!;
}

export interface DispatchLatencySnapshot {
  samples: number;
  totalSinceBoot: number;
  budgetMs: number;
  p50: number;
  p95: number;
  p99: number;
}

export function snapshotDispatchLatency(): DispatchLatencySnapshot {
  return {
    samples: samples.length,
    totalSinceBoot: total,
    budgetMs: BUDGET_MS,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

function maybeAlert(): void {
  if (samples.length < 32) return; // not enough signal
  const p95 = percentile(0.95);
  if (p95 < BUDGET_MS) return;
  const now = Date.now();
  if (now - lastAlertAt < ALERT_INTERVAL_MS) return;
  lastAlertAt = now;
  logger.error(
    {
      alert: true,
      metric: "dispatch_p95_over_budget",
      p95,
      budgetMs: BUDGET_MS,
      samples: samples.length,
    },
    "dispatch loop p95 exceeds budget",
  );
}

/** Test hook — reset the ring buffer between tests. */
export function resetDispatchMetrics(): void {
  samples.length = 0;
  writeIdx = 0;
  total = 0;
  lastAlertAt = 0;
}
