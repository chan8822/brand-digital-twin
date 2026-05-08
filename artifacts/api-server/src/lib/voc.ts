import { generateText } from "ai";
import { desc, gte, sql } from "drizzle-orm";
import { db, vocThemesTable, type VocTheme } from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "./ai/model";
import { logger } from "./logger";

// All source-document reads in this file go through curated `safe_*` views
// (see safeSql.ts / ensureSafeViews) so the VoC pipeline operates under
// the same governance boundary as NL analytics — only non-PII columns are
// reachable, even if a future change to the loader function is buggy.

interface SourceDoc {
  source: "review" | "support" | "nps";
  body: string;
  rating?: number;
}

const MAX_DOCS = 200;

async function loadDocuments(start: Date, end: Date): Promise<SourceDoc[]> {
  const reviewsP = db.execute<{ body: string | null; rating: number | null }>(
    sql`select body, rating from safe_dish_reviews
        where created_at >= ${start} and created_at < ${end}
        limit ${MAX_DOCS}`,
  );
  // Customer-side support messages are not part of the curated safe schema
  // by design — the messages table contains free-text support content that
  // may include PII. We intentionally skip it here and rely on reviews and
  // NPS comments, both of which ARE in the safe view layer.
  const npsP = db
    .execute<{ comment: string | null; score: number }>(
      sql`select comment, score from safe_nps_responses
          where created_at >= ${start} and created_at < ${end}
          limit ${MAX_DOCS}`,
    )
    .catch(() => ({ rows: [] as Array<{ comment: string | null; score: number }> }));
  const [reviews, npsRows] = await Promise.all([reviewsP, npsP]);
  const docs: SourceDoc[] = [
    ...reviews.rows
      .filter((r) => r.body && r.body.trim().length > 5)
      .map((r) => ({ source: "review" as const, body: r.body as string, rating: r.rating ?? undefined })),
    ...npsRows.rows
      .filter((r) => r.comment && r.comment.trim().length > 5)
      .map((r) => ({
        source: "nps" as const,
        body: `[${r.score}/10] ${r.comment as string}`,
      })),
  ];
  return docs.slice(0, MAX_DOCS);
}

interface ModelTheme {
  theme: string;
  sentiment: "positive" | "negative" | "mixed";
  summary: string;
  // All document indices assigned to this theme. The first few are used as
  // example quotes; the length is the true mention count for ranking and
  // week-over-week trends.
  memberIndices: number[];
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
      sentiment: "mixed" as const,
      summary: `${ix.length} mentions in this theme.`,
      memberIndices: ix,
    }));
}

async function clusterWithAI(docs: SourceDoc[]): Promise<ModelTheme[]> {
  const numbered = docs
    .map((d, i) => `[${i}] (${d.source}${d.rating ? ` ${d.rating}★` : ""}) ${d.body.replace(/\s+/g, " ").slice(0, 240)}`)
    .join("\n");
  const prompt = `You are mining voice-of-customer signal for a wellness food brand. Below are ${docs.length} customer messages from this past week. Cluster them into 3-7 actionable themes.\n\nEvery message MUST be assigned to exactly one theme. For each theme return:\n- theme: short title\n- sentiment: "positive" | "negative" | "mixed"\n- summary: one sentence with concrete insight\n- memberIndices: array of ALL message indices belonging to this theme (this is used to count mentions and trend the theme week over week, so be exhaustive — do not just list a couple of examples)\n\nReturn STRICT JSON array only, no prose.\n\nMessages:\n${numbered}`;
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
    const seen = new Set<number>();
    for (const t of parsed as Array<Partial<ModelTheme> & { exampleIndices?: number[] }>) {
      if (!t.theme || typeof t.theme !== "string") continue;
      // Accept both `memberIndices` (preferred) and the older
      // `exampleIndices` shape so we don't undercount on schema drift.
      const raw = Array.isArray(t.memberIndices)
        ? t.memberIndices
        : Array.isArray(t.exampleIndices)
          ? t.exampleIndices
          : [];
      const members = raw
        .filter((n): n is number => typeof n === "number" && Number.isInteger(n))
        .filter((n) => n >= 0 && n < docs.length)
        .filter((n) => {
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        });
      out.push({
        theme: t.theme.slice(0, 120),
        sentiment:
          t.sentiment === "positive" || t.sentiment === "negative"
            ? t.sentiment
            : "mixed",
        summary: typeof t.summary === "string" ? t.summary : "",
        memberIndices: members,
      });
    }
    // If the model produced themes but every doc was unassigned, fall back
    // to keyword clustering so mention counts are still meaningful.
    if (out.length > 0 && out.some((t) => t.memberIndices.length > 0)) {
      return out;
    }
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
    if (t.memberIndices.length === 0) continue;
    const examples = t.memberIndices
      .slice(0, 3)
      .map((i) => docs[i])
      .filter((d): d is SourceDoc => Boolean(d))
      .map((d) => ({ source: d.source, body: d.body.slice(0, 280) }));
    const mentionCount = t.memberIndices.length;
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
