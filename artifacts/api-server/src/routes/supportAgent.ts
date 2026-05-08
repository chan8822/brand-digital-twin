import { Router, type IRouter, type Request, type Response } from "express";
import type { ModelMessage } from "ai";
import { runAgent, type GatewayEvent } from "../lib/ai";
import { getUserBriefForRequest } from "../lib/userBrief";

const router: IRouter = Router();

interface ChatTurn {
  role: "user" | "agent";
  text: string;
}

interface ChatBody {
  message: string;
  history?: ChatTurn[];
}

/**
 * NDJSON event stream protocol for the chat endpoint. Each line is a JSON
 * object — text-delta, tool-call, tool-result, finish, or error. The
 * gateway emits these events; the route only handles serialization and
 * the legacy `finish` payload shape that the Admin Ops dashboard expects.
 */
function writeEvent(res: Response, event: object): void {
  res.write(`${JSON.stringify(event)}\n`);
}

function startStream(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

router.post("/support-agent/chat", async (req: Request, res: Response) => {
  const body = req.body as ChatBody;
  if (!body?.message || typeof body.message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }
  const message = body.message.trim();

  startStream(res);

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
        // text-delta will be emitted next by the gateway; nothing to do here
        break;
      case "finish":
        writeEvent(res, {
          type: "finish",
          text: event.text,
          toolCalls: event.toolCalls.map((t) => ({
            name: t.name,
            args: t.input,
            result: t.output,
          })),
          escalated: event.escalated,
          ...(event.refusalReason
            ? { refusalReason: event.refusalReason }
            : {}),
        });
        break;
      case "error":
        writeEvent(res, { type: "error", message: event.message });
        break;
    }
  };

  try {
    const userId = req.user?.id ?? null;
    const brief = userId
      ? await getUserBriefForRequest(req, userId).catch(() => null)
      : null;
    await runAgent({
      agent: "support",
      userId,
      messages,
      stream: true,
      onEvent,
      promptContext: { brief },
    });
    res.end();
  } catch (err) {
    req.log.error({ err }, "support-agent error");
    const fallback =
      "I'm having trouble reaching our systems right now. Please try again in a moment.";
    writeEvent(res, { type: "error", message: fallback });
    writeEvent(res, {
      type: "finish",
      text: fallback,
      toolCalls: [],
      escalated: false,
    });
    res.end();
  }
});

export default router;
