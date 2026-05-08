import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`;

export type DishRationaleSource = "cache" | "generated" | "fallback";

export interface DishRationale {
  dishId: number;
  rationale: string;
  expanded: string;
  source: DishRationaleSource;
}

interface RationaleEnvelope {
  rationales: DishRationale[];
}

const MAX_PER_REQUEST = 12;

async function fetchRationales(dishIds: number[]): Promise<DishRationale[]> {
  if (dishIds.length === 0) return [];
  const res = await fetch(`${API_BASE}/dish-rationales`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ dishIds }),
  });
  // Treat unauthenticated as silent no-op — the card falls back to its
  // normal description when no rationale is loaded.
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`dish-rationales ${res.status}`);
  const json = (await res.json()) as RationaleEnvelope;
  return json.rationales;
}

/**
 * Fetch rationales lazily for a list of visible dishes. The caller passes
 * a `cacheKey` that fingerprints the user's brief (preferences id +
 * updatedAt is plenty) — when it changes, the local cache is dropped so
 * previously fetched dishes are re-requested against the new brief
 * version on the server.
 *
 * Strategy: debounce the visible-dish list, then request only the ids
 * we don't already have a rationale for, capped at MAX_PER_REQUEST.
 */
export function useDishRationales(
  visibleDishIds: number[],
  enabled: boolean,
  cacheKey: string,
): {
  byId: Map<number, DishRationale>;
  isLoading: boolean;
} {
  const [byId, setById] = useState<Map<number, DishRationale>>(new Map());

  // Drop everything when the user's brief fingerprint changes — those
  // rationales were generated against a stale brief hash.
  useEffect(() => {
    setById(new Map());
  }, [cacheKey]);

  const stableKey = useMemo(
    () => visibleDishIds.slice().sort((a, b) => a - b).join(","),
    [visibleDishIds],
  );

  const mutation = useMutation({
    mutationFn: fetchRationales,
    onSuccess: (rationales) => {
      setById((prev) => {
        const next = new Map(prev);
        for (const r of rationales) next.set(r.dishId, r);
        return next;
      });
    },
  });

  useEffect(() => {
    if (!enabled) return;
    const missing = visibleDishIds.filter((id) => !byId.has(id));
    if (missing.length === 0) return;
    const batch = missing.slice(0, MAX_PER_REQUEST);
    const t = setTimeout(() => {
      mutation.mutate(batch);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey, enabled, cacheKey]);

  return { byId, isLoading: mutation.isPending };
}
