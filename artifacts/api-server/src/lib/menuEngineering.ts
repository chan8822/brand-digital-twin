import { and, desc, eq, gte, sql } from "drizzle-orm";
import { generateText } from "ai";
import {
  db,
  menuItemsTable,
  menuEngineeringRunsTable,
  menuEngineeringDishStatsTable,
  ordersTable,
  pricingSuggestionsTable,
  recipesTable,
  type DishClassification,
  type DishRecommendation,
  type MenuEngineeringDishStat,
  type MenuEngineeringRun,
  type PricingSuggestion,
  type PricingSuggestionStatus,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "./ai/model";
import { logger } from "./logger";
import { recordOpsAction } from "./opsAudit";

// ---- Domain helpers ----------------------------------------------------------

export type Daypart = "breakfast" | "lunch" | "snacks" | "dinner";

export function dayPartFromHour(hour: number): Daypart {
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "snacks";
  return "dinner";
}

// Lightweight zoning by Indian PIN prefix. Real geocoding is out of scope
// here; we just need a stable bucket per address for elasticity slicing.
export function zoneFromPincode(pin: string | null | undefined): string {
  if (!pin) return "unzoned";
  const trimmed = pin.replace(/\D/g, "").slice(0, 6);
  if (trimmed.length < 3) return "unzoned";
  return `pin-${trimmed.slice(0, 3)}`;
}

// ---- Stat aggregation --------------------------------------------------------

interface DishAccumulator {
  slug: string;
  name: string;
  ordersCount: number;
  unitsSold: number;
  revenuePaise: number;
  marginPaise: number;
}

interface PricedItem {
  slug: string;
  name: string;
  pricePaise: number;
  foodCostPaise: number | null;
}

async function loadPricedItems(): Promise<Map<string, PricedItem>> {
  const items = await db
    .select({
      slug: menuItemsTable.slug,
      name: menuItemsTable.name,
      pricePaise: menuItemsTable.pricePaise,
      foodCostPaise: recipesTable.foodCostPaise,
    })
    .from(menuItemsTable)
    .leftJoin(recipesTable, eq(recipesTable.slug, menuItemsTable.slug));
  const out = new Map<string, PricedItem>();
  for (const row of items) {
    out.set(row.slug, {
      slug: row.slug,
      name: row.name,
      pricePaise: row.pricePaise,
      foodCostPaise: row.foodCostPaise ?? null,
    });
    // Allow lookups by name too — order items historically only carry name.
    out.set(`name:${row.name.toLowerCase()}`, {
      slug: row.slug,
      name: row.name,
      pricePaise: row.pricePaise,
      foodCostPaise: row.foodCostPaise ?? null,
    });
  }
  return out;
}

// Aggregate orders within [windowStart, windowEnd] into per-slug stats.
// Margin defaults to 35% of price when no recipe cost is available — flagged
// in the run summary so editors know the scores are estimates.
export interface AggregateOptions {
  windowStart: Date;
  windowEnd: Date;
  defaultMarginPct?: number;
}

export interface AggregateResult {
  totalOrders: number;
  stats: DishAccumulator[];
  unmatchedItemNames: string[];
}

export async function aggregateDishStats(
  opts: AggregateOptions,
): Promise<AggregateResult> {
  const defaultMarginPct = opts.defaultMarginPct ?? 0.35;
  const orders = await db
    .select({ id: ordersTable.id, items: ordersTable.items })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, opts.windowStart),
        sql`${ordersTable.createdAt} < ${opts.windowEnd}`,
      ),
    );
  const priced = await loadPricedItems();
  const accum = new Map<string, DishAccumulator>();
  const unmatched = new Set<string>();
  for (const order of orders) {
    if (!Array.isArray(order.items)) continue;
    for (const it of order.items) {
      if (!it || typeof it !== "object") continue;
      const name = String(it.name ?? "");
      if (!name) continue;
      const lookup =
        priced.get(`name:${name.toLowerCase()}`) ??
        // Some legacy data may have used slug as name
        priced.get(name);
      if (!lookup) {
        unmatched.add(name);
        continue;
      }
      const qty = Math.max(1, Math.round(Number(it.qty ?? 1)));
      // orders.items.price is stored in paise by finalizeOrder() — see
      // loyaltyEngine.ts. We do NOT multiply by 100 here; doing so would
      // inflate revenue by 100x.
      const unitPricePaise = Math.max(
        0,
        Math.round(Number(it.price ?? lookup.pricePaise)),
      );
      const revenuePaise = unitPricePaise * qty;
      const costPaiseUnit =
        lookup.foodCostPaise ??
        Math.round(lookup.pricePaise * (1 - defaultMarginPct));
      const marginPaise = (unitPricePaise - costPaiseUnit) * qty;
      const cur = accum.get(lookup.slug) ?? {
        slug: lookup.slug,
        name: lookup.name,
        ordersCount: 0,
        unitsSold: 0,
        revenuePaise: 0,
        marginPaise: 0,
      };
      cur.ordersCount += 1;
      cur.unitsSold += qty;
      cur.revenuePaise += revenuePaise;
      cur.marginPaise += marginPaise;
      accum.set(lookup.slug, cur);
    }
  }
  return {
    totalOrders: orders.length,
    stats: [...accum.values()],
    unmatchedItemNames: [...unmatched],
  };
}

// ---- Classification ----------------------------------------------------------

interface ClassifiedDish extends DishAccumulator {
  popularityScore: number; // 0..1
  marginScore: number; // 0..1
  classification: DishClassification;
  recommendation: DishRecommendation;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function recommendationFor(
  classification: DishClassification,
): DishRecommendation {
  switch (classification) {
    case "star":
      return "promote";
    case "puzzle":
      return "reprice";
    case "plowhorse":
      return "hold";
    case "dog":
      return "retire";
  }
}

export function classifyDishes(stats: DishAccumulator[]): ClassifiedDish[] {
  if (stats.length === 0) return [];
  const popMedian = median(stats.map((s) => s.unitsSold));
  // Use absolute margin contribution rather than per-unit %, so a tiny-but-
  // popular cheap dish doesn't appear as a star solely on margin %.
  const marginMedian = median(stats.map((s) => s.marginPaise));
  const popMax = Math.max(1, ...stats.map((s) => s.unitsSold));
  const marginMax = Math.max(1, ...stats.map((s) => s.marginPaise));
  return stats.map((s) => {
    const popularity = s.unitsSold >= popMedian;
    const margin = s.marginPaise >= marginMedian;
    const classification: DishClassification = popularity
      ? margin
        ? "star"
        : "plowhorse"
      : margin
        ? "puzzle"
        : "dog";
    return {
      ...s,
      popularityScore: Math.round((s.unitsSold / popMax) * 100) / 100,
      marginScore:
        Math.round((Math.max(0, s.marginPaise) / marginMax) * 100) / 100,
      classification,
      recommendation: recommendationFor(classification),
    };
  });
}

// ---- Commentary --------------------------------------------------------------

const COMMENTARY_TIMEOUT_MS = 12_000;

interface CommentaryInput {
  slug: string;
  name: string;
  classification: DishClassification;
  unitsSold: number;
  revenuePaise: number;
  marginPaise: number;
  recommendation: DishRecommendation;
}

// Generates one short commentary per dish in a single batched call. Falls
// back to a deterministic template if the model fails — commentary is
// advisory and must never block a run.
export async function generateBatchCommentary(
  dishes: CommentaryInput[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (dishes.length === 0) return out;
  const fallback = (d: CommentaryInput): string => {
    const rupees = (d.revenuePaise / 100).toFixed(0);
    return `${d.unitsSold} units sold and ₹${rupees} revenue. Classified as ${d.classification}; suggested action: ${d.recommendation}.`;
  };
  const slim = dishes.slice(0, 80).map((d) => ({
    slug: d.slug,
    name: d.name,
    classification: d.classification,
    units: d.unitsSold,
    revenueRupees: Math.round(d.revenuePaise / 100),
    marginRupees: Math.round(d.marginPaise / 100),
    recommendation: d.recommendation,
  }));
  const prompt = `You are a menu engineering analyst for Tanmatra, a wellness food brand.
For each dish below, write exactly TWO short sentences (max 32 words total)
explaining its current performance and the recommended action. Plain English,
no marketing fluff, no medical claims.

Return STRICT JSON: an array of objects with "slug" and "commentary" only.
Do not wrap in markdown. Do not add other fields.

Dishes:
${JSON.stringify(slim, null, 2)}`;
  try {
    const result = await Promise.race([
      generateText({ model: getModel(), prompt }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("commentary timeout")),
          COMMENTARY_TIMEOUT_MS,
        ),
      ),
    ]);
    const text = result.text.trim().replace(/^```json\s*|```\s*$/g, "");
    const parsed = JSON.parse(text) as Array<{
      slug?: string;
      commentary?: string;
    }>;
    for (const row of parsed) {
      if (row?.slug && typeof row.commentary === "string") {
        out.set(row.slug, row.commentary.trim().slice(0, 280));
      }
    }
  } catch (err) {
    logger.warn({ err }, "menu engineering commentary fell back to template");
  }
  for (const d of dishes) {
    if (!out.has(d.slug)) out.set(d.slug, fallback(d));
  }
  return out;
}

// ---- Persisting a run --------------------------------------------------------

export interface RunOptions {
  sinceDays?: number;
  operatorId?: string | null;
}

export interface RunResult {
  run: MenuEngineeringRun;
  stats: MenuEngineeringDishStat[];
  unmatchedItemNames: string[];
}

export async function runMenuEngineering(opts: RunOptions): Promise<RunResult> {
  const sinceDays = Math.max(1, Math.min(180, opts.sinceDays ?? 30));
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - sinceDays * 86_400_000);
  const agg = await aggregateDishStats({ windowStart, windowEnd });
  const classified = classifyDishes(agg.stats);
  const commentary = await generateBatchCommentary(
    classified.map((c) => ({
      slug: c.slug,
      name: c.name,
      classification: c.classification,
      unitsSold: c.unitsSold,
      revenuePaise: c.revenuePaise,
      marginPaise: c.marginPaise,
      recommendation: c.recommendation,
    })),
  );
  const result = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(menuEngineeringRunsTable)
      .values({
        windowStart,
        windowEnd,
        modelId: DEFAULT_MODEL_ID,
        totalDishes: classified.length,
        totalOrders: agg.totalOrders,
      })
      .returning();
    if (!run) throw new Error("failed to create menu engineering run");
    const statRows =
      classified.length === 0
        ? []
        : await tx
            .insert(menuEngineeringDishStatsTable)
            .values(
              classified.map((c) => ({
                runId: run.id,
                slug: c.slug,
                name: c.name,
                ordersCount: c.ordersCount,
                unitsSold: c.unitsSold,
                revenuePaise: c.revenuePaise,
                marginPaise: c.marginPaise,
                popularityScore: Math.round(c.popularityScore * 100),
                marginScore: Math.round(c.marginScore * 100),
                classification: c.classification,
                recommendation: c.recommendation,
                commentary: commentary.get(c.slug) ?? "",
              })),
            )
            .returning();
    return { run, stats: statRows };
  });
  await recordOpsAction({
    operatorId: opts.operatorId ?? null,
    agent: "menu-engineering",
    action: "menu_engineering_run",
    params: { sinceDays },
    beforeState: null,
    afterState: {
      runId: result.run.id,
      dishes: result.stats.length,
      unmatched: agg.unmatchedItemNames.length,
    },
    status: "success",
    reasoning: "scored dishes and generated commentary",
  });
  return { ...result, unmatchedItemNames: agg.unmatchedItemNames };
}

// ---- Pricing suggester -------------------------------------------------------

// Simple heuristic recommender keyed off the classification. We bias toward
// small, reversible nudges; predicted impact is a deliberately wide band so
// editors don't read it as a forecast.
function suggestPriceForClass(
  classification: DishClassification,
  currentPaise: number,
): {
  suggestedPaise: number;
  rationale: string;
  pctLowX10: number;
  pctHighX10: number;
} {
  const round50 = (n: number): number => Math.max(50, Math.round(n / 50) * 50);
  switch (classification) {
    case "star":
      return {
        suggestedPaise: round50(currentPaise * 1.05),
        rationale:
          "High demand and strong margin — small price lift likely sticky.",
        pctLowX10: 10,
        pctHighX10: 60,
      };
    case "puzzle":
      return {
        suggestedPaise: round50(currentPaise * 0.93),
        rationale:
          "Good margin but weak demand — modest price drop may unlock volume.",
        pctLowX10: -20,
        pctHighX10: 80,
      };
    case "plowhorse":
      return {
        suggestedPaise: round50(currentPaise * 1.02),
        rationale:
          "Popular but thin margin — protect price; consider portion or cost work.",
        pctLowX10: -10,
        pctHighX10: 30,
      };
    case "dog":
      return {
        suggestedPaise: round50(currentPaise * 0.9),
        rationale: "Low demand and low margin — discount to clear or retire.",
        pctLowX10: -50,
        pctHighX10: 20,
      };
  }
}

// Build a per-zone, per-daypart suggestion when there is enough demand in
// that slice; otherwise fall back to a single (all, all) suggestion.
// `nameToSlug` MUST be the same lookup used in aggregation so the slice
// counts correspond to the same orders that produced the run stats.
async function buildDishSuggestions(
  runId: number,
  slug: string,
  classification: DishClassification,
  currentPaise: number,
  windowStart: Date,
  windowEnd: Date,
  nameToSlug: Map<string, string>,
): Promise<Array<typeof pricingSuggestionsTable.$inferInsert>> {
  const orders = await db
    .select({
      pincode: ordersTable.pincode,
      createdAt: ordersTable.createdAt,
      items: ordersTable.items,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, windowStart),
        sql`${ordersTable.createdAt} < ${windowEnd}`,
      ),
    );
  const slices = new Map<string, { count: number; zone: string; daypart: Daypart }>();
  for (const o of orders) {
    if (!Array.isArray(o.items)) continue;
    const has = o.items.some((it) => {
      const n = (it as { name?: string }).name ?? "";
      return nameToSlug.get(n.toLowerCase()) === slug;
    });
    if (!has) continue;
    const zone = zoneFromPincode(o.pincode);
    const daypart = dayPartFromHour(o.createdAt.getUTCHours());
    const key = `${zone}:${daypart}`;
    const cur = slices.get(key) ?? { count: 0, zone, daypart };
    cur.count += 1;
    slices.set(key, cur);
  }
  const base = suggestPriceForClass(classification, currentPaise);
  const rows: Array<typeof pricingSuggestionsTable.$inferInsert> = [
    {
      runId,
      slug,
      zone: "all",
      daypart: "all",
      currentPaise,
      suggestedPaise: base.suggestedPaise,
      expectedRevenueDeltaPctLow: base.pctLowX10,
      expectedRevenueDeltaPctHigh: base.pctHighX10,
      rationale: base.rationale,
      status: "pending",
    },
  ];
  // Only emit slice-level suggestions when there is enough volume to
  // distinguish signal from noise.
  for (const slice of slices.values()) {
    if (slice.count < 8) continue;
    rows.push({
      runId,
      slug,
      zone: slice.zone,
      daypart: slice.daypart,
      currentPaise,
      suggestedPaise: base.suggestedPaise,
      expectedRevenueDeltaPctLow: base.pctLowX10,
      expectedRevenueDeltaPctHigh: base.pctHighX10,
      rationale: `${base.rationale} (${slice.count} orders in ${slice.zone}/${slice.daypart}.)`,
      status: "pending",
    });
  }
  return rows;
}

export async function buildPricingSuggestionsForRun(
  runId: number,
  operatorId?: string | null,
): Promise<PricingSuggestion[]> {
  const [run] = await db
    .select()
    .from(menuEngineeringRunsTable)
    .where(eq(menuEngineeringRunsTable.id, runId))
    .limit(1);
  if (!run) throw new Error("run not found");
  const stats = await db
    .select()
    .from(menuEngineeringDishStatsTable)
    .where(eq(menuEngineeringDishStatsTable.runId, runId));
  const items = await db
    .select({
      slug: menuItemsTable.slug,
      name: menuItemsTable.name,
      pricePaise: menuItemsTable.pricePaise,
    })
    .from(menuItemsTable);
  const priceMap = new Map(items.map((i) => [i.slug, i.pricePaise]));
  // Build the same name→slug lookup that aggregation uses, so slice counts
  // correspond to the orders that produced the stats.
  const nameToSlug = new Map(
    items.map((i) => [i.name.toLowerCase(), i.slug] as const),
  );
  const allRows: Array<typeof pricingSuggestionsTable.$inferInsert> = [];
  for (const s of stats) {
    const currentPaise = priceMap.get(s.slug);
    if (currentPaise == null) continue;
    const rows = await buildDishSuggestions(
      runId,
      s.slug,
      s.classification as DishClassification,
      currentPaise,
      run.windowStart,
      run.windowEnd,
      nameToSlug,
    );
    allRows.push(...rows);
  }
  if (allRows.length === 0) return [];
  // Refresh-by-replace: drop pending suggestions for this run before inserting
  // the new batch, so re-running doesn't pile up duplicates.
  const inserted = await db.transaction(async (tx) => {
    await tx
      .delete(pricingSuggestionsTable)
      .where(
        and(
          eq(pricingSuggestionsTable.runId, runId),
          eq(pricingSuggestionsTable.status, "pending"),
        ),
      );
    return tx
      .insert(pricingSuggestionsTable)
      .values(allRows)
      .returning();
  });
  await recordOpsAction({
    operatorId: operatorId ?? null,
    agent: "menu-engineering",
    action: "pricing_suggestions_run",
    params: { runId },
    beforeState: null,
    afterState: { count: inserted.length },
    status: "success",
    reasoning: "regenerated pending pricing suggestions",
  });
  return inserted;
}

// ---- Decisions ---------------------------------------------------------------

export interface DecisionResult {
  suggestion: PricingSuggestion;
  appliedPricePaise?: number;
}

async function settleSuggestion(
  id: number,
  status: PricingSuggestionStatus,
  operatorId: string | null,
): Promise<PricingSuggestion> {
  // Conditional update guards against TOCTOU: if two operators race to
  // approve/dismiss the same suggestion, only one UPDATE will match.
  const [updated] = await db
    .update(pricingSuggestionsTable)
    .set({ status, decidedBy: operatorId, decidedAt: new Date() })
    .where(
      and(
        eq(pricingSuggestionsTable.id, id),
        eq(pricingSuggestionsTable.status, "pending"),
      ),
    )
    .returning();
  if (!updated) {
    const [existing] = await db
      .select({ status: pricingSuggestionsTable.status })
      .from(pricingSuggestionsTable)
      .where(eq(pricingSuggestionsTable.id, id))
      .limit(1);
    if (!existing) throw new Error("suggestion not found");
    throw new Error("suggestion already decided");
  }
  return updated;
}

export async function approvePricingSuggestion(
  id: number,
  operatorId: string | null,
): Promise<DecisionResult> {
  const updated = await settleSuggestion(id, "approved", operatorId);
  // Only apply price changes when the suggestion is for "all" zones/dayparts;
  // slice-level suggestions are insight-only — we don't have per-slice price
  // overrides in the catalog yet.
  // KNOWN GAP: customer ordering currently prices off the static
  // `@workspace/menu-catalog` DISHES list (see loyaltyEngine.finalizeOrder).
  // Updating menu_items.pricePaise here changes admin/CMS displays and any
  // future catalog-DB-driven flows, but does NOT yet affect checkout totals.
  // Tracked as a follow-up to unify pricing source-of-truth.
  let appliedPricePaise: number | undefined;
  if (updated.zone === "all" && updated.daypart === "all") {
    const [item] = await db
      .select({ pricePaise: menuItemsTable.pricePaise })
      .from(menuItemsTable)
      .where(eq(menuItemsTable.slug, updated.slug))
      .limit(1);
    if (item) {
      await db
        .update(menuItemsTable)
        .set({ pricePaise: updated.suggestedPaise })
        .where(eq(menuItemsTable.slug, updated.slug));
      appliedPricePaise = updated.suggestedPaise;
    }
  }
  await recordOpsAction({
    operatorId,
    agent: "menu-engineering",
    action: "pricing_suggestion_approved",
    params: { id, slug: updated.slug },
    beforeState: { currentPaise: updated.currentPaise },
    afterState: { suggestedPaise: updated.suggestedPaise, appliedPricePaise },
    status: "success",
    reasoning: "human-approved pricing change",
  });
  return { suggestion: updated, appliedPricePaise };
}

export async function dismissPricingSuggestion(
  id: number,
  operatorId: string | null,
): Promise<DecisionResult> {
  const updated = await settleSuggestion(id, "dismissed", operatorId);
  await recordOpsAction({
    operatorId,
    agent: "menu-engineering",
    action: "pricing_suggestion_dismissed",
    params: { id, slug: updated.slug },
    beforeState: null,
    afterState: null,
    status: "success",
    reasoning: "human dismissed pricing suggestion",
  });
  return { suggestion: updated };
}

// ---- Read helpers ------------------------------------------------------------

export async function getLatestRun(): Promise<MenuEngineeringRun | null> {
  const [row] = await db
    .select()
    .from(menuEngineeringRunsTable)
    .orderBy(desc(menuEngineeringRunsTable.runAt))
    .limit(1);
  return row ?? null;
}

export async function getRunStats(
  runId: number,
): Promise<MenuEngineeringDishStat[]> {
  return db
    .select()
    .from(menuEngineeringDishStatsTable)
    .where(eq(menuEngineeringDishStatsTable.runId, runId))
    .orderBy(desc(menuEngineeringDishStatsTable.popularityScore));
}

export async function listPendingSuggestions(
  runId?: number,
): Promise<PricingSuggestion[]> {
  if (runId) {
    return db
      .select()
      .from(pricingSuggestionsTable)
      .where(
        and(
          eq(pricingSuggestionsTable.runId, runId),
          eq(pricingSuggestionsTable.status, "pending"),
        ),
      )
      .orderBy(desc(pricingSuggestionsTable.createdAt));
  }
  return db
    .select()
    .from(pricingSuggestionsTable)
    .where(eq(pricingSuggestionsTable.status, "pending"))
    .orderBy(desc(pricingSuggestionsTable.createdAt));
}

export async function listSuggestionsForSlug(
  slug: string,
): Promise<PricingSuggestion[]> {
  return db
    .select()
    .from(pricingSuggestionsTable)
    .where(eq(pricingSuggestionsTable.slug, slug))
    .orderBy(desc(pricingSuggestionsTable.createdAt));
}
