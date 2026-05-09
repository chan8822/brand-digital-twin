export interface DishCustomOption {
  name: string;
  priceModifier: number;
  default?: boolean;
}

export interface DishCustomGroup {
  groupName: string;
  type: "single" | "multiple";
  options: DishCustomOption[];
}

export interface DishMacros {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  calories: number;
}

export type DishCategory =
  | "beverages"
  | "breakfast"
  | "salads"
  | "soups"
  | "pasta"
  | "wraps"
  | "bowls"
  | "snacks"
  | "mains";

export type DishKitchen = "continental" | "indian" | "asian" | "mediterranean";

export interface DishData {
  id: number;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  image: string;
  price: number;
  kitchen: DishKitchen;
  category: DishCategory;
  isVeg: boolean;
  rdVerified: boolean;
  rdNote?: string;
  prepTime: string;
  macros: DishMacros;
  ingredients: string[];
  allergens: string[];
  glycaemicIndex: "low" | "medium" | "high";
  sugarPerServing: string;
  customizations: DishCustomGroup[];
  pairingSlug?: string;
  isAvailable: boolean;
  averageRating?: number | null;
  reviewCount?: number;
}

export const CATEGORY_LABELS: Record<DishCategory, string> = {
  beverages: "Beverages",
  breakfast: "Breakfast",
  salads: "Salads",
  soups: "Soups",
  pasta: "Pasta",
  wraps: "Wraps & Sandwiches",
  bowls: "Rice Bowls",
  snacks: "Snacks & Bakes",
  mains: "Mains",
};

export const KITCHEN_LABELS: Record<DishKitchen, string> = {
  continental: "Continental",
  indian: "Indian",
  asian: "Asian",
  mediterranean: "Mediterranean",
};

// The shared dish catalog is now sourced exclusively from the API/database.
// No hardcoded dishes ship with the build — the array is intentionally empty.
export const DISHES: DishData[] = [];

export function getDishBySlug(slug: string): DishData | undefined {
  return DISHES.find((d) => d.slug === slug);
}

export function getDishById(id: number): DishData | undefined {
  return DISHES.find((d) => d.id === id);
}

export function getDishAllergens(slug: string): string[] | null {
  const d = getDishBySlug(slug);
  return d ? d.allergens : null;
}
