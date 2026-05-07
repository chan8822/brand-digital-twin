import { Router, type IRouter, type Request, type Response } from "express";
import type { ModelMessage } from "ai";
import { db, opsActionsTable } from "@workspace/db";
import { desc, eq, and, type SQL } from "drizzle-orm";
import { runAgent, type GatewayEvent } from "../lib/ai";
import { fetchLiveQueue } from "../lib/ai/agents/ops";

const router: IRouter = Router();

/**
 * Ops gating.
 *
 * An operator is authorized to drive the Ops Agent when EITHER:
 *   - The request carries `x-admin-token` matching env `RD_ADMIN_TOKEN`
 *     (used by the Admin Ops console for token-elevated dev access), OR
 *   - The authenticated user's id is listed in `OPS_USER_IDS`
 *     (comma-separated allowlist env var).
 *
 * If neither token nor allowlist is configured, the agent is locked.
 */
function resolveOps(req: Request): { allowed: boolean; operatorId: string | null } {
  const adminToken = process.env["RD_ADMIN_TOKEN"];
  const headerToken = req.header("x-admin-token");
  if (adminToken && headerToken && headerToken === adminToken) {
    return { allowed: true, operatorId: req.user?.id ?? "admin-token" };
  }
  const allowlist = (process.env["OPS_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (req.isAuthenticated() && allowlist.includes(req.user.id)) {
    return { allowed: true, operatorId: req.user.id };
  }
  return { allowed: false, operatorId: null };
}

interface ChatTurn {
  role: "user" | "agent";
  text: string;
}

interface ChatBody {
  message: string;
  history?: ChatTurn[];
}

function writeEvent(res: Response, event: object): void {
  res.write(`${JSON.stringify(event)}\n`);
}

router.post("/ops-agent/chat", async (req: Request, res: Response) => {
  const { allowed, operatorId } = resolveOps(req);
  if (!allowed) {
    res.status(403).json({ error: "ops scope required" });
    return;
  }
  const body = req.body as ChatBody;
  if (!body?.message || typeof body.message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }
  const message = body.message.trim();

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const messages: ModelMessage[] = [
    ...((body.history ?? []).map(
      (m): ModelMessage => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }),
    )),
    { role: "user", content: message },
  ];

  const onEvent = (event: GatewayEvent) => {
    switch (event.type) {
      case "text-delta":
        writeEvent(res, { type: "text-delta", delta: event.delta });
        break;
      case "tool-call":
        writeEvent(res, {
          type: "tool-call",
          name: event.name,
          args: event.args,
        });
        break;
      case "tool-result":
        writeEvent(res, {
          type: "tool-result",
          name: event.name,
          result: event.result,
        });
        break;
      case "refusal":
        break;
      case "finish":
        writeEvent(res, {
          type: "finish",
          text: event.text,
          toolCalls: event.toolCalls.map((t) => ({
            name: t.name,
            args: t.input,
            result: t.output,
            ok: t.ok,
            ms: t.ms,
          })),
          escalated: event.escalated,
        });
        break;
      case "error":
        writeEvent(res, { type: "error", message: event.message });
        break;
    }
  };

  try {
    await runAgent({
      agent: "ops",
      userId: operatorId,
      isOps: true,
      messages,
      stream: true,
      onEvent,
    });
    res.end();
  } catch (err) {
    req.log.error({ err }, "ops-agent error");
    writeEvent(res, {
      type: "error",
      message: "Ops agent failed. Check logs.",
    });
    writeEvent(res, {
      type: "finish",
      text: "Sorry, the Ops Agent ran into an error. Try again.",
      toolCalls: [],
      escalated: false,
    });
    res.end();
  }
});

router.get("/ops-agent/live-queue", async (req: Request, res: Response) => {
  const { allowed } = resolveOps(req);
  if (!allowed) {
    res.status(403).json({ error: "ops scope required" });
    return;
  }
  const result = await fetchLiveQueue({});
  res.json(result);
});

router.get("/ops-agent/audit", async (req: Request, res: Response) => {
  const { allowed } = resolveOps(req);
  if (!allowed) {
    res.status(403).json({ error: "ops scope required" });
    return;
  }
  const limit = Math.min(
    200,
    Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50),
  );
  const action =
    typeof req.query.action === "string" ? req.query.action : undefined;
  const operator =
    typeof req.query.operatorId === "string"
      ? req.query.operatorId
      : undefined;
  const conditions: SQL[] = [];
  if (action) conditions.push(eq(opsActionsTable.action, action));
  if (operator) conditions.push(eq(opsActionsTable.operatorId, operator));
  const rows = await (conditions.length > 0
    ? db.select().from(opsActionsTable).where(and(...conditions))
    : db.select().from(opsActionsTable))
    .orderBy(desc(opsActionsTable.createdAt))
    .limit(limit);
  res.json({ actions: rows });
});

export default router;
