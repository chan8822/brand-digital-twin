import { Router, type IRouter, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db, aiRunsTable } from "@workspace/db";
import { requireOps } from "../lib/adminGate";
import { probeRedis, isRedisConfigured } from "../lib/queue";
import { logger } from "../lib/logger";

/**
 * `/admin/_status` — operations health dashboard. Returns a single
 * JSON payload covering:
 *
 *   - env: every env var the admin + agent stack expects, with a
 *     {set, required, hint} triple so the operator can see at a
 *     glance which knobs are missing on this deployment.
 *   - dependencies: live status of Postgres, Redis, and the BullMQ
 *     queue.
 *   - agents: per-agent rollup of the last-24h ai_runs (count,
 *     failure rate, last success timestamp). Reveals whether each
 *     agent is actually serving traffic without having to drill into
 *     /admin/ai-runs.
 *
 * Gated by requireOps so only operators see it. Safe to poll —
 * each call costs one cheap DB aggregate + one Redis PING.
 */

const router: IRouter = Router();

interface EnvCheck {
  name: string;
  required: boolean;
  set: boolean;
  hint: string;
  // We never echo the value — only presence.
}

const ENV_SPEC: Array<Omit<EnvCheck, "set">> = [
  { name: "DATABASE_URL", required: true, hint: "Postgres connection string (with sslmode=require)." },
  { name: "REDIS_URL", required: true, hint: "BullMQ + rate-limit storage. Without it, the order pipeline silently disables in dev and crash-on-boot in prod." },
  { name: "GOOGLE_API_KEY", required: true, hint: "Gemini key. Without it, every AI agent route returns an error." },
  { name: "ALLOWED_ORIGINS", required: true, hint: "Comma-separated origins for CORS. e.g. https://tanmatra.food" },
  { name: "ADMIN_USERNAME", required: true, hint: "Username for /admin/login." },
  { name: "ADMIN_PASSWORD_HASH", required: true, hint: "bcrypt hash of the admin password. Mint via POST /admin/_hash with x-admin-secret header." },
  { name: "ADMIN_SESSION_SECRET", required: true, hint: "HMAC secret for the admin cookie. 32+ random bytes." },
  { name: "RD_ADMIN_TOKEN", required: false, hint: "Alternative admin auth via x-admin-token header. Used by curl/CI." },
  { name: "OPS_USER_IDS", required: false, hint: "Comma-separated user UUIDs allowed at /admin/ops (in addition to admin session)." },
  { name: "CATALOG_USER_IDS", required: false, hint: "Comma-separated user UUIDs allowed in CMS / catalog edits." },
  { name: "SESSION_SAMESITE", required: false, hint: "Customer session cookie SameSite — set to `none` for cross-origin Firebase → Cloud Run setup." },
  { name: "PRIVATE_OBJECT_DIR", required: false, hint: "GCS object-storage prefix for menu-asset uploads. Format: /<bucket>/<prefix>." },
  { name: "FIREBASE_DOMAIN", required: false, hint: "Frontend domain used for absolute links in transactional emails / WhatsApp." },
  { name: "TWILIO_ACCOUNT_SID", required: false, hint: "OTP SMS provider. Without it, OTPs go to console.log only (mock mode)." },
  { name: "TWILIO_AUTH_TOKEN", required: false, hint: "Pairs with TWILIO_ACCOUNT_SID." },
  { name: "TWILIO_VERIFY_SID", required: false, hint: "Verify-service SID for phone OTP." },
  { name: "RAZORPAY_KEY_ID", required: false, hint: "Razorpay publishable key. Without it, payment falls back to mark-as-paid (dev mode)." },
  { name: "RAZORPAY_KEY_SECRET", required: false, hint: "Pairs with RAZORPAY_KEY_ID; never exposed to the browser." },
];

function envChecks(): EnvCheck[] {
  return ENV_SPEC.map((spec) => ({
    ...spec,
    set: Boolean(process.env[spec.name]),
  }));
}

const AGENTS = [
  "coach",
  "support",
  "ops",
  "cms",
  "forecasting",
  "reorder",
] as const;

interface AgentRollup {
  name: string;
  totalRuns: number;
  failures: number;
  failureRate: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
}

async function agentRollups(): Promise<AgentRollup[]> {
  try {
    const rows = await db.execute<{
      agent: string;
      total: number;
      failures: number;
      last_run_at: Date | null;
      last_success_at: Date | null;
    }>(sql`
      select
        agent,
        count(*)::int as total,
        sum(case when status <> 'ok' then 1 else 0 end)::int as failures,
        max(created_at) as last_run_at,
        max(case when status = 'ok' then created_at else null end) as last_success_at
      from ${aiRunsTable}
      where created_at > now() - interval '24 hours'
      group by agent
    `);
    const byName = new Map(rows.rows.map((r) => [r.agent, r]));
    return AGENTS.map((name) => {
      const r = byName.get(name);
      const total = r?.total ?? 0;
      const failures = r?.failures ?? 0;
      return {
        name,
        totalRuns: total,
        failures,
        failureRate: total === 0 ? 0 : failures / total,
        lastRunAt: r?.last_run_at ? new Date(r.last_run_at).toISOString() : null,
        lastSuccessAt: r?.last_success_at
          ? new Date(r.last_success_at).toISOString()
          : null,
      };
    });
  } catch (err) {
    logger.error({ err }, "agentRollups failed");
    return AGENTS.map((name) => ({
      name,
      totalRuns: 0,
      failures: 0,
      failureRate: 0,
      lastRunAt: null,
      lastSuccessAt: null,
    }));
  }
}

router.get("/admin/_status", async (req: Request, res: Response) => {
  const gate = requireOps(req, res);
  if (!gate) return;

  const env = envChecks();
  const redisState = await probeRedis().catch(() => "down" as const);

  let dbHealthy = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbHealthy = false;
  }

  const agents = await agentRollups();

  const missingRequired = env.filter((e) => e.required && !e.set).map((e) => e.name);

  res.json({
    ok: missingRequired.length === 0 && dbHealthy && redisState !== "down",
    summary: {
      missingRequiredEnv: missingRequired,
      dbHealthy,
      redisConfigured: isRedisConfigured(),
      redisState,
      agentsLast24h: agents.reduce((n, a) => n + a.totalRuns, 0),
    },
    env,
    dependencies: {
      db: { healthy: dbHealthy },
      redis: { state: redisState },
    },
    agents,
  });
});

export default router;
