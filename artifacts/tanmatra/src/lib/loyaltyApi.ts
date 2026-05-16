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
  | "anniversary"
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

import { API_BASE as API_BASE } from "./apiBase";

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
  finalizeOrder: (args: {
    /** Server-managed idempotency key. The caller mints ONE UUID per
     * submit attempt (one "Place order" click) and reuses the same
     * value across any retry of THAT in-flight request (transient
     * 5xx, fetch timeout). The server caches the first response per
     * (user, key) for 24h and replays it on retries, so the customer
     * is never double-charged. A subsequent click is a new intent
     * and must mint a new key. */
    idempotencyKey: string;
    orderId: string;
    items: Array<{ id: number; name: string; qty: number; price: number }>;
    address?: {
      label?: string | null;
      line?: string | null;
      city?: string | null;
      pincode?: string | null;
      phone?: string | null;
    };
    applyCreditsPaise?: number;
    scheduledFor?: string;
    bundleSlugs?: string[];
    deliverySlotId?: number | null;
    pickupLocationId?: number | null;
    fulfillmentType?: "delivery" | "pickup";
    ecoPackagingOptIn?: boolean;
    deliveryInstructions?: string | null;
    // Optional payment method — backend accepts "razorpay" (default,
    // existing behaviour) or "cod" (gated by backend feature flag +
    // pincode eligibility). Backwards-compatible: omitted = razorpay.
    paymentMethod?: "razorpay" | "cod";
  }) =>
    request<{
      orderId: string;
      serverOrderId: number;
      grossPaise: number;
      bundleDiscountPaise: number;
      pickupDiscountPaise: number;
      preorderDiscountPaise: number;
      redeemedPaise: number;
      finalPaise: number;
      balancePaise: number;
      duplicate: boolean;
      referral:
        | { awarded: true; redemptionId: number }
        | {
            awarded: false;
            reason:
              | "no_pending_referral"
              | "order_already_claimed"
              | "no_qualifying_activity"
              | "already_awarded";
          };
    }>("/orders/finalize", {
      method: "POST",
      headers: { "Idempotency-Key": args.idempotencyKey },
      body: JSON.stringify(args),
    }),
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
  getLoyaltyProgress: () =>
    request<{
      progress: Array<{
        subscriptionId: number;
        deliveredCount: number;
        freeEveryN: number;
        deliveriesUntilFree: number;
        premiumUnlockAt: number;
        deliveriesUntilPremium: number;
        premiumUnlocked: boolean;
      }>;
    }>("/loyalty/progress"),
};
