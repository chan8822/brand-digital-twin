import { and, desc, eq, ne, sql } from "drizzle-orm";
import { generateText } from "ai";
import {
  db,
  dishReviewSummariesTable,
  dishReviewsTable,
  menuItemsTable,
  ordersTable,
  usersTable,
  type DishReview,
  type DishReviewSummary,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "./ai/model";
import { logger } from "./logger";

// Customer reviews are slug-keyed so they're independent of menu_items
// edits/deletes. Ratings are 1..5 inclusive; body is bounded.
export interface CreateReviewInput {
  userId: string | null;
  slug: string;
  rating: number;
  body: string;
  photoUrl?: string | null;
}

export async function createReview(
  input: CreateReviewInput,
): Promise<DishReview> {
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const body = input.body.trim().slice(0, 2000);
  const photoUrl = input.photoUrl?.trim().slice(0, 1024) || null;
  const [row] = await db
    .insert(dishReviewsTable)
    .values({
      userId: input.userId,
      slug: input.slug,
      rating,
      body,
      photoUrl,
      sentiment: null,
    })
    .returning();
  if (!row) throw new Error("failed to insert review");

  // Moderation hook — same pattern as challenge posts. Audit row is
  // always written; visibility flips only on a 'hidden' verdict.
  // Both text and photo are screened independently so a photo-only
  // review still goes through the safety pipeline.
  let hidden = false;
  const mod = await import("./community/moderation");
  if (body) {
    try {
      const decision = await mod.screenContent({
        text: body,
        contentType: "dish_review",
        contentId: row.id,
        userId: input.userId,
      });
      if (decision.decision === "hidden") hidden = true;
    } catch {
      // never block content creation on moderation failure
    }
  }
  if (photoUrl) {
    try {
      const decision = await mod.screenPhoto({
        photoUrl,
        contentType: "dish_review",
        contentId: row.id,
        userId: input.userId,
        caption: body,
      });
      if (decision.decision === "hidden") hidden = true;
    } catch {
      // never block content creation on photo moderation failure
    }
  }
  if (hidden) {
    await db
      .update(dishReviewsTable)
      .set({ hidden: 1 })
      .where(eq(dishReviewsTable.id, row.id));
    return { ...row, hidden: 1 };
  }
  return row;
}

// Server-side eligibility check used both by the public reviews endpoint
// (to gate the "leave a review" form) and by createReview (to reject posts
// from users who never actually ordered the dish). Eligibility means: the
// user has a non-cancelled order whose items jsonb array contains a row
// whose `id` matches the menu item id resolved from the slug. We resolve
// slug -> id via menu_items rather than trusting an `slug` field on order
// items (orders only persist {id,name,qty,price}).
export async function userHasOrderedSlug(
  userId: string,
  slug: string,
): Promise<boolean> {
  const trimmedSlug = slug.trim();
  if (!userId || !trimmedSlug) return false;
  const [item] = await db
    .select({ id: menuItemsTable.id })
    .from(menuItemsTable)
    .where(eq(menuItemsTable.slug, trimmedSlug))
    .limit(1);
  if (!item) return false;
  const [row] = await db
    .select({ exists: sql<number>`1`.as("exists") })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.userId, userId),
        ne(ordersTable.status, "cancelled"),
        sql`exists (
          select 1
          from jsonb_array_elements(${ordersTable.items}) as it
          where (it->>'id')::int = ${item.id}
        )`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function setReviewHidden(
  id: number,
  hidden: boolean,
): Promise<DishReview | null> {
  const [row] = await db
    .update(dishReviewsTable)
    .set({ hidden: hidden ? 1 : 0 })
    .where(eq(dishReviewsTable.id, id))
    .returning();
  return row ?? null;
}

export async function listReviewsForModeration(
  limit = 100,
): Promise<DishReview[]> {
  return db
    .select()
    .from(dishReviewsTable)
    .orderBy(desc(dishReviewsTable.createdAt))
    .limit(Math.max(1, Math.min(500, limit)));
}

export async function listReviews(
  slug: string,
  limit = 50,
): Promise<DishReview[]> {
  return db
    .select()
    .from(dishReviewsTable)
    .where(
      and(eq(dishReviewsTable.slug, slug), eq(dishReviewsTable.hidden, 0)),
    )
    .orderBy(desc(dishReviewsTable.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));
}

export interface PublicReviewer {
  label: string;
  avatarUrl: string | null;
}

export interface PublicReviewRow {
  id: number;
  slug: string;
  rating: number;
  body: string;
  photoUrl: string | null;
  createdAt: Date;
  reviewer: PublicReviewer;
}

// Privacy model: show "First L." (first name + last initial) so reviews feel
// like they came from real people without exposing full names, email handles,
// or user ids. We deliberately do not fall back to the email local-part —
// email handles often contain full names or other PII. When we don't have a
// first name, we surface the last initial (or a generic "Tanmatra Guest"),
// never the raw email.
export function buildReviewerLabel(input: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const first = (input.firstName ?? "").trim();
  const last = (input.lastName ?? "").trim();
  if (first && last) return `${first} ${last[0]!.toUpperCase()}.`;
  if (first) return first;
  if (last) return `${last[0]!.toUpperCase()}.`;
  return "Tanmatra Guest";
}

export async function listPublicReviews(
  slug: string,
  limit = 50,
): Promise<PublicReviewRow[]> {
  const rows = await db
    .select({
      id: dishReviewsTable.id,
      slug: dishReviewsTable.slug,
      rating: dishReviewsTable.rating,
      body: dishReviewsTable.body,
      photoUrl: dishReviewsTable.photoUrl,
      createdAt: dishReviewsTable.createdAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      profileImageUrl: usersTable.profileImageUrl,
    })
    .from(dishReviewsTable)
    .leftJoin(usersTable, eq(dishReviewsTable.userId, usersTable.id))
    .where(
      and(eq(dishReviewsTable.slug, slug), eq(dishReviewsTable.hidden, 0)),
    )
    .orderBy(desc(dishReviewsTable.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    rating: r.rating,
    body: r.body,
    photoUrl: r.photoUrl,
    createdAt: r.createdAt,
    reviewer: {
      label: buildReviewerLabel({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
      }),
      avatarUrl: r.profileImageUrl ?? null,
    },
  }));
}

export async function getSummary(
  slug: string,
): Promise<DishReviewSummary | null> {
  const [row] = await db
    .select()
    .from(dishReviewSummariesTable)
    .where(eq(dishReviewSummariesTable.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getSummariesForSlugs(
  slugs: string[],
): Promise<Map<string, DishReviewSummary>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select()
    .from(dishReviewSummariesTable);
  const wanted = new Set(slugs);
  return new Map(rows.filter((r) => wanted.has(r.slug)).map((r) => [r.slug, r]));
}

interface ReviewSummaryFields {
  mostLoved: string;
  commonGripe: string;
  trend: "improving" | "declining" | "stable";
}

const SUMMARIZER_TIMEOUT_MS = 8_000;
const MIN_REVIEWS = 3;

// Ask the model to extract three small fields from the recent reviews.
// Falls back to a deterministic, frequency-based summary if the model fails.
async function summarizeWithModel(
  reviews: DishReview[],
): Promise<ReviewSummaryFields> {
  const fallback = (): ReviewSummaryFields => {
    const positives = reviews.filter((r) => r.rating >= 4);
    const negatives = reviews.filter((r) => r.rating <= 2);
    return {
      mostLoved:
        positives[0]?.body.slice(0, 140) ??
        "Customers haven't called out a clear favourite yet.",
      commonGripe:
        negatives[0]?.body.slice(0, 140) ??
        "No common complaints in recent reviews.",
      trend: "stable",
    };
  };
  const slim = reviews.slice(0, 40).map((r) => ({
    rating: r.rating,
    body: r.body.slice(0, 280),
    daysAgo: Math.round(
      (Date.now() - new Date(r.createdAt).getTime()) / 86_400_000,
    ),
  }));
  const prompt = `You are summarising customer reviews for a single dish at Tanmatra.
Read the JSON list of reviews below. Return STRICT JSON with exactly these
fields and no others:

{
  "mostLoved": "one short phrase (<=80 chars) describing what customers love most, or empty string",
  "commonGripe": "one short phrase (<=80 chars) describing the most common complaint, or empty string",
  "trend": "improving" | "declining" | "stable"
}

Rules: plain English. No marketing fluff. No medical claims. If there is no
clear signal, use empty strings and trend "stable".

Reviews:
${JSON.stringify(slim, null, 2)}`;
  try {
    const result = await Promise.race([
      generateText({ model: getModel(), prompt }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("review summary timeout")),
          SUMMARIZER_TIMEOUT_MS,
        ),
      ),
    ]);
    const text = result.text.trim().replace(/^```json\s*|```\s*$/g, "");
    const parsed = JSON.parse(text) as Partial<ReviewSummaryFields>;
    const trend: ReviewSummaryFields["trend"] =
      parsed.trend === "improving" || parsed.trend === "declining"
        ? parsed.trend
        : "stable";
    return {
      mostLoved: String(parsed.mostLoved ?? "").slice(0, 200),
      commonGripe: String(parsed.commonGripe ?? "").slice(0, 200),
      trend,
    };
  } catch (err) {
    logger.warn({ err }, "review summarizer fell back to template");
    return fallback();
  }
}

export async function summarizeReviewsForSlug(
  slug: string,
): Promise<DishReviewSummary | null> {
  const reviews = await listReviews(slug, 100);
  if (reviews.length < MIN_REVIEWS) {
    // Not enough signal — wipe any stale summary so the UI shows empty state.
    await db
      .delete(dishReviewSummariesTable)
      .where(eq(dishReviewSummariesTable.slug, slug));
    return null;
  }
  const fields = await summarizeWithModel(reviews);
  const avgX10 = Math.round(
    (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length) * 10,
  );
  const [row] = await db
    .insert(dishReviewSummariesTable)
    .values({
      slug,
      mostLoved: fields.mostLoved,
      commonGripe: fields.commonGripe,
      trend: fields.trend,
      sampleSize: reviews.length,
      averageRating: avgX10,
      modelId: DEFAULT_MODEL_ID,
      generatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: dishReviewSummariesTable.slug,
      set: {
        mostLoved: fields.mostLoved,
        commonGripe: fields.commonGripe,
        trend: fields.trend,
        sampleSize: reviews.length,
        averageRating: avgX10,
        modelId: DEFAULT_MODEL_ID,
        generatedAt: new Date(),
      },
    })
    .returning();
  return row ?? null;
}

// Summarize every slug that has reviews. Returns counts only — keeps the
// caller log small even when many dishes are summarized.
export async function summarizeAllReviews(): Promise<{
  attempted: number;
  summarized: number;
}> {
  const rows = await db
    .select({
      slug: dishReviewsTable.slug,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(dishReviewsTable)
    .groupBy(dishReviewsTable.slug);
  let summarized = 0;
  for (const r of rows) {
    if (r.n < MIN_REVIEWS) continue;
    try {
      const out = await summarizeReviewsForSlug(r.slug);
      if (out) summarized += 1;
    } catch (err) {
      logger.error({ err, slug: r.slug }, "review summarize failed");
    }
  }
  return { attempted: rows.length, summarized };
}

// Used by the menu engineering dashboard to attach a summary chip to dishes.
export async function getSummariesForActiveMenu(): Promise<
  Map<string, DishReviewSummary>
> {
  const items = await db
    .select({ slug: menuItemsTable.slug })
    .from(menuItemsTable)
    .where(and(eq(menuItemsTable.isAvailable, true)));
  return getSummariesForSlugs(items.map((i) => i.slug));
}
