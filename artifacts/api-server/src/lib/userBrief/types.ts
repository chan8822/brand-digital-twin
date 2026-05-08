/**
 * UserBrief — single shape consumed by every Tanmatra AI agent.
 *
 * The brief is built by `getUserBrief` (see ./loader.ts) by joining
 * existing data sources (preferences, profile, orders, subscriptions,
 * loyalty, wellness, premium). Agents should never refetch this data
 * directly — they take a brief and feed it through the prompt helpers
 * in ./prompt.ts.
 *
 * Fields here intentionally hold richer values than what reaches the
 * model. Redaction (./redaction.ts) strips PII (full address, phone,
 * email, DOB, etc.) before any prompt rendering.
 */

export type BriefSection =
  | "identity"
  | "preferences"
  | "profile"
  | "subscription"
  | "loyalty"
  | "premium"
  | "recentOrders"
  | "wellness"
  | "context";

export interface BriefIdentity {
  userId: string;
  /** First name only — last name and email are stripped during redaction. */
  firstName: string | null;
}

export interface BriefPreferences {
  dietaryStyle:
    | "omnivore"
    | "vegetarian"
    | "vegan"
    | "pescatarian"
    | "keto"
    | null;
  allergens: string[];
  dislikedIngredients: string[];
  cuisines: string[];
  spiceLevel: "none" | "mild" | "medium" | "hot" | null;
  goal:
    | "lose_weight"
    | "maintain"
    | "gain_muscle"
    | "general_wellness"
    | null;
  activityLevel:
    | "sedentary"
    | "light"
    | "moderate"
    | "active"
    | "very_active"
    | null;
  calorieTarget: number | null;
  proteinTargetGrams: number | null;
  carbsTargetGrams: number | null;
  fatTargetGrams: number | null;
  quizCompleted: boolean;
}

export interface BriefProfile {
  hasBirthDate: boolean;
  hasAnniversary: boolean;
  proteinGoalGrams: number | null;
  proteinShortfallStreak: number;
}

export interface BriefSubscription {
  id: number;
  status: "active" | "paused" | "cancelled";
  cadence: "weekly" | "fortnightly" | "monthly";
  mealsPerDelivery: number;
  deliveryWindow: string;
  nextDeliveryAt: string | null;
  pricePerDeliveryRupees: number;
  /** City only — full address line / pincode / phone are not exposed. */
  city: string | null;
  memberCount: number;
}

export interface BriefLoyalty {
  creditBalanceRupees: number;
  pendingNotifications: number;
}

export interface BriefPremium {
  isPremium: boolean;
  currentPeriodEndIso: string | null;
  rdConsultsRemaining: number | null;
}

export interface BriefRecentOrder {
  id: number;
  status: string;
  totalRupees: number;
  itemCount: number;
  topItems: string[];
  placedAtIso: string;
  fulfillmentType: string;
}

export interface BriefWellness {
  calorieTarget: number;
  proteinTargetGrams: number;
  todayCalories: number;
  todayProteinGrams: number;
  todayWaterMl: number;
  proteinStreakDays: number;
  vegStreakDays: number;
}

export interface BriefContext {
  /** IANA timezone, e.g. "Asia/Kolkata". Defaults to Asia/Kolkata. */
  timezone: string;
  /** Local date in YYYY-MM-DD. */
  localDate: string;
  /** Local hour 0-23. */
  localHour: number;
  /** "morning" | "afternoon" | "evening" | "night" */
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  /** City pulled from latest order/subscription, never the full address. */
  city: string | null;
}

export interface UserBrief {
  identity: BriefIdentity;
  preferences: BriefPreferences | null;
  profile: BriefProfile | null;
  subscription: BriefSubscription | null;
  loyalty: BriefLoyalty | null;
  premium: BriefPremium | null;
  recentOrders: BriefRecentOrder[] | null;
  wellness: BriefWellness | null;
  context: BriefContext;
  /** Sections that were actually loaded for this brief. */
  loadedSections: BriefSection[];
  /** Wall-clock timestamp the brief was assembled. */
  assembledAtIso: string;
}

export interface GetUserBriefOptions {
  /**
   * Subset of sections to include. Omit to load all sections.
   * `identity` and `context` are always included.
   */
  include?: BriefSection[];
  /**
   * IANA timezone for the `context` block. Defaults to Asia/Kolkata.
   */
  timezone?: string;
  /** Bypass the per-process cache. */
  refresh?: boolean;
}
