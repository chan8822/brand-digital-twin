/**
 * TanStack Query hooks — one per major data surface. In MOCK mode (no
 * NEXT_PUBLIC_API_URL) they resolve from `mock.ts` so the UI renders standalone.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch, USE_MOCK } from "./api";
import { MOCK_RECOMMENDATIONS } from "./mock";
import type { RecommendationCard } from "./types";

export function useRecommendations() {
  return useQuery({
    queryKey: ["recommendations"],
    queryFn: async (): Promise<RecommendationCard[]> => {
      if (USE_MOCK) {
        // Simulate a little latency so loading states are exercised in dev.
        await new Promise((r) => setTimeout(r, 350));
        return MOCK_RECOMMENDATIONS;
      }
      const data = await apiFetch<{ recommendations: RecommendationCard[] }>(
        "/api/v1/recommendations",
      );
      return data.recommendations;
    },
    staleTime: 60_000,
  });
}
