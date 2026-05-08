import { logger } from "./logger";
import { summarizeAllReviews } from "./dishReviews";

// Periodic batch job that refreshes per-dish review summaries. Runs on a
// long interval (default 6h) because Gemini calls are billed per dish.
const DEFAULT_INTERVAL_MS = Number(
  process.env["REVIEW_SUMMARIZER_INTERVAL_MS"] ?? 6 * 60 * 60 * 1000,
);

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  const start = Date.now();
  try {
    const out = await summarizeAllReviews();
    logger.info(
      { ...out, durationMs: Date.now() - start },
      "review summarizer tick complete",
    );
  } catch (err) {
    logger.error({ err }, "review summarizer tick failed");
  } finally {
    running = false;
  }
}

export function startReviewSummarizerScheduler(
  intervalMs = DEFAULT_INTERVAL_MS,
): void {
  if (timer) return;
  if (process.env["REVIEW_SUMMARIZER_DISABLED"] === "1") {
    logger.info("review summarizer disabled via env");
    return;
  }
  // First run delayed to let the server warm up.
  setTimeout(() => void tick(), 60_000);
  timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs }, "review summarizer scheduler started");
}

export function stopReviewSummarizerScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
