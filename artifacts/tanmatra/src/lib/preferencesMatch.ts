import type { DishData } from "@workspace/menu-catalog";
import { DISHES } from "@workspace/menu-catalog";
import {
  evaluateDishForPreferences as sharedEvaluate,
  type DishMatchResult as SharedDishMatchResult,
  type PreferencesForMatch,
} from "@workspace/preferences-match";
import type { UserPreferences } from "./preferencesApi";

export type DishMatchResult = SharedDishMatchResult;

export function evaluateDishForPreferences(
  dish: DishData,
  prefs: UserPreferences | null,
): DishMatchResult {
  return sharedEvaluate(dish, prefs as PreferencesForMatch | null);
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
