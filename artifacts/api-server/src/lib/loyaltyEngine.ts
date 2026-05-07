import { and, count, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  creditLedgerTable,
  db,
  loyaltyConfigTable,
  notificationsTable,
  referralRedemptionsTable,
  subscriptionDeliveriesTable,
  subscriptionsTable,
  userProfileTable,
  type CreditLedgerReason,
  type LoyaltyConfig,
  type Notification,
  type NotificationKind,
} from "@workspace/db";
import type { PgTransaction } from "drizzle-orm/pg-core";

type DbOrTx = typeof db | PgTransaction<any, any, any>;

const DEFAULTS: Omit<LoyaltyConfig, "updatedAt"> = {
  id: 1,
  referrerAwardPaise: 30000,
  refereeAwardPaise: 30000,
  referralExpiryDays: 90,
  winbackPausedDays: 14,
  winbackOfferPaise: 25000,
  birthdayPaise: 50000,
  anniversaryPaise: 75000,
  loyaltyFreeEveryN: 4,
  premiumUnlockDeliveries: 8,
  premiumUnlockBonusPaise: 75000,
  proteinStreakThreshold: 3,
};

let _cachedConfig: LoyaltyConfig | null = null;
let _cachedAt = 0;
const CONFIG_TTL_MS = 60_000;

export async function getLoyaltyConfig(force = false): Promise<LoyaltyConfig> {
  if (!force && _cachedConfig && Date.now() - _cachedAt < CONFIG_TTL_MS) {
    return _cachedConfig;
  }
  const [row] = await db
    .select()
    .from(loyaltyConfigTable)
    .where(eq(loyaltyConfigTable.id, 1));
  if (row) {
    _cachedConfig = row;
  } else {
    const [created] = await db
      .insert(loyaltyConfigTable)
      .values(DEFAULTS)
      .onConflictDoNothing()
      .returning();
    if (created) _cachedConfig = created;
    else
      _cachedConfig = {
        ...DEFAULTS,
        updatedAt: new Date(),
      } as LoyaltyConfig;
  }
  _cachedAt = Date.now();
  return _cachedConfig;
}

export function invalidateLoyaltyConfigCache(): void {
  _cachedConfig = null;
}

/** Snapshot of current config for clients that need labels (UI). */
export async function getLoyaltyConstantsSnapshot(): Promise<{
  REFERRER_AWARD_PAISE: number;
  REFEREE_AWARD_PAISE: number;
  REFERRAL_EXPIRY_DAYS: number;
  WINBACK_PAUSED_DAYS: number;
  WINBACK_OFFER_PAISE: number;
  BIRTHDAY_PAISE: number;
  ANNIVERSARY_PAISE: number;
  LOYALTY_FREE_EVERY_N: number;
  PREMIUM_UNLOCK_DELIVERIES: number;
  PREMIUM_UNLOCK_BONUS_PAISE: number;
  PROTEIN_STREAK_THRESHOLD: number;
}> {
  const c = await getLoyaltyConfig();
  return {
    REFERRER_AWARD_PAISE: c.referrerAwardPaise,
    REFEREE_AWARD_PAISE: c.refereeAwardPaise,
    REFERRAL_EXPIRY_DAYS: c.referralExpiryDays,
    WINBACK_PAUSED_DAYS: c.winbackPausedDays,
    WINBACK_OFFER_PAISE: c.winbackOfferPaise,
    BIRTHDAY_PAISE: c.birthdayPaise,
    ANNIVERSARY_PAISE: c.anniversaryPaise,
    LOYALTY_FREE_EVERY_N: c.loyaltyFreeEveryN,
    PREMIUM_UNLOCK_DELIVERIES: c.premiumUnlockDeliveries,
    PREMIUM_UNLOCK_BONUS_PAISE: c.premiumUnlockBonusPaise,
    PROTEIN_STREAK_THRESHOLD: c.proteinStreakThreshold,
  };
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export async function issueCredit(
  args: {
    userId: string;
    deltaPaise: number;
    reason: CreditLedgerReason;
    refType?: string;
    refId?: string;
    note?: string;
    expiresAt?: Date | null;
  },
  tx: DbOrTx = db,
): Promise<void> {
  await tx.insert(creditLedgerTable).values({
    userId: args.userId,
    deltaPaise: args.deltaPaise,
    reason: args.reason,
    refType: args.refType ?? null,
    refId: args.refId ?? null,
    note: args.note ?? null,
    expiresAt: args.expiresAt ?? null,
  });
}

export async function getCreditBalancePaise(
  userId: string,
  tx: DbOrTx = db,
): Promise<number> {
  const rows = await tx
    .select({
      total: sql<number>`coalesce(sum(${creditLedgerTable.deltaPaise}), 0)`,
    })
    .from(creditLedgerTable)
    .where(
      and(
        eq(creditLedgerTable.userId, userId),
        or(
          isNull(creditLedgerTable.expiresAt),
          gt(creditLedgerTable.expiresAt, sql`now()`),
        ),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export async function redeemCreditAtomic(args: {
  userId: string;
  paise: number;
  refId?: string;
  note?: string;
}): Promise<{ ok: true; balancePaise: number } | { ok: false; reason: "insufficient" }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"credit:" + args.userId}, 0))`,
    );
    const balance = await getCreditBalancePaise(args.userId, tx);
    if (balance < args.paise) {
      return { ok: false, reason: "insufficient" } as const;
    }
    await issueCredit(
      {
        userId: args.userId,
        deltaPaise: -args.paise,
        reason: "checkout_redemption",
        refType: "checkout",
        refId: args.refId,
        note: args.note ?? "Applied at checkout",
      },
      tx,
    );
    const newBalance = await getCreditBalancePaise(args.userId, tx);
    return { ok: true, balancePaise: newBalance } as const;
  });
}

async function ensureNotification(
  args: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    dedupeKey: string;
    payload?: Record<string, unknown>;
  },
  tx: DbOrTx = db,
): Promise<Notification | null> {
  const [created] = await tx
    .insert(notificationsTable)
    .values({
      userId: args.userId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      dedupeKey: args.dedupeKey,
      payload: args.payload ?? null,
      status: "sent",
      sentAt: new Date(),
    })
    .onConflictDoNothing({
      target: [notificationsTable.userId, notificationsTable.dedupeKey],
    })
    .returning();
  return created ?? null;
}

/**
 * Award pending referral credits when the referee completes their first
 * order. Idempotent: redemption.awardedAt acts as a guard, the unique
 * (userId, dedupeKey) on notifications prevents duplicates, and the whole
 * thing runs in a transaction with an advisory lock per redemption row.
 */
export async function awardPendingReferral(args: {
  refereeUserId: string;
  orderId: string;
}): Promise<{ awarded: boolean; redemptionId?: number }> {
  const config = await getLoyaltyConfig();
  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(referralRedemptionsTable)
      .where(
        and(
          eq(referralRedemptionsTable.refereeUserId, args.refereeUserId),
          isNull(referralRedemptionsTable.awardedAt),
        ),
      );
    if (!pending) return { awarded: false };
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${"referral:" + pending.id}, 0))`,
    );
    const [stillPending] = await tx
      .select()
      .from(referralRedemptionsTable)
      .where(
        and(
          eq(referralRedemptionsTable.id, pending.id),
          isNull(referralRedemptionsTable.awardedAt),
        ),
      );
    if (!stillPending) return { awarded: false };
    const expiresAt = addDays(new Date(), config.referralExpiryDays);
    await issueCredit(
      {
        userId: pending.referrerUserId,
        deltaPaise: pending.referrerAwardPaise,
        reason: "referral_referrer_award",
        refType: "referral_redemption",
        refId: String(pending.id),
        note: "Friend completed their first order",
        expiresAt,
      },
      tx,
    );
    await issueCredit(
      {
        userId: pending.refereeUserId,
        deltaPaise: pending.refereeAwardPaise,
        reason: "referral_referee_signup",
        refType: "referral_redemption",
        refId: String(pending.id),
        note: "Welcome bonus",
        expiresAt,
      },
      tx,
    );
    await tx
      .update(referralRedemptionsTable)
      .set({ awardedAt: new Date(), firstOrderId: args.orderId })
      .where(eq(referralRedemptionsTable.id, pending.id));
    await ensureNotification(
      {
        userId: pending.referrerUserId,
        kind: "referral_redeemed",
        title: "A friend just placed their first order",
        body: `You earned Rs.${(pending.referrerAwardPaise / 100).toFixed(0)} in credits.`,
        dedupeKey: `referral_award:${pending.id}`,
        payload: { redemptionId: pending.id },
      },
      tx,
    );
    return { awarded: true, redemptionId: pending.id };
  });
}

async function checkBirthdayOrAnniversary(
  userId: string,
  field: "birthDate" | "anniversaryDate",
  kind: "birthday" | "anniversary",
): Promise<Notification | null> {
  const [profile] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId));
  const value = profile?.[field];
  if (!value) return null;
  const config = await getLoyaltyConfig();
  // Use UTC consistently for "today"; date columns return YYYY-MM-DD strings.
  const today = new Date();
  const [yStr, mStr, dStr] = String(value).split("-");
  const m = Number(mStr);
  const d = Number(dStr);
  if (
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    m - 1 !== today.getUTCMonth() ||
    d !== today.getUTCDate()
  ) {
    return null;
  }
  const year = today.getUTCFullYear();
  const dedupe = `${kind}:${year}`;
  const paise =
    kind === "birthday" ? config.birthdayPaise : config.anniversaryPaise;
  const created = await ensureNotification({
    userId,
    kind: kind === "birthday" ? "birthday" : "loyalty_premium_unlock",
    title:
      kind === "birthday"
        ? "Happy birthday from Tanmatra!"
        : "Happy anniversary with Tanmatra!",
    body: `We've added Rs.${(paise / 100).toFixed(0)} in credits — a meal on us.`,
    dedupeKey: dedupe,
    payload: { since: yStr },
  });
  if (created) {
    await issueCredit({
      userId,
      deltaPaise: paise,
      reason: kind === "birthday" ? "birthday_meal" : "manual_grant",
      refType: "notification",
      refId: String(created.id),
      note: kind === "birthday" ? `Birthday meal ${year}` : `Anniversary ${year}`,
      expiresAt: addDays(today, 30),
    });
  }
  return created;
}

async function checkWinback(userId: string): Promise<Notification[]> {
  const config = await getLoyaltyConfig();
  const cutoff = addDays(new Date(), -config.winbackPausedDays);
  const paused = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        eq(subscriptionsTable.status, "paused"),
      ),
    );
  const out: Notification[] = [];
  for (const sub of paused) {
    if (!sub.pausedAt || sub.pausedAt > cutoff) continue;
    const dedupe = `winback:${sub.id}:${sub.pausedAt.toISOString().slice(0, 10)}`;
    const created = await ensureNotification({
      userId,
      kind: "winback",
      title: "Come back to your plan",
      body: `Your ${sub.cadence} plan has been paused. Here's Rs.${(config.winbackOfferPaise / 100).toFixed(0)} to resume.`,
      dedupeKey: dedupe,
      payload: { subscriptionId: sub.id },
    });
    if (created) {
      await issueCredit({
        userId,
        deltaPaise: config.winbackOfferPaise,
        reason: "winback_offer",
        refType: "subscription",
        refId: String(sub.id),
        note: "Win-back offer",
        expiresAt: addDays(new Date(), 30),
      });
      out.push(created);
    }
  }
  return out;
}

async function checkLoyalty(userId: string): Promise<Notification[]> {
  const config = await getLoyaltyConfig();
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));
  const out: Notification[] = [];
  for (const sub of subs) {
    const [delivered] = await db
      .select({ n: count() })
      .from(subscriptionDeliveriesTable)
      .where(
        and(
          eq(subscriptionDeliveriesTable.subscriptionId, sub.id),
          eq(subscriptionDeliveriesTable.status, "delivered"),
        ),
      );
    const deliveredCount = Number(delivered?.n ?? 0);

    if (
      deliveredCount > 0 &&
      deliveredCount % config.loyaltyFreeEveryN === 0
    ) {
      const dedupe = `loyalty_free:${sub.id}:${deliveredCount}`;
      const created = await ensureNotification({
        userId,
        kind: "loyalty_free_week",
        title: "Loyalty reward unlocked",
        body: `You've completed ${deliveredCount} deliveries — your next plan delivery is on us.`,
        dedupeKey: dedupe,
        payload: { subscriptionId: sub.id },
      });
      if (created) {
        await issueCredit({
          userId,
          deltaPaise: sub.pricePerDeliveryPaise,
          reason: "loyalty_free_week",
          refType: "subscription",
          refId: String(sub.id),
          note: `Every-${config.loyaltyFreeEveryN} reward (after ${deliveredCount} deliveries)`,
          expiresAt: addDays(new Date(), 60),
        });
        out.push(created);
      }
    }

    if (deliveredCount >= config.premiumUnlockDeliveries) {
      const dedupe = `premium_unlock:${sub.id}`;
      const created = await ensureNotification({
        userId,
        kind: "loyalty_premium_unlock",
        title: "Premium meals unlocked",
        body: `You've completed ${deliveredCount} deliveries — premium meals are now part of your plan.`,
        dedupeKey: dedupe,
        payload: { subscriptionId: sub.id },
      });
      if (created) {
        await issueCredit({
          userId,
          deltaPaise: config.premiumUnlockBonusPaise,
          reason: "premium_unlock_bonus",
          refType: "subscription",
          refId: String(sub.id),
          note: "Premium tier unlock bonus",
          expiresAt: addDays(new Date(), 60),
        });
        out.push(created);
      }
    }
  }
  return out;
}

async function checkProteinStreak(userId: string): Promise<Notification | null> {
  const config = await getLoyaltyConfig();
  const [profile] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId));
  if (!profile) return null;
  if ((profile.proteinShortfallStreak ?? 0) < config.proteinStreakThreshold)
    return null;
  const today = new Date().toISOString().slice(0, 10);
  return ensureNotification({
    userId,
    kind: "protein_streak",
    title: "You're behind on protein",
    body: `${profile.proteinShortfallStreak} days under your goal. Try a high-protein bowl today.`,
    dedupeKey: `protein:${today}`,
    payload: { streak: profile.proteinShortfallStreak },
  });
}

export async function runLoyaltyEngineForUser(userId: string): Promise<{
  notifications: Notification[];
}> {
  const out: Notification[] = [];
  const bday = await checkBirthdayOrAnniversary(userId, "birthDate", "birthday");
  if (bday) out.push(bday);
  const anniv = await checkBirthdayOrAnniversary(
    userId,
    "anniversaryDate",
    "anniversary",
  );
  if (anniv) out.push(anniv);
  out.push(...(await checkWinback(userId)));
  out.push(...(await checkLoyalty(userId)));
  const protein = await checkProteinStreak(userId);
  if (protein) out.push(protein);
  return { notifications: out };
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  return db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt));
}
