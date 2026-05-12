import {
  DISHES,
  type DishData,
  type DishCategory,
  type DishKitchen,
  type DishCustomGroup,
} from "@workspace/menu-catalog";
import { listMenuItems } from "./menu";
import { getSummariesForSlugs } from "./dishReviews";

const VALID_CATEGORIES = new Set<DishCategory>([
  "beverages",
  "breakfast",
  "salads",
  "soups",
  "pasta",
  "wraps",
  "bowls",
  "snacks",
  "mains",
]);
const VALID_KITCHENS = new Set<DishKitchen>([
  "continental",
  "indian",
  "asian",
  "mediterranean",
]);
const VALID_GI = new Set<DishData["glycaemicIndex"]>(["low", "medium", "high"]);

function coerceGi(v: string | null): DishData["glycaemicIndex"] | null {
  return v && VALID_GI.has(v as DishData["glycaemicIndex"])
    ? (v as DishData["glycaemicIndex"])
    : null;
}

const SYNTHETIC_ID_OFFSET = 100000;

export function syntheticIdFor(dbRowId: number): number {
  return SYNTHETIC_ID_OFFSET + dbRowId;
}

/** Build the merged DB-backed catalog: static DISHES with editable DB fields
 * (price, name, description, image, isAvailable, macros, etc.) overridden by
 * matching menu_items rows. CMS-only rows (no static counterpart) get
 * synthetic ids in the SYNTHETIC_ID_OFFSET+ range. */
export async function getMergedCatalog(): Promise<DishData[]> {
  const dbRows = await listMenuItems({});
  const dbBySlug = new Map(dbRows.map((r) => [r.slug, r]));
  const allSlugs = Array.from(
    new Set([...DISHES.map((d) => d.slug), ...dbRows.map((r) => r.slug)]),
  );
  const summaries = await getSummariesForSlugs(allSlugs);
  const enrich = (dish: DishData): DishData => {
    const s = summaries.get(dish.slug);
    if (!s) return dish;
    return {
      ...dish,
      averageRating: s.averageRating / 10,
      reviewCount: s.sampleSize,
    };
  };
  const merged: DishData[] = [];
  const usedSlugs = new Set<string>();

  for (const stat of DISHES) {
    const row = dbBySlug.get(stat.slug);
    usedSlugs.add(stat.slug);
    if (!row) {
      merged.push(stat);
      continue;
    }
    const gi = coerceGi(row.glycaemicIndex);
    merged.push({
      ...stat,
      name: row.name || stat.name,
      description: row.description || stat.description,
      longDescription: row.longDescription ?? stat.longDescription,
      image: row.imageUrl ?? stat.image,
      price: row.pricePaise,
      isAvailable: row.isAvailable,
      isVeg: row.isVeg,
      category: VALID_CATEGORIES.has(row.category as DishCategory)
        ? (row.category as DishCategory)
        : stat.category,
      kitchen: VALID_KITCHENS.has(row.kitchenLocation as DishKitchen)
        ? (row.kitchenLocation as DishKitchen)
        : stat.kitchen,
      allergens: row.allergens ?? stat.allergens,
      macros: row.macros
        ? {
            calories: row.macros.kcal,
            protein: row.macros.proteinG,
            carbs: row.macros.carbsG,
            fat: row.macros.fatG,
            fiber: row.macros.fiberG ?? stat.macros.fiber,
          }
        : stat.macros,
      rdVerified: row.rdVerified,
      ...(row.rdNote ? { rdNote: row.rdNote } : {}),
      prepTime: row.prepTime ?? "",
      glycaemicIndex: gi ?? "medium",
      sugarPerServing: row.sugarPerServing ?? "",
      ingredients: row.ingredients ?? [],
      customizations:
        (row.customizations as DishCustomGroup[] | null) ?? [],
      ...(row.pairingSlug ? { pairingSlug: row.pairingSlug } : {}),
      ...(coerceReviewState(row.allergenReviewState)
        ? { rdReviewState: coerceReviewState(row.allergenReviewState)! }
        : {}),
    });
  }

  for (const row of dbRows) {
    if (usedSlugs.has(row.slug)) continue;
    const cat = VALID_CATEGORIES.has(row.category as DishCategory)
      ? (row.category as DishCategory)
      : "mains";
    const kit = VALID_KITCHENS.has(row.kitchenLocation as DishKitchen)
      ? (row.kitchenLocation as DishKitchen)
      : "continental";
    const gi = coerceGi(row.glycaemicIndex);
    merged.push({
      id: syntheticIdFor(row.id),
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      longDescription: row.longDescription ?? "",
      image:
        row.imageUrl ??
        "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
      price: row.pricePaise,
      kitchen: kit,
      category: cat,
      isVeg: row.isVeg,
      rdVerified: row.rdVerified,
      ...(row.rdNote ? { rdNote: row.rdNote } : {}),
      prepTime: row.prepTime ?? "—",
      macros: row.macros
        ? {
            calories: row.macros.kcal,
            protein: row.macros.proteinG,
            carbs: row.macros.carbsG,
            fat: row.macros.fatG,
            fiber: row.macros.fiberG ?? 0,
          }
        : { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      ingredients: row.ingredients ?? [],
      allergens: row.allergens ?? [],
      glycaemicIndex: gi ?? "medium",
      sugarPerServing: row.sugarPerServing ?? "—",
      customizations:
        (row.customizations as DishCustomGroup[] | null) ?? [],
      ...(row.pairingSlug ? { pairingSlug: row.pairingSlug } : {}),
      isAvailable: row.isAvailable,
      ...(coerceReviewState(row.allergenReviewState)
        ? { rdReviewState: coerceReviewState(row.allergenReviewState)! }
        : { rdReviewState: "pending_review" as const }),
    });
  }
  return merged.map(enrich);
}

const REVIEW_STATES = new Set(["pending_review", "reviewed", "blocked"]);
function coerceReviewState(
  v: string | null | undefined,
): DishData["rdReviewState"] {
  return v && REVIEW_STATES.has(v)
    ? (v as DishData["rdReviewState"])
    : undefined;
}

/** Lookup a dish by its catalog id (static id 1..N or synthetic id 100000+).
 * Always reflects current DB state. */
export async function resolveDishById(
  id: number,
): Promise<DishData | undefined> {
  const merged = await getMergedCatalog();
  return merged.find((d) => d.id === id);
}

/** Lookup a dish by slug. Always reflects current DB state. */
export async function resolveDishBySlug(
  slug: string,
): Promise<DishData | undefined> {
  const merged = await getMergedCatalog();
  return merged.find((d) => d.slug === slug);
}

/** Build a single-shot resolver that fetches the merged catalog once and
 * answers many lookups against the in-memory snapshot. Use this in any
 * server flow that needs to resolve multiple dishes in a tight loop
 * (e.g. checkout finalize, bundle expansion) to avoid N round-trips. */
export async function makeBatchDishResolver(): Promise<{
  byId: (id: number) => DishData | undefined;
  bySlug: (slug: string) => DishData | undefined;
  all: DishData[];
}> {
  const merged = await getMergedCatalog();
  const byIdMap = new Map(merged.map((d) => [d.id, d]));
  const bySlugMap = new Map(merged.map((d) => [d.slug, d]));
  return {
    byId: (id) => byIdMap.get(id),
    bySlug: (slug) => bySlugMap.get(slug),
    all: merged,
  };
}
