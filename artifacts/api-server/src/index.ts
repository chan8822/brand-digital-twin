import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { initRealtime } from "./lib/realtime";
import { startWorkers } from "./lib/queue";
import { startLoyaltyScheduler } from "./lib/loyaltyScheduler";
import { startAnomalyScheduler } from "./lib/anomalyScheduler";
import { startAnomalyDigestSender } from "./lib/anomalyDigestSender";
import { startReviewSummarizerScheduler } from "./lib/menuEngineeringScheduler";
import { startAnalyticsScheduler } from "./lib/analyticsScheduler";
import { ensureSafeViews } from "./lib/safeSql";

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
// Make sure the curated safe_* views exist before the analytics scheduler
// starts ticking; otherwise the first tick can race view creation and fail
// with a missing-relation error.
void ensureSafeViews()
  .catch((err) => logger.error({ err }, "ensureSafeViews failed"))
  .finally(() => startAnalyticsScheduler());

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
