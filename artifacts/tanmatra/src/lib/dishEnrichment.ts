import { DISHES, type DishCategory, type DishCustomGroup, type DishData } from "./menuData";

export type Lifestyle =
  | "all"
  | "heart-healthy"
  | "fitness-gains"
  | "diabetes-management"
  | "junior-explorers"
  | "silver-vitality";

export const LIFESTYLE_LABELS: Record<Exclude<Lifestyle, "all">, string> = {
  "heart-healthy": "Heart Healthy",
  "fitness-gains": "Fitness & Gains",
  "diabetes-management": "Diabetes Management",
  "junior-explorers": "Junior Explorers",
  "silver-vitality": "Silver Vitality",
};

export const LIFESTYLE_TAGS: Record<Exclude<Lifestyle, "all">, string> = {
  "heart-healthy": "LOW SODIUM",
  "fitness-gains": "HIGH PROTEIN",
  "diabetes-management": "LOW GI",
  "junior-explorers": "KID FRIENDLY",
  "silver-vitality": "EASY DIGEST",
};

const KID_FRIENDLY_CATEGORIES: DishCategory[] = ["breakfast", "snacks", "pasta", "wraps", "beverages"];
const SILVER_CATEGORIES: DishCategory[] = ["soups", "salads", "bowls", "breakfast"];

export function matchesLifestyle(dish: DishData, ls: Lifestyle): boolean {
  if (ls === "all") return true;
  const sugarNum = parseFloat(dish.sugarPerServing) || 0;
  switch (ls) {
    case "heart-healthy":
      return (
        dish.glycaemicIndex !== "high" &&
        dish.macros.fat <= 18 &&
        sugarNum <= 12
      );
    case "fitness-gains":
      return dish.macros.protein >= 18;
    case "diabetes-management":
      return dish.glycaemicIndex === "low" && sugarNum <= 8;
    case "junior-explorers":
      return KID_FRIENDLY_CATEGORIES.includes(dish.category) && dish.isVeg;
    case "silver-vitality":
      return (
        SILVER_CATEGORIES.includes(dish.category) &&
        dish.glycaemicIndex !== "high" &&
        dish.macros.fiber >= 3
      );
  }
}

const CATEGORY_CUSTOMIZATIONS: Record<DishCategory, DishCustomGroup[]> = {
  beverages: [
    {
      groupName: "Sweetness",
      type: "single",
      options: [
        { name: "No sugar", priceModifier: 0, default: true },
        { name: "Light sweet", priceModifier: 0 },
        { name: "Regular", priceModifier: 0 },
      ],
    },
    {
      groupName: "Add-ons",
      type: "multiple",
      options: [
        { name: "Whey protein scoop", priceModifier: 6000 },
        { name: "Chia seeds", priceModifier: 2000 },
        { name: "Flax seeds", priceModifier: 2000 },
      ],
    },
  ],
  breakfast: [
    {
      groupName: "Portion",
      type: "single",
      options: [
        { name: "Regular", priceModifier: 0, default: true },
        { name: "Large", priceModifier: 6000 },
      ],
    },
    {
      groupName: "Add-ons",
      type: "multiple",
      options: [
        { name: "Egg whites (3)", priceModifier: 8000 },
        { name: "Avocado slices", priceModifier: 7000 },
        { name: "Extra protein scoop", priceModifier: 10000 },
      ],
    },
  ],
  salads: [
    {
      groupName: "Dressing",
      type: "single",
      options: [
        { name: "Lemon-olive", priceModifier: 0, default: true },
        { name: "Tahini", priceModifier: 0 },
        { name: "Balsamic vinaigrette", priceModifier: 0 },
        { name: "No dressing", priceModifier: 0 },
      ],
    },
    {
      groupName: "Add Protein",
      type: "single",
      options: [
        { name: "None", priceModifier: 0, default: true },
        { name: "Grilled chicken", priceModifier: 12000 },
        { name: "Tofu", priceModifier: 8000 },
        { name: "Paneer", priceModifier: 9000 },
      ],
    },
  ],
  soups: [
    {
      groupName: "Spice level",
      type: "single",
      options: [
        { name: "Mild", priceModifier: 0, default: true },
        { name: "Medium", priceModifier: 0 },
        { name: "Hot", priceModifier: 0 },
      ],
    },
    {
      groupName: "Add-ons",
      type: "multiple",
      options: [
        { name: "Multigrain croutons", priceModifier: 2000 },
        { name: "Parmesan shavings", priceModifier: 3000 },
        { name: "Extra veg", priceModifier: 4000 },
      ],
    },
  ],
  pasta: [
    {
      groupName: "Pasta type",
      type: "single",
      options: [
        { name: "Whole wheat", priceModifier: 0, default: true },
        { name: "Semolina", priceModifier: 0 },
        { name: "Gluten-free penne", priceModifier: 4000 },
      ],
    },
    {
      groupName: "Cheese",
      type: "single",
      options: [
        { name: "Light", priceModifier: 0, default: true },
        { name: "None", priceModifier: 0 },
        { name: "Extra parmesan", priceModifier: 4000 },
      ],
    },
    {
      groupName: "Add-ons",
      type: "multiple",
      options: [
        { name: "Grilled chicken", priceModifier: 12000 },
        { name: "Sautéed mushrooms", priceModifier: 5000 },
      ],
    },
  ],
  wraps: [
    {
      groupName: "Wrap base",
      type: "single",
      options: [
        { name: "Whole-wheat tortilla", priceModifier: 0, default: true },
        { name: "Multigrain", priceModifier: 0 },
        { name: "Lettuce wrap (low-carb)", priceModifier: 0 },
      ],
    },
    {
      groupName: "Spice level",
      type: "single",
      options: [
        { name: "Mild", priceModifier: 0, default: true },
        { name: "Medium", priceModifier: 0 },
        { name: "Hot", priceModifier: 0 },
      ],
    },
    {
      groupName: "Add-ons",
      type: "multiple",
      options: [
        { name: "Extra cheese", priceModifier: 3000 },
        { name: "Avocado", priceModifier: 7000 },
        { name: "Side of baked fries", priceModifier: 8000 },
      ],
    },
  ],
  bowls: [
    {
      groupName: "Grain base",
      type: "single",
      options: [
        { name: "Brown rice", priceModifier: 0, default: true },
        { name: "Basmati", priceModifier: 0 },
        { name: "Quinoa", priceModifier: 4000 },
      ],
    },
    {
      groupName: "Spice level",
      type: "single",
      options: [
        { name: "Mild", priceModifier: 0, default: true },
        { name: "Medium", priceModifier: 0 },
        { name: "Hot", priceModifier: 0 },
      ],
    },
    {
      groupName: "Add-ons",
      type: "multiple",
      options: [
        { name: "Extra protein", priceModifier: 10000 },
        { name: "Side raita", priceModifier: 3000 },
        { name: "Roasted papad", priceModifier: 1500 },
      ],
    },
  ],
  snacks: [
    {
      groupName: "Portion",
      type: "single",
      options: [
        { name: "Regular", priceModifier: 0, default: true },
        { name: "Sharing", priceModifier: 8000 },
      ],
    },
    {
      groupName: "Dipping sauce",
      type: "multiple",
      options: [
        { name: "Mint chutney", priceModifier: 0 },
        { name: "Hummus", priceModifier: 3000 },
        { name: "Spicy mayo", priceModifier: 2000 },
      ],
    },
  ],
  mains: [
    {
      groupName: "Spice level",
      type: "single",
      options: [
        { name: "Mild", priceModifier: 0, default: true },
        { name: "Medium", priceModifier: 0 },
        { name: "Hot", priceModifier: 0 },
      ],
    },
    {
      groupName: "Side",
      type: "single",
      options: [
        { name: "Brown rice", priceModifier: 0, default: true },
        { name: "Multigrain roti (2)", priceModifier: 0 },
        { name: "Quinoa pilaf", priceModifier: 4000 },
      ],
    },
    {
      groupName: "Add-ons",
      type: "multiple",
      options: [
        { name: "Extra gravy", priceModifier: 3000 },
        { name: "Side raita", priceModifier: 3000 },
        { name: "Garden salad", priceModifier: 5000 },
      ],
    },
  ],
};

export function getCustomizationsForDish(dish: DishData): DishCustomGroup[] {
  if (dish.customizations && dish.customizations.length > 0) return dish.customizations;
  return CATEGORY_CUSTOMIZATIONS[dish.category];
}

const KITCHEN_NOTES: Record<DishCategory, string> = {
  beverages: "Cold-pressed and shaken to order in our beverage bar — no syrups, no concentrates. Plant-based milk on request.",
  breakfast: "Cooked à la minute on a brushed-oil flat-top. Eggs sourced from cage-free farms; grains soaked overnight for digestibility.",
  salads: "Greens triple-washed and spun within the hour of plating. Dressings are emulsified in-house with cold-pressed oils.",
  soups: "Slow-simmered for 90 minutes from a vegetable or bone broth base. No cubes, no MSG, salt added post-tasting.",
  pasta: "Boiled to al dente in salted water, then finished in the sauce — pan-tossed, never microwaved. Whole-wheat by default.",
  wraps: "Tortillas warmed on the griddle for 30 seconds; fillings layered to keep the wrap structurally sound for transit.",
  bowls: "Components cooked separately and assembled to order so flavours stay distinct. Grains rested for fluff before bowl-up.",
  snacks: "Air-fried or baked — never deep-fried — using a 12-minute fixed protocol to control oil pickup.",
  mains: "Spice base bloomed in a separate pan; protein cooked sous-vide-style to retain moisture, then seared for finish.",
};

export function getKitchenNoteForDish(dish: DishData): string {
  return KITCHEN_NOTES[dish.category];
}

const RD_NOTE_FALLBACKS: Record<DishCategory, string> = {
  beverages: "A clean macro fit for between-meal hydration. Skip added sweeteners if tracking glucose.",
  breakfast: "Strong morning macro split. Pair with a protein add-on if your goal is muscle synthesis.",
  salads: "Nutrient-dense and high in micronutrients. Add a protein for a complete meal.",
  soups: "Easy-digest and hydrating — ideal pre-workout or as a light dinner option.",
  pasta: "Complex-carb forward. Best within a 4-hour window of moderate-to-high activity.",
  wraps: "Balanced grab-and-go option. Choose lettuce wrap to reduce refined carbs further.",
  bowls: "Complete meal with all macros covered. Quinoa swap recommended for low-GI days.",
  snacks: "Portion-controlled — sized for an in-between fix without spiking insulin.",
  mains: "Restaurant-style without the salt and oil load. Anchor of a balanced dinner plate.",
};

export function getRdNoteForDish(dish: DishData): string {
  return dish.rdNote ?? RD_NOTE_FALLBACKS[dish.category];
}

export function getUpsellsForDish(dish: DishData, count = 3): DishData[] {
  const sameKitchen = DISHES.filter(
    (d) => d.id !== dish.id && d.kitchen === dish.kitchen && d.category !== dish.category && d.isAvailable,
  );
  const crossKitchen = DISHES.filter(
    (d) =>
      d.id !== dish.id &&
      d.kitchen !== dish.kitchen &&
      d.category !== dish.category &&
      d.isAvailable,
  );
  const seed = dish.id;
  const pick = (pool: DishData[], n: number): DishData[] => {
    const out: DishData[] = [];
    for (let i = 0; i < pool.length && out.length < n; i++) {
      const idx = (seed * 7 + i * 13) % pool.length;
      const candidate = pool[idx];
      if (!out.find((x) => x.id === candidate.id)) out.push(candidate);
    }
    return out;
  };
  const primary = pick(sameKitchen, count);
  if (primary.length < count) {
    primary.push(...pick(crossKitchen, count - primary.length));
  }
  return primary.slice(0, count);
}

export function stripIngredientAmount(line: string): string {
  const cleaned = line.split(/\s[–—-]\s/)[0];
  return cleaned.trim();
}
