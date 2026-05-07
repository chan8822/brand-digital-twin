import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const aiRunsTable = pgTable(
  "ai_runs",
  {
    id: serial("id").primaryKey(),
    agent: text("agent").notNull(),
    userId: text("user_id"),
    model: text("model").notNull(),
    promptVersion: text("prompt_version"),
    input: jsonb("input").notNull(),
    output: text("output"),
    toolCalls: jsonb("tool_calls").notNull().default([]),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" })
      .notNull()
      .default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    status: text("status").notNull(),
    error: text("error"),
    escalated: integer("escalated").notNull().default(0),
    refusalReason: text("refusal_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ai_runs_agent_created").on(table.agent, table.createdAt),
    index("idx_ai_runs_user_created").on(table.userId, table.createdAt),
  ],
);

export type AiRun = typeof aiRunsTable.$inferSelect;
export type InsertAiRun = typeof aiRunsTable.$inferInsert;
