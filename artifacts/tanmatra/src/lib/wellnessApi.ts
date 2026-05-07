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

export type NutritionSource = "auto_order" | "manual" | "water" | "wearable_adjust";

export interface NutritionLog {
  id: number;
  userId: string;
  loggedFor: string;
  source: NutritionSource;
  label: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  waterMl: number;
  vegServings: number;
  orderId: number | null;
  createdAt: string;
}

export interface DailyTargets {
  userId: string;
  calorieTarget: number;
  proteinTargetGrams: number;
  fiberTargetGrams: number;
  waterTargetMl: number;
  vegTargetServings: number;
  effectiveCalorieTarget?: number;
  activityKcal?: number;
}

export interface DayTotals {
  date: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  waterMl: number;
  vegServings: number;
}

export interface WearableLink {
  id: number;
  provider: "apple_health" | "google_fit";
  connected: boolean;
  lastSyncedAt: string | null;
  lastActivityKcal: number | null;
  lastSteps: number | null;
}

export interface Streak {
  id: number;
  kind: "protein" | "veg";
  currentDays: number;
  bestDays: number;
  lastDayHit: string | null;
}

export interface WellnessTodayResponse {
  date: string;
  targets: DailyTargets;
  totals: DayTotals;
  logs: NutritionLog[];
  wearables: WearableLink[];
  streaks: { protein: Streak | null; veg: Streak | null };
}

export interface WellnessWeekResponse {
  from: string;
  to: string;
  days: DayTotals[];
  targets: DailyTargets;
}

export interface ManualLogPayload {
  label: string;
  calories?: number;
  proteinGrams?: number;
  carbsGrams?: number;
  fatGrams?: number;
  fiberGrams?: number;
  vegServings?: number;
  loggedFor?: string;
}

export const wellnessApi = {
  today: () => request<WellnessTodayResponse>("/wellness/today"),
  week: () => request<WellnessWeekResponse>("/wellness/week"),
  log: (payload: ManualLogPayload) =>
    request<{ log: NutritionLog }>("/wellness/log", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteLog: (id: number) =>
    request<{ ok: true }>(`/wellness/log/${id}`, { method: "DELETE" }),
  water: (ml: number) =>
    request<{ log: NutritionLog }>("/wellness/water", {
      method: "POST",
      body: JSON.stringify({ ml }),
    }),
  updateTargets: (patch: Partial<DailyTargets>) =>
    request<{ targets: DailyTargets }>("/wellness/targets", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  connectWearable: (provider: WearableLink["provider"]) =>
    request<{ link: WearableLink }>("/wellness/wearable/connect", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),
  disconnectWearable: (provider: WearableLink["provider"]) =>
    request<{ ok: true }>("/wellness/wearable/disconnect", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),
  syncWearable: (
    provider: WearableLink["provider"],
    activityKcal: number,
    steps?: number,
  ) =>
    request<{ link: WearableLink }>("/wellness/wearable/sync", {
      method: "POST",
      body: JSON.stringify({ provider, activityKcal, steps }),
    }),
};
