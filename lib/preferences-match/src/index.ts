import type { DishData } from "@workspace/menu-catalog";

export type DietaryStyle =
  | "omnivore"
  | "vegetarian"
  | "vegan"
  | "pescatarian"
  | "keto";

export type WellnessGoal =
  | "lose_weight"
  | "maintain"
  | "gain_muscle"
  | "general_wellness";

/**
 * Minimal preference shape needed by the dish evaluator. Both the client
 * (`UserPreferences` from preferencesApi) and the server (the
 * `userPreferencesTable` row from `@workspace/db`) satisfy this contract.
 */
export interface PreferencesForMatch {
  allergens: string[];
  dislikedIngredients: string[];
  cuisines: string[];
  dietaryStyle: DietaryStyle;
  goal?: WellnessGoal | null;
  calorieTarget?: number | null;
}

export interface DishMatchResult {
  blocked: boolean;
  /** Why this dish was blocked. Empty when `blocked === false`. */
  blockReasons: BlockReason[];
  warnings: string[];
  reasons: string[];
  matchedAllergens: string[];
  matchedDislikes: string[];
  cuisineMatch: boolean;
}

/** Discriminator for server-side 422 responses + audit logs. */
export type BlockReason =
  | { code: "allergen_block"; allergens: string[] }
  | { code: "diet_block"; style: DietaryStyle; detail: string };

const norm = (s: string) => s.trim().toLowerCase();

function dishAllergens(d: DishData): string[] {
  return d.allergens.map(norm);
}

function dishIngredientText(d: DishData): string {
  return d.ingredients.map(norm).join(" | ");
}

const NON_VEG_HINTS = [
  "chicken",
  "fish",
  "egg",
  "shrimp",
  "prawn",
  "salmon",
  "tuna",
  "beef",
  "pork",
  "lamb",
  "mutton",
  "bacon",
  "turkey",
];
const ANIMAL_HINTS = [
  ...NON_VEG_HINTS,
  "milk",
  "cheese",
  "paneer",
  "yogurt",
  "butter",
  "ghee",
  "honey",
  "cream",
];
const FISH_OK_HINTS = ["fish", "salmon", "tuna", "shrimp", "prawn"];

export function evaluateDishForPreferences(
  dish: DishData,
  prefs: PreferencesForMatch | null,
): DishMatchResult {
  const result: DishMatchResult = {
    blocked: false,
    blockReasons: [],
    warnings: [],
    reasons: [],
    matchedAllergens: [],
    matchedDislikes: [],
    cuisineMatch: true,
  };
  if (!prefs) return result;

  const allergens = dishAllergens(dish);
  const userAllergens = prefs.allergens.map(norm);
  for (const a of userAllergens) {
    if (allergens.includes(a)) result.matchedAllergens.push(a);
  }
  if (result.matchedAllergens.length > 0) {
    result.blocked = true;
    result.blockReasons.push({
      code: "allergen_block",
      allergens: [...new Set(result.matchedAllergens)],
    });
    result.warnings.push(
      `Contains ${result.matchedAllergens.join(", ")} — flagged in your allergens`,
    );
  }

  const ingText = dishIngredientText(dish);
  for (const dis of prefs.dislikedIngredients.map(norm)) {
    if (!dis) continue;
    if (ingText.includes(dis) || dish.name.toLowerCase().includes(dis)) {
      result.matchedDislikes.push(dis);
    }
  }
  if (result.matchedDislikes.length > 0) {
    result.warnings.push(
      `Contains ${result.matchedDislikes.join(", ")} (on your dislikes)`,
    );
  }

  switch (prefs.dietaryStyle) {
    case "vegetarian":
      if (!dish.isVeg) {
        result.blocked = true;
        result.blockReasons.push({
          code: "diet_block",
          style: "vegetarian",
          detail: "Not vegetarian",
        });
        result.warnings.push("Not vegetarian");
      }
      break;
    case "vegan": {
      const animal = ANIMAL_HINTS.find((h) => ingText.includes(h));
      if (!dish.isVeg || animal) {
        result.blocked = true;
        result.blockReasons.push({
          code: "diet_block",
          style: "vegan",
          detail: animal
            ? `Contains animal product: ${animal}`
            : "Contains animal products",
        });
        result.warnings.push("Contains animal products");
      }
      break;
    }
    case "pescatarian": {
      if (!dish.isVeg) {
        const fishy = FISH_OK_HINTS.some((h) => ingText.includes(h));
        if (!fishy) {
          result.blocked = true;
          result.blockReasons.push({
            code: "diet_block",
            style: "pescatarian",
            detail: "Pescatarian: only fish/seafood",
          });
          result.warnings.push("Pescatarian: only fish/seafood");
        }
      }
      break;
    }
    case "keto":
      if (dish.macros.carbs > 30) {
        result.warnings.push(`High carbs (${dish.macros.carbs}g) for keto`);
      }
      break;
    case "omnivore":
      break;
  }

  if (prefs.cuisines.length > 0) {
    result.cuisineMatch = prefs.cuisines
      .map(norm)
      .includes(dish.kitchen.toLowerCase());
  }

  if (prefs.calorieTarget && dish.macros.calories > prefs.calorieTarget * 0.6) {
    result.warnings.push(
      `${dish.macros.calories} kcal is heavy for your daily target`,
    );
  }

  if (prefs.goal === "gain_muscle" && dish.macros.protein < 15) {
    result.warnings.push(
      `Only ${dish.macros.protein}g protein — light for your muscle-gain goal`,
    );
  }
  if (prefs.goal === "lose_weight" && dish.macros.calories > 700) {
    result.warnings.push(
      `${dish.macros.calories} kcal is heavy for your weight-loss goal`,
    );
  }

  if (prefs.cuisines.length > 0 && result.cuisineMatch) {
    result.reasons.push(`${dish.kitchen} is on your cuisine list`);
  }
  if (prefs.goal === "lose_weight" && dish.macros.calories <= 450) {
    result.reasons.push("Light on calories for your weight-loss goal");
  }
  if (prefs.goal === "gain_muscle" && dish.macros.protein >= 25) {
    result.reasons.push(`${dish.macros.protein}g protein supports muscle gain`);
  }

  return result;
}
