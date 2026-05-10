import { Queue, Worker, type Processor } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { logger } from "./logger";
import { db, deliveryEventsTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const QUEUE_NAMES = {
  orderPipeline: "order-pipeline",
  riderAssignment: "rider-assignment",
} as const;

export interface OrderPipelineJob {
  orderId: number;
  step: "preparing" | "ready" | "out_for_delivery" | "delivered";
}

let connection: Redis | null = null;
let orderPipelineQueue: Queue<OrderPipelineJob> | null = null;
let workersStarted = false;
let activeWorker: Worker<OrderPipelineJob> | null = null;

function getConnection(): Redis | null {
  if (connection) return connection;
  const url = process.env["REDIS_URL"];
  if (!url) return null;
  connection = new IORedis(url, { maxRetriesPerRequest: null });
  connection.on("error", (err) => logger.error({ err }, "redis connection error"));
  return connection;
}

export function getOrderPipelineQueue(): Queue<OrderPipelineJob> | null {
  if (orderPipelineQueue) return orderPipelineQueue;
  const conn = getConnection();
  if (!conn) return null;
  orderPipelineQueue = new Queue<OrderPipelineJob>(QUEUE_NAMES.orderPipeline, { connection: conn });
  return orderPipelineQueue;
}

const orderPipelineProcessor: Processor<OrderPipelineJob> = async (job) => {
  const { orderId, step } = job.data;
  const eventName =
    step === "preparing"
      ? "order_preparing"
      : step === "ready"
        ? "rider_at_kitchen"
        : step === "out_for_delivery"
          ? "order_picked_up"
          : "delivered";
  await db.insert(deliveryEventsTable).values({ orderId, event: eventName });
  await db.update(ordersTable).set({ status: step }).where(eq(ordersTable.id, orderId));
  logger.info({ orderId, step }, "order pipeline step advanced");
  // Auto-run smart dispatch when an order becomes ready and has no rider yet.
  if (step === "ready") {
    try {
      const [order] = await db
        .select({ riderId: ordersTable.riderId })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);
      if (order && order.riderId == null) {
        const { dispatchOrder } = await import("./dispatch");
        const result = await dispatchOrder(orderId, { allowBatch: true });
        logger.info(
          { orderId, riderId: result.riderId, batched: result.batched },
          "auto-dispatch on ready",
        );
      }
    } catch (err) {
      logger.error({ err, orderId }, "auto-dispatch failed");
    }
  }
  // Auto-log nutrition for the user's wellness dashboard on delivery.
  if (step === "delivered") {
    try {
      const { autoLogDeliveredOrder } = await import("./wellnessAutoLog");
      await autoLogDeliveredOrder(orderId);
    } catch (err) {
      logger.error({ err, orderId }, "wellness auto-log failed");
    }
    try {
      const { recordActualDelivery } = await import("./etaModel");
      await recordActualDelivery(orderId);
    } catch (err) {
      logger.error({ err, orderId }, "eta actual record failed");
    }
  }
  // Hook for socket fanout — late-bound to avoid import cycle.
  try {
    const { emitDeliveryEvent } = await import("./realtime");
    emitDeliveryEvent(orderId, { event: eventName });
  } catch {
    /* realtime module not initialized yet */
  }
};

export function startWorkers(): void {
  if (workersStarted) return;
  const conn = getConnection();
  if (!conn) {
    logger.warn(
      "REDIS_URL not set — BullMQ queue and worker disabled. Background jobs will be skipped.",
    );
    return;
  }
  workersStarted = true;
  const concurrency = Number(process.env["ORDER_PIPELINE_CONCURRENCY"] ?? 4);
  const worker = new Worker<OrderPipelineJob>(QUEUE_NAMES.orderPipeline, orderPipelineProcessor, {
    connection: conn,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 4,
  });
  worker.on("failed", (job, err) =>
    logger.error({ err, jobId: job?.id, attemptsMade: job?.attemptsMade }, "order pipeline job failed"),
  );
  worker.on("error", (err) =>
    logger.error({ err }, "order pipeline worker error"),
  );
  activeWorker = worker;
  logger.info({ concurrency }, "BullMQ worker started for order-pipeline");
}

/**
 * Drain the worker so in-flight jobs complete cleanly. Called from the
 * SIGTERM handler in index.ts.
 */
export async function stopWorkers(): Promise<void> {
  if (!activeWorker) return;
  try {
    await activeWorker.close();
  } finally {
    activeWorker = null;
    workersStarted = false;
  }
}

export async function scheduleOrderAdvance(
  orderId: number,
  step: OrderPipelineJob["step"],
  delayMs: number,
): Promise<boolean> {
  const queue = getOrderPipelineQueue();
  if (!queue) return false;
  await queue.add(
    `advance-${orderId}-${step}`,
    { orderId, step },
    {
      delay: delayMs,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      // Keep the last 1k completed and last 5k failed jobs so we have a
      // visible failure trail without unbounded Redis growth. (Default
      // is unbounded.)
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );
  return true;
}
