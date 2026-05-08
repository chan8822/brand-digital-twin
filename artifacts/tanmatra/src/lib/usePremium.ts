import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { premiumApi } from "@/lib/marketplaceApi";

export function usePremiumStatus() {
  const q = useQuery({
    queryKey: ["premium", "me"],
    queryFn: premiumApi.me,
    staleTime: 30_000,
  });
  return {
    isPremium: q.data?.isPremium ?? false,
    membership: q.data?.membership ?? null,
    isLoading: q.isLoading,
  };
}

export function usePremiumSlugs() {
  const q = useQuery({
    queryKey: ["premium", "meals"],
    queryFn: premiumApi.meals,
    staleTime: 5 * 60_000,
  });
  return useMemo(
    () => new Set<string>(q.data?.slugs ?? []),
    [q.data?.slugs],
  );
}
