import { Router, type IRouter, type Request, type Response } from "express";
import type { ModelMessage } from "ai";
import { z } from "zod/v4";
import { db, opsActionsTable } from "@workspace/db";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { runAgent, type GatewayEvent } from "../lib/ai";
import { isCatalogRequest, requireCatalog } from "../lib/adminGate";

const router: IRouter = Router();

const ChatTurnSchema = z.object({
  role: z.enum(["user", "agent"]),
  text: z.string(),
});
const ChatBodySchema = z.object({
  message: z.string().min(1).max(8000),
  history: z.array(ChatTurnSchema).max(50).optional(),
});

function writeEvent(res: Response, event: object): void {
  res.write(`${JSON.stringify(event)}\n`);
}

router.post("/cms-agent/chat", async (req: Request, res: Response) => {
  const gate = requireCatalog(req, res);
  if (!gate) return;
  const operatorId = gate.operatorId;
  const parsed = ChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid body" });
    return;
  }
  const body = parsed.data;
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
      agent: "cms",
      userId: operatorId,
      isCatalog: true,
      messages,
      stream: true,
      onEvent,
    });
    res.end();
  } catch (err) {
    req.log.error({ err }, "cms-agent error");
    writeEvent(res, {
      type: "error",
      message: "CMS agent failed. Check logs.",
    });
    writeEvent(res, {
      type: "finish",
      text: "Sorry, the CMS Agent ran into an error. Try again.",
      toolCalls: [],
      escalated: false,
    });
    res.end();
  }
});

router.get("/cms-agent/audit", async (req: Request, res: Response) => {
  if (!isCatalogRequest(req).allowed) {
    res.status(403).json({ error: "catalog scope required" });
    return;
  }
  const limit = Math.min(
    200,
    Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50),
  );
  const conditions: SQL[] = [
    or(
      eq(opsActionsTable.agent, "cms"),
      eq(opsActionsTable.agent, "cms-rest"),
      ilike(opsActionsTable.action, "cms_%"),
    ) as SQL,
  ];
  if (typeof req.query.action === "string") {
    conditions.push(eq(opsActionsTable.action, req.query.action));
  }
  const rows = await db
    .select()
    .from(opsActionsTable)
    .where(and(...conditions))
    .orderBy(desc(opsActionsTable.createdAt))
    .limit(limit);
  res.json({ actions: rows });
});

export default router;
