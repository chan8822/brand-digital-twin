import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { isRedisConfigured, probeRedis } from "../lib/queue";

const router: IRouter = Router();

const DB_PROBE_TIMEOUT_MS = 1500;
const REDIS_PROBE_TIMEOUT_MS = 1500;

async function probeDb(): Promise<"ok" | "down"> {
  const client = await pool.connect();
  try {
    await client.query({ text: "select 1", values: [] });
    return "ok";
  } finally {
    client.release();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} probe timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

router.get("/healthz", async (req: Request, res: Response) => {
  const failures: string[] = [];

  let dbOk = false;
  try {
    const r = await withTimeout(probeDb(), DB_PROBE_TIMEOUT_MS, "db");
    dbOk = r === "ok";
  } catch (err) {
    req.log.error({ err }, "healthz db probe failed");
  }
  if (!dbOk) failures.push("db");

  // Redis is required in production (see queue.ts). In dev we tolerate
  // its absence so the API can run without the worker stack — only treat
  // a configured-but-unreachable Redis as a failure.
  if (isRedisConfigured()) {
    let redisOk = false;
    try {
      const r = await withTimeout(probeRedis(), REDIS_PROBE_TIMEOUT_MS, "redis");
      redisOk = r === "ok";
    } catch (err) {
      req.log.error({ err }, "healthz redis probe failed");
    }
    if (!redisOk) failures.push("redis");
  } else if (process.env["NODE_ENV"] === "production") {
    // Defensive: assertRedisAvailableInProduction should have prevented
    // boot, but fail-closed here too if the env was somehow stripped.
    failures.push("redis");
  }

  if (failures.length > 0) {
    res
      .status(503)
      .json(HealthCheckResponse.parse({ status: `degraded:${failures.join(",")}` }));
    return;
  }
  res.json(HealthCheckResponse.parse({ status: "ok" }));
});

export default router;
