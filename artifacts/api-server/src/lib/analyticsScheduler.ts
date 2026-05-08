import { logger } from "./logger";
import { generateWbr, lastFullWeek } from "./wbr";
import { extractWeeklyVoc } from "./voc";

// Runs WBR + VoC once per day; the WBR/VoC code itself is idempotent
// (upsert by week_start), so multiple ticks in the same week are safe.
const DEFAULT_INTERVAL_MS = Number(
  process.env["ANALYTICS_SCHEDULER_INTERVAL_MS"] ?? 24 * 60 * 60 * 1000,
);

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  const start = Date.now();
  try {
    const week = lastFullWeek();
    const wbr = await generateWbr(week);
    const themes = await extractWeeklyVoc(week.weekStart, week.weekEnd);
    logger.info(
      {
        weekStart: week.weekStart,
        wbrId: wbr.id,
        vocThemes: themes.length,
        durationMs: Date.now() - start,
      },
      "analytics scheduler tick complete",
    );
  } catch (err) {
    logger.error({ err }, "analytics scheduler tick failed");
  } finally {
    running = false;
  }
}

export function startAnalyticsScheduler(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (timer) return;
  if (process.env["ANALYTICS_SCHEDULER_DISABLED"] === "1") {
    logger.info("analytics scheduler disabled via env");
    return;
  }
  // Delay first tick a bit so server isn't slammed at startup.
  setTimeout(() => void tick(), 90_000);
  timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs }, "analytics scheduler started");
}

export function stopAnalyticsScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
