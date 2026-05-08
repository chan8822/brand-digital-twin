import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { initRealtime } from "./lib/realtime";
import { startWorkers } from "./lib/queue";
import { startLoyaltyScheduler } from "./lib/loyaltyScheduler";
import { startAnomalyScheduler } from "./lib/anomalyScheduler";
import { startAnomalyDigestSender } from "./lib/anomalyDigestSender";
import { startReviewSummarizerScheduler } from "./lib/menuEngineeringScheduler";
import { startMealPlanScheduler } from "./lib/mealPlanScheduler";
import { startAnalyticsScheduler } from "./lib/analyticsScheduler";
import { ensureSafeViews } from "./lib/safeSql";
import { resumeActiveSimulations } from "./lib/riderSim";

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
