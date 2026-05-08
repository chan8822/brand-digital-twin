import { logger } from "./logger";
import { runAnomalyScan } from "./anomalies";

const DEFAULT_INTERVAL_MS = Number(
  process.env["ANOMALY_SCAN_INTERVAL_MS"] ?? 5 * 60 * 1000,
);

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  const start = Date.now();
  try {
    const results = await runAnomalyScan();
    const fired = results.filter((r) => r.fired);
    logger.info(
      {
        scanned: results.length,
        fired: fired.length,
        durationMs: Date.now() - start,
        firedMetrics: fired.map((f) => ({
          metric: f.metric,
          severity: f.severity,
          alertId: f.alertId,
        })),
      },
      "anomaly scan complete",
    );
  } catch (err) {
    logger.error({ err }, "anomaly scan failed");
  } finally {
    running = false;
  }
}

export function startAnomalyScheduler(
  intervalMs = DEFAULT_INTERVAL_MS,
): void {
  if (timer) return;
  if (process.env["ANOMALY_SCHEDULER_DISABLED"] === "1") {
    logger.info("anomaly scheduler disabled via env");
    return;
  }
  setTimeout(() => void tick(), 15_000);
  timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs }, "anomaly scheduler started");
}

export function stopAnomalyScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
