/**
 * "Why this meal" rationale service.
 *
 * Generates a one-line + short paragraph explanation tying a specific dish
 * to a user's taste profile, recent orders, and goals. Cached per
 * (user, dish, brief-version) in `dish_rationales` so we never regenerate
 * unless the user's brief actually changed.
 *
 * Design notes:
 * - The brief hash is computed over the *subset* of the brief that
 *   actually influences a rationale (preferences, goal, allergens,
 *   targets, recent order names). Other brief sections (loyalty,
 *   subscription windows, etc.) don't move the hash so unrelated user
 *   activity never invalidates the cache.
 * - Generation is batched: one Gemini call returns rationales for up to
 *   `MAX_BATCH` dishes at once. Cached hits short-circuit before any
 *   model call.
 * - Failures (timeout, parse error, missing dish) fall back to a generic
 *   rationale per-dish so the UI always has *something* to render.
 * - Ground truth (ingredients, macros, allergens) is passed to the model
 *   from menu-catalog. The model is instructed never to invent
 *   ingredients or claims.
 */

import crypto from "node:crypto";
import { generateText } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { db, dishRationalesTable } from "@workspace/db";
import { DISHES, type DishData } from "@workspace/menu-catalog";
import { logger } from "./logger";
import { getModel, DEFAULT_MODEL_ID } from "./ai/model";
import {
  getUserBrief,
  briefToRedacted,
  type UserBrief,
} from "./userBrief";

export const MAX_RATIONALES_PER_REQUEST = 12;
const GENERATION_TIMEOUT_MS = 15_000;
const MAX_RATIONALE_CHARS = 140;
const MAX_EXPANDED_CHARS = 360;

export type RationaleSource = "cache" | "generated" | "fallback";

export interface DishRationaleResult {
  dishId: number;
  rationale: string;
  expanded: string;
  source: RationaleSource;
}

const dishById = new Map(DISHES.map((d) => [d.id, d]));

/**
 * Hash the slice of a UserBrief that actually drives the rationale.
 * Stable JSON ordering — the same logical brief always produces the
 * same hash so cache lookups are deterministic.
 */
export function computeBriefHash(brief: UserBrief): string {
  const r = briefToRedacted(brief);
  const subset = {
    diet: r.preferences?.dietaryStyle ?? null,
    spice: r.preferences?.spiceLevel ?? null,
    goal: r.preferences?.goal ?? null,
    activity: r.preferences?.activityLevel ?? null,
    allergens: [...(r.preferences?.allergens ?? [])].sort(),
    dislikes: [...(r.preferences?.dislikedIngredients ?? [])].sort(),
    cuisines: [...(r.preferences?.cuisines ?? [])].sort(),
    cal: r.preferences?.calorieTarget ?? null,
    protein: r.preferences?.proteinTargetGrams ?? null,
    recentItems: (r.recentOrders ?? [])
      .slice(0, 5)
      .flatMap((o) => o.topItems)
      .slice(0, 10),
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(subset))
    .digest("hex");
}

/**
 * Hash the dish ground-truth fields the model is actually allowed to
 * reason over. If a dish's macros/ingredients/allergens/category change,
 * its rationale silently invalidates next read.
 */
export function computeDishVersion(dish: DishData): string {
  const subset = {
    name: dish.name,
    kitchen: dish.kitchen,
    category: dish.category,
    isVeg: dish.isVeg,
    macros: dish.macros,
    glycaemicIndex: dish.glycaemicIndex,
    allergens: [...dish.allergens].sort(),
    ingredients: [...dish.ingredients].sort(),
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(subset))
    .digest("hex")
    .slice(0, 16);
}

/**
 * The DB column is named `briefHash` for historical reasons but acts
 * as the full cache key — combine the user's brief hash with the dish
 * ground-truth version so either one moving invalidates a row.
 */
function cacheKey(briefHash: string, dishVersion: string): string {
  return crypto
    .createHash("sha256")
    .update(`${briefHash}:${dishVersion}`)
    .digest("hex");
}

/**
 * Strip rationales that mention ingredients NOT in the dish's ground
 * truth (model hallucination guard). Allowed terms: any whole word in
 * the dish's ingredient list, the dish name, the kitchen, the category,
 * plus a small kitchen vocabulary that's safe to reference generically.
 */
const GENERIC_FOOD_VOCAB = new Set([
  "protein",
  "carbs",
  "carb",
  "fat",
  "fiber",
  "calories",
  "kcal",
  "cal",
  "macros",
  "macro",
  "veg",
  "vegetarian",
  "vegan",
  "meat",
  "spice",
  "spices",
  "flavor",
  "flavour",
  "low",
  "high",
  "medium",
  "lean",
  "balanced",
  "rich",
  "light",
  "heavy",
  "warm",
  "cool",
  "fresh",
  "sweet",
  "savoury",
  "savory",
  "sour",
  "bitter",
  "umami",
  "salt",
  "sugar",
  "oil",
  "water",
  "stock",
  "broth",
  "sauce",
  "dressing",
  "marinade",
  "seasoning",
  "garnish",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4); // ignore tiny noise words
}

function looksFactuallyGrounded(text: string, dish: DishData): boolean {
  const allowed = new Set<string>(GENERIC_FOOD_VOCAB);
  for (const t of tokenize(dish.name)) allowed.add(t);
  for (const ing of dish.ingredients) for (const t of tokenize(ing)) allowed.add(t);
  for (const a of dish.allergens) for (const t of tokenize(a)) allowed.add(t);
  allowed.add(dish.kitchen.toLowerCase());
  allowed.add(dish.category.toLowerCase());
  // Forbid any allergy-safety claim outright.
  if (/\b(safe|ok|fine)\b[^.]{0,40}\b(allerg|gluten|dairy|nut|soy|egg)/i.test(text))
    return false;
  // Spot-check ingredient nouns: scan for "of <noun>" / "with <noun>" /
  // "<noun> and <noun>" patterns. If any noun-shaped token in the text
  // isn't in the allowed set, treat as hallucination.
  const tokens = tokenize(text);
  let unknown = 0;
  for (const t of tokens) {
    if (allowed.has(t)) continue;
    // Allow common english function words / adjectives that survived the
    // length filter
    if (
      /^(this|that|with|from|your|their|which|while|brings?|serves?|fits?|matches?|aligns?|supports?|recent|order|orders|ordered|profile|today|tonight|meals?|dish|dishes|protocol|portion|portions|after|before|workout|workouts|breakfast|lunch|dinner|snack|snacks|simple|gentle|hearty|cozy|comfort|comforting|nourishing|wholesome|smart|good|great|tasty|delicious|favourite|favorite)$/.test(
        t,
      )
    )
      continue;
    unknown++;
    if (unknown > 3) return false;
  }
  return true;
}

function clampLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function genericRationale(dish: DishData): {
  rationale: string;
  expanded: string;
} {
  const protein = dish.macros.protein;
  const cal = dish.macros.calories;
  const piece =
    protein >= 20
      ? `${protein}g protein per serving`
      : dish.glycaemicIndex === "low"
        ? "low glycaemic index"
        : `${cal} kcal per serving`;
  return {
    rationale: clampLine(
      `${piece} — ${dish.kitchen} ${dish.category}.`,
      MAX_RATIONALE_CHARS,
    ),
    expanded: clampLine(
      `${dish.name} brings ${protein}g protein, ${dish.macros.carbs}g carbs, ${dish.macros.fat}g fat at ${cal} kcal. ${dish.rdVerified ? "RD-verified recipe." : ""}`.trim(),
      MAX_EXPANDED_CHARS,
    ),
  };
}

interface ModelRationale {
  dishId: number;
  rationale: string;
  expanded: string;
}

function buildPrompt(brief: UserBrief, dishes: DishData[]): string {
  const r = briefToRedacted(brief);
  const profileLines: string[] = [];
  if (r.preferences) {
    profileLines.push(`- diet: ${r.preferences.dietaryStyle ?? "unset"}`);
    profileLines.push(`- spice tolerance: ${r.preferences.spiceLevel ?? "unset"}`);
    profileLines.push(`- goal: ${r.preferences.goal ?? "unset"}`);
    profileLines.push(`- activity: ${r.preferences.activityLevel ?? "unset"}`);
    profileLines.push(
      `- allergens to avoid: ${(r.preferences.allergens ?? []).join(", ") || "none"}`,
    );
    profileLines.push(
      `- dislikes: ${(r.preferences.dislikedIngredients ?? []).join(", ") || "none"}`,
    );
    profileLines.push(
      `- cuisines: ${(r.preferences.cuisines ?? []).join(", ") || "no preference"}`,
    );
    if (r.preferences.calorieTarget)
      profileLines.push(`- daily calorie target: ${r.preferences.calorieTarget}`);
    if (r.preferences.proteinTargetGrams)
      profileLines.push(
        `- daily protein target: ${r.preferences.proteinTargetGrams} g`,
      );
  } else {
    profileLines.push("- (no taste profile saved yet)");
  }
  const recent = (r.recentOrders ?? [])
    .slice(0, 5)
    .flatMap((o) => o.topItems)
    .slice(0, 8);
  const recentLine =
    recent.length > 0
      ? `Recently ordered: ${recent.join(", ")}`
      : "No recent orders.";

  const dishBlock = dishes.map((d) => ({
    dishId: d.id,
    name: d.name,
    category: d.category,
    kitchen: d.kitchen,
    isVeg: d.isVeg,
    macros: d.macros,
    glycaemicIndex: d.glycaemicIndex,
    allergens: d.allergens,
    ingredients: d.ingredients.slice(0, 8),
  }));

  return `You are writing short, honest "why this meal" rationales for a Tanmatra
nutrition-delivery customer. Tie each dish to the user's taste profile,
goals, and recent orders. Be specific, warm, and brief.

USER PROFILE
${profileLines.join("\n")}
${recentLine}

DISHES (ground truth — do NOT invent ingredients, macros, or allergens
beyond what is listed):
${JSON.stringify(dishBlock, null, 2)}

Return STRICT JSON, an array with one object per dishId, in the same order:
[
  {
    "dishId": <number>,
    "rationale": "one short sentence (<=140 chars) tying this dish to the user — mention a concrete reason (macro, ingredient, goal fit, similarity to a recent order). Plain language, no marketing fluff, no medical claims, no emoji.",
    "expanded": "2-3 sentence paragraph (<=360 chars) elaborating: which goal/macro it serves, why it fits this user's diet & preferences, and one practical note. Never claim a dish is 'safe' for any allergy."
  }
]

Hard rules:
- Use ONLY the ingredients, macros, allergens, and category provided.
- Never invent dish names, ingredients, restaurants, or nutrition numbers.
- Never tell the user a dish is safe for an allergy.
- If the dish conflicts with the user's allergens or dietary style, say so honestly in one short clause.
- Do not address the user by name. Do not reference user_id.
- Output ONLY the JSON array, no prose, no code fence.`;
}

export const __test__ = { looksFactuallyGrounded };

function safeParseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*|^```\s*|```\s*$/g, "");
  return JSON.parse(cleaned);
}

async function callModel(
  brief: UserBrief,
  dishes: DishData[],
): Promise<Map<number, { rationale: string; expanded: string }>> {
  const prompt = buildPrompt(brief, dishes);
  const result = await Promise.race([
    generateText({ model: getModel(), prompt }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("dish-rationale model timeout")),
        GENERATION_TIMEOUT_MS,
      ),
    ),
  ]);
  const parsed = safeParseJson(result.text);
  if (!Array.isArray(parsed)) {
    throw new Error("dish-rationale: model did not return an array");
  }
  const out = new Map<number, { rationale: string; expanded: string }>();
  for (const row of parsed as ModelRationale[]) {
    if (
      typeof row?.dishId !== "number" ||
      typeof row?.rationale !== "string" ||
      typeof row?.expanded !== "string"
    ) {
      continue;
    }
    out.set(row.dishId, {
      rationale: clampLine(row.rationale, MAX_RATIONALE_CHARS),
      expanded: clampLine(row.expanded, MAX_EXPANDED_CHARS),
    });
  }
  return out;
}

async function loadCached(
  userId: string,
  dishKeys: Map<number, string>,
): Promise<Map<number, { rationale: string; expanded: string }>> {
  if (dishKeys.size === 0) return new Map();
  const rows = await db
    .select({
      dishId: dishRationalesTable.dishId,
      briefHash: dishRationalesTable.briefHash,
      rationale: dishRationalesTable.rationale,
      expanded: dishRationalesTable.expanded,
    })
    .from(dishRationalesTable)
    .where(
      and(
        eq(dishRationalesTable.userId, userId),
        inArray(dishRationalesTable.dishId, Array.from(dishKeys.keys())),
      ),
    );
  const out = new Map<number, { rationale: string; expanded: string }>();
  for (const r of rows) {
    if (dishKeys.get(r.dishId) === r.briefHash) {
      out.set(r.dishId, { rationale: r.rationale, expanded: r.expanded });
    }
  }
  return out;
}

async function persist(
  userId: string,
  dishKeys: Map<number, string>,
  generated: Map<number, { rationale: string; expanded: string }>,
  modelId: string,
): Promise<void> {
  if (generated.size === 0) return;
  const values = Array.from(generated.entries()).map(([dishId, v]) => ({
    userId,
    dishId,
    briefHash: dishKeys.get(dishId)!,
    rationale: v.rationale,
    expanded: v.expanded,
    model: modelId,
  }));
  try {
    await db
      .insert(dishRationalesTable)
      .values(values)
      .onConflictDoNothing({
        target: [
          dishRationalesTable.userId,
          dishRationalesTable.dishId,
          dishRationalesTable.briefHash,
        ],
      });
  } catch (err) {
    logger.warn({ err }, "dish-rationale persist failed");
  }
}

/**
 * Look up rationales for dishIds. Cached hits are returned immediately;
 * misses are batch-generated, persisted, and merged. Always returns one
 * entry per requested dishId — fallback rationales are used when the
 * dish is unknown or generation fails.
 */
export async function getDishRationales(
  userId: string,
  rawDishIds: number[],
): Promise<DishRationaleResult[]> {
  const dishIds = Array.from(
    new Set(rawDishIds.filter((n) => Number.isInteger(n) && n > 0)),
  ).slice(0, MAX_RATIONALES_PER_REQUEST);
  if (dishIds.length === 0) return [];

  const brief = await getUserBrief(userId, {
    include: ["preferences", "recentOrders"],
  });
  const briefHash = computeBriefHash(brief);

  // Per-dish effective cache key = sha256(briefHash + dishVersion).
  // If the dish's ground truth (macros/ingredients/etc) moves, its row
  // invalidates even when the user brief hasn't changed.
  const dishKeys = new Map<number, string>();
  for (const id of dishIds) {
    const dish = dishById.get(id);
    if (dish) dishKeys.set(id, cacheKey(briefHash, computeDishVersion(dish)));
  }

  const cached = await loadCached(userId, dishKeys);

  const missing: DishData[] = [];
  for (const id of dishIds) {
    if (cached.has(id)) continue;
    const dish = dishById.get(id);
    if (dish) missing.push(dish);
  }

  let generated = new Map<number, { rationale: string; expanded: string }>();
  if (missing.length > 0) {
    try {
      const raw = await callModel(brief, missing);
      // Strip any rationale that referenced unknown ingredients or
      // claimed allergy safety — those silently fall through to the
      // generic fallback.
      for (const dish of missing) {
        const r = raw.get(dish.id);
        if (!r) continue;
        if (
          looksFactuallyGrounded(r.rationale, dish) &&
          looksFactuallyGrounded(r.expanded, dish)
        ) {
          generated.set(dish.id, r);
        } else {
          logger.warn(
            { dishId: dish.id, userId },
            "dish-rationale dropped by factual guard",
          );
        }
      }
      await persist(userId, dishKeys, generated, DEFAULT_MODEL_ID);
    } catch (err) {
      logger.warn(
        { err, userId, count: missing.length },
        "dish-rationale generation failed; using fallbacks",
      );
    }
  }

  const out: DishRationaleResult[] = [];
  for (const id of dishIds) {
    const hit = cached.get(id);
    if (hit) {
      out.push({ dishId: id, ...hit, source: "cache" });
      continue;
    }
    const fresh = generated.get(id);
    if (fresh) {
      out.push({ dishId: id, ...fresh, source: "generated" });
      continue;
    }
    const dish = dishById.get(id);
    const fb = dish
      ? genericRationale(dish)
      : { rationale: "Recommended for you.", expanded: "Recommended for you." };
    out.push({ dishId: id, ...fb, source: "fallback" });
  }
  return out;
}
