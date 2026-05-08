import {
  DISHES,
  type DishData,
  type DishCategory,
  type DishKitchen,
} from "@workspace/menu-catalog";
import { listMenuItems } from "./menu";

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
  const merged: DishData[] = [];
  const usedSlugs = new Set<string>();

  for (const stat of DISHES) {
    const row = dbBySlug.get(stat.slug);
    usedSlugs.add(stat.slug);
    if (!row) {
      merged.push(stat);
      continue;
    }
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
            fiber: stat.macros.fiber,
          }
        : stat.macros,
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
      rdVerified: false,
      prepTime: "—",
      macros: row.macros
        ? {
            calories: row.macros.kcal,
            protein: row.macros.proteinG,
            carbs: row.macros.carbsG,
            fat: row.macros.fatG,
            fiber: 0,
          }
        : { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      ingredients: [],
      allergens: row.allergens ?? [],
      glycaemicIndex: "medium",
      sugarPerServing: "—",
      customizations: [],
      isAvailable: row.isAvailable,
    });
  }
  return merged;
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
