import type { DishData, DishKitchen } from "@workspace/menu-catalog";

export interface MicroNutrient {
  key: string;
  label: string;
  value: number;
  unit: string;
  dailyTargetPct: number;
}

export interface NutritionLabel {
  servingSize: string;
  calories: number;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    saturatedFat: number;
    sugar: number;
    sodiumMg: number;
  };
  micros: MicroNutrient[];
  allergens: string[];
  containsClaims: string[];
  freeFromClaims: string[];
}

const CATEGORY_SODIUM_MG: Record<string, number> = {
  beverages: 30,
  breakfast: 320,
  salads: 280,
  soups: 460,
  pasta: 520,
  wraps: 540,
  bowls: 480,
  snacks: 360,
  mains: 540,
};

const CATEGORY_SERVING: Record<string, string> = {
  beverages: "1 glass (~280 ml)",
  breakfast: "1 plate (~320 g)",
  salads: "1 bowl (~340 g)",
  soups: "1 bowl (~300 ml)",
  pasta: "1 plate (~330 g)",
  wraps: "1 wrap (~280 g)",
  bowls: "1 bowl (~360 g)",
  snacks: "1 portion (~180 g)",
  mains: "1 plate (~380 g)",
};

function parseSugarGrams(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function deriveMicros(dish: DishData): MicroNutrient[] {
  const m = dish.macros;
  const ingredientText = dish.ingredients.join(" ").toLowerCase();
  const hasGreens = /spinach|kale|lettuce|methi|coriander|broccoli|moringa/.test(ingredientText);
  const hasDairy = /milk|curd|yogurt|paneer|cheese/.test(ingredientText);
  const hasNuts = /almond|cashew|walnut|peanut|chia|flax/.test(ingredientText);
  const hasCitrus = /lemon|lime|orange|amla/.test(ingredientText);
  const hasLegumes = /dal|lentil|chickpea|moong|chana|rajma|tofu|beans/.test(ingredientText);
  const hasWholeGrain = /quinoa|oats|brown rice|multigrain|whole.?wheat|millet|jowar|ragi/.test(
    ingredientText,
  );

  const ironMg = Math.round(
    (m.protein * 0.05 + (hasGreens ? 1.6 : 0) + (hasLegumes ? 1.4 : 0) + (hasWholeGrain ? 0.8 : 0)) * 10,
  ) / 10;
  const calciumMg = Math.round(
    m.protein * 4 + (hasDairy ? 180 : 0) + (hasGreens ? 60 : 0) + (hasNuts ? 40 : 0),
  );
  const vitaminCMg = Math.round((hasCitrus ? 24 : 0) + (hasGreens ? 18 : 0) + m.fiber * 1.2);
  const potassiumMg = Math.round(
    300 + m.fiber * 30 + (hasGreens ? 200 : 0) + (hasLegumes ? 250 : 0),
  );
  const magnesiumMg = Math.round(
    40 + m.fiber * 6 + (hasNuts ? 60 : 0) + (hasWholeGrain ? 40 : 0),
  );

  return [
    { key: "iron", label: "Iron", value: ironMg, unit: "mg", dailyTargetPct: Math.round((ironMg / 18) * 100) },
    { key: "calcium", label: "Calcium", value: calciumMg, unit: "mg", dailyTargetPct: Math.round((calciumMg / 1000) * 100) },
    { key: "vitc", label: "Vitamin C", value: vitaminCMg, unit: "mg", dailyTargetPct: Math.round((vitaminCMg / 75) * 100) },
    { key: "potassium", label: "Potassium", value: potassiumMg, unit: "mg", dailyTargetPct: Math.round((potassiumMg / 3500) * 100) },
    { key: "magnesium", label: "Magnesium", value: magnesiumMg, unit: "mg", dailyTargetPct: Math.round((magnesiumMg / 400) * 100) },
  ];
}

export function buildNutritionLabel(dish: DishData): NutritionLabel {
  const sugar = parseSugarGrams(dish.sugarPerServing);
  const sodium = CATEGORY_SODIUM_MG[dish.category] ?? 400;
  const saturated = Math.round(dish.macros.fat * 0.32 * 10) / 10;

  const ingText = dish.ingredients.join(" ").toLowerCase();
  const containsClaims: string[] = [];
  const freeFromClaims: string[] = [];

  if (dish.macros.protein >= 20) containsClaims.push("High protein");
  if (dish.macros.fiber >= 5) containsClaims.push("Good source of fibre");
  if (dish.glycaemicIndex === "low") containsClaims.push("Low glycaemic index");
  if (sodium <= 350) containsClaims.push("Lower sodium");
  if (saturated <= 4) containsClaims.push("Low saturated fat");
  if (sugar <= 5) containsClaims.push("Low added sugar");

  if (!/sugar|honey|syrup|jaggery/.test(ingText)) freeFromClaims.push("No added sugar");
  if (!/maida|refined flour|all-purpose flour/.test(ingText)) freeFromClaims.push("No refined flour");
  if (!/palm oil|hydrogenated|margarine|vanaspati/.test(ingText)) freeFromClaims.push("No trans fats");
  if (!/msg|monosodium|ajinomoto|preservative/.test(ingText)) freeFromClaims.push("No MSG or preservatives");
  if (!/colour|coloring|artificial flavour/.test(ingText))
    freeFromClaims.push("No artificial colours");

  return {
    servingSize: CATEGORY_SERVING[dish.category] ?? "1 portion",
    calories: dish.macros.calories,
    macros: {
      protein: dish.macros.protein,
      carbs: dish.macros.carbs,
      fat: dish.macros.fat,
      fiber: dish.macros.fiber,
      saturatedFat: saturated,
      sugar,
      sodiumMg: sodium,
    },
    micros: deriveMicros(dish),
    allergens: dish.allergens,
    containsClaims,
    freeFromClaims,
  };
}

export interface SourcingNote {
  area: string;
  detail: string;
}

const KITCHEN_SOURCING: Record<DishKitchen, SourcingNote[]> = {
  continental: [
    { area: "Dairy & eggs", detail: "Cage-free eggs from a Maharashtra co-op; A2 milk from a partner farm in Pune." },
    { area: "Greens & herbs", detail: "Hydroponic basil, kale, and lettuce from a Lonavla glasshouse — harvested the morning of cooking." },
    { area: "Oils", detail: "Cold-pressed extra-virgin olive oil and sunflower oil; no refined or palm-derived oils." },
  ],
  asian: [
    { area: "Aromatics & broths", detail: "Lemongrass, galangal, and kaffir lime from a Coorg estate; vegetable stock made daily, never cubes." },
    { area: "Sauces", detail: "Low-sodium soy reduced in-house with mirin and rice vinegar — no MSG, no caramel colour." },
    { area: "Grains", detail: "Single-origin jasmine and brown rice; soaked the night before to lower the glycaemic load." },
  ],
  indian: [
    { area: "Spices", detail: "Whole spices ground weekly at our Bengaluru spice room — no pre-mixed masalas." },
    { area: "Dals & legumes", detail: "Single-origin moong, masoor, and chana from a Vidarbha farmer collective; sorted and re-cleaned in-house." },
    { area: "Dairy", detail: "Paneer set fresh daily from A2 milk; ghee made in small batches from cultured cream." },
  ],
  mediterranean: [
    { area: "Olive oil", detail: "First-cold-press EVOO from a Crete cooperative; tested for free fatty acids each batch." },
    { area: "Greens & vegetables", detail: "Hydroponic greens; tomatoes from a vine-ripened farm partner in Nashik." },
    { area: "Grains & legumes", detail: "Whole-grain durum, farro, and chickpeas — cooked al-dente, never canned." },
  ],
};

export function getSourcingForDish(dish: DishData): SourcingNote[] {
  return KITCHEN_SOURCING[dish.kitchen];
}
