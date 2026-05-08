import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DISHES as STATIC_DISHES,
  type DishData,
} from "@workspace/menu-catalog";

export {
  CATEGORY_LABELS,
  KITCHEN_LABELS,
  type DishCategory,
  type DishKitchen,
  type DishData,
  type DishCustomGroup,
  type DishCustomOption,
  type DishMacros,
} from "@workspace/menu-catalog";

const API_BASE = `${import.meta.env.BASE_URL}api`;

// Module-level mutable cache. Initially seeded with the static catalog so
// synchronous helpers work at import time (build-time fallback). Replaced at
// runtime when /menu/public responds.
let runtimeDishes: DishData[] = STATIC_DISHES;
let runtimeBySlug: Map<string, DishData> = new Map(
  STATIC_DISHES.map((d) => [d.slug, d]),
);
let runtimeById: Map<number, DishData> = new Map(
  STATIC_DISHES.map((d) => [d.id, d]),
);

function setRuntime(dishes: DishData[]) {
  runtimeDishes = dishes;
  runtimeBySlug = new Map(dishes.map((d) => [d.slug, d]));
  runtimeById = new Map(dishes.map((d) => [d.id, d]));
}

/** The static fallback array shipped with the build. Use only when you
 * explicitly need a non-reactive snapshot. Prefer `useMenuCatalog()`. */
export const DISHES: DishData[] = STATIC_DISHES;

/** Lookup that consults the runtime cache (live DB-backed catalog) first,
 * falling back to the static catalog. Safe to call from non-React code. */
export function getDishBySlug(slug: string): DishData | undefined {
  return runtimeBySlug.get(slug);
}

/** Lookup that consults the runtime cache first, falling back to the static
 * catalog. Safe to call from non-React code. */
export function getDishById(id: number): DishData | undefined {
  return runtimeById.get(id);
}

export function getDishAllergens(slug: string): string[] | null {
  const d = getDishBySlug(slug);
  return d ? d.allergens : null;
}

async function fetchPublicCatalog(): Promise<DishData[]> {
  const res = await fetch(`${API_BASE}/menu/public`, { credentials: "include" });
  if (!res.ok) throw new Error(`menu/public ${res.status}`);
  const json = (await res.json()) as { dishes: DishData[] };
  return json.dishes;
}

/** React-Query hook that fetches the merged DB+static catalog. While loading
 * (or on error) returns the static fallback so the UI never blanks out.
 * Side-effect: keeps the module-level runtime cache in sync so the synchronous
 * `getDishById` / `getDishBySlug` helpers reflect editor changes. */
export function useMenuCatalog(): {
  dishes: DishData[];
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery<DishData[]>({
    queryKey: ["menu", "public"],
    queryFn: fetchPublicCatalog,
    staleTime: 1000 * 60 * 5,
    initialData: STATIC_DISHES,
  });

  useEffect(() => {
    if (q.data && q.data !== runtimeDishes) {
      setRuntime(q.data);
    }
  }, [q.data]);

  return {
    dishes: q.data ?? STATIC_DISHES,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
