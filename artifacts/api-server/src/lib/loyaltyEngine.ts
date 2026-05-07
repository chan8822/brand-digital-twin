import { and, count, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  creditLedgerTable,
  db,
  notificationsTable,
  subscriptionDeliveriesTable,
  subscriptionsTable,
  userProfileTable,
  type CreditLedgerReason,
  type Notification,
  type NotificationKind,
} from "@workspace/db";
import type { PgTransaction } from "drizzle-orm/pg-core";

type DbOrTx = typeof db | PgTransaction<any, any, any>;

const REFERRER_AWARD_PAISE = 30000;
const REFEREE_AWARD_PAISE = 30000;
const REFERRAL_EXPIRY_DAYS = 90;
const WINBACK_PAUSED_DAYS = 14;
const WINBACK_OFFER_PAISE = 25000;
const WINBACK_EXPIRY_DAYS = 30;
const BIRTHDAY_PAISE = 50000;
const BIRTHDAY_EXPIRY_DAYS = 30;
const LOYALTY_FREE_EVERY_N = 4;
const PREMIUM_UNLOCK_DELIVERIES = 8;
const PREMIUM_UNLOCK_BONUS_PAISE = 75000;
const PROTEIN_STREAK_THRESHOLD = 3;

export const LOYALTY_CONSTANTS = {
  REFERRER_AWARD_PAISE,
  REFEREE_AWARD_PAISE,
  REFERRAL_EXPIRY_DAYS,
  WINBACK_PAUSED_DAYS,
  WINBACK_OFFER_PAISE,
  BIRTHDAY_PAISE,
  LOYALTY_FREE_EVERY_N,
  PREMIUM_UNLOCK_DELIVERIES,
  PREMIUM_UNLOCK_BONUS_PAISE,
  PROTEIN_STREAK_THRESHOLD,
};

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

/**
 * Atomically debit credits for a user. Uses a Postgres advisory lock keyed
 * to the user to prevent double-spend across concurrent requests, then
 * re-checks the live balance (incl. expiry filter) before inserting the
 * negative ledger entry.
 */
export async function redeemCreditAtomic(args: {
  userId: string;
  paise: number;
  refId?: string;
  note?: string;
}): Promise<{ ok: true; balancePaise: number } | { ok: false; reason: "insufficient" }> {
  return db.transaction(async (tx) => {
    // Per-user advisory lock; auto-released at txn end.
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

async function ensureNotification(args: {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  dedupeKey: string;
  payload?: Record<string, unknown>;
}): Promise<Notification | null> {
  const [created] = await db
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

async function checkBirthday(userId: string): Promise<Notification | null> {
  const [profile] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId));
  if (!profile?.birthDate) return null;
  const today = new Date();
  const bd = new Date(profile.birthDate);
  if (
    bd.getUTCMonth() !== today.getUTCMonth() ||
    bd.getUTCDate() !== today.getUTCDate()
  ) {
    return null;
  }
  const year = today.getUTCFullYear();
  const dedupe = `birthday:${year}`;
  const created = await ensureNotification({
    userId,
    kind: "birthday",
    title: "Happy birthday from Tanmatra!",
    body: `We've added Rs.${(BIRTHDAY_PAISE / 100).toFixed(0)} in credits — pick a meal on us.`,
    dedupeKey: dedupe,
  });
  if (created) {
    await issueCredit({
      userId,
      deltaPaise: BIRTHDAY_PAISE,
      reason: "birthday_meal",
      refType: "notification",
      refId: String(created.id),
      note: `Birthday meal ${year}`,
      expiresAt: addDays(today, BIRTHDAY_EXPIRY_DAYS),
    });
  }
  return created;
}

async function checkWinback(userId: string): Promise<Notification[]> {
  const cutoff = addDays(new Date(), -WINBACK_PAUSED_DAYS);
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
      body: `Your ${sub.cadence} plan has been paused. Here's Rs.${(WINBACK_OFFER_PAISE / 100).toFixed(0)} to resume.`,
      dedupeKey: dedupe,
      payload: { subscriptionId: sub.id },
    });
    if (created) {
      await issueCredit({
        userId,
        deltaPaise: WINBACK_OFFER_PAISE,
        reason: "winback_offer",
        refType: "subscription",
        refId: String(sub.id),
        note: "Win-back offer",
        expiresAt: addDays(new Date(), WINBACK_EXPIRY_DAYS),
      });
      out.push(created);
    }
  }
  return out;
}

async function checkLoyalty(userId: string): Promise<Notification[]> {
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
      deliveredCount % LOYALTY_FREE_EVERY_N === 0
    ) {
      const dedupe = `loyalty_free:${sub.id}:${deliveredCount}`;
      const created = await ensureNotification({
        userId,
        kind: "loyalty_free_week",
        title: "Loyalty reward unlocked",
        body: `You've completed ${deliveredCount} deliveries — your next plan delivery is on us.`,
        dedupeKey: dedupe,
        payload: { subscriptionId: sub.id, freeDeliveryPaise: sub.pricePerDeliveryPaise },
      });
      if (created) {
        await issueCredit({
          userId,
          deltaPaise: sub.pricePerDeliveryPaise,
          reason: "loyalty_free_week",
          refType: "subscription",
          refId: String(sub.id),
          note: `Every-${LOYALTY_FREE_EVERY_N} reward (after ${deliveredCount} deliveries)`,
          expiresAt: addDays(new Date(), 60),
        });
        out.push(created);
      }
    }

    if (deliveredCount >= PREMIUM_UNLOCK_DELIVERIES) {
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
          deltaPaise: PREMIUM_UNLOCK_BONUS_PAISE,
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
  const [profile] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId));
  if (!profile) return null;
  if ((profile.proteinShortfallStreak ?? 0) < PROTEIN_STREAK_THRESHOLD) return null;
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
  const bday = await checkBirthday(userId);
  if (bday) out.push(bday);
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
