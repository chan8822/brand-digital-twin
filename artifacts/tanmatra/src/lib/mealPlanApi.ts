const API_BASE = `${import.meta.env.BASE_URL}api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export type MealPlanSlot = "breakfast" | "lunch" | "dinner";
export type MealPlanStatus = "draft" | "accepted" | "scheduled" | "discarded";

export interface MealPlanSlotEntry {
  dishId: number;
  slug: string;
  name: string;
  image: string;
  pricePaise: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealPlanDay {
  date: string;
  breakfast: MealPlanSlotEntry;
  lunch: MealPlanSlotEntry;
  dinner: MealPlanSlotEntry;
}

export interface MealPlanConstraints {
  dailyCalorieTarget: number | null;
  dailyProteinTargetGrams: number | null;
  weeklyBudgetPaise: number | null;
  maxRepetitionsPerDish: number;
  allergens: string[];
  dietaryStyle: string | null;
  spiceLevel: string | null;
  goal: string | null;
}

export interface MealPlanTotals {
  totalPaise: number;
  avgCalories: number;
  avgProteinGrams: number;
  avgCarbsGrams: number;
  avgFatGrams: number;
}

export interface MealPlan {
  id: number;
  userId: string;
  weekStartDate: string;
  status: MealPlanStatus;
  constraints: MealPlanConstraints;
  days: MealPlanDay[];
  totals: MealPlanTotals | null;
  subscriptionId: number | null;
  model: string | null;
  notes: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanSettings {
  userId: string;
  autoReplanEnabled: boolean;
  weeklyBudgetPaise: number | null;
  maxRepetitionsPerDish: number;
  lastPlannedWeekStart: string | null;
}

export const mealPlanApi = {
  listPlans: () => request<{ plans: MealPlan[] }>("/meal-plans"),
  getPlan: (id: number) => request<{ plan: MealPlan }>(`/meal-plans/${id}`),
  generate: (input?: {
    weekStartDate?: string;
    overrides?: {
      weeklyBudgetPaise?: number | null;
      maxRepetitionsPerDish?: number;
      dailyCalorieTarget?: number | null;
      dailyProteinTargetGrams?: number | null;
    };
  }) =>
    request<{ plan: MealPlan; usedFallback: boolean }>("/meal-plans/generate", {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    }),
  regenerateDay: (id: number, dayIndex: number) =>
    request<{ plan: MealPlan }>(`/meal-plans/${id}/regenerate-day`, {
      method: "POST",
      body: JSON.stringify({ dayIndex }),
    }),
  swapSlot: (id: number, dayIndex: number, slot: MealPlanSlot, dishId: number) =>
    request<{ plan: MealPlan }>(`/meal-plans/${id}/slot`, {
      method: "PATCH",
      body: JSON.stringify({ dayIndex, slot, dishId }),
    }),
  swapSuggestions: (planId: number, dayIndex: number, slot: MealPlanSlot) =>
    request<{ suggestions: MealPlanSlotEntry[] }>(
      "/meal-plans/swap-suggestions",
      {
        method: "POST",
        body: JSON.stringify({ planId, dayIndex, slot }),
      },
    ),
  accept: (id: number) =>
    request<{
      plan: MealPlan;
      deliveryIds: number[];
      subscriptionId: number | null;
    }>(`/meal-plans/${id}/accept`, { method: "POST" }),
  discard: (id: number) =>
    request<{ plan: MealPlan }>(`/meal-plans/${id}/discard`, {
      method: "POST",
    }),
  getSettings: () =>
    request<{ settings: MealPlanSettings }>("/meal-plan-settings"),
  updateSettings: (patch: Partial<Omit<MealPlanSettings, "userId" | "lastPlannedWeekStart">>) =>
    request<{ settings: MealPlanSettings }>("/meal-plan-settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
};

export function formatPaise(p: number): string {
  return `₹${(p / 100).toFixed(0)}`;
}

export function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
