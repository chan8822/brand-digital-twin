import type { ToolCallTrace, ToolDefinition } from "./tools";
import type { PromptDefinition } from "./prompts";

export interface AgentDefinition<TPromptCtx = unknown> {
  name: string;
  description: string;
  defaultModel?: string;
  maxSteps?: number;
  systemPrompt: PromptDefinition<TPromptCtx>;
  tools: ToolDefinition[];
  preflight?: (
    userMessage: string,
  ) => { refusal: { text: string; reason: string } } | null;
  detectEscalation?: (text: string, toolCalls: ToolCallTrace[]) => boolean;
}

const REGISTRY = new Map<string, AgentDefinition>();

export function registerAgent<TCtx>(agent: AgentDefinition<TCtx>): void {
  REGISTRY.set(agent.name, agent as unknown as AgentDefinition);
}

export function getAgent(name: string): AgentDefinition | undefined {
  return REGISTRY.get(name);
}

export function listAgents(): AgentDefinition[] {
  return Array.from(REGISTRY.values());
}
