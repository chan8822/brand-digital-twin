import type {
  MealPlanConstraints,
  MealPlanDay,
  MealPlanTotals,
} from "./mealPlanApi";

export type { MealPlanConstraints, MealPlanDay, MealPlanTotals };

export interface RdCopilotClient {
  userId: string;
  appointmentCount: number;
  nextAppointmentAt: string | null;
  lastAppointmentAt: string | null;
  proposalsOpen: number;
  proposalsApproved: number;
  driftEvents: number;
}

export interface RdClientSummary {
  id: number;
  userId: string;
  rdSlug: string;
  summary: string;
  sources: Record<string, unknown> | null;
  model: string | null;
  draftedAt: string;
}

export type RdPlanProposalStatus =
  | "ai_drafted"
  | "rd_editing"
  | "rd_approved"
  | "rejected";

export interface RdPlanProposal {
  id: number;
  userId: string;
  rdSlug: string;
  weekStartDate: string;
  status: RdPlanProposalStatus;
  constraints: MealPlanConstraints;
  days: MealPlanDay[];
  totals: MealPlanTotals | null;
  aiRationale: string | null;
  rdNotes: string | null;
  mealPlanId: number | null;
  model: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdherenceEventKind =
  | "skipped_delivery"
  | "over_calories"
  | "missed_protein"
  | "outside_plan";

export interface AdherenceEvent {
  id: number;
  userId: string;
  mealPlanId: number;
  dayDate: string;
  kind: AdherenceEventKind;
  severity: number;
  detail: Record<string, unknown> | null;
  nudgeSentAt: string | null;
  createdAt: string;
}

export interface AdherenceResponse {
  mealPlanId: number | null;
  weekStartDate: string | null;
  scan: {
    countsByKind: Record<AdherenceEventKind, number>;
    totalDays: number;
    daysScanned: number;
  } | null;
  events: AdherenceEvent[];
  escalateRecommended: boolean;
}

export interface RdAuditEntry {
  id: number;
  userId: string;
  rdSlug: string;
  proposalId: number | null;
  kind: string;
  actor: "ai" | "rd";
  payload: Record<string, unknown> | null;
  createdAt: string;
}

const API_BASE = `${import.meta.env.BASE_URL}api`;

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

export const rdCopilotApi = {
  listClients(rdSlug: string) {
    return request<{ clients: RdCopilotClient[] }>(
      `/rd/copilot/clients?rdSlug=${encodeURIComponent(rdSlug)}`,
    );
  },
  getSummary(rdSlug: string, userId: string) {
    return request<{ summary: RdClientSummary | null }>(
      `/rd/copilot/clients/${encodeURIComponent(userId)}/summary?rdSlug=${encodeURIComponent(rdSlug)}`,
    );
  },
  refreshSummary(rdSlug: string, userId: string) {
    return request<{ summary: RdClientSummary }>(
      `/rd/copilot/clients/${encodeURIComponent(userId)}/summary?rdSlug=${encodeURIComponent(rdSlug)}`,
      { method: "POST" },
    );
  },
  draftProposal(
    rdSlug: string,
    userId: string,
    body: { weekStartDate: string; overrides?: Partial<MealPlanConstraints> },
  ) {
    return request<{ proposal: RdPlanProposal }>(
      `/rd/copilot/clients/${encodeURIComponent(userId)}/proposals?rdSlug=${encodeURIComponent(rdSlug)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  latestProposal(rdSlug: string, userId: string) {
    return request<{ proposal: RdPlanProposal | null }>(
      `/rd/copilot/clients/${encodeURIComponent(userId)}/proposals/latest?rdSlug=${encodeURIComponent(rdSlug)}`,
    );
  },
  getProposal(rdSlug: string, id: number) {
    return request<{ proposal: RdPlanProposal }>(
      `/rd/copilot/proposals/${id}?rdSlug=${encodeURIComponent(rdSlug)}`,
    );
  },
  editProposal(
    rdSlug: string,
    id: number,
    body: { days?: MealPlanDay[]; rdNotes?: string | null },
  ) {
    return request<{ proposal: RdPlanProposal }>(
      `/rd/copilot/proposals/${id}?rdSlug=${encodeURIComponent(rdSlug)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  },
  approveProposal(rdSlug: string, id: number) {
    return request<{ proposal: RdPlanProposal; mealPlan: { id: number } }>(
      `/rd/copilot/proposals/${id}/approve?rdSlug=${encodeURIComponent(rdSlug)}`,
      { method: "POST" },
    );
  },
  rejectProposal(rdSlug: string, id: number, reason: string) {
    return request<{ proposal: RdPlanProposal }>(
      `/rd/copilot/proposals/${id}/reject?rdSlug=${encodeURIComponent(rdSlug)}`,
      { method: "POST", body: JSON.stringify({ reason }) },
    );
  },
  getAdherence(rdSlug: string, userId: string) {
    return request<AdherenceResponse>(
      `/rd/copilot/clients/${encodeURIComponent(userId)}/adherence?rdSlug=${encodeURIComponent(rdSlug)}`,
    );
  },
  sendNudge(
    rdSlug: string,
    userId: string,
    body: { eventId?: number; body?: string },
  ) {
    return request<{ message: { id: number; body: string } }>(
      `/rd/copilot/clients/${encodeURIComponent(userId)}/nudge?rdSlug=${encodeURIComponent(rdSlug)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  getAudit(rdSlug: string, userId: string) {
    return request<{ entries: RdAuditEntry[] }>(
      `/rd/copilot/clients/${encodeURIComponent(userId)}/audit?rdSlug=${encodeURIComponent(rdSlug)}`,
    );
  },
};
