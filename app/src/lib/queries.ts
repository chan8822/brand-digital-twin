/**
 * TanStack Query hooks — one per major data surface. In MOCK mode (no
 * NEXT_PUBLIC_API_URL) they resolve from `mock.ts` so the UI renders standalone.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getMockBrandIndex, USE_MOCK } from "./api";
import {
  MOCK_APPROVALS,
  MOCK_BILLING_QUEUE,
  MOCK_BRAND_INTEGRATIONS,
  MOCK_BRAND_READINESS,
  MOCK_BRAND_RECOMMENDATIONS,
  MOCK_BRAND_SWEEP,
  MOCK_COGS_COVERAGE,
  MOCK_COGS_GAPS,
  MOCK_READINESS,
  MOCK_RECEIPTS,
  MOCK_SUBSCRIPTION,
  MOCK_TENANT_LIMITS,
  MOCK_TRUST_TIER,
} from "./mock";
import type {
  ApprovalRequest,
  BillingQueueEntry,
  CogsCoverage,
  CogsGap,
  DismissReason,
  IntegrationState,
  ProfitReadiness,
  Receipt,
  RecommendationCard,
  SemanticTrustTier,
  Subscription,
  SweepFinding,
  TenantLimits,
} from "./types";

export function useRecommendations() {
  return useQuery({
    queryKey: USE_MOCK ? ["recommendations", getMockBrandIndex()] : ["recommendations"],
    queryFn: async (): Promise<RecommendationCard[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 350));
        return MOCK_BRAND_RECOMMENDATIONS[getMockBrandIndex()] ?? MOCK_BRAND_RECOMMENDATIONS[0];
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
    queryKey: USE_MOCK ? ["sweep", getMockBrandIndex()] : ["sweep"],
    queryFn: async (): Promise<SweepFinding[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 350));
        return MOCK_BRAND_SWEEP[getMockBrandIndex()] ?? MOCK_BRAND_SWEEP[0];
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
    queryKey: USE_MOCK ? ["integrations", getMockBrandIndex()] : ["integrations"],
    queryFn: async (): Promise<IntegrationState[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_BRAND_INTEGRATIONS[getMockBrandIndex()] ?? MOCK_BRAND_INTEGRATIONS[0];
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
    queryKey: USE_MOCK ? ["profit-readiness", getMockBrandIndex()] : ["profit-readiness"],
    queryFn: async (): Promise<ProfitReadiness> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_BRAND_READINESS[getMockBrandIndex()] ?? MOCK_READINESS;
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

/* ── Phase C1: COGS ───────────────────────────────────────────────────────── */

export function useCogsCoverage() {
  return useQuery({
    queryKey: ["cogs-coverage"],
    queryFn: async (): Promise<CogsCoverage> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_COGS_COVERAGE;
      }
      // Needs `GET /api/v1/cogs/coverage` (C-ENDPOINT_GAPS_SPEC.md C1.a).
      return apiFetch<CogsCoverage>("/api/v1/cogs/coverage");
    },
    staleTime: 60_000,
  });
}

export function useCogsGaps() {
  return useQuery({
    queryKey: ["cogs-gaps"],
    queryFn: async (): Promise<CogsGap[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 350));
        return MOCK_COGS_GAPS;
      }
      // Needs `GET /api/v1/cogs/gaps` — top missing-cost SKUs by spend (C1.b).
      const data = await apiFetch<{ gaps: CogsGap[] }>("/api/v1/cogs/gaps");
      return data.gaps;
    },
    staleTime: 60_000,
  });
}

export function useSaveCogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      entries: { sku: string; unitCost: number }[],
    ): Promise<void> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 400));
        return;
      }
      // Needs `POST /api/v1/cogs` { entries } — persists manual costs (provenance='manual', C1.c).
      await apiFetch<unknown>("/api/v1/cogs", {
        method: "POST",
        body: JSON.stringify({ entries }),
      });
    },
    onSuccess: () => {
      // New cost data shifts coverage and the readiness gate.
      qc.invalidateQueries({ queryKey: ["cogs-coverage"] });
      qc.invalidateQueries({ queryKey: ["cogs-gaps"] });
      qc.invalidateQueries({ queryKey: ["profit-readiness"] });
    },
  });
}

/* ── Phase C2: billing ────────────────────────────────────────────────────── */

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: async (): Promise<Subscription> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_SUBSCRIPTION;
      }
      // Needs `GET /api/v1/billing/subscription` (C2.a).
      return apiFetch<Subscription>("/api/v1/billing/subscription");
    },
    staleTime: 60_000,
  });
}

export function useSuggestAmount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      amount: number;
      note?: string;
    }): Promise<void> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 450));
        return;
      }
      // Needs `POST /api/v1/billing/suggest` { amount, note } → pending_review;
      // account stays live during review (C2.b).
      await apiFetch<unknown>("/api/v1/billing/suggest", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription"] }),
  });
}

/* ── Admin: billing ops queue ────────────────────────────────────────────── */

export function useAdminBillingQueue() {
  return useQuery({
    queryKey: ["admin-billing-queue"],
    queryFn: async (): Promise<BillingQueueEntry[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_BILLING_QUEUE;
      }
      const data = await apiFetch<{ queue: BillingQueueEntry[] }>(
        "/api/v1/admin/billing/queue",
      );
      return data.queue;
    },
    staleTime: 30_000,
  });
}

export function useApproveBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orgId: string): Promise<void> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 600));
        return;
      }
      await apiFetch<unknown>(`/api/v1/admin/billing/approve/${orgId}`, {
        method: "POST",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-billing-queue"] }),
  });
}

/* ── Billing receipts ─────────────────────────────────────────────────────── */

export function useReceipts() {
  return useQuery({
    queryKey: ["receipts"],
    queryFn: async (): Promise<Receipt[]> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 300));
        return MOCK_RECEIPTS;
      }
      const data = await apiFetch<{ receipts: Receipt[] }>(
        "/api/v1/billing/receipts",
      );
      return data.receipts;
    },
    staleTime: 60_000,
  });
}

/* ── Tenant limits (B4 spend caps) ───────────────────────────────────────── */

export function useTenantLimits() {
  return useQuery({
    queryKey: ["tenant-limits"],
    queryFn: async (): Promise<TenantLimits> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 250));
        return MOCK_TENANT_LIMITS;
      }
      return apiFetch<TenantLimits>("/api/v1/tenant-limits");
    },
    staleTime: 60_000,
  });
}

export function useSetTenantLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (limits: TenantLimits): Promise<void> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 350));
        return;
      }
      await apiFetch<unknown>("/api/v1/tenant-limits", {
        method: "POST",
        body: JSON.stringify(limits),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenant-limits"] }),
  });
}

/* ── Support ticket ───────────────────────────────────────────────────────── */

export function useSupportTicket() {
  return useMutation({
    mutationFn: async (input: {
      subject: string;
      body: string;
    }): Promise<void> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 500));
        return;
      }
      await apiFetch<unknown>("/api/v1/support/ticket", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  });
}

/* ── P2.1: dismiss telemetry ──────────────────────────────────────────────── */

export function useDismissRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      campaignId: string;
      reason: DismissReason;
      note?: string;
    }): Promise<void> => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 250));
        return;
      }
      // Needs `POST /api/v1/recommendations/:id/dismiss` { reason, note }
      // → one `recommendation_events` row (P2.1).
      await apiFetch<unknown>(
        `/api/v1/recommendations/${input.campaignId}/dismiss`,
        {
          method: "POST",
          body: JSON.stringify({ reason: input.reason, note: input.note }),
        },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });
}
