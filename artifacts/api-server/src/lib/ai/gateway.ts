import { streamText, generateText, stepCountIs, type ModelMessage } from "ai";
import { db, aiRunsTable } from "@workspace/db";
import { logger } from "../logger";
import { DEFAULT_MODEL_ID, getModel } from "./model";
import { estimateCostMicroUsd } from "./pricing";
import { buildTools, type ToolCallTrace, type ToolContext } from "./tools";
import type { AgentDefinition } from "./agentRegistry";
import { getAgent } from "./agentRegistry";

export interface RunAgentOptions {
  agent: string;
  userId: string | null;
  isOps?: boolean;
  messages: ModelMessage[];
  promptContext?: unknown;
  onEvent?: (event: GatewayEvent) => void;
  stream?: boolean;
  modelId?: string;
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
        input: row.input as unknown as Record<string, unknown>,
        output: row.output,
        toolCalls: row.toolCalls as unknown as Record<string, unknown>,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.inputTokens + row.outputTokens,
        costMicroUsd: row.costMicroUsd,
        latencyMs: row.latencyMs,
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

  try {
    if (opts.stream) {
      const result = streamText({
        model: getModel(modelId),
        system,
        messages: opts.messages,
        tools,
        stopWhen: stepCountIs(agent.maxSteps ?? 4),
      });
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
    } else {
      const result = await generateText({
        model: getModel(modelId),
        system,
        messages: opts.messages,
        tools,
        stopWhen: stepCountIs(agent.maxSteps ?? 4),
      });
      fullText = result.text;
      inputTokens = result.usage.inputTokens ?? 0;
      outputTokens = result.usage.outputTokens ?? 0;
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
