export type DietaryStyle =
  | "omnivore"
  | "vegetarian"
  | "vegan"
  | "pescatarian"
  | "keto";

export type SpiceLevel = "none" | "mild" | "medium" | "hot";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type WellnessGoal =
  | "lose_weight"
  | "maintain"
  | "gain_muscle"
  | "general_wellness";

export interface UserPreferences {
  userId: string;
  allergens: string[];
  dislikedIngredients: string[];
  cuisines: string[];
  spiceLevel: SpiceLevel;
  dietaryStyle: DietaryStyle;
  goal: WellnessGoal;
  activityLevel: ActivityLevel;
  calorieTarget: number | null;
  proteinTargetGrams: number | null;
  carbsTargetGrams: number | null;
  fatTargetGrams: number | null;
  quizCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreferencesPatch {
  allergens?: string[];
  dislikedIngredients?: string[];
  cuisines?: string[];
  spiceLevel?: SpiceLevel;
  dietaryStyle?: DietaryStyle;
  goal?: WellnessGoal;
  activityLevel?: ActivityLevel;
  calorieTarget?: number | null;
  proteinTargetGrams?: number | null;
  carbsTargetGrams?: number | null;
  fatTargetGrams?: number | null;
  markQuizComplete?: boolean;
}

import { API_BASE as API_BASE } from "./apiBase";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const preferencesApi = {
  get: () => request<{ preferences: UserPreferences | null }>("/preferences"),
  update: (patch: PreferencesPatch) =>
    request<{ preferences: UserPreferences }>("/preferences", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};

export const ALLERGEN_OPTIONS = [
  "dairy",
  "eggs",
  "gluten",
  "peanuts",
  "shellfish",
  "soy",
  "tree nuts",
] as const;

export const CUISINE_OPTIONS = [
  "continental",
  "indian",
  "asian",
  "mediterranean",
] as const;

export const DIETARY_STYLE_LABEL: Record<DietaryStyle, string> = {
  omnivore: "Omnivore (everything)",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  keto: "Keto",
};

export const GOAL_LABEL: Record<WellnessGoal, string> = {
  lose_weight: "Lose weight",
  maintain: "Maintain",
  gain_muscle: "Gain muscle",
  general_wellness: "General wellness",
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  very_active: "Very active",
};

export const SPICE_LABEL: Record<SpiceLevel, string> = {
  none: "No spice",
  mild: "Mild",
  medium: "Medium",
  hot: "Hot",
};
