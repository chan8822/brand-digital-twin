/**
 * TanStack Query hooks — one per major data surface. In MOCK mode (no
 * NEXT_PUBLIC_API_URL) they resolve from `mock.ts` so the UI renders standalone.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, USE_MOCK } from "./api";
import {
  MOCK_APPROVALS,
  MOCK_INTEGRATIONS,
  MOCK_READINESS,
  MOCK_RECOMMENDATIONS,
  MOCK_SWEEP,
  MOCK_TRUST_TIER,
} from "./mock";
import type {
  ApprovalRequest,
  IntegrationState,
  ProfitReadiness,
  RecommendationCard,
  SemanticTrustTier,
  SweepFinding,
} from "./types";

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

export function useSweep() {
  return useQuery({
    queryKey: ["sweep"],
    queryFn: async (): Promise<SweepFinding[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 350));
        return MOCK_SWEEP;
      }
      // Needs `GET /api/v1/sweep` exposing the rich SweepFinding[] (see types.ts).
      const data = await apiFetch<{ sweep: SweepFinding[] }>("/api/v1/sweep");
      return data.sweep;
    },
    staleTime: 60_000,
  });
}

export function useApprovals() {
  return useQuery({
    queryKey: ["approvals"],
    queryFn: async (): Promise<ApprovalRequest[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 350));
        return MOCK_APPROVALS;
      }
      const data = await apiFetch<{ approvals: ApprovalRequest[] }>(
        "/api/v1/approvals",
      );
      return data.approvals;
    },
    staleTime: 30_000,
  });
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (approvalId: string): Promise<void> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return;
      }
      await apiFetch<unknown>(`/api/v1/approvals/${approvalId}/approve`, {
        method: "POST",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approvals"] }),
  });
}

export function useIntegrations() {
  return useQuery({
    queryKey: ["integrations"],
    queryFn: async (): Promise<IntegrationState[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_INTEGRATIONS;
      }
      // Needs `GET /api/v1/integrations` exposing getIntegrationStates (A2.4).
      const data = await apiFetch<{ integrations: IntegrationState[] }>(
        "/api/v1/integrations",
      );
      return data.integrations;
    },
    staleTime: 30_000,
  });
}

export function useProfitReadiness() {
  return useQuery({
    queryKey: ["profit-readiness"],
    queryFn: async (): Promise<ProfitReadiness> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_READINESS;
      }
      // Live endpoint (dd9045a): returns ProfitReadiness directly as `data`.
      return apiFetch<ProfitReadiness>("/api/v1/profit-readiness");
    },
    staleTime: 60_000,
  });
}

export function useAutonomy() {
  return useQuery({
    queryKey: ["autonomy"],
    queryFn: async (): Promise<SemanticTrustTier> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 250));
        return MOCK_TRUST_TIER;
      }
      // Needs `GET /api/v1/autonomy` exposing the current trust tier (see types.ts).
      const data = await apiFetch<{ tier: SemanticTrustTier }>("/api/v1/autonomy");
      return data.tier;
    },
    staleTime: 60_000,
  });
}
