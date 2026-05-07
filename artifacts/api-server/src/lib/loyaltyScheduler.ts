import { logger } from "./logger";
import { runLoyaltyEngineForAll } from "./loyaltyEngine";

const DEFAULT_INTERVAL_MS = Number(
  process.env["LOYALTY_SWEEP_INTERVAL_MS"] ?? 6 * 60 * 60 * 1000,
);

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  const start = Date.now();
  try {
    const out = await runLoyaltyEngineForAll();
    logger.info(
      { ...out, durationMs: Date.now() - start },
      "loyalty sweep complete",
    );
  } catch (err) {
    logger.error({ err }, "loyalty sweep failed");
  } finally {
    running = false;
  }
}

export function startLoyaltyScheduler(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (timer) return;
  if (process.env["LOYALTY_SCHEDULER_DISABLED"] === "1") {
    logger.info("loyalty scheduler disabled via env");
    return;
  }
  // Kick off shortly after boot so birthday/anniversary fires for the day
  // even if the process restarts mid-day, then on a regular cadence.
  setTimeout(() => void tick(), 30_000);
  timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs }, "loyalty scheduler started");
}

export function stopLoyaltyScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
