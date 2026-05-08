import { logger } from "./logger";
import { generateWbr, lastFullWeek } from "./wbr";
import { extractWeeklyVoc } from "./voc";
import { publishWbr } from "./wbrPublisher";

// Day-of-week to publish the WBR (0=Sun, 1=Mon ...). Default Monday.
// Idempotency is enforced in the DB via wbr_reports.published_at, so a
// process restart on Monday will not republish.
const PUBLISH_DOW = Number(process.env["WBR_PUBLISH_DOW"] ?? 1);

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
    // Publish at most once per ISO week. We attempt on the configured DOW
    // and on every subsequent day of the same week as a backfill — so a
    // failed Monday Slack post (network error, missing webhook later wired
    // up, etc.) still gets delivered the same week. publishWbr is
    // idempotent via wbr_reports.published_at so successful prior delivery
    // is never duplicated.
    let published: { delivered: boolean; channel: string; alreadyPublished: boolean } | null = null;
    // Normalize day-of-week to "days since Monday" (0..6) so backfill logic
    // works for any configured WBR_PUBLISH_DOW, not just Monday. Sunday=0
    // wraps to 6 (end of ISO week).
    const daysSinceMonday = (dow: number) => (dow + 6) % 7;
    const todayIdx = daysSinceMonday(new Date().getUTCDay());
    const publishIdx = daysSinceMonday(PUBLISH_DOW);
    const inWindow = todayIdx === publishIdx || (todayIdx > publishIdx && !wbr.publishedAt);
    if (inWindow) {
      published = await publishWbr(wbr);
    }
    logger.info(
      {
        weekStart: week.weekStart,
        wbrId: wbr.id,
        vocThemes: themes.length,
        published,
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
