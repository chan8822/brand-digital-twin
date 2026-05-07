import { Router, type IRouter, type Request, type Response } from "express";
import { db, aiRunsTable } from "@workspace/db";
import { desc, eq, and, lt, type SQL } from "drizzle-orm";
import { listAgents } from "../lib/ai";

const router: IRouter = Router();

/**
 * Admin gating for telemetry endpoints.
 *
 * Admin access is granted by either:
 *   - HTTP header `x-admin-token` matching env `RD_ADMIN_TOKEN`, or
 *   - cookie/session attribute `req.session.isAdmin === true` (set by the
 *     web AdminGate after a token exchange — out of scope here).
 *
 * If `RD_ADMIN_TOKEN` is unset, admin elevation via header is disabled.
 */
function isAdminRequest(req: Request): boolean {
  const expected = process.env["RD_ADMIN_TOKEN"];
  if (expected) {
    const header = req.header("x-admin-token");
    if (header && header === expected) return true;
  }
  const session = (req as Request & { session?: { isAdmin?: boolean } })
    .session;
  if (session?.isAdmin === true) return true;
  return false;
}

router.get("/ai/agents", (_req: Request, res: Response) => {
  res.json({
    agents: listAgents().map((a) => ({
      name: a.name,
      description: a.description,
      defaultModel: a.defaultModel ?? null,
      promptVersion: a.systemPrompt.version,
      tools: a.tools.map((t) => ({
        name: t.name,
        description: t.description,
        authScope: t.authScope,
      })),
    })),
  });
});

router.get("/ai/runs", async (req: Request, res: Response) => {
  const admin = isAdminRequest(req);
  if (!admin && !req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25),
  );
  const agent =
    typeof req.query.agent === "string" ? req.query.agent : undefined;
  const userIdFilter =
    typeof req.query.userId === "string" ? req.query.userId : undefined;
  const beforeId =
    typeof req.query.beforeId === "string"
      ? parseInt(req.query.beforeId, 10) || undefined
      : undefined;

  const conditions: SQL[] = [];

  if (admin) {
    // Admin can view all runs across users; optional userId filter narrows.
    if (userIdFilter) conditions.push(eq(aiRunsTable.userId, userIdFilter));
  } else {
    // Non-admin authenticated users only see their own runs and may not
    // request another user's runs even via query param.
    conditions.push(eq(aiRunsTable.userId, req.user!.id));
  }

  if (agent) conditions.push(eq(aiRunsTable.agent, agent));
  if (beforeId) conditions.push(lt(aiRunsTable.id, beforeId));

  const baseQuery = db
    .select({
      id: aiRunsTable.id,
      agent: aiRunsTable.agent,
      userId: aiRunsTable.userId,
      model: aiRunsTable.model,
      promptVersion: aiRunsTable.promptVersion,
      status: aiRunsTable.status,
      escalated: aiRunsTable.escalated,
      refusalReason: aiRunsTable.refusalReason,
      inputTokens: aiRunsTable.inputTokens,
      outputTokens: aiRunsTable.outputTokens,
      totalTokens: aiRunsTable.totalTokens,
      costMicroUsd: aiRunsTable.costMicroUsd,
      latencyMs: aiRunsTable.latencyMs,
      attempts: aiRunsTable.attempts,
      timedOut: aiRunsTable.timedOut,
      createdAt: aiRunsTable.createdAt,
      output: aiRunsTable.output,
      toolCalls: aiRunsTable.toolCalls,
    })
    .from(aiRunsTable);

  const rows = await (conditions.length > 0
    ? baseQuery.where(and(...conditions))
    : baseQuery
  )
    .orderBy(desc(aiRunsTable.id))
    .limit(limit);

  const nextCursor =
    rows.length === limit ? rows[rows.length - 1]!.id : null;

  res.json({ scope: admin ? "admin" : "self", runs: rows, nextCursor });
});

export default router;
