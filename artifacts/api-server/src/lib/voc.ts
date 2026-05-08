import { generateText } from "ai";
import { and, desc, gte, lt, sql } from "drizzle-orm";
import {
  db,
  dishReviewsTable,
  vocThemesTable,
  type VocTheme,
} from "@workspace/db";
import { messages, conversations } from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "./ai/model";
import { logger } from "./logger";

interface SourceDoc {
  source: "review" | "support";
  body: string;
  rating?: number;
}

const MAX_DOCS = 200;

async function loadDocuments(start: Date, end: Date): Promise<SourceDoc[]> {
  const [reviews, supportRows] = await Promise.all([
    db
      .select({
        body: dishReviewsTable.body,
        rating: dishReviewsTable.rating,
      })
      .from(dishReviewsTable)
      .where(
        and(
          gte(dishReviewsTable.createdAt, start),
          lt(dishReviewsTable.createdAt, end),
        ),
      )
      .limit(MAX_DOCS),
    db
      .select({ content: messages.content })
      .from(messages)
      .innerJoin(conversations, sql`${messages.conversationId} = ${conversations.id}`)
      .where(
        and(
          gte(messages.createdAt, start),
          lt(messages.createdAt, end),
          sql`${messages.role} = 'user'`,
        ),
      )
      .limit(MAX_DOCS),
  ]);
  const docs: SourceDoc[] = [
    ...reviews
      .filter((r) => r.body && r.body.trim().length > 5)
      .map((r) => ({ source: "review" as const, body: r.body, rating: r.rating ?? undefined })),
    ...supportRows
      .filter((r) => r.content && r.content.trim().length > 5)
      .map((r) => ({ source: "support" as const, body: r.content })),
  ];
  return docs.slice(0, MAX_DOCS);
}

interface ModelTheme {
  theme: string;
  sentiment: "positive" | "negative" | "mixed";
  summary: string;
  exampleIndices: number[];
}

function extractJson(s: string): unknown {
  const fence = s.match(/```json\s*([\s\S]*?)```/i) ?? s.match(/```([\s\S]*?)```/);
  const body = (fence?.[1] ?? s).trim();
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("no JSON array found");
  return JSON.parse(body.slice(start, end + 1));
}

function templateClusters(docs: SourceDoc[]): ModelTheme[] {
  // Naive keyword clustering as a no-AI fallback.
  const groups: Record<string, number[]> = {
    "Delivery & timing": [],
    "Food quality & taste": [],
    "Pricing & value": [],
    "Packaging & freshness": [],
    "Other": [],
  };
  docs.forEach((d, i) => {
    const t = d.body.toLowerCase();
    if (/(late|delay|deliver|rider|eta|wait)/.test(t)) groups["Delivery & timing"]?.push(i);
    else if (/(price|cost|expensive|cheap|value)/.test(t)) groups["Pricing & value"]?.push(i);
    else if (/(pack|leak|container|cold|hot|fresh|stale)/.test(t)) groups["Packaging & freshness"]?.push(i);
    else if (/(taste|flavou?r|spicy|bland|delicious|salty|sweet)/.test(t)) groups["Food quality & taste"]?.push(i);
    else groups["Other"]?.push(i);
  });
  return Object.entries(groups)
    .filter(([, ix]) => ix.length > 0)
    .map(([theme, ix]) => ({
      theme,
      sentiment: theme === "Delivery & timing" || theme === "Pricing & value" ? "mixed" : "mixed",
      summary: `${ix.length} mentions in this theme.`,
      exampleIndices: ix.slice(0, 2),
    }));
}

async function clusterWithAI(docs: SourceDoc[]): Promise<ModelTheme[]> {
  const numbered = docs
    .map((d, i) => `[${i}] (${d.source}${d.rating ? ` ${d.rating}★` : ""}) ${d.body.replace(/\s+/g, " ").slice(0, 240)}`)
    .join("\n");
  const prompt = `You are mining voice-of-customer signal for a wellness food brand. Below are ${docs.length} customer messages from this past week. Cluster them into 3-7 actionable themes.\n\nFor each theme return:\n- theme: short title\n- sentiment: "positive" | "negative" | "mixed"\n- summary: one sentence with concrete insight\n- exampleIndices: array of 1-3 message indices that best illustrate the theme\n\nReturn STRICT JSON array only, no prose.\n\nMessages:\n${numbered}`;
  try {
    const { text } = await generateText({
      model: getModel(DEFAULT_MODEL_ID),
      system: "Return only a JSON array of theme objects.",
      prompt,
      temperature: 0.3,
    });
    const parsed = extractJson(text);
    if (!Array.isArray(parsed)) throw new Error("not array");
    const out: ModelTheme[] = [];
    for (const t of parsed as Array<Partial<ModelTheme>>) {
      if (!t.theme || typeof t.theme !== "string") continue;
      out.push({
        theme: t.theme.slice(0, 120),
        sentiment:
          t.sentiment === "positive" || t.sentiment === "negative"
            ? t.sentiment
            : "mixed",
        summary: typeof t.summary === "string" ? t.summary : "",
        exampleIndices: Array.isArray(t.exampleIndices)
          ? t.exampleIndices.filter((n) => typeof n === "number")
          : [],
      });
    }
    if (out.length > 0) return out;
  } catch (err) {
    logger.warn({ err }, "voc clustering AI failed; using template");
  }
  return templateClusters(docs);
}

export async function extractWeeklyVoc(weekStart?: Date, weekEnd?: Date): Promise<VocTheme[]> {
  const end = weekEnd ?? new Date();
  const start = weekStart ?? new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const docs = await loadDocuments(start, end);
  if (docs.length === 0) {
    logger.info({ start, end }, "voc: no documents in window");
    return [];
  }
  const themes = await clusterWithAI(docs);
  // Persist by upsert so re-running the same week refreshes.
  const inserted: VocTheme[] = [];
  for (const t of themes) {
    const examples = t.exampleIndices
      .map((i) => docs[i])
      .filter((d): d is SourceDoc => Boolean(d))
      .map((d) => ({ source: d.source, body: d.body.slice(0, 280) }));
    const mentionCount = t.exampleIndices.length;
    const [row] = await db
      .insert(vocThemesTable)
      .values({
        weekStart: start,
        weekEnd: end,
        theme: t.theme,
        sentiment: t.sentiment,
        mentionCount,
        exampleQuotes: examples,
        summary: t.summary,
      })
      .onConflictDoUpdate({
        target: [vocThemesTable.weekStart, vocThemesTable.theme],
        set: {
          weekEnd: end,
          sentiment: t.sentiment,
          mentionCount,
          exampleQuotes: examples,
          summary: t.summary,
        },
      })
      .returning();
    if (row) inserted.push(row);
  }
  return inserted;
}

export async function listVocThemes(limitWeeks = 4): Promise<VocTheme[]> {
  // Pull the most recent N week_start values.
  const recent = await db
    .selectDistinct({ weekStart: vocThemesTable.weekStart })
    .from(vocThemesTable)
    .orderBy(desc(vocThemesTable.weekStart))
    .limit(limitWeeks);
  if (recent.length === 0) return [];
  const oldest = recent[recent.length - 1]?.weekStart;
  if (!oldest) return [];
  return db
    .select()
    .from(vocThemesTable)
    .where(gte(vocThemesTable.weekStart, oldest))
    .orderBy(desc(vocThemesTable.weekStart), desc(vocThemesTable.mentionCount));
}
