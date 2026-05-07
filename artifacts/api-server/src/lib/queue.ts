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
  const worker = new Worker<OrderPipelineJob>(QUEUE_NAMES.orderPipeline, orderPipelineProcessor, {
    connection: conn,
  });
  worker.on("failed", (job, err) =>
    logger.error({ err, jobId: job?.id }, "order pipeline job failed"),
  );
  logger.info("BullMQ worker started for order-pipeline");
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
    { delay: delayMs, attempts: 3, backoff: { type: "exponential", delay: 2000 } },
  );
  return true;
}
