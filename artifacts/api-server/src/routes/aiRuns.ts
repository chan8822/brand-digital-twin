import { Router, type IRouter, type Request, type Response } from "express";
import { db, aiRunsTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { listAgents } from "../lib/ai";

const router: IRouter = Router();

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
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25),
  );
  const agent =
    typeof req.query.agent === "string" ? req.query.agent : undefined;

  const conditions = [];
  // Non-ops users see only their own runs. Ops gating comes later — for
  // now any authenticated user can view their own AI run history.
  conditions.push(eq(aiRunsTable.userId, req.user.id));
  if (agent) conditions.push(eq(aiRunsTable.agent, agent));

  const rows = await db
    .select({
      id: aiRunsTable.id,
      agent: aiRunsTable.agent,
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
      createdAt: aiRunsTable.createdAt,
      output: aiRunsTable.output,
      toolCalls: aiRunsTable.toolCalls,
    })
    .from(aiRunsTable)
    .where(and(...conditions))
    .orderBy(desc(aiRunsTable.createdAt))
    .limit(limit);

  res.json({ runs: rows });
});

export default router;
