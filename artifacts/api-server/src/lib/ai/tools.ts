import { tool, type Tool } from "ai";
import type { z } from "zod/v4";

export type AuthScope = "public" | "user" | "ops";

export interface ToolContext {
  userId: string | null;
  agent: string;
  isOps: boolean;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  authScope: AuthScope;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export function defineTool<TInput, TOutput>(
  def: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return def;
}

export interface ToolCallTrace {
  name: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  ms: number;
}

export interface BuildToolsResult {
  tools: Record<string, Tool>;
  traces: ToolCallTrace[];
}

function authorizes(scope: AuthScope, ctx: ToolContext): boolean {
  if (scope === "public") return true;
  if (scope === "user") return ctx.userId != null;
  if (scope === "ops") return ctx.isOps;
  return false;
}

export function buildTools(
  defs: ToolDefinition[],
  ctx: ToolContext,
): BuildToolsResult {
  const traces: ToolCallTrace[] = [];
  const tools: Record<string, Tool> = {};
  for (const def of defs) {
    tools[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input: unknown) => {
        const start = Date.now();
        if (!authorizes(def.authScope, ctx)) {
          const out = {
            success: false as const,
            error: `not authorized for tool ${def.name}`,
          };
          traces.push({
            name: def.name,
            input,
            output: out,
            ok: false,
            ms: Date.now() - start,
          });
          return out;
        }
        try {
          const out = await def.handler(input as never, ctx);
          traces.push({
            name: def.name,
            input,
            output: out,
            ok: true,
            ms: Date.now() - start,
          });
          return out;
        } catch (err) {
          const out = {
            success: false as const,
            error: (err as Error).message,
          };
          traces.push({
            name: def.name,
            input,
            output: out,
            ok: false,
            ms: Date.now() - start,
          });
          return out;
        }
      },
    });
  }
  return { tools, traces };
}
