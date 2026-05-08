/**
 * getUserBrief — single source of user context for AI agents.
 *
 * Pulls from existing tables (no new sources). Each section is fetched
 * in parallel and isolated in a try/catch so a single failing query
 * never breaks the whole brief — the section just lands as null.
 *
 * Per-request memoization is provided via getUserBriefForRequest, which
 * de-duplicates concurrent calls in the same Express request.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import {
  creditLedgerTable,
  dailyTargetsTable,
  db,
  notificationsTable,
  nutritionLogsTable,
  ordersTable,
  premiumMembershipsTable,
  streaksTable,
  subscriptionMembersTable,
  subscriptionsTable,
  userPreferencesTable,
  userProfileTable,
  usersTable,
} from "@workspace/db";
import { logger } from "../logger";
import {
  getProcessCached,
  getRequestCache,
  processCacheKey,
  setProcessCached,
} from "./cache";
import type {
  BriefContext,
  BriefLoyalty,
  BriefPremium,
  BriefPreferences,
  BriefProfile,
  BriefRecentOrder,
  BriefSection,
  BriefSubscription,
  BriefWellness,
  GetUserBriefOptions,
  UserBrief,
} from "./types";

const ALL_SECTIONS: BriefSection[] = [
  "identity",
  "preferences",
  "profile",
  "subscription",
  "loyalty",
  "premium",
  "recentOrders",
  "wellness",
  "context",
];

const DEFAULT_TZ = "Asia/Kolkata";

function shouldLoad(
  section: BriefSection,
  include: BriefSection[] | undefined,
): boolean {
  if (section === "identity" || section === "context") return true;
  if (!include) return true;
  return include.includes(section);
}

function buildContext(timezone: string, city: string | null): BriefContext {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const localDate = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour")) || 0;
  const timeOfDay: BriefContext["timeOfDay"] =
    hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  return { timezone, localDate, localHour: hour, timeOfDay, city };
}

async function safeLoad<T>(
  section: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, section }, "userBrief: section load failed");
    return null;
  }
}

async function loadIdentity(userId: string) {
  const [row] = await db
    .select({ id: usersTable.id, firstName: usersTable.firstName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return { userId, firstName: row?.firstName ?? null };
}

async function loadPreferences(userId: string): Promise<BriefPreferences | null> {
  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    dietaryStyle: row.dietaryStyle,
    allergens: row.allergens ?? [],
    dislikedIngredients: row.dislikedIngredients ?? [],
    cuisines: row.cuisines ?? [],
    spiceLevel: row.spiceLevel,
    goal: row.goal,
    activityLevel: row.activityLevel,
    calorieTarget: row.calorieTarget,
    proteinTargetGrams: row.proteinTargetGrams,
    carbsTargetGrams: row.carbsTargetGrams,
    fatTargetGrams: row.fatTargetGrams,
    quizCompleted: row.quizCompletedAt != null,
  };
}

async function loadProfile(userId: string): Promise<BriefProfile | null> {
  const [row] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    hasBirthDate: row.birthDate != null,
    hasAnniversary: row.anniversaryDate != null,
    proteinGoalGrams: row.proteinGoalGrams,
    proteinShortfallStreak: row.proteinShortfallStreak ?? 0,
  };
}

async function loadSubscription(
  userId: string,
): Promise<BriefSubscription | null> {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);
  if (!row) return null;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(subscriptionMembersTable)
    .where(eq(subscriptionMembersTable.subscriptionId, row.id));
  return {
    id: row.id,
    status: row.status,
    cadence: row.cadence,
    mealsPerDelivery: row.mealsPerDelivery,
    deliveryWindow: row.deliveryWindow,
    nextDeliveryAt: row.nextDeliveryAt
      ? new Date(row.nextDeliveryAt).toISOString()
      : null,
    pricePerDeliveryRupees: (row.pricePerDeliveryPaise ?? 0) / 100,
    city: row.city ?? null,
    memberCount: Number(count ?? 0),
  };
}

async function loadLoyalty(userId: string): Promise<BriefLoyalty> {
  const [{ balance }] = await db
    .select({
      balance: sql<number>`coalesce(sum(${creditLedgerTable.deltaPaise}), 0)::int`,
    })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.userId, userId));
  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.status, "pending"),
      ),
    );
  return {
    creditBalanceRupees: Number(balance ?? 0) / 100,
    pendingNotifications: Number(pending ?? 0),
  };
}

async function loadPremium(userId: string): Promise<BriefPremium> {
  const [row] = await db
    .select()
    .from(premiumMembershipsTable)
    .where(eq(premiumMembershipsTable.userId, userId))
    .orderBy(desc(premiumMembershipsTable.createdAt))
    .limit(1);
  if (!row) {
    return { isPremium: false, currentPeriodEndIso: null, rdConsultsRemaining: null };
  }
  const stillInPeriod =
    new Date(row.currentPeriodEnd).getTime() > Date.now() &&
    (row.status === "active" || row.status === "cancelled");
  return {
    isPremium: stillInPeriod,
    currentPeriodEndIso: stillInPeriod
      ? new Date(row.currentPeriodEnd).toISOString()
      : null,
    rdConsultsRemaining: stillInPeriod
      ? Math.max(0, row.rdConsultsPerPeriod - row.rdConsultsUsedThisPeriod)
      : null,
  };
}

async function loadRecentOrders(
  userId: string,
): Promise<BriefRecentOrder[]> {
  const rows = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);
  return rows.map((row) => {
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      id: row.id,
      status: row.status,
      totalRupees: (row.totalPaise ?? 0) / 100,
      itemCount: items.reduce((n, i) => n + (i?.qty ?? 0), 0),
      topItems: items.slice(0, 3).map((i) => i?.name ?? "unknown"),
      placedAtIso: new Date(row.createdAt).toISOString(),
      fulfillmentType: row.fulfillmentType,
    };
  });
}

async function loadWellness(userId: string, today: string): Promise<BriefWellness> {
  const [target] = await db
    .select()
    .from(dailyTargetsTable)
    .where(eq(dailyTargetsTable.userId, userId))
    .limit(1);
  const [totals] = await db
    .select({
      cal: sql<number>`coalesce(sum(${nutritionLogsTable.calories}), 0)::int`,
      protein: sql<number>`coalesce(sum(${nutritionLogsTable.proteinGrams}), 0)::int`,
      water: sql<number>`coalesce(sum(${nutritionLogsTable.waterMl}), 0)::int`,
    })
    .from(nutritionLogsTable)
    .where(
      and(
        eq(nutritionLogsTable.userId, userId),
        eq(nutritionLogsTable.loggedFor, today),
      ),
    );
  const streaks = await db
    .select()
    .from(streaksTable)
    .where(eq(streaksTable.userId, userId));
  const proteinStreak = streaks.find((s) => s.kind === "protein")?.currentDays ?? 0;
  const vegStreak = streaks.find((s) => s.kind === "veg")?.currentDays ?? 0;
  return {
    calorieTarget: target?.calorieTarget ?? 2000,
    proteinTargetGrams: target?.proteinTargetGrams ?? 80,
    todayCalories: Number(totals?.cal ?? 0),
    todayProteinGrams: Number(totals?.protein ?? 0),
    todayWaterMl: Number(totals?.water ?? 0),
    proteinStreakDays: proteinStreak,
    vegStreakDays: vegStreak,
  };
}

async function loadCity(userId: string): Promise<string | null> {
  // Pull just city from latest order or active subscription. We never
  // expose addressLine, pincode, or phone via the brief.
  const [order] = await db
    .select({ city: ordersTable.city })
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(1);
  if (order?.city) return order.city;
  const [sub] = await db
    .select({ city: subscriptionsTable.city })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);
  return sub?.city ?? null;
}

export async function getUserBrief(
  userId: string,
  opts: GetUserBriefOptions = {},
): Promise<UserBrief> {
  const cached = getProcessCached(userId, opts);
  if (cached) return cached;

  const include = opts.include;
  const timezone = opts.timezone ?? DEFAULT_TZ;
  const sections = ALL_SECTIONS.filter((s) => shouldLoad(s, include));

  const [
    identity,
    preferences,
    profile,
    subscription,
    loyalty,
    premium,
    recentOrders,
    city,
  ] = await Promise.all([
    safeLoad("identity", () => loadIdentity(userId)),
    shouldLoad("preferences", include)
      ? safeLoad("preferences", () => loadPreferences(userId))
      : Promise.resolve(null),
    shouldLoad("profile", include)
      ? safeLoad("profile", () => loadProfile(userId))
      : Promise.resolve(null),
    shouldLoad("subscription", include)
      ? safeLoad("subscription", () => loadSubscription(userId))
      : Promise.resolve(null),
    shouldLoad("loyalty", include)
      ? safeLoad("loyalty", () => loadLoyalty(userId))
      : Promise.resolve(null),
    shouldLoad("premium", include)
      ? safeLoad("premium", () => loadPremium(userId))
      : Promise.resolve(null),
    shouldLoad("recentOrders", include)
      ? safeLoad("recentOrders", () => loadRecentOrders(userId))
      : Promise.resolve(null),
    safeLoad("city", () => loadCity(userId)),
  ]);

  const ctx = buildContext(timezone, city ?? null);
  const wellness = shouldLoad("wellness", include)
    ? await safeLoad("wellness", () => loadWellness(userId, ctx.localDate))
    : null;

  const brief: UserBrief = {
    identity: identity ?? { userId, firstName: null },
    preferences,
    profile,
    subscription,
    loyalty,
    premium,
    recentOrders,
    wellness,
    context: ctx,
    loadedSections: sections,
    assembledAtIso: new Date().toISOString(),
  };
  setProcessCached(userId, opts, brief);
  return brief;
}

/**
 * Per-request memoized variant. Multiple callers within the same Express
 * request share one in-flight promise per (userId, options) pair.
 */
export function getUserBriefForRequest(
  req: object | null | undefined,
  userId: string,
  opts: GetUserBriefOptions = {},
): Promise<UserBrief> {
  const cache = getRequestCache(req);
  if (!cache) return getUserBrief(userId, opts);
  const key = processCacheKey(userId, opts);
  if (!opts.refresh) {
    const existing = cache.get(key);
    if (existing) return existing;
  }
  const p = getUserBrief(userId, opts);
  cache.set(key, p);
  return p;
}
