export type CreditLedgerReason =
  | "referral_referrer_award"
  | "referral_referee_signup"
  | "loyalty_free_week"
  | "premium_unlock_bonus"
  | "birthday_meal"
  | "winback_offer"
  | "manual_grant"
  | "checkout_redemption"
  | "expired";

export type NotificationKind =
  | "winback"
  | "birthday"
  | "loyalty_free_week"
  | "loyalty_premium_unlock"
  | "protein_streak"
  | "referral_redeemed";

export type NotificationStatus = "pending" | "sent" | "dismissed";

export interface CreditLedgerEntry {
  id: number;
  userId: string;
  deltaPaise: number;
  reason: CreditLedgerReason;
  refType: string | null;
  refId: string | null;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ReferralRedemption {
  id: number;
  codeId: number;
  referrerUserId: string;
  refereeUserId: string;
  refereeAwardPaise: number;
  referrerAwardPaise: number;
  createdAt: string;
}

export interface ReferralResponse {
  code: string;
  awards: { referrerPaise: number; refereePaise: number };
  redemptions: ReferralRedemption[];
}

export interface NotificationItem {
  id: number;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  channel: string;
  status: NotificationStatus;
  payload: Record<string, unknown> | null;
  dedupeKey: string | null;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface UserProfile {
  userId: string;
  birthDate: string | null;
  anniversaryDate: string | null;
  proteinGoalGrams: number | null;
  lastNutritionLogAt: string | null;
  proteinShortfallStreak: number;
  createdAt: string;
  updatedAt: string;
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

export const loyaltyApi = {
  getReferral: () => request<ReferralResponse>("/referral/me"),
  redeemReferral: (code: string) =>
    request<{ awardedPaise: number }>("/referral/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getCreditLedger: () =>
    request<{ entries: CreditLedgerEntry[]; balancePaise: number }>(
      "/credit-ledger",
    ),
  redeemCredit: (paise: number, refId?: string, note?: string) =>
    request<{ redeemedPaise: number; balancePaise: number }>(
      "/credit-ledger/redeem",
      {
        method: "POST",
        body: JSON.stringify({ paise, refId, note }),
      },
    ),
  getNotifications: () =>
    request<{ notifications: NotificationItem[] }>("/notifications"),
  dismissNotification: (id: number) =>
    request<{ notification: NotificationItem }>(
      `/notifications/${id}/dismiss`,
      { method: "POST" },
    ),
  runEngine: () =>
    request<{ triggered: number; notifications: NotificationItem[] }>(
      "/loyalty/run",
      { method: "POST" },
    ),
  getProfile: () => request<{ profile: UserProfile | null }>("/profile"),
  updateProfile: (data: {
    birthDate?: string;
    anniversaryDate?: string;
    proteinGoalGrams?: number;
    proteinShortfallStreak?: number;
  }) =>
    request<{ profile: UserProfile }>("/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
