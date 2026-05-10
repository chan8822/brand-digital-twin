import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { initRealtime } from "./lib/realtime";
import { startWorkers, stopWorkers } from "./lib/queue";
import { startLoyaltyScheduler } from "./lib/loyaltyScheduler";
import { startAnomalyScheduler } from "./lib/anomalyScheduler";
import { startAnomalyDigestSender } from "./lib/anomalyDigestSender";
import { startReviewSummarizerScheduler } from "./lib/menuEngineeringScheduler";
import { startMealPlanScheduler } from "./lib/mealPlanScheduler";
import { startAnalyticsScheduler } from "./lib/analyticsScheduler";
import { ensureSafeViews } from "./lib/safeSql";
import { resumeActiveSimulations } from "./lib/riderSim";
import { purgeExpiredRateLimits } from "./lib/rateLimit";
import { purgeExpiredSessions } from "./lib/auth";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);
initRealtime(httpServer);
startWorkers();
startLoyaltyScheduler();
startAnomalyScheduler();
startAnomalyDigestSender();
startReviewSummarizerScheduler();
startMealPlanScheduler();
void resumeActiveSimulations();
// Bootstrap the curated safe_* views and reader role BEFORE we start
// listening, so the very first /analytics/* request can never race view
// creation. We then start the scheduler and bind the port.
async function start(): Promise<void> {
  try {
    await ensureSafeViews();
  } catch (err) {
    logger.error({ err }, "ensureSafeViews failed (continuing without safe layer)");
  }
  startAnalyticsScheduler();
  httpServer.listen(port, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}
void start();

// --- Background hygiene -----------------------------------------------------
//
// `rateLimitsTable` and `sessionsTable` rows are only deleted as a side effect
// of the next request that hits the same key. Without a sweeper, expired rows
// accumulate forever under attack. Run a low-frequency cleanup on every node;
// concurrent purges are safe.
const HOUR = 60 * 60 * 1000;
const purgeTimer = setInterval(() => {
  Promise.all([
    purgeExpiredRateLimits().catch((err) =>
      logger.error({ err }, "purgeExpiredRateLimits failed"),
    ),
    purgeExpiredSessions().catch((err) =>
      logger.error({ err }, "purgeExpiredSessions failed"),
    ),
  ]).catch(() => {
    /* swallowed above */
  });
}, HOUR);
purgeTimer.unref();

// --- Process-level safety nets ---------------------------------------------
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaughtException");
  // Exit so the orchestrator can restart us cleanly. We don't try to
  // continue — node's invariants are no longer guaranteed.
  process.exit(1);
});

// --- Graceful shutdown ------------------------------------------------------
//
// SIGTERM is what Cloud Run / Kubernetes / Docker send on rollout.
// Stop accepting connections, drain in-flight work, then exit.
let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutdown initiated");
  // Give the load balancer ~10 s to notice the readiness flip before
  // we slam the connection. Tunable per environment.
  const HARD_DEADLINE_MS = 15_000;
  const killer = setTimeout(() => {
    logger.error("hard shutdown deadline reached — exiting");
    process.exit(1);
  }, HARD_DEADLINE_MS);
  killer.unref();

  httpServer.close((err) => {
    if (err) logger.error({ err }, "httpServer.close failed");
  });

  try {
    await stopWorkers();
  } catch (err) {
    logger.error({ err }, "stopWorkers failed");
  }
  clearInterval(purgeTimer);
  logger.info("shutdown complete");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
