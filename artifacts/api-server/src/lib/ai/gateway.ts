import { streamText, generateText, stepCountIs, type ModelMessage } from "ai";
import { db, aiRunsTable } from "@workspace/db";
import { logger } from "../logger";

// --- Storage redaction for ai_runs.input -----------------------------------
//
// `ai_runs.input` is the verbatim conversation we sent to the model. Ops
// staff browse this table from /admin/ai-runs to debug refusals and
// hallucinations, so the storage layer is effectively a long-retention
// PII sink. The system prompt already runs through `redactBrief` (see
// lib/userBrief/redaction.ts) so it omits address/phone/email — but the
// USER message bodies are free text and routinely include phone numbers
// ("call me on +91 9XXXX XXXX"), email handles, addresses, and 12+
// digit ID numbers. Mask them before persistence so a future ops-table
// breach can't leak them. The unredacted text was already sent to the
// model provider and was already used to compute the response; nothing
// downstream needs the raw form.
const PII_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  // Email — strict-ish to avoid mangling URLs in code blocks.
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: "[email]" },
  // Phone numbers: + country code + 7..14 digits with optional separators.
  { re: /\+\d[\d\s().-]{6,16}\d/g, replacement: "[phone]" },
  // Bare 10–14 digit runs (Indian mobile w/o +91, Aadhaar, PAN-like).
  { re: /\b\d{10,14}\b/g, replacement: "[number]" },
  // 6-digit Indian pincodes when prefixed by a comma/space context.
  { re: /\b\d{6}\b/g, replacement: "[pincode]" },
];

function redactString(s: string): string {
  let out = s;
  for (const { re, replacement } of PII_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

function redactMessageContent(content: unknown): unknown {
  if (typeof content === "string") return redactString(content);
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part && typeof part === "object" && "text" in part && typeof (part as { text: unknown }).text === "string") {
        return { ...part, text: redactString((part as { text: string }).text) };
      }
      return part;
    });
  }
  return content;
}

function redactMessagesForStorage(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== "user") return m;
    return { ...m, content: redactMessageContent(m.content) } as ModelMessage;
  });
}
import { DEFAULT_MODEL_ID, getModel } from "./model";
import { estimateCostMicroUsd } from "./pricing";
import { buildTools, type ToolCallTrace, type ToolContext } from "./tools";
import type { AgentDefinition } from "./agentRegistry";
import { getAgent } from "./agentRegistry";

export interface RunAgentOptions {
  agent: string;
  userId: string | null;
  isOps?: boolean;
  isCatalog?: boolean;
  messages: ModelMessage[];
  promptContext?: unknown;
  onEvent?: (event: GatewayEvent) => void;
  stream?: boolean;
  modelId?: string;
  /** Per-attempt timeout for the model call. Default 30s. */
  timeoutMs?: number;
  /** Maximum attempts on transient errors (non-stream only). Default 2. */
  maxAttempts?: number;
}

export type GatewayEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; name: string; args: unknown }
  | { type: "tool-result"; name: string; result: unknown }
  | { type: "refusal"; reason: string; text: string }
  | {
      type: "finish";
      text: string;
      toolCalls: ToolCallTrace[];
      escalated: boolean;
      refusalReason?: string;
      tokens: { input: number; output: number; total: number };
      costMicroUsd: number;
      latencyMs: number;
    }
  | { type: "error"; message: string };

export interface RunAgentResult {
  text: string;
  toolCalls: ToolCallTrace[];
  escalated: boolean;
  refusalReason?: string;
  tokens: { input: number; output: number; total: number };
  costMicroUsd: number;
  latencyMs: number;
  runId: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 2;

function isTransientError(err: unknown): boolean {
  const message = (err as Error)?.message ?? "";
  if (/aborted|timeout/i.test(message)) return true;
  const status = (err as { status?: number; statusCode?: number })?.status ??
    (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && (status === 429 || status >= 500)) {
    return true;
  }
  return false;
}

async function persistRun(row: {
  agent: string;
  userId: string | null;
  modelId: string;
  promptVersion: string;
  input: ModelMessage[];
  output: string | null;
  toolCalls: ToolCallTrace[];
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  latencyMs: number;
  attempts: number;
  timedOut: boolean;
  status: "ok" | "error" | "refused";
  error: string | null;
  escalated: boolean;
  refusalReason: string | null;
}): Promise<number> {
  try {
    const [r] = await db
      .insert(aiRunsTable)
      .values({
        agent: row.agent,
        userId: row.userId,
        model: row.modelId,
        promptVersion: row.promptVersion,
        input: redactMessagesForStorage(
          row.input,
        ) as unknown as Record<string, unknown>,
        output: row.output,
        toolCalls: row.toolCalls as unknown as Record<string, unknown>,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.inputTokens + row.outputTokens,
        costMicroUsd: row.costMicroUsd,
        latencyMs: row.latencyMs,
        attempts: row.attempts,
        timedOut: row.timedOut ? 1 : 0,
        status: row.status,
        error: row.error,
        escalated: row.escalated ? 1 : 0,
        refusalReason: row.refusalReason,
      })
      .returning({ id: aiRunsTable.id });
    return r?.id ?? 0;
  } catch (err) {
    logger.error({ err }, "ai_runs insert failed");
    return 0;
  }
}

function applyPreflight(
  agent: AgentDefinition,
  messages: ModelMessage[],
): { refusal: { text: string; reason: string } } | null {
  if (!agent.preflight) return null;
  const last = messages[messages.length - 1];
  const userText =
    last && last.role === "user" && typeof last.content === "string"
      ? last.content
      : "";
  return agent.preflight(userText);
}

export async function runAgent(
  opts: RunAgentOptions,
): Promise<RunAgentResult> {
  const agent = getAgent(opts.agent);
  if (!agent) {
    throw new Error(`unknown agent: ${opts.agent}`);
  }

  const modelId = opts.modelId ?? agent.defaultModel ?? DEFAULT_MODEL_ID;
  const start = Date.now();
  const ctx: ToolContext = {
    userId: opts.userId,
    agent: agent.name,
    isOps: opts.isOps === true,
    isCatalog: opts.isCatalog === true,
  };

  const refusal = applyPreflight(agent, opts.messages);
  if (refusal) {
    if (opts.onEvent) {
      opts.onEvent({
        type: "refusal",
        reason: refusal.refusal.reason,
        text: refusal.refusal.text,
      });
      opts.onEvent({ type: "text-delta", delta: refusal.refusal.text });
    }
    const latencyMs = Date.now() - start;
    const result: RunAgentResult = {
      text: refusal.refusal.text,
      toolCalls: [],
      escalated: true,
      refusalReason: refusal.refusal.reason,
      tokens: { input: 0, output: 0, total: 0 },
      costMicroUsd: 0,
      latencyMs,
      runId: 0,
    };
    if (opts.onEvent) {
      opts.onEvent({
        type: "finish",
        text: result.text,
        toolCalls: [],
        escalated: true,
        refusalReason: result.refusalReason,
        tokens: result.tokens,
        costMicroUsd: 0,
        latencyMs,
      });
    }
    result.runId = await persistRun({
      agent: agent.name,
      userId: opts.userId,
      modelId,
      promptVersion: agent.systemPrompt.version,
      input: opts.messages,
      output: result.text,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      latencyMs,
      attempts: 1,
      timedOut: false,
      status: "refused",
      error: null,
      escalated: true,
      refusalReason: refusal.refusal.reason,
    });
    return result;
  }

  const { tools, traces } = buildTools(agent.tools, ctx);
  const system = agent.systemPrompt.build(opts.promptContext as never);

  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;
  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

  try {
    if (opts.stream) {
      // Streaming mode: a single attempt with a timeout. We do not retry mid
      // stream because partial deltas may already have been flushed to the
      // client. Transient failures before the first delta still surface as
      // errors to the caller.
      attempts = 1;
      const ctrl = new AbortController();
      const timer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, timeoutMs);
      const result = streamText({
        model: getModel(modelId),
        system,
        messages: opts.messages,
        tools,
        stopWhen: stepCountIs(agent.maxSteps ?? 4),
        abortSignal: ctrl.signal,
      });
      try {
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "text-delta": {
            const delta =
              (part as unknown as { text?: string; delta?: string }).text ??
              (part as { delta?: string }).delta ??
              "";
            if (delta) {
              fullText += delta;
              opts.onEvent?.({ type: "text-delta", delta });
            }
            break;
          }
          case "tool-call":
            opts.onEvent?.({
              type: "tool-call",
              name: part.toolName,
              args: part.input,
            });
            break;
          case "tool-result":
            opts.onEvent?.({
              type: "tool-result",
              name: part.toolName,
              result: (part as unknown as { output?: unknown }).output,
            });
            break;
          case "error":
            throw (part as { error: unknown }).error;
          default:
            break;
        }
      }
      const usage = await result.usage;
      inputTokens = usage.inputTokens ?? 0;
      outputTokens = usage.outputTokens ?? 0;
      } finally {
        clearTimeout(timer);
      }
    } else {
      // Non-streaming: bounded retry loop on transient errors with a per
      // attempt timeout. Attempt count is recorded in ai_runs.attempts.
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        attempts = attempt;
        const ctrl = new AbortController();
        const timer = setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, timeoutMs);
        try {
          const result = await generateText({
            model: getModel(modelId),
            system,
            messages: opts.messages,
            tools,
            stopWhen: stepCountIs(agent.maxSteps ?? 4),
            abortSignal: ctrl.signal,
          });
          clearTimeout(timer);
          fullText = result.text;
          inputTokens = result.usage.inputTokens ?? 0;
          outputTokens = result.usage.outputTokens ?? 0;
          lastErr = undefined;
          break;
        } catch (err) {
          clearTimeout(timer);
          lastErr = err;
          if (attempt >= maxAttempts || !isTransientError(err)) break;
          timedOut = false;
          logger.warn(
            { err, agent: agent.name, attempt },
            "gateway transient error, retrying",
          );
        }
      }
      if (lastErr) throw lastErr;
    }
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = (err as Error).message;
    logger.error({ err, agent: agent.name }, "gateway error");
    opts.onEvent?.({ type: "error", message });
    const runId = await persistRun({
      agent: agent.name,
      userId: opts.userId,
      modelId,
      promptVersion: agent.systemPrompt.version,
      input: opts.messages,
      output: null,
      toolCalls: traces,
      inputTokens,
      outputTokens,
      costMicroUsd: 0,
      latencyMs,
      attempts: Math.max(1, attempts),
      timedOut,
      status: "error",
      error: message,
      escalated: false,
      refusalReason: null,
    });
    throw Object.assign(new Error(message), { runId });
  }

  const text = fullText || "I'm not sure how to help with that.";
  const escalated = agent.detectEscalation
    ? agent.detectEscalation(text, traces)
    : false;
  const latencyMs = Date.now() - start;
  const costMicroUsd = estimateCostMicroUsd(modelId, inputTokens, outputTokens);

  if (opts.onEvent) {
    opts.onEvent({
      type: "finish",
      text,
      toolCalls: traces,
      escalated,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      costMicroUsd,
      latencyMs,
    });
  }

  const runId = await persistRun({
    agent: agent.name,
    userId: opts.userId,
    modelId,
    promptVersion: agent.systemPrompt.version,
    input: opts.messages,
    output: text,
    toolCalls: traces,
    inputTokens,
    outputTokens,
    costMicroUsd,
    latencyMs,
    attempts: Math.max(1, attempts),
    timedOut,
    status: "ok",
    error: null,
    escalated,
    refusalReason: null,
  });

  return {
    text,
    toolCalls: traces,
    escalated,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    },
    costMicroUsd,
    latencyMs,
    runId,
  };
}
