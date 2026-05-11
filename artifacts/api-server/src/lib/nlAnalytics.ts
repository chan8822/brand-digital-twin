import { generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import {
  analyticsQueriesTable,
  db,
  type AnalyticsQuery,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "./ai/model";
import { logger } from "./logger";
import {
  describeSchemaForPrompt,
  runSafeSql,
  UnsafeSqlError,
  type SafeSqlResult,
} from "./safeSql";

import { z } from "zod/v4";

export const chartSpecSchema = z.object({
  // Only kinds the analytics UI actually renders. `area` falls back to a
  // line chart in ResultChart; `pie` is intentionally not in the schema
  // because no renderer exists for it.
  kind: z.enum(["bar", "line", "area", "table"]),
  xKey: z.string().min(1).max(64).optional(),
  yKey: z.string().min(1).max(64).optional(),
  seriesKey: z.string().min(1).max(64).optional(),
  title: z.string().max(200).optional(),
});
export type ChartSpec = z.infer<typeof chartSpecSchema>;

export interface AskResult {
  question: string;
  sql: string;
  chartSpec: ChartSpec;
  rationale: string;
  result: SafeSqlResult;
  /** True when the SQL came from the deterministic fallback (model
   *  unavailable / unparsable). Clients should warn the analyst that
   *  the result does not answer their question. */
  fallback: boolean;
  saved?: AnalyticsQuery;
}

const SYS_PROMPT = `You translate analyst questions into a single PostgreSQL SELECT query against a curated safe view.
Rules:
- Output ONLY a SELECT statement (no semicolons, no comments, no DDL/DML).
- Only use the tables/columns listed in the schema.
- Prefer aggregations and date_trunc for time series. Always alias output columns to short snake_case names.
- Cast paise to rupees only if it improves readability; otherwise keep paise.
- Limit results when sensible (e.g. top 20).
- Pick a chart kind: "line"/"area" for time series, "bar" for categories, "table" otherwise.
Return STRICT JSON of shape:
{ "sql": "<select ...>", "chartSpec": {"kind": "...", "xKey": "...", "yKey": "...", "title": "..."}, "rationale": "<one sentence>" }`;

function extractJson(s: string): unknown {
  const fence = s.match(/```json\s*([\s\S]*?)```/i) ?? s.match(/```([\s\S]*?)```/);
  const body = (fence?.[1] ?? s).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON object found in model output");
  return JSON.parse(body.slice(start, end + 1));
}

interface ModelPlan {
  sql: string;
  chartSpec: ChartSpec;
  rationale: string;
  /** True when the planner could not call the model and returned a
   *  hardcoded recent-orders query. Surfaced to the UI so analysts know
   *  the result does NOT answer their question. */
  fallback: boolean;
}

async function planQuery(question: string): Promise<ModelPlan> {
  const schema = describeSchemaForPrompt();
  const prompt = `Schema:\n${schema}\n\nQuestion: ${question}\n\nRespond with the JSON described in the system prompt.`;
  try {
    const { text } = await generateText({
      model: getModel(DEFAULT_MODEL_ID),
      system: SYS_PROMPT,
      prompt,
      temperature: 0.1,
    });
    const parsed = extractJson(text) as Partial<ModelPlan>;
    if (!parsed.sql || typeof parsed.sql !== "string") {
      throw new Error("model did not return sql");
    }
    return {
      sql: parsed.sql,
      chartSpec: parsed.chartSpec ?? { kind: "table" },
      rationale: parsed.rationale ?? "",
      fallback: false,
    };
  } catch (err) {
    logger.warn({ err }, "nl analytics plan failed, falling back");
    // Deterministic fallback so the surface still works without AI.
    // Marked `fallback: true` so the UI can flag that the result does
    // not answer the analyst's actual question.
    return {
      sql: "select date_trunc('day', created_at)::date as day, count(*) as orders, sum(total_paise) as revenue_paise from safe_orders where created_at > now() - interval '14 days' group by 1 order by 1",
      chartSpec: { kind: "line", xKey: "day", yKey: "orders", title: "Orders, last 14 days" },
      rationale: "Could not generate from question — showing recent order trend.",
      fallback: true,
    };
  }
}

export async function askDataQuestion(
  question: string,
  userId: string | null,
): Promise<AskResult> {
  const q = question.trim();
  if (!q) throw new Error("question is required");
  const plan = await planQuery(q);
  const result = await runSafeSql(plan.sql);
  const [saved] = await db
    .insert(analyticsQueriesTable)
    .values({
      userId,
      question: q,
      sql: plan.sql,
      chartSpec: plan.chartSpec,
      rationale: plan.rationale,
      rowCount: result.rowCount,
    })
    .returning();
  return {
    question: q,
    sql: plan.sql,
    chartSpec: plan.chartSpec,
    rationale: plan.rationale,
    result,
    fallback: plan.fallback,
    ...(saved ? { saved } : {}),
  };
}

export async function runEditedSql(
  sql: string,
  question: string | null,
  chartSpec: ChartSpec | null,
  userId: string | null,
): Promise<{ sql: string; result: SafeSqlResult; saved: AnalyticsQuery | null }> {
  const result = await runSafeSql(sql);
  const [saved] = await db
    .insert(analyticsQueriesTable)
    .values({
      userId,
      question: question ?? "(edited SQL)",
      sql,
      chartSpec: chartSpec ?? { kind: "table" },
      rationale: "edited by analyst",
      rowCount: result.rowCount,
    })
    .returning();
  return { sql, result, saved: saved ?? null };
}

export async function listRecentQueries(limit = 25): Promise<AnalyticsQuery[]> {
  return db
    .select()
    .from(analyticsQueriesTable)
    .orderBy(desc(analyticsQueriesTable.createdAt))
    .limit(limit);
}

export async function markQuerySaved(id: number, saved: boolean): Promise<AnalyticsQuery | null> {
  const [row] = await db
    .update(analyticsQueriesTable)
    .set({ saved: saved ? 1 : 0 })
    .where(eq(analyticsQueriesTable.id, id))
    .returning();
  return row ?? null;
}

export { UnsafeSqlError };
