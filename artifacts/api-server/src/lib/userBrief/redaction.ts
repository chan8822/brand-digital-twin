/**
 * Redaction layer for UserBrief.
 *
 * Allowlist approach: only fields explicitly listed here may be sent
 * to a model. Anything else (full address line, pincode, phone, email,
 * last name, raw birth date, payment info, rider notes…) must never
 * leak through prompt rendering or JSON dumps used in prompts.
 *
 * The redacted brief is what the prompt helpers (./prompt.ts) render.
 * The full brief is kept in-process for code paths that need it
 * (e.g. tool handlers that already enforce object-level access control).
 */

import type {
  UserBrief,
  BriefContext,
  BriefIdentity,
  BriefLoyalty,
  BriefPreferences,
  BriefPremium,
  BriefProfile,
  BriefRecentOrder,
  BriefSubscription,
  BriefWellness,
} from "./types";

/** Authoritative allowlist of safe-for-prompt fields per section. */
export const PROMPT_ALLOWLIST = {
  identity: ["userId", "firstName"] as const,
  preferences: [
    "dietaryStyle",
    "allergens",
    "dislikedIngredients",
    "cuisines",
    "spiceLevel",
    "goal",
    "activityLevel",
    "calorieTarget",
    "proteinTargetGrams",
    "carbsTargetGrams",
    "fatTargetGrams",
    "quizCompleted",
  ] as const,
  profile: [
    "hasBirthDate",
    "hasAnniversary",
    "proteinGoalGrams",
    "proteinShortfallStreak",
  ] as const,
  subscription: [
    "id",
    "status",
    "cadence",
    "mealsPerDelivery",
    "deliveryWindow",
    "nextDeliveryAt",
    "pricePerDeliveryRupees",
    "city",
    "memberCount",
  ] as const,
  loyalty: ["creditBalanceRupees", "pendingNotifications"] as const,
  premium: ["isPremium", "currentPeriodEndIso", "rdConsultsRemaining"] as const,
  recentOrder: [
    "id",
    "status",
    "totalRupees",
    "itemCount",
    "topItems",
    "placedAtIso",
    "fulfillmentType",
  ] as const,
  wellness: [
    "calorieTarget",
    "proteinTargetGrams",
    "todayCalories",
    "todayProteinGrams",
    "todayWaterMl",
    "proteinStreakDays",
    "vegStreakDays",
  ] as const,
  context: ["timezone", "localDate", "localHour", "timeOfDay", "city"] as const,
} as const;

/**
 * Fields that must NEVER be present in a redacted brief, even if they
 * appear in upstream rows. Used by tests as a hard stop. Kept narrow on
 * purpose — anything not on the allowlist is dropped, this list documents
 * the fields we explicitly care about catching.
 */
export const FORBIDDEN_FIELDS = [
  "addressLine",
  "address_line",
  "pincode",
  "phone",
  "email",
  "lastName",
  "last_name",
  "birthDate",
  "birth_date",
  "anniversaryDate",
  "anniversary_date",
  "profileImageUrl",
  "profile_image_url",
  "refresh_token",
  "access_token",
  "deliveryInstructions",
  "delivery_instructions",
] as const;

function pick<T, K extends keyof T>(
  obj: T | null | undefined,
  keys: readonly K[],
): Pick<T, K> | null {
  if (obj == null) return null;
  const src = obj as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in src) out[k as string] = src[k as string];
  }
  return out as Pick<T, K>;
}

export interface RedactedBrief {
  identity: Pick<BriefIdentity, (typeof PROMPT_ALLOWLIST.identity)[number]>;
  preferences: Pick<
    BriefPreferences,
    (typeof PROMPT_ALLOWLIST.preferences)[number]
  > | null;
  profile: Pick<BriefProfile, (typeof PROMPT_ALLOWLIST.profile)[number]> | null;
  subscription: Pick<
    BriefSubscription,
    (typeof PROMPT_ALLOWLIST.subscription)[number]
  > | null;
  loyalty: Pick<BriefLoyalty, (typeof PROMPT_ALLOWLIST.loyalty)[number]> | null;
  premium: Pick<BriefPremium, (typeof PROMPT_ALLOWLIST.premium)[number]> | null;
  recentOrders:
    | Pick<BriefRecentOrder, (typeof PROMPT_ALLOWLIST.recentOrder)[number]>[]
    | null;
  wellness: Pick<
    BriefWellness,
    (typeof PROMPT_ALLOWLIST.wellness)[number]
  > | null;
  context: Pick<BriefContext, (typeof PROMPT_ALLOWLIST.context)[number]>;
}

export function redactBrief(brief: UserBrief): RedactedBrief {
  return {
    identity: pick(brief.identity, PROMPT_ALLOWLIST.identity)!,
    preferences: pick(brief.preferences, PROMPT_ALLOWLIST.preferences),
    profile: pick(brief.profile, PROMPT_ALLOWLIST.profile),
    subscription: pick(brief.subscription, PROMPT_ALLOWLIST.subscription),
    loyalty: pick(brief.loyalty, PROMPT_ALLOWLIST.loyalty),
    premium: pick(brief.premium, PROMPT_ALLOWLIST.premium),
    recentOrders: brief.recentOrders
      ? brief.recentOrders.map(
          (o) => pick(o, PROMPT_ALLOWLIST.recentOrder)!,
        )
      : null,
    wellness: pick(brief.wellness, PROMPT_ALLOWLIST.wellness),
    context: pick(brief.context, PROMPT_ALLOWLIST.context)!,
  };
}

/**
 * Walk an arbitrary value tree and return the set of forbidden field
 * names found. Used by tests to fail loudly if a future schema change
 * sneaks PII into the redacted shape.
 */
export function findForbiddenFields(value: unknown): string[] {
  const hits = new Set<string>();
  const stack: unknown[] = [value];
  while (stack.length) {
    const v = stack.pop();
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
      continue;
    }
    if (typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if ((FORBIDDEN_FIELDS as readonly string[]).includes(k)) hits.add(k);
        stack.push(val);
      }
    }
  }
  return [...hits];
}
