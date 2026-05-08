import { logger } from "./logger";
import { runLoyaltyEngineForAll } from "./loyaltyEngine";

const DAY_MS = 24 * 60 * 60 * 1000;

// Hour-of-day (UTC) at which the daily sweep runs. Defaults to 00:30 UTC
// (~06:00 IST) so birthday/anniversary notifications land at the start of
// the user-facing day. Override with LOYALTY_SWEEP_HOUR_UTC (0-23).
const SWEEP_HOUR_UTC = clampHour(
  Number(process.env["LOYALTY_SWEEP_HOUR_UTC"] ?? 0),
);
const SWEEP_MINUTE_UTC = clampMinute(
  Number(process.env["LOYALTY_SWEEP_MINUTE_UTC"] ?? 30),
);

// Optional override for tests / ops: forces the scheduler to a fixed
// interval instead of the daily cadence (milliseconds). When set, the
// same-day guard is skipped so the override actually fires every tick.
const FORCE_INTERVAL_MS = Number(process.env["LOYALTY_SWEEP_INTERVAL_MS"] ?? 0);
const intervalMode = FORCE_INTERVAL_MS > 0;

let timer: ReturnType<typeof setTimeout> | null = null;
let bootCatchupTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastRunDayUtc: string | null = null;

function clampHour(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

function clampMinute(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(59, Math.max(0, Math.floor(n)));
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function msUntilNextSweep(now: Date): number {
  const next = new Date(now);
  next.setUTCHours(SWEEP_HOUR_UTC, SWEEP_MINUTE_UTC, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  const start = Date.now();
  const dayKey = utcDayKey(new Date());
  try {
    if (!intervalMode && lastRunDayUtc === dayKey) {
      logger.info({ dayKey }, "loyalty sweep already ran today, skipping");
      return;
    }
    const out = await runLoyaltyEngineForAll();
    lastRunDayUtc = dayKey;
    logger.info(
      { ...out, dayKey, durationMs: Date.now() - start },
      "loyalty sweep complete",
    );
  } catch (err) {
    logger.error({ err }, "loyalty sweep failed");
  } finally {
    running = false;
  }
}

function scheduleNext(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const delay = intervalMode ? FORCE_INTERVAL_MS : msUntilNextSweep(new Date());
  timer = setTimeout(() => {
    void tick().finally(scheduleNext);
  }, Math.min(delay, DAY_MS));
  if (typeof timer.unref === "function") timer.unref();
  logger.info(
    { delayMs: delay, nextRunAt: new Date(Date.now() + delay).toISOString() },
    "loyalty sweep scheduled",
  );
}

export function startLoyaltyScheduler(): void {
  if (timer || bootCatchupTimer) return;
  if (process.env["LOYALTY_SCHEDULER_DISABLED"] === "1") {
    logger.info("loyalty scheduler disabled via env");
    return;
  }
  // Catch-up sweep shortly after boot so a process restart late in the
  // day still fires today's birthdays/anniversaries. Idempotency is
  // guaranteed by the engine's dedupe keys plus the per-day guard above.
  bootCatchupTimer = setTimeout(() => {
    bootCatchupTimer = null;
    void tick();
  }, 30_000);
  if (typeof bootCatchupTimer.unref === "function") bootCatchupTimer.unref();
  scheduleNext();
}

export function stopLoyaltyScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (bootCatchupTimer) {
    clearTimeout(bootCatchupTimer);
    bootCatchupTimer = null;
  }
}
