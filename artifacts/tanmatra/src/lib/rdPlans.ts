import type { DishData } from "@workspace/menu-catalog";
import { DISHES } from "@workspace/menu-catalog";
import type { UserPreferences, WellnessGoal, DietaryStyle } from "./preferencesApi";
import { evaluateDishForPreferences, type DishMatchResult } from "./preferencesMatch";
import { TEAM, type TeamMember } from "./teamData";

export type PlanGoal =
  | "weight_loss"
  | "lean_muscle"
  | "pcos_balance"
  | "diabetic_friendly"
  | "senior_vitality"
  | "low_fodmap";

export interface PlanDay {
  label: string;
  breakfastSlug: string;
  lunchSlug: string;
  dinnerSlug: string;
  rdTip?: string;
}

export interface RdPlanWeeklyNote {
  weekNumber: number;
  title: string;
  body: string;
}

export interface RdPlan {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  goal: PlanGoal;
  rdAuthorSlug: string;
  calorieTargetPerDay: number;
  proteinTargetGrams: number;
  carbsTargetGrams: number;
  fatTargetGrams: number;
  dietaryStyles: DietaryStyle[];
  pricePerWeekPaise: number;
  badges: string[];
  week: PlanDay[];
  weeklyNotes: RdPlanWeeklyNote[];
  matchesGoals: WellnessGoal[];
}

export const PLAN_GOAL_LABEL: Record<PlanGoal, string> = {
  weight_loss: "Weight loss",
  lean_muscle: "Lean muscle",
  pcos_balance: "PCOS balance",
  diabetic_friendly: "Diabetic-friendly",
  senior_vitality: "Senior vitality",
  low_fodmap: "Low FODMAP / Gut reset",
};

export const RD_PLANS: RdPlan[] = [
  {
    slug: "weight-loss-jumpstart",
    name: "Weight-Loss Jumpstart",
    tagline: "1500 kcal, low-GI, fibre-forward — designed by a clinical RD.",
    description:
      "A six-week curated rotation built around lean proteins, low-glycaemic carbs and at least 25g of fibre per day. Portions are calibrated for a sustainable 0.5–0.7 kg/week loss without hunger spikes.",
    goal: "weight_loss",
    rdAuthorSlug: "rd-anjali-nair",
    calorieTargetPerDay: 1500,
    proteinTargetGrams: 90,
    carbsTargetGrams: 160,
    fatTargetGrams: 50,
    dietaryStyles: ["omnivore", "vegetarian", "pescatarian"],
    pricePerWeekPaise: 549000,
    badges: ["Low GI", "High fibre", "RD signed-off"],
    matchesGoals: ["lose_weight", "general_wellness"],
    week: [
      { label: "Mon", breakfastSlug: "amaranth-porridge-with-blueberry-sauce", lunchSlug: "signature-quinoa-salad", dinnerSlug: "quinoa-khichdi", rdTip: "Front-load fibre and water at breakfast — keeps afternoon snacking down." },
      { label: "Tue", breakfastSlug: "moong-dal-chilla-with-curd", lunchSlug: "broccoli-lemon-chicken-salad", dinnerSlug: "tomato-basil-soup" },
      { label: "Wed", breakfastSlug: "exotic-fruit-bowl", lunchSlug: "chickpea-peanut-tabbouleh-salad", dinnerSlug: "broccoli-almond-soup", rdTip: "Soup-first dinners reduce total intake by ~15% in our cohort." },
      { label: "Thu", breakfastSlug: "quinoa-upma", lunchSlug: "lebanese-hummus-salad", dinnerSlug: "quinoa-khichdi" },
      { label: "Fri", breakfastSlug: "spinach-mushroom-omelette", lunchSlug: "broccoli-babycorn-tomato-salad", dinnerSlug: "tomato-basil-soup" },
      { label: "Sat", breakfastSlug: "exotic-amaranth-blueberry-yogurt", lunchSlug: "signature-quinoa-salad", dinnerSlug: "broccoli-almond-soup", rdTip: "Weekend treat day — keep within ±200 kcal of plan." },
      { label: "Sun", breakfastSlug: "moong-dal-chilla-with-curd", lunchSlug: "chickpea-peanut-tabbouleh-salad", dinnerSlug: "quinoa-khichdi" },
    ],
    weeklyNotes: [
      { weekNumber: 1, title: "Hydration first", body: "3 L/day of water this week. Track every dinner — feedback in-app helps me tune portions for week two." },
      { weekNumber: 2, title: "Walk after dinner", body: "10-min post-dinner walk improves glucose response by ~22% in adults. Logging it nudges your streak." },
      { weekNumber: 3, title: "Protein anchor", body: "Add an extra hand-sized protein at lunch on training days — no calorie penalty in this plan." },
    ],
  },
  {
    slug: "lean-muscle-builder",
    name: "Lean Muscle Builder",
    tagline: "2400 kcal, 160g protein — for hypertrophy and recovery windows.",
    description:
      "Built for 4–6 strength sessions per week. Hits a 1.6 g/kg protein floor, distributes carbs around your training window, and includes recovery-focused dinners for sleep-quality protein synthesis.",
    goal: "lean_muscle",
    rdAuthorSlug: "rd-vikram-sethi",
    calorieTargetPerDay: 2400,
    proteinTargetGrams: 160,
    carbsTargetGrams: 280,
    fatTargetGrams: 75,
    dietaryStyles: ["omnivore", "pescatarian"],
    pricePerWeekPaise: 749000,
    badges: ["High protein", "Trainer-tested", "Post-workout meals"],
    matchesGoals: ["gain_muscle"],
    week: [
      { label: "Mon", breakfastSlug: "creamy-egg-white-sandwich", lunchSlug: "barbeque-grilled-chicken-rice-bowl", dinnerSlug: "broccoli-lemon-chicken-salad", rdTip: "Train heavy today — eat lunch within 90 min of session." },
      { label: "Tue", breakfastSlug: "spinach-mushroom-omelette", lunchSlug: "chipotle-grilled-chicken-rice-bowl", dinnerSlug: "signature-quinoa-salad" },
      { label: "Wed", breakfastSlug: "exotic-egg-bhurji", lunchSlug: "broccoli-lemon-chicken-salad", dinnerSlug: "quinoa-khichdi", rdTip: "Active recovery day — carbs slightly lower." },
      { label: "Thu", breakfastSlug: "tomato-basil-omelette", lunchSlug: "barbeque-grilled-chicken-rice-bowl", dinnerSlug: "chickpea-peanut-tabbouleh-salad" },
      { label: "Fri", breakfastSlug: "creamy-egg-white-sandwich", lunchSlug: "chipotle-grilled-chicken-rice-bowl", dinnerSlug: "broccoli-almond-soup", rdTip: "Pre-load carbs for weekend long session." },
      { label: "Sat", breakfastSlug: "spinach-mushroom-omelette", lunchSlug: "barbeque-grilled-chicken-rice-bowl", dinnerSlug: "signature-quinoa-salad" },
      { label: "Sun", breakfastSlug: "exotic-egg-bhurji", lunchSlug: "broccoli-lemon-chicken-salad", dinnerSlug: "quinoa-khichdi" },
    ],
    weeklyNotes: [
      { weekNumber: 1, title: "Protein timing", body: "Aim for ~30 g protein per meal. Don't bank protein for dinner — synthesis is per-meal capped." },
      { weekNumber: 2, title: "Sleep > supplement", body: "8 h sleep beats any post-workout shake. We've front-loaded carbs at lunch so dinners stay lighter." },
    ],
  },
  {
    slug: "pcos-balance",
    name: "PCOS Hormone Balance",
    tagline: "Anti-inflammatory, low-GI, fibre + omega-3 forward.",
    description:
      "Curated for PCOS / insulin-resistance support. Emphasises low-GI carbs, magnesium-rich greens, and omega-3 sources to help reduce androgen-driven inflammation. Pairs well with weight-loss goals.",
    goal: "pcos_balance",
    rdAuthorSlug: "rd-anjali-nair",
    calorieTargetPerDay: 1700,
    proteinTargetGrams: 100,
    carbsTargetGrams: 170,
    fatTargetGrams: 60,
    dietaryStyles: ["vegetarian", "omnivore", "pescatarian"],
    pricePerWeekPaise: 599000,
    badges: ["Low GI", "Anti-inflammatory", "Hormone-aware"],
    matchesGoals: ["lose_weight", "general_wellness", "maintain"],
    week: [
      { label: "Mon", breakfastSlug: "moong-dal-chilla-with-curd", lunchSlug: "signature-quinoa-salad", dinnerSlug: "tomato-basil-soup", rdTip: "Cinnamon in your morning chai — small but evidence-backed for insulin response." },
      { label: "Tue", breakfastSlug: "amaranth-porridge-with-blueberry-sauce", lunchSlug: "broccoli-babycorn-tomato-salad", dinnerSlug: "quinoa-khichdi" },
      { label: "Wed", breakfastSlug: "spinach-mushroom-omelette", lunchSlug: "lebanese-hummus-salad", dinnerSlug: "broccoli-almond-soup" },
      { label: "Thu", breakfastSlug: "exotic-amaranth-blueberry-yogurt", lunchSlug: "chickpea-peanut-tabbouleh-salad", dinnerSlug: "tomato-basil-soup" },
      { label: "Fri", breakfastSlug: "quinoa-upma", lunchSlug: "signature-quinoa-salad", dinnerSlug: "quinoa-khichdi", rdTip: "Try a 12-h overnight fast Mon–Fri — supports insulin sensitivity." },
      { label: "Sat", breakfastSlug: "moong-dal-chilla-with-curd", lunchSlug: "broccoli-lemon-chicken-salad", dinnerSlug: "broccoli-almond-soup" },
      { label: "Sun", breakfastSlug: "exotic-fruit-bowl", lunchSlug: "lebanese-hummus-salad", dinnerSlug: "quinoa-khichdi" },
    ],
    weeklyNotes: [
      { weekNumber: 1, title: "Track your cycle", body: "Note any symptom changes — bloating, energy, mood. Most members feel a shift by week 4." },
      { weekNumber: 2, title: "Magnesium nightcap", body: "Pumpkin-seed snack 30 min before bed supports sleep + magnesium repletion." },
    ],
  },
  {
    slug: "diabetic-friendly",
    name: "Diabetic-Friendly Plate",
    tagline: "ADA-aligned, ≤45 g carb per meal, ≤8 g sugar per dish.",
    description:
      "Designed alongside our cardiometabolic team to align with ADA and ICMR-INDIAB guidelines. Every meal stays under 45 g carbs and 8 g sugar, with paired protein + fibre to flatten the post-prandial curve.",
    goal: "diabetic_friendly",
    rdAuthorSlug: "rd-anjali-nair",
    calorieTargetPerDay: 1800,
    proteinTargetGrams: 95,
    carbsTargetGrams: 180,
    fatTargetGrams: 60,
    dietaryStyles: ["vegetarian", "omnivore", "pescatarian"],
    pricePerWeekPaise: 629000,
    badges: ["ADA aligned", "≤45g carbs/meal", "Low GI"],
    matchesGoals: ["maintain", "general_wellness", "lose_weight"],
    week: [
      { label: "Mon", breakfastSlug: "moong-dal-chilla-with-curd", lunchSlug: "broccoli-lemon-chicken-salad", dinnerSlug: "tomato-basil-soup", rdTip: "Check fasting glucose Mon morning — note pattern in app." },
      { label: "Tue", breakfastSlug: "spinach-mushroom-omelette", lunchSlug: "signature-quinoa-salad", dinnerSlug: "broccoli-almond-soup" },
      { label: "Wed", breakfastSlug: "quinoa-upma", lunchSlug: "chickpea-peanut-tabbouleh-salad", dinnerSlug: "quinoa-khichdi" },
      { label: "Thu", breakfastSlug: "moong-dal-chilla-with-curd", lunchSlug: "broccoli-babycorn-tomato-salad", dinnerSlug: "tomato-basil-soup" },
      { label: "Fri", breakfastSlug: "amaranth-porridge-with-blueberry-sauce", lunchSlug: "lebanese-hummus-salad", dinnerSlug: "broccoli-almond-soup" },
      { label: "Sat", breakfastSlug: "spinach-mushroom-omelette", lunchSlug: "broccoli-lemon-chicken-salad", dinnerSlug: "quinoa-khichdi" },
      { label: "Sun", breakfastSlug: "exotic-amaranth-blueberry-yogurt", lunchSlug: "signature-quinoa-salad", dinnerSlug: "tomato-basil-soup", rdTip: "Walk for 15 min after Sunday lunch — biggest carb meal of the week." },
    ],
    weeklyNotes: [
      { weekNumber: 1, title: "Plate sequencing", body: "Eat fibre/protein first, carbs last. Cuts post-meal spikes by 20–30% without changing what's on the plate." },
      { weekNumber: 2, title: "Sleep + glucose", body: "<7h sleep raises next-day fasting by 9–15 mg/dL. We're not weighing you — but we are watching the labs." },
    ],
  },
  {
    slug: "senior-vitality",
    name: "Senior Vitality",
    tagline: "Soft-textured, calcium + B12 forward, gentle on digestion.",
    description:
      "For guests 60+. Soft-textured proteins, calcium and vitamin-D forward dishes, lower sodium, and predictable portions. Designed by our family-and-gut RD with feedback from a 50-member elder cohort.",
    goal: "senior_vitality",
    rdAuthorSlug: "rd-kavya-menon",
    calorieTargetPerDay: 1700,
    proteinTargetGrams: 80,
    carbsTargetGrams: 200,
    fatTargetGrams: 55,
    dietaryStyles: ["vegetarian", "omnivore", "pescatarian"],
    pricePerWeekPaise: 549000,
    badges: ["Low sodium", "Soft texture", "B12 + calcium"],
    matchesGoals: ["maintain", "general_wellness"],
    week: [
      { label: "Mon", breakfastSlug: "amaranth-porridge-with-blueberry-sauce", lunchSlug: "quinoa-khichdi", dinnerSlug: "tomato-basil-soup", rdTip: "Warm meals at dinner — easier on overnight digestion." },
      { label: "Tue", breakfastSlug: "moong-dal-chilla-with-curd", lunchSlug: "broccoli-almond-soup", dinnerSlug: "quinoa-khichdi" },
      { label: "Wed", breakfastSlug: "exotic-amaranth-blueberry-yogurt", lunchSlug: "tomato-basil-soup", dinnerSlug: "broccoli-almond-soup" },
      { label: "Thu", breakfastSlug: "quinoa-upma", lunchSlug: "quinoa-khichdi", dinnerSlug: "tomato-basil-soup" },
      { label: "Fri", breakfastSlug: "moong-dal-chilla-with-curd", lunchSlug: "broccoli-almond-soup", dinnerSlug: "quinoa-khichdi" },
      { label: "Sat", breakfastSlug: "amaranth-porridge-with-blueberry-sauce", lunchSlug: "tomato-basil-soup", dinnerSlug: "broccoli-almond-soup" },
      { label: "Sun", breakfastSlug: "exotic-fruit-bowl", lunchSlug: "quinoa-khichdi", dinnerSlug: "tomato-basil-soup" },
    ],
    weeklyNotes: [
      { weekNumber: 1, title: "Hydration cues", body: "Thirst cues fade with age. Aim for 8 small glasses, spaced — not chugged." },
      { weekNumber: 2, title: "Vitamin D", body: "If you're indoor most of the day, ask your physician about a D3 supplement — diet alone rarely reaches target." },
    ],
  },
  {
    slug: "low-fodmap-gut-reset",
    name: "Low-FODMAP Gut Reset",
    tagline: "Six-week elimination → re-introduction protocol for IBS.",
    description:
      "A structured low-FODMAP rotation for IBS / sensitive guts. Avoids garlic, onion, lactose, and high-fructose ingredients in weeks 1–4, then re-introduces categories one at a time so you can map your triggers.",
    goal: "low_fodmap",
    rdAuthorSlug: "rd-kavya-menon",
    calorieTargetPerDay: 1800,
    proteinTargetGrams: 90,
    carbsTargetGrams: 200,
    fatTargetGrams: 60,
    dietaryStyles: ["vegetarian", "omnivore", "pescatarian"],
    pricePerWeekPaise: 649000,
    badges: ["Low FODMAP", "Garlic + onion free", "IBS protocol"],
    matchesGoals: ["general_wellness", "maintain"],
    week: [
      { label: "Mon", breakfastSlug: "exotic-amaranth-blueberry-yogurt", lunchSlug: "signature-quinoa-salad", dinnerSlug: "broccoli-almond-soup", rdTip: "Keep a symptom log — we'll review at week 4." },
      { label: "Tue", breakfastSlug: "amaranth-porridge-with-blueberry-sauce", lunchSlug: "quinoa-khichdi", dinnerSlug: "tomato-basil-soup" },
      { label: "Wed", breakfastSlug: "spinach-mushroom-omelette", lunchSlug: "broccoli-lemon-chicken-salad", dinnerSlug: "broccoli-almond-soup" },
      { label: "Thu", breakfastSlug: "exotic-amaranth-blueberry-yogurt", lunchSlug: "signature-quinoa-salad", dinnerSlug: "tomato-basil-soup" },
      { label: "Fri", breakfastSlug: "quinoa-upma", lunchSlug: "quinoa-khichdi", dinnerSlug: "broccoli-almond-soup", rdTip: "Smaller, more frequent meals on busy days." },
      { label: "Sat", breakfastSlug: "amaranth-porridge-with-blueberry-sauce", lunchSlug: "broccoli-lemon-chicken-salad", dinnerSlug: "tomato-basil-soup" },
      { label: "Sun", breakfastSlug: "exotic-fruit-bowl", lunchSlug: "quinoa-khichdi", dinnerSlug: "broccoli-almond-soup" },
    ],
    weeklyNotes: [
      { weekNumber: 1, title: "Strict elimination", body: "First two weeks are strict — no garlic/onion/dairy. Symptoms typically calm by day 10." },
      { weekNumber: 2, title: "Stress + gut", body: "Gut-brain axis is real. 5 min of slow breathing before meals improves digestion measurably." },
      { weekNumber: 3, title: "Re-introduction starts", body: "Week 5 — we re-introduce one FODMAP category at a time. Your tolerance map is yours alone." },
    ],
  },
];

export interface PlanDayResolved {
  label: string;
  breakfast: DishData | undefined;
  lunch: DishData | undefined;
  dinner: DishData | undefined;
  rdTip?: string;
}

const DISH_INDEX = new Map<string, DishData>(DISHES.map((d) => [d.slug, d]));

export function resolvePlanWeek(plan: RdPlan): PlanDayResolved[] {
  return plan.week.map((day) => ({
    label: day.label,
    breakfast: DISH_INDEX.get(day.breakfastSlug),
    lunch: DISH_INDEX.get(day.lunchSlug),
    dinner: DISH_INDEX.get(day.dinnerSlug),
    rdTip: day.rdTip,
  }));
}

export function getRdAuthor(plan: RdPlan): TeamMember | undefined {
  return TEAM.find((m) => m.slug === plan.rdAuthorSlug);
}

export function getRdPlanBySlug(slug: string): RdPlan | undefined {
  return RD_PLANS.find((p) => p.slug === slug);
}

export interface PlanRecommendation {
  plan: RdPlan;
  score: number;
  reasons: string[];
}

export function recommendPlansForPreferences(
  prefs: UserPreferences | null,
  limit = 3,
): PlanRecommendation[] {
  if (!prefs) {
    return RD_PLANS.slice(0, limit).map((plan) => ({
      plan,
      score: 1,
      reasons: ["Popular RD-curated plan"],
    }));
  }

  const scored = RD_PLANS.map((plan) => {
    let score = 0;
    const reasons: string[] = [];

    if (plan.matchesGoals.includes(prefs.goal)) {
      score += 4;
      reasons.push(`Matches your ${prefs.goal.replace(/_/g, " ")} goal`);
    }
    if (plan.dietaryStyles.includes(prefs.dietaryStyle)) {
      score += 2;
      reasons.push(`Works for ${prefs.dietaryStyle} eaters`);
    }
    if (
      prefs.calorieTarget &&
      Math.abs(plan.calorieTargetPerDay - prefs.calorieTarget) <= 250
    ) {
      score += 2;
      reasons.push(
        `Calorie target (${plan.calorieTargetPerDay} kcal) matches yours`,
      );
    }
    if (
      prefs.proteinTargetGrams &&
      Math.abs(plan.proteinTargetGrams - prefs.proteinTargetGrams) <= 20
    ) {
      score += 1;
      reasons.push(`Protein target close to your ${prefs.proteinTargetGrams}g`);
    }

    const conflicts = countPlanConflicts(plan, prefs);
    if (conflicts > 0) {
      score -= Math.min(conflicts, 8);
      reasons.push(`${conflicts} dish swap${conflicts === 1 ? "" : "s"} suggested for your allergens`);
    }

    return { plan, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export interface PlanConflict {
  dayLabel: string;
  mealKey: "breakfast" | "lunch" | "dinner";
  dish: DishData;
  match: DishMatchResult;
  swap: DishData | null;
}

export function getPlanConflicts(
  plan: RdPlan,
  prefs: UserPreferences | null,
): PlanConflict[] {
  if (!prefs) return [];
  const out: PlanConflict[] = [];
  const week = resolvePlanWeek(plan);
  for (const day of week) {
    for (const mealKey of ["breakfast", "lunch", "dinner"] as const) {
      const dish = day[mealKey];
      if (!dish) continue;
      const match = evaluateDishForPreferences(dish, prefs);
      const isSafetyConflict =
        match.blocked ||
        match.matchedAllergens.length > 0 ||
        match.matchedDislikes.length > 0;
      if (isSafetyConflict) {
        out.push({
          dayLabel: day.label,
          mealKey,
          dish,
          match,
          swap: findPlanSafeSwap(plan, dish, prefs),
        });
      }
    }
  }
  return out;
}

function countPlanConflicts(plan: RdPlan, prefs: UserPreferences): number {
  return getPlanConflicts(plan, prefs).length;
}

export function findPlanSafeSwap(
  plan: RdPlan,
  blocked: DishData,
  prefs: UserPreferences,
): DishData | null {
  const candidates = DISHES.filter(
    (d) =>
      d.isAvailable &&
      d.category === blocked.category &&
      d.slug !== blocked.slug &&
      (plan.dietaryStyles.includes("vegan") ? d.isVeg : true) &&
      (prefs.dietaryStyle === "vegetarian" || prefs.dietaryStyle === "vegan"
        ? d.isVeg
        : true),
  );
  for (const c of candidates) {
    const m = evaluateDishForPreferences(c, prefs);
    if (
      !m.blocked &&
      m.matchedAllergens.length === 0 &&
      m.matchedDislikes.length === 0
    ) {
      return c;
    }
  }
  return null;
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}
