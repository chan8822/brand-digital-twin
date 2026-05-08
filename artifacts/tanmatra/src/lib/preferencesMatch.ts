import type { DishData } from "@workspace/menu-catalog";
import { DISHES } from "@workspace/menu-catalog";
import type { UserPreferences } from "./preferencesApi";

export interface DishMatchResult {
  blocked: boolean;
  warnings: string[];
  reasons: string[];
  matchedAllergens: string[];
  matchedDislikes: string[];
  cuisineMatch: boolean;
}

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
const ANIMAL_HINTS = [...NON_VEG_HINTS, "milk", "cheese", "paneer", "yogurt", "butter", "ghee", "honey", "cream"];
const FISH_OK_HINTS = ["fish", "salmon", "tuna", "shrimp", "prawn"];

export function evaluateDishForPreferences(
  dish: DishData,
  prefs: UserPreferences | null,
): DishMatchResult {
  const result: DishMatchResult = {
    blocked: false,
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
        result.warnings.push("Not vegetarian");
      }
      break;
    case "vegan": {
      const animal = ANIMAL_HINTS.find((h) => ingText.includes(h));
      if (!dish.isVeg || animal) {
        result.blocked = true;
        result.warnings.push("Contains animal products");
      }
      break;
    }
    case "pescatarian": {
      if (!dish.isVeg) {
        const fishy = FISH_OK_HINTS.some((h) => ingText.includes(h));
        if (!fishy) {
          result.blocked = true;
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

export function rankDishesForPreferences(
  dishes: DishData[],
  prefs: UserPreferences | null,
): Array<{ dish: DishData; match: DishMatchResult }> {
  return dishes
    .map((dish) => ({ dish, match: evaluateDishForPreferences(dish, prefs) }))
    .sort((a, b) => {
      if (a.match.blocked !== b.match.blocked) return a.match.blocked ? 1 : -1;
      if (a.match.cuisineMatch !== b.match.cuisineMatch)
        return a.match.cuisineMatch ? -1 : 1;
      const aw = a.match.warnings.length;
      const bw = b.match.warnings.length;
      if (aw !== bw) return aw - bw;
      if (a.match.reasons.length !== b.match.reasons.length)
        return b.match.reasons.length - a.match.reasons.length;
      // Customer reviews tip the tie: a Bayesian-shrunk rating that nudges
      // well-rated dishes up while not over-rewarding 1-review noise.
      return reviewScore(b.dish) - reviewScore(a.dish);
    });
}

const REVIEW_PRIOR_RATING = 3.5;
const REVIEW_PRIOR_WEIGHT = 4;
function reviewScore(dish: DishData): number {
  const r = dish.averageRating;
  const n = dish.reviewCount ?? 0;
  if (r == null || n <= 0) return REVIEW_PRIOR_RATING;
  return (
    (r * n + REVIEW_PRIOR_RATING * REVIEW_PRIOR_WEIGHT) /
    (n + REVIEW_PRIOR_WEIGHT)
  );
}

export function findSmartSwap(
  dish: DishData,
  prefs: UserPreferences | null,
): DishData | null {
  if (!prefs) return null;
  const original = evaluateDishForPreferences(dish, prefs);
  if (!original.blocked && original.warnings.length === 0) return null;
  const scored = DISHES.filter(
    (d) => d.id !== dish.id && d.isAvailable && d.category === dish.category,
  )
    .map((d) => ({ d, m: evaluateDishForPreferences(d, prefs) }))
    .filter(({ m }) => !m.blocked && m.warnings.length === 0);
  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (a.m.cuisineMatch !== b.m.cuisineMatch) return a.m.cuisineMatch ? -1 : 1;
    if (a.m.reasons.length !== b.m.reasons.length)
      return b.m.reasons.length - a.m.reasons.length;
    return Math.abs(a.d.price - dish.price) - Math.abs(b.d.price - dish.price);
  });
  return scored[0]?.d ?? null;
}
