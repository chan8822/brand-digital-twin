/**
 * Client for the B2B office lunch planner & account health agent.
 * Mirrors `routes/b2bPlanner.ts` on the server.
 */
import { API_BASE as API_BASE } from "./apiBase";
const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

function adminHeaders(): Record<string, string> {
  const token =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { "x-admin-token": token } : {};
}

export async function downloadQbrExport(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/sales/qbr/${id}/export`, {
    credentials: "include",
    headers: { ...adminHeaders() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qbr-${id}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function req<T>(
  path: string,
  init: RequestInit = {},
  withAdmin = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
    ...(withAdmin ? adminHeaders() : {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface TeamDietConstraints {
  headcount: number;
  vegPct: number;
  vegCount: number;
  veganCount: number;
  glutenFreeCount: number;
  jainCount: number;
  halalCount: number;
  allergens: string[];
  cuisinePrefs: string[];
  calorieFloor: number | null;
  calorieCeiling: number | null;
  notes: string;
}

export interface TeamDietProfile {
  id: number;
  companyId: number;
  constraints: TeamDietConstraints;
  lastSurveyAt: string;
}

export interface LunchPlanDay {
  date: string;
  picks: Array<{
    menuItemId: number;
    slug: string;
    name: string;
    why: string;
  }>;
  warnings: string[];
}

export interface LunchPlan {
  weekStartDate: string;
  days: LunchPlanDay[];
  summary: string;
  modelId: string;
  generatedBy: "ai" | "deterministic";
}

export interface LunchPlanProposal {
  id: number;
  companyId: number;
  weekStartDate: string;
  plan: LunchPlan;
  status: "draft" | "approved" | "scheduled";
  scheduledOfficeOrderIds: number[];
  createdAt: string;
}

export interface AccountHealthDrivers {
  ordersLast30: number;
  ordersPrev30: number;
  ordersTrendPct: number;
  activeMembers: number;
  totalMembers: number;
  memberActivationPct: number;
  budgetUtilization: number;
  daysSinceLastOrder: number | null;
  hasDietProfile: boolean;
}

export interface AccountHealthSnapshot {
  id: number;
  companyId: number;
  snapshotDate: string;
  score: number;
  riskLevel: "healthy" | "watch" | "at_risk" | "critical";
  drivers: AccountHealthDrivers;
  commentary: string;
  modelId: string;
  createdAt: string;
}

export interface QbrSection {
  title: string;
  body: string;
}

export interface QbrChart {
  title: string;
  unit: string;
  series: Array<{ label: string; value: number }>;
}

export interface QbrPayload {
  sections: QbrSection[];
  charts: QbrChart[];
  modelId: string;
}

export interface QbrDraft {
  id: number;
  companyId: number;
  periodStart: string;
  periodEnd: string;
  payload: QbrPayload;
  status: "draft" | "approved" | "exported";
  editedBy: string | null;
  createdAt: string;
}

export interface SalesAccountRow {
  company: {
    id: number;
    slug: string;
    name: string;
    perEmployeeMonthlyBudgetPaise: number;
  };
  health: AccountHealthSnapshot | null;
}

export const b2bPlannerApi = {
  getDietProfile: (slug: string) =>
    req<{ profile: TeamDietProfile | null }>(
      `/companies/${slug}/diet-profile`,
    ),
  saveDietProfile: (slug: string, body: Partial<TeamDietConstraints>) =>
    req<{ profile: TeamDietProfile }>(`/companies/${slug}/diet-profile`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  generatePlan: (slug: string, weekStartDate?: string) =>
    req<{ proposal: LunchPlanProposal }>(
      `/companies/${slug}/lunch-plan/generate`,
      {
        method: "POST",
        body: JSON.stringify(weekStartDate ? { weekStartDate } : {}),
      },
    ),
  getCurrentPlan: (slug: string) =>
    req<{ proposal: LunchPlanProposal | null }>(
      `/companies/${slug}/lunch-plan/current`,
    ),
  schedulePlan: (
    proposalId: number,
    body: {
      scheduledHour?: number;
      perEmployeeBudgetPaise?: number;
      address?: {
        line: string;
        city: string;
        pincode: string;
        label?: string;
        phone?: string;
      };
    },
  ) =>
    req<{
      proposal: LunchPlanProposal;
      scheduledOfficeOrderIds: number[];
    }>(`/lunch-plans/${proposalId}/schedule`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getHealth: (slug: string) =>
    req<{ snapshot: AccountHealthSnapshot }>(`/companies/${slug}/health`),
  recomputeHealth: (slug: string) =>
    req<{ snapshot: AccountHealthSnapshot }>(
      `/companies/${slug}/health/recompute`,
      { method: "POST" },
    ),

  // ---- sales console (admin) ----
  listSalesAccounts: () =>
    req<{ accounts: SalesAccountRow[] }>(`/sales/accounts`, {}, true),
  getSalesAccount: (slug: string) =>
    req<{
      company: SalesAccountRow["company"];
      health: AccountHealthSnapshot | null;
      qbr: QbrDraft | null;
      hasDietProfile: boolean;
    }>(`/sales/accounts/${slug}`, {}, true),
  recomputeSalesHealth: (slug: string) =>
    req<{ snapshot: AccountHealthSnapshot }>(
      `/sales/accounts/${slug}/health/recompute`,
      { method: "POST" },
      true,
    ),
  generateQbr: (slug: string) =>
    req<{ qbr: QbrDraft }>(
      `/sales/accounts/${slug}/qbr/generate`,
      { method: "POST" },
      true,
    ),
  saveQbr: (id: number, sections: QbrSection[]) =>
    req<{ qbr: QbrDraft }>(
      `/sales/qbr/${id}`,
      { method: "PUT", body: JSON.stringify({ sections }) },
      true,
    ),
  exportQbrUrl: (id: number) => `${API_BASE}/sales/qbr/${id}/export`,
};
