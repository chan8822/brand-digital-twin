/**
 * Smart weekly meal planner.
 *
 * Generates a 7-day x {breakfast, lunch, dinner} plan tailored to the
 * user's preferences (allergens, diet, goal, calorie/protein targets) and
 * a per-week budget cap. The model is asked to pick from a pre-filtered
 * candidate pool (we never trust the model to invent dish IDs, so the
 * pool is the only source of truth). The output is then validated
 * against hard constraints — allergen-safety, diet, repetition limit,
 * budget — and on the first violation we either patch deterministically
 * or fall back to a greedy picker so the UI always gets a usable plan.
 */

import { generateText } from "ai";
import { DISHES, type DishData } from "@workspace/menu-catalog";
import {
  type MealPlanConstraints,
  type MealPlanDay,
  type MealPlanSlot,
  type MealPlanSlotEntry,
  type MealPlanTotals,
  type WeekDayCalendarKind,
  MEAL_SLOTS,
} from "@workspace/db";
import { logger } from "./logger";
import { getModel, DEFAULT_MODEL_ID } from "./ai/model";
import {
  getUserBrief,
  briefToRedacted,
  type UserBrief,
} from "./userBrief";

const GENERATION_TIMEOUT_MS = 20_000;
const DAYS_PER_PLAN = 7;
const POOL_SIZE_PER_SLOT = 18;

export const DEFAULT_MAX_REPETITIONS = 2;

const dishById = new Map<number, DishData>(DISHES.map((d) => [d.id, d]));

const SLOT_CATEGORY_BUCKETS: Record<MealPlanSlot, Set<string>> = {
  breakfast: new Set(["breakfast", "beverages", "snacks"]),
  lunch: new Set(["bowls", "wraps", "mains", "salads", "soups", "pasta"]),
  dinner: new Set(["mains", "bowls", "wraps", "salads", "pasta", "soups"]),
};

export interface PlanGenerationResult {
  days: MealPlanDay[];
  totals: MealPlanTotals;
  model: string;
  usedFallback: boolean;
  notes: string[];
}

export function defaultConstraintsFromBrief(
  brief: UserBrief,
  overrides: Partial<MealPlanConstraints> = {},
): MealPlanConstraints {
  const r = briefToRedacted(brief);
  const calorieTarget = r.preferences?.calorieTarget ?? null;
  const proteinTarget = r.preferences?.proteinTargetGrams ?? null;
  return {
    dailyCalorieTarget: overrides.dailyCalorieTarget ?? calorieTarget,
    dailyProteinTargetGrams:
      overrides.dailyProteinTargetGrams ?? proteinTarget,
    weeklyBudgetPaise: overrides.weeklyBudgetPaise ?? null,
    maxRepetitionsPerDish:
      overrides.maxRepetitionsPerDish ?? DEFAULT_MAX_REPETITIONS,
    allergens:
      overrides.allergens ??
      [...(r.preferences?.allergens ?? [])].map((s) => s.toLowerCase()),
    dietaryStyle: overrides.dietaryStyle ?? r.preferences?.dietaryStyle ?? null,
    spiceLevel: overrides.spiceLevel ?? r.preferences?.spiceLevel ?? null,
    goal: overrides.goal ?? r.preferences?.goal ?? null,
    weekCalendar: normalizeWeekCalendar(overrides.weekCalendar),
  };
}

const CALORIE_MULTIPLIER: Record<WeekDayCalendarKind, number> = {
  normal: 1,
  wfh: 1,
  gym: 1.15,
  travel: 0.9,
};

/**
 * Normalize an arbitrary `weekCalendar` override into a fixed 7-entry
 * array. Anything missing or malformed defaults to "normal" so downstream
 * callers can index without bounds checks.
 */
export function normalizeWeekCalendar(
  input: WeekDayCalendarKind[] | undefined,
): WeekDayCalendarKind[] | undefined {
  if (!input) return undefined;
  const valid: WeekDayCalendarKind[] = ["normal", "gym", "travel", "wfh"];
  const out: WeekDayCalendarKind[] = [];
  for (let i = 0; i < 7; i++) {
    const v = input[i];
    out.push(v && valid.includes(v) ? v : "normal");
  }
  return out;
}

function calorieTargetForDay(
  base: number,
  calendar: WeekDayCalendarKind[] | undefined,
  dayIndex: number,
): number {
  const kind = calendar?.[dayIndex] ?? "normal";
  return Math.round(base * CALORIE_MULTIPLIER[kind]);
}

/** True when the dish does NOT contain any of the user's allergens. */
export function isAllergenSafe(
  dish: DishData,
  allergens: readonly string[],
): boolean {
  if (allergens.length === 0) return true;
  const dishAllergens = new Set(
    dish.allergens.map((a) => a.toLowerCase().trim()),
  );
  for (const a of allergens) {
    if (dishAllergens.has(a.toLowerCase().trim())) return false;
  }
  return true;
}

/** True when the dish satisfies the user's dietary style. */
export function matchesDiet(
  dish: DishData,
  dietaryStyle: string | null,
): boolean {
  if (!dietaryStyle) return true;
  switch (dietaryStyle) {
    case "vegan":
      // We don't track vegan-vs-vegetarian on dishes; require veg + no
      // dairy/egg allergens to approximate vegan-safety.
      if (!dish.isVeg) return false;
      return !dish.allergens.some((a) => /dairy|egg/i.test(a));
    case "vegetarian":
      return dish.isVeg;
    case "pescatarian":
      // Allow veg + anything fish-flagged. Fall through to true (no
      // ground-truth meat type field on dishes).
      return true;
    case "keto":
      // Approximate: low/medium GI and carbs <= 30g per serving.
      return dish.glycaemicIndex !== "high" && dish.macros.carbs <= 30;
    case "omnivore":
    default:
      return true;
  }
}

export function buildCandidatePool(
  constraints: MealPlanConstraints,
): Record<MealPlanSlot, DishData[]> {
  const pool: Record<MealPlanSlot, DishData[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };
  const eligible = DISHES.filter(
    (d) =>
      d.isAvailable &&
      isAllergenSafe(d, constraints.allergens) &&
      matchesDiet(d, constraints.dietaryStyle),
  );

  for (const slot of MEAL_SLOTS) {
    const buckets = SLOT_CATEGORY_BUCKETS[slot];
    const slotDishes = eligible.filter((d) => buckets.has(d.category));
    // Sort by protein desc for muscle-gain users, by calories asc for
    // weight-loss users, otherwise by name for stable variety.
    let sorted: DishData[];
    if (constraints.goal === "gain_muscle") {
      sorted = [...slotDishes].sort(
        (a, b) => b.macros.protein - a.macros.protein,
      );
    } else if (constraints.goal === "lose_weight") {
      sorted = [...slotDishes].sort(
        (a, b) => a.macros.calories - b.macros.calories,
      );
    } else {
      sorted = [...slotDishes].sort((a, b) => a.name.localeCompare(b.name));
    }
    pool[slot] = sorted.slice(0, POOL_SIZE_PER_SLOT);
    // Fallback: if the slot pool ended up empty, drop the category
    // restriction so the user always gets a plan.
    if (pool[slot].length === 0) {
      pool[slot] = eligible.slice(0, POOL_SIZE_PER_SLOT);
    }
  }
  return pool;
}

function dishToSlotEntry(dish: DishData): MealPlanSlotEntry {
  return {
    dishId: dish.id,
    slug: dish.slug,
    name: dish.name,
    image: dish.image,
    pricePaise: dish.price,
    calories: dish.macros.calories,
    protein: dish.macros.protein,
    carbs: dish.macros.carbs,
    fat: dish.macros.fat,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekDates(weekStart: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < DAYS_PER_PLAN; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(isoDate(d));
  }
  return out;
}

export function computeTotals(days: MealPlanDay[]): MealPlanTotals {
  let totalPaise = 0;
  let cal = 0;
  let pro = 0;
  let carb = 0;
  let fat = 0;
  let dayCount = 0;
  for (const day of days) {
    let dayCal = 0;
    let dayPro = 0;
    let dayCarb = 0;
    let dayFat = 0;
    for (const slot of MEAL_SLOTS) {
      const e = day[slot];
      if (!e) continue;
      totalPaise += e.pricePaise;
      dayCal += e.calories;
      dayPro += e.protein;
      dayCarb += e.carbs;
      dayFat += e.fat;
    }
    cal += dayCal;
    pro += dayPro;
    carb += dayCarb;
    fat += dayFat;
    dayCount++;
  }
  const denom = Math.max(dayCount, 1);
  return {
    totalPaise,
    avgCalories: Math.round(cal / denom),
    avgProteinGrams: Math.round(pro / denom),
    avgCarbsGrams: Math.round(carb / denom),
    avgFatGrams: Math.round(fat / denom),
  };
}

export interface ConstraintViolation {
  kind:
    | "allergen"
    | "diet"
    | "repetition"
    | "budget"
    | "missing-dish"
    | "calories"
    | "protein";
  message: string;
  dishId?: number;
}

/**
 * Validate a candidate plan against hard constraints. Returns the list
 * of violations (empty when valid).
 */
export function validatePlan(
  days: MealPlanDay[],
  constraints: MealPlanConstraints,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const counts = new Map<number, number>();
  let total = 0;
  // Per-day macro tolerance: allow ±15% drift around the target so a
  // realistic catalog can still satisfy a precise calorie/protein goal.
  const MACRO_TOLERANCE = 0.15;
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex]!;
    let dayCalories = 0;
    let dayProtein = 0;
    for (const slot of MEAL_SLOTS) {
      const entry = day[slot];
      if (!entry) {
        violations.push({ kind: "missing-dish", message: `${day.date} ${slot} missing` });
        continue;
      }
      const dish = dishById.get(entry.dishId);
      if (!dish) {
        violations.push({
          kind: "missing-dish",
          message: `unknown dishId ${entry.dishId}`,
          dishId: entry.dishId,
        });
        continue;
      }
      if (!isAllergenSafe(dish, constraints.allergens)) {
        violations.push({
          kind: "allergen",
          message: `${dish.name} contains a flagged allergen`,
          dishId: dish.id,
        });
      }
      if (!matchesDiet(dish, constraints.dietaryStyle)) {
        violations.push({
          kind: "diet",
          message: `${dish.name} does not match diet ${constraints.dietaryStyle}`,
          dishId: dish.id,
        });
      }
      counts.set(dish.id, (counts.get(dish.id) ?? 0) + 1);
      total += entry.pricePaise;
      dayCalories += entry.calories;
      dayProtein += entry.protein;
    }
    if (constraints.dailyCalorieTarget !== null && constraints.dailyCalorieTarget > 0) {
      // Calendar (gym/travel/wfh) shifts the per-day calorie target so a
      // training day can carry more food and a travel day can carry less,
      // while still being judged against the user's overall goal.
      const target = calorieTargetForDay(
        constraints.dailyCalorieTarget,
        constraints.weekCalendar,
        dayIndex,
      );
      const lo = target * (1 - MACRO_TOLERANCE);
      const hi = target * (1 + MACRO_TOLERANCE);
      if (dayCalories < lo || dayCalories > hi) {
        violations.push({
          kind: "calories",
          message: `${day.date} calories ${dayCalories} outside target ${target} (±${Math.round(MACRO_TOLERANCE * 100)}%)`,
        });
      }
    }
    if (
      constraints.dailyProteinTargetGrams !== null &&
      constraints.dailyProteinTargetGrams > 0
    ) {
      const target = constraints.dailyProteinTargetGrams;
      // Protein has a one-sided floor: hitting more than the target is
      // generally fine for the goals we support, but falling significantly
      // short is a real plan failure.
      if (dayProtein < target * (1 - MACRO_TOLERANCE)) {
        violations.push({
          kind: "protein",
          message: `${day.date} protein ${dayProtein}g below target ${target}g`,
        });
      }
    }
  }
  for (const [dishId, c] of counts) {
    if (c > constraints.maxRepetitionsPerDish) {
      const dish = dishById.get(dishId);
      violations.push({
        kind: "repetition",
        message: `${dish?.name ?? `dish ${dishId}`} appears ${c} times (max ${constraints.maxRepetitionsPerDish})`,
        dishId,
      });
    }
  }
  if (
    constraints.weeklyBudgetPaise !== null &&
    constraints.weeklyBudgetPaise > 0 &&
    total > constraints.weeklyBudgetPaise
  ) {
    violations.push({
      kind: "budget",
      message: `plan total ${total} exceeds weekly budget ${constraints.weeklyBudgetPaise}`,
    });
  }
  return violations;
}

/**
 * Greedy fallback planner: rotates through the slot pool, respecting
 * repetition limits and budget cap. Used when the model is unavailable
 * or returns an unrecoverable plan.
 */
export function greedyPlan(
  weekStart: Date,
  pool: Record<MealPlanSlot, DishData[]>,
  constraints: MealPlanConstraints,
): MealPlanDay[] {
  const dates = weekDates(weekStart);
  const counts = new Map<number, number>();
  let runningTotal = 0;

  function pickFor(slot: MealPlanSlot): DishData | null {
    const choices = pool[slot];
    // Pool is already filtered to allergen-safe + diet-matching dishes
    // upstream. If it's empty we MUST NOT silently fall back to an
    // unfiltered DISHES[0] — that would inject the very allergens the
    // user asked to avoid. Caller treats null as a missing-dish
    // violation surfaced by validatePlan.
    if (choices.length === 0) {
      return null;
    }
    // First pass: respect repetition + budget headroom
    for (const dish of choices) {
      const used = counts.get(dish.id) ?? 0;
      if (used >= constraints.maxRepetitionsPerDish) continue;
      if (
        constraints.weeklyBudgetPaise !== null &&
        constraints.weeklyBudgetPaise > 0 &&
        runningTotal + dish.price > constraints.weeklyBudgetPaise
      )
        continue;
      return dish;
    }
    // Second pass: ignore budget but keep repetition cap
    for (const dish of choices) {
      const used = counts.get(dish.id) ?? 0;
      if (used >= constraints.maxRepetitionsPerDish) continue;
      return dish;
    }
    // Last resort: cheapest available
    return [...choices].sort((a, b) => a.price - b.price)[0]!;
  }

  return dates.map((date) => {
    const breakfast = pickFor("breakfast");
    const lunch = pickFor("lunch");
    const dinner = pickFor("dinner");
    for (const d of [breakfast, lunch, dinner]) {
      if (!d) continue;
      counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
      runningTotal += d.price;
    }
    const day: MealPlanDay = { date };
    if (breakfast) day.breakfast = dishToSlotEntry(breakfast);
    if (lunch) day.lunch = dishToSlotEntry(lunch);
    if (dinner) day.dinner = dishToSlotEntry(dinner);
    return day;
  });
}

function buildPlannerPrompt(
  brief: UserBrief,
  constraints: MealPlanConstraints,
  pool: Record<MealPlanSlot, DishData[]>,
  dates: string[],
): string {
  const r = briefToRedacted(brief);
  const profile: string[] = [];
  if (r.preferences) {
    profile.push(`- diet: ${r.preferences.dietaryStyle ?? "unset"}`);
    profile.push(`- spice tolerance: ${r.preferences.spiceLevel ?? "unset"}`);
    profile.push(`- goal: ${r.preferences.goal ?? "unset"}`);
    profile.push(`- activity: ${r.preferences.activityLevel ?? "unset"}`);
    profile.push(
      `- allergens to avoid: ${(r.preferences.allergens ?? []).join(", ") || "none"}`,
    );
    profile.push(
      `- dislikes: ${(r.preferences.dislikedIngredients ?? []).join(", ") || "none"}`,
    );
    profile.push(
      `- preferred cuisines: ${(r.preferences.cuisines ?? []).join(", ") || "no preference"}`,
    );
    if (r.preferences.calorieTarget)
      profile.push(`- daily calorie target: ${r.preferences.calorieTarget}`);
    if (r.preferences.proteinTargetGrams)
      profile.push(
        `- daily protein target: ${r.preferences.proteinTargetGrams} g`,
      );
  } else {
    profile.push("- (no taste profile saved yet)");
  }
  const recent = (r.recentOrders ?? [])
    .slice(0, 5)
    .flatMap((o) => o.topItems)
    .slice(0, 8);
  const recentLine =
    recent.length > 0
      ? `Recently ordered: ${recent.join(", ")}`
      : "No recent orders.";

  const compactPool = (slot: MealPlanSlot) =>
    pool[slot].map((d) => ({
      dishId: d.id,
      name: d.name,
      kitchen: d.kitchen,
      category: d.category,
      isVeg: d.isVeg,
      pricePaise: d.price,
      calories: d.macros.calories,
      protein: d.macros.protein,
      carbs: d.macros.carbs,
      fat: d.macros.fat,
      glycaemicIndex: d.glycaemicIndex,
    }));

  // Surface per-day calendar context so the model can scale calories
  // (gym day → heavier, travel day → lighter) and bias dish choices
  // (travel → low-prep / convenience-friendly).
  const calendarLines = constraints.weekCalendar
    ? constraints.weekCalendar
        .map((kind, i) => `- ${dates[i] ?? `day${i + 1}`}: ${kind}`)
        .join("\n")
    : "- (no calendar provided — treat every day as normal)";

  return `You are planning a 7-day meal schedule for a Tanmatra customer.
Pick ONE dish per slot per day from the candidate pools below. Match the
user's goals; spread cuisines across the week; never reuse a single dish
more than ${constraints.maxRepetitionsPerDish} times across the whole week.

USER PROFILE
${profile.join("\n")}
${recentLine}

WEEK CALENDAR (use this to scale daily calories and dish style)
${calendarLines}

WEEKLY CONSTRAINTS
- weekly budget cap (paise): ${constraints.weeklyBudgetPaise ?? "none"}
- daily calorie target: ${constraints.dailyCalorieTarget ?? "no explicit target"}
- daily protein target (g): ${constraints.dailyProteinTargetGrams ?? "no explicit target"}
- max repetitions per dish across the week: ${constraints.maxRepetitionsPerDish}

DATES (in order)
${dates.join(", ")}

BREAKFAST POOL
${JSON.stringify(compactPool("breakfast"), null, 2)}

LUNCH POOL
${JSON.stringify(compactPool("lunch"), null, 2)}

DINNER POOL
${JSON.stringify(compactPool("dinner"), null, 2)}

Return STRICT JSON of shape:
{
  "days": [
    {"date":"YYYY-MM-DD","breakfast":<dishId>,"lunch":<dishId>,"dinner":<dishId>},
    ... 7 entries in date order ...
  ]
}

Hard rules:
- Use ONLY dishIds that appear in the corresponding slot pool.
- Never invent dishIds.
- Stay under the weekly budget if one was provided.
- Respect the repetition cap.
- Output ONLY the JSON object, no prose, no code fence.`;
}

function safeParseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*|^```\s*|```\s*$/g, "");
  return JSON.parse(cleaned);
}

interface ModelDay {
  date: string;
  breakfast: number;
  lunch: number;
  dinner: number;
}

function modelOutputToDays(
  raw: unknown,
  pool: Record<MealPlanSlot, DishData[]>,
  dates: string[],
): MealPlanDay[] | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { days?: unknown };
  if (!Array.isArray(obj.days) || obj.days.length !== DAYS_PER_PLAN) return null;
  const poolIds: Record<MealPlanSlot, Set<number>> = {
    breakfast: new Set(pool.breakfast.map((d) => d.id)),
    lunch: new Set(pool.lunch.map((d) => d.id)),
    dinner: new Set(pool.dinner.map((d) => d.id)),
  };
  const days: MealPlanDay[] = [];
  for (let i = 0; i < DAYS_PER_PLAN; i++) {
    const row = obj.days[i] as Partial<ModelDay> | undefined;
    if (!row) return null;
    const date = dates[i]!;
    const slots: Partial<Record<MealPlanSlot, MealPlanSlotEntry>> = {};
    for (const slot of MEAL_SLOTS) {
      const dishId = Number(row[slot]);
      if (!Number.isFinite(dishId) || !poolIds[slot].has(dishId)) return null;
      const dish = dishById.get(dishId);
      if (!dish) return null;
      slots[slot] = dishToSlotEntry(dish);
    }
    days.push({
      date,
      breakfast: slots.breakfast!,
      lunch: slots.lunch!,
      dinner: slots.dinner!,
    });
  }
  return days;
}

async function callPlannerModel(
  brief: UserBrief,
  constraints: MealPlanConstraints,
  pool: Record<MealPlanSlot, DishData[]>,
  dates: string[],
): Promise<MealPlanDay[] | null> {
  const prompt = buildPlannerPrompt(brief, constraints, pool, dates);
  try {
    const result = await Promise.race([
      generateText({ model: getModel(), prompt }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("meal-planner model timeout")),
          GENERATION_TIMEOUT_MS,
        ),
      ),
    ]);
    const parsed = safeParseJson(result.text);
    return modelOutputToDays(parsed, pool, dates);
  } catch (err) {
    logger.warn({ err }, "meal-planner model call failed");
    return null;
  }
}

/**
 * Heuristic patcher: replaces any dish in `days` that violates a
 * constraint with the next available choice from its slot pool.
 */
function patchViolations(
  days: MealPlanDay[],
  pool: Record<MealPlanSlot, DishData[]>,
  constraints: MealPlanConstraints,
): MealPlanDay[] {
  const counts = new Map<number, number>();
  for (const day of days) {
    for (const slot of MEAL_SLOTS) {
      const e = day[slot];
      if (!e) continue;
      counts.set(e.dishId, (counts.get(e.dishId) ?? 0) + 1);
    }
  }
  const patched = days.map((d) => ({ ...d }));
  for (let i = 0; i < patched.length; i++) {
    for (const slot of MEAL_SLOTS) {
      const entry = patched[i]![slot];
      const dish = entry ? dishById.get(entry.dishId) : undefined;
      const overUsed =
        !!entry && (counts.get(entry.dishId) ?? 0) > constraints.maxRepetitionsPerDish;
      const allergenBad = dish ? !isAllergenSafe(dish, constraints.allergens) : true;
      const dietBad = dish ? !matchesDiet(dish, constraints.dietaryStyle) : true;
      if (!dish || overUsed || allergenBad || dietBad) {
        const replacement = pool[slot].find((d) => {
          if (entry && d.id === entry.dishId) return false;
          const used = counts.get(d.id) ?? 0;
          if (used >= constraints.maxRepetitionsPerDish) return false;
          return isAllergenSafe(d, constraints.allergens) &&
            matchesDiet(d, constraints.dietaryStyle);
        });
        if (replacement) {
          if (entry) {
            counts.set(entry.dishId, (counts.get(entry.dishId) ?? 1) - 1);
          }
          counts.set(replacement.id, (counts.get(replacement.id) ?? 0) + 1);
          patched[i] = { ...patched[i]!, [slot]: dishToSlotEntry(replacement) };
        }
      }
    }
  }
  return patched;
}

/**
 * Generate a fresh weekly plan for the user. Always returns a valid
 * (constraint-passing) plan — falls back to a deterministic greedy
 * picker if the model can't produce one.
 */
export async function generateWeeklyPlan(
  userId: string,
  weekStart: Date,
  overrides: Partial<MealPlanConstraints> = {},
): Promise<PlanGenerationResult & { constraints: MealPlanConstraints }> {
  const brief = await getUserBrief(userId, {
    include: ["preferences", "recentOrders"],
  });
  const constraints = defaultConstraintsFromBrief(brief, overrides);
  const pool = buildCandidatePool(constraints);
  const dates = weekDates(weekStart);
  const notes: string[] = [];

  let days = await callPlannerModel(brief, constraints, pool, dates);
  let usedFallback = false;
  let model = DEFAULT_MODEL_ID;

  if (!days) {
    days = greedyPlan(weekStart, pool, constraints);
    usedFallback = true;
    model = "greedy";
    notes.push("model_unavailable");
  } else {
    const violations = validatePlan(days, constraints);
    if (violations.length > 0) {
      days = patchViolations(days, pool, constraints);
      const stillBad = validatePlan(days, constraints);
      if (stillBad.length > 0) {
        days = greedyPlan(weekStart, pool, constraints);
        usedFallback = true;
        model = "greedy";
        notes.push("model_violation_unrecoverable");
      } else {
        notes.push("model_violation_patched");
      }
    }
  }

  // Final guarantee: never persist a partial or constraint-violating plan.
  // Greedy can leave a slot empty when its candidate pool is exhausted —
  // surface that as an explicit failure rather than saving a half-built
  // week the UI would have to render around.
  const finalViolations = validatePlan(days, constraints);
  const allSlotsFilled =
    days.length === 7 &&
    days.every((d) => d.breakfast != null && d.lunch != null && d.dinner != null);
  if (!allSlotsFilled || finalViolations.length > 0) {
    const err = new Error(
      "could not produce a complete, constraint-satisfying weekly plan",
    ) as Error & { violations: ConstraintViolation[]; status: number };
    err.violations = finalViolations;
    err.status = 422;
    throw err;
  }

  const totals = computeTotals(days);
  return { days, totals, model, usedFallback, notes, constraints };
}

/**
 * Regenerate a single day in an existing plan. The other six days are
 * left untouched but contribute to repetition counts so we don't push
 * any dish over the cap.
 */
export async function regenerateDay(
  userId: string,
  days: MealPlanDay[],
  dayIndex: number,
  constraints: MealPlanConstraints,
): Promise<{ days: MealPlanDay[]; totals: MealPlanTotals }> {
  if (dayIndex < 0 || dayIndex >= days.length) {
    throw new Error("invalid dayIndex");
  }
  const pool = buildCandidatePool(constraints);
  const counts = new Map<number, number>();
  for (let i = 0; i < days.length; i++) {
    if (i === dayIndex) continue;
    for (const slot of MEAL_SLOTS) {
      const e = days[i]?.[slot];
      if (!e) continue;
      counts.set(e.dishId, (counts.get(e.dishId) ?? 0) + 1);
    }
  }
  const target = days[dayIndex]!;
  const usedToday = new Set<number>();
  const newSlotsPartial: Partial<Record<MealPlanSlot, MealPlanSlotEntry>> = {};
  for (const slot of MEAL_SLOTS) {
    const currentId = target[slot]?.dishId;
    // Pool is pre-filtered to allergen-safe + diet-matching candidates;
    // we never fall back outside it. If no candidate is available the
    // slot stays empty and validatePlan surfaces "missing-dish".
    const candidates = pool[slot].filter((d) => {
      if (usedToday.has(d.id)) return false;
      if (currentId !== undefined && d.id === currentId) return false;
      const used = counts.get(d.id) ?? 0;
      return used < constraints.maxRepetitionsPerDish;
    });
    const offset = (dayIndex + slot.length) % Math.max(candidates.length, 1);
    const pick = candidates[offset] ?? candidates[0];
    if (!pick) continue;
    newSlotsPartial[slot] = dishToSlotEntry(pick);
    usedToday.add(pick.id);
    counts.set(pick.id, (counts.get(pick.id) ?? 0) + 1);
  }
  const newDays = days.map((d, i) => {
    if (i !== dayIndex) return d;
    const next: MealPlanDay = { date: target.date };
    if (newSlotsPartial.breakfast) next.breakfast = newSlotsPartial.breakfast;
    if (newSlotsPartial.lunch) next.lunch = newSlotsPartial.lunch;
    if (newSlotsPartial.dinner) next.dinner = newSlotsPartial.dinner;
    return next;
  });
  // Final safety check: never persist a regenerated day that would
  // violate the user's allergen / diet / repetition / budget rules.
  const violations = validatePlan(newDays, constraints);
  if (violations.length > 0) {
    const err = new Error(
      `regenerated day violates constraints: ${violations
        .map((v) => v.message)
        .join("; ")}`,
    );
    (err as Error & { violations: typeof violations }).violations = violations;
    throw err;
  }
  logger.debug({ userId, dayIndex }, "meal-plan regenerated day");
  return { days: newDays, totals: computeTotals(newDays) };
}

/**
 * Swap a single slot to a chosen dish. Validates that the dish exists,
 * passes diet + allergen rules, and doesn't blow the repetition cap.
 */
export function swapSlot(
  days: MealPlanDay[],
  dayIndex: number,
  slot: MealPlanSlot,
  newDishId: number,
  constraints: MealPlanConstraints,
): { days: MealPlanDay[]; totals: MealPlanTotals } {
  if (dayIndex < 0 || dayIndex >= days.length) {
    throw new Error("invalid dayIndex");
  }
  const dish = dishById.get(newDishId);
  if (!dish) throw new Error("unknown dishId");
  if (!isAllergenSafe(dish, constraints.allergens))
    throw new Error("dish contains a flagged allergen");
  if (!matchesDiet(dish, constraints.dietaryStyle))
    throw new Error("dish does not match dietary style");
  const counts = new Map<number, number>();
  for (let i = 0; i < days.length; i++) {
    for (const s of MEAL_SLOTS) {
      let id: number | undefined;
      if (i === dayIndex && s === slot) {
        id = newDishId;
      } else {
        id = days[i]?.[s]?.dishId;
      }
      if (id === undefined) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  if ((counts.get(newDishId) ?? 0) > constraints.maxRepetitionsPerDish) {
    throw new Error("dish exceeds repetition cap");
  }
  const updated = days.map((d, i) =>
    i === dayIndex ? { ...d, [slot]: dishToSlotEntry(dish) } : d,
  );
  return { days: updated, totals: computeTotals(updated) };
}

/**
 * Suggest swap candidates for a given slot — anything in the slot pool
 * that isn't already at the repetition cap.
 */
export async function suggestSwapsForSlot(
  userId: string,
  days: MealPlanDay[],
  dayIndex: number,
  slot: MealPlanSlot,
  constraints: MealPlanConstraints,
  limit = 8,
): Promise<MealPlanSlotEntry[]> {
  const pool = buildCandidatePool(constraints);
  const counts = new Map<number, number>();
  for (let i = 0; i < days.length; i++) {
    for (const s of MEAL_SLOTS) {
      const e = days[i]?.[s];
      if (!e) continue;
      counts.set(e.dishId, (counts.get(e.dishId) ?? 0) + 1);
    }
  }
  const currentId = days[dayIndex]?.[slot]?.dishId;
  // Subtract the current slot from counts so it isn't double-counted
  if (currentId !== undefined) {
    counts.set(currentId, (counts.get(currentId) ?? 1) - 1);
  }
  const out: MealPlanSlotEntry[] = [];
  for (const dish of pool[slot]) {
    if (dish.id === currentId) continue;
    const used = counts.get(dish.id) ?? 0;
    if (used >= constraints.maxRepetitionsPerDish) continue;
    out.push(dishToSlotEntry(dish));
    if (out.length >= limit) break;
  }
  // Touch userId so the audit trail shows who asked.
  logger.debug({ userId, dayIndex, slot }, "meal-plan swap suggestions");
  return out;
}
