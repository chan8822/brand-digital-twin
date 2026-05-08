import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
  bundlesTable,
  creditLedgerTable,
  db,
  loyaltyConfigTable,
  notificationsTable,
  orderClaimsTable,
  ordersTable,
  referralRedemptionsTable,
  subscriptionDeliveriesTable,
  subscriptionsTable,
  userProfileTable,
  type CreditLedgerReason,
  type LoyaltyConfig,
  type Notification,
  type NotificationKind,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import { makeBatchDishResolver } from "./menuResolver";
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

// FIFO lot-based balance — redemptions consume oldest-expiring
// unexpired lots first, so an expired grant can't drive balance < 0.
async function computeRemainingLots(
  userId: string,
  tx: DbOrTx,
): Promise<Array<{ remaining: number; expiresAt: Date | null }>> {
  const rows = await tx
    .select({
      deltaPaise: creditLedgerTable.deltaPaise,
      expiresAt: creditLedgerTable.expiresAt,
      createdAt: creditLedgerTable.createdAt,
    })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.userId, userId))
    .orderBy(asc(creditLedgerTable.createdAt), asc(creditLedgerTable.id));

  const lots: Array<{
    remaining: number;
    expiresAt: Date | null;
    createdAt: Date;
  }> = [];

  for (const r of rows) {
    if (r.deltaPaise > 0) {
      lots.push({
        remaining: r.deltaPaise,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      });
      continue;
    }
    let needed = -r.deltaPaise;
    const eligible = lots
      .filter(
        (l) =>
          l.remaining > 0 &&
          (l.expiresAt === null || l.expiresAt > r.createdAt),
      )
      .sort((a, b) => {
        const ea = a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const eb = b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (ea !== eb) return ea - eb;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    for (const lot of eligible) {
      if (needed <= 0) break;
      const take = Math.min(lot.remaining, needed);
      lot.remaining -= take;
      needed -= take;
    }
  }
  return lots;
}

export async function getCreditBalancePaise(
  userId: string,
  tx: DbOrTx = db,
): Promise<number> {
  const lots = await computeRemainingLots(userId, tx);
  const now = Date.now();
  let total = 0;
  for (const l of lots) {
    if (l.remaining <= 0) continue;
    if (l.expiresAt !== null && l.expiresAt.getTime() <= now) continue;
    total += l.remaining;
  }
  return total;
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

// Award pending referral on first order. Idempotent via awardedAt
// + advisory lock + unique notification dedupe key.
export type AwardReferralResult =
  | { awarded: true; redemptionId: number }
  | {
      awarded: false;
      reason:
        | "no_pending_referral"
        | "order_already_claimed"
        | "no_qualifying_activity"
        | "already_awarded";
    };

async function awardPendingReferralInTx(
  tx: DbOrTx,
  args: { refereeUserId: string; orderId: string },
): Promise<AwardReferralResult> {
  const config = await getLoyaltyConfig();
  // Find the pending redemption for this user (if any).
  const [pending] = await tx
    .select()
    .from(referralRedemptionsTable)
    .where(
      and(
        eq(referralRedemptionsTable.refereeUserId, args.refereeUserId),
        isNull(referralRedemptionsTable.awardedAt),
      ),
    );
  if (!pending) {
    return { awarded: false, reason: "no_pending_referral" } as const;
  }

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
  if (!stillPending) {
    return { awarded: false, reason: "already_awarded" } as const;
  }
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
}

// Server-owned checkout finalization: one transaction that records
// the order, redeems credits, and awards any pending referral.
export interface FinalizeOrderItem {
  id: number;
  name: string;
  qty: number;
  price: number;
}

export interface FinalizeOrderAddress {
  label?: string | null;
  line?: string | null;
  city?: string | null;
  pincode?: string | null;
  phone?: string | null;
}

export const PREORDER_DISCOUNT_BPS = 500; // 5% off scheduled orders

export async function finalizeOrder(args: {
  userId: string;
  orderId: string;
  items: FinalizeOrderItem[];
  address?: FinalizeOrderAddress;
  applyCreditsPaise?: number;
  scheduledFor?: Date | null;
  bundleSlugs?: string[];
}): Promise<{
  orderId: string;
  serverOrderId: number;
  grossPaise: number;
  bundleDiscountPaise: number;
  preorderDiscountPaise: number;
  redeemedPaise: number;
  finalPaise: number;
  balancePaise: number;
  duplicate: boolean;
  referral: AwardReferralResult;
}> {
  // Server-authoritative pricing from the shared menu catalog.
  // Client-supplied `price` is ignored.
  if (args.items.length === 0) {
    throw new Error("order has no items");
  }
  const validatedItems: FinalizeOrderItem[] = [];
  let grossPaise = 0;
  // Resolve the merged catalog once; subsequent lookups are in-memory.
  const catalog = await makeBatchDishResolver();
  for (const it of args.items) {
    const dish = catalog.byId(it.id);
    if (!dish) throw new Error(`unknown dish id: ${it.id}`);
    if (!dish.isAvailable) throw new Error(`dish unavailable: ${dish.slug}`);
    const qty = Math.max(0, Math.floor(it.qty));
    if (qty <= 0) throw new Error(`invalid qty for dish ${dish.slug}`);
    grossPaise += dish.price * qty;
    validatedItems.push({ id: dish.id, name: dish.name, qty, price: dish.price });
  }
  if (grossPaise <= 0) {
    throw new Error("order total must be positive");
  }
  // Bundle discount: for each requested bundle slug, verify every dish
  // in that bundle is present in the cart in sufficient quantity. If
  // valid, apply the bundle's (originalPricePaise - pricePaise) saving.
  // We track a per-dish "remaining qty" budget so the same line cannot
  // satisfy two overlapping bundles. Unknown / unsatisfied bundles are
  // silently dropped — never throw, since stale client state shouldn't
  // block checkout.
  let bundleDiscountPaise = 0;
  // Preserve multiplicity: a client that bought the same combo twice
  // sends the slug twice and gets two discounts (assuming the cart has
  // enough stock). We dedupe only for the catalog lookup.
  const requestedSlugs = (args.bundleSlugs ?? []).filter(
    (s) => typeof s === "string" && s.length > 0,
  );
  if (requestedSlugs.length > 0) {
    const uniqueSlugs = Array.from(new Set(requestedSlugs));
    const bundleRows = await db
      .select()
      .from(bundlesTable)
      .where(inArray(bundlesTable.slug, uniqueSlugs));
    const bundleBySlug = new Map(bundleRows.map((b) => [b.slug, b]));
    const remaining = new Map<number, number>();
    for (const it of args.items) {
      remaining.set(
        it.id,
        (remaining.get(it.id) ?? 0) + Math.max(0, Math.floor(it.qty)),
      );
    }
    // Apply each requested instance independently. If a bundle row has
    // duplicate dish IDs, the frequency map ensures we only accept it
    // when the cart has enough of each component to cover the duplicates.
    // Apply higher-savings bundles first so overlapping bundles resolve
    // deterministically and in the user's favor.
    const expanded = requestedSlugs
      .map((s) => bundleBySlug.get(s))
      .filter((b): b is NonNullable<typeof b> => Boolean(b));
    expanded.sort(
      (a, b) =>
        (b.originalPricePaise - b.pricePaise) -
        (a.originalPricePaise - a.pricePaise),
    );
    for (const b of expanded) {
      const dishIds = Array.isArray(b.dishIds) ? b.dishIds : [];
      if (dishIds.length === 0) continue;
      const required = new Map<number, number>();
      for (const id of dishIds) {
        required.set(id, (required.get(id) ?? 0) + 1);
      }
      let satisfiable = true;
      for (const [id, need] of required) {
        if ((remaining.get(id) ?? 0) < need) {
          satisfiable = false;
          break;
        }
      }
      if (!satisfiable) continue;
      for (const [id, need] of required) {
        remaining.set(id, (remaining.get(id) ?? 0) - need);
      }
      const saving = Math.max(0, b.originalPricePaise - b.pricePaise);
      bundleDiscountPaise += saving;
    }
    // Cap so a malformed catalog can never push the order negative.
    bundleDiscountPaise = Math.min(bundleDiscountPaise, grossPaise);
  }
  const grossAfterBundles = grossPaise - bundleDiscountPaise;
  // Pre-order discount: 5% off the meal subtotal when scheduled for the
  // future. Floored to whole paise; never negative.
  const isScheduled =
    args.scheduledFor instanceof Date &&
    args.scheduledFor.getTime() > Date.now();
  const preorderDiscountPaise = isScheduled
    ? Math.floor((grossAfterBundles * PREORDER_DISCOUNT_BPS) / 10_000)
    : 0;
  const discountedGross = grossAfterBundles - preorderDiscountPaise;
  const requested = Math.max(0, Math.floor(args.applyCreditsPaise ?? 0));
  return db.transaction(async (tx) => {
    // 1. Persist a real server-side order row, idempotent on
    //    (userId, externalOrderId). This is the source of truth
    //    that referral awards are tied to — no order row, no award.
    const [createdOrder] = await tx
      .insert(ordersTable)
      .values({
        userId: args.userId,
        externalOrderId: args.orderId,
        status: "placed",
        totalPaise: discountedGross,
        items: validatedItems,
        addressLabel: args.address?.label ?? null,
        addressLine: args.address?.line ?? null,
        city: args.address?.city ?? null,
        pincode: args.address?.pincode ?? null,
        phone: args.address?.phone ?? null,
        scheduledFor: isScheduled ? args.scheduledFor! : null,
      })
      .onConflictDoNothing({
        target: [ordersTable.userId, ordersTable.externalOrderId],
      })
      .returning();

    let serverOrderId: number;
    if (createdOrder) {
      serverOrderId = createdOrder.id;
    } else {
      const [existingOrder] = await tx
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.userId, args.userId),
            eq(ordersTable.externalOrderId, args.orderId),
          ),
        );
      if (!existingOrder) throw new Error("order persistence race");
      serverOrderId = existingOrder.id;
    }

    // 2. Loyalty claim — same idempotency story as the order row.
    const [created] = await tx
      .insert(orderClaimsTable)
      .values({
        userId: args.userId,
        orderId: args.orderId,
        grossPaise: discountedGross,
        redeemedPaise: 0,
        finalPaise: discountedGross,
      })
      .onConflictDoNothing({
        target: [orderClaimsTable.userId, orderClaimsTable.orderId],
      })
      .returning();

    if (!created) {
      // Duplicate finalize call — return the existing claim verbatim.
      const [existing] = await tx
        .select()
        .from(orderClaimsTable)
        .where(
          and(
            eq(orderClaimsTable.userId, args.userId),
            eq(orderClaimsTable.orderId, args.orderId),
          ),
        );
      const balance = await getCreditBalancePaise(args.userId, tx);
      return {
        orderId: args.orderId,
        serverOrderId,
        grossPaise: existing?.grossPaise ?? discountedGross,
        bundleDiscountPaise,
        preorderDiscountPaise,
        redeemedPaise: existing?.redeemedPaise ?? 0,
        finalPaise: existing?.finalPaise ?? discountedGross,
        balancePaise: balance,
        duplicate: true,
        referral: {
          awarded: false,
          reason: "order_already_claimed",
        } as const,
      };
    }

    // 3. Optional credit redemption, atomic with the order + claim.
    let redeemed = 0;
    if (requested > 0) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"credit:" + args.userId}, 0))`,
      );
      const balance = await getCreditBalancePaise(args.userId, tx);
      redeemed = Math.min(requested, balance, discountedGross);
      if (redeemed > 0) {
        await issueCredit(
          {
            userId: args.userId,
            deltaPaise: -redeemed,
            reason: "checkout_redemption",
            refType: "checkout",
            refId: args.orderId,
            note: `Applied at checkout for order ${args.orderId}`,
          },
          tx,
        );
      }
    }
    const finalPaise = discountedGross - redeemed;

    // 4. Persist actual amounts on the claim and the order total.
    await tx
      .update(orderClaimsTable)
      .set({ redeemedPaise: redeemed, finalPaise })
      .where(eq(orderClaimsTable.id, created.id));
    if (redeemed > 0) {
      await tx
        .update(ordersTable)
        .set({ totalPaise: finalPaise })
        .where(eq(ordersTable.id, serverOrderId));
    }

    // 5. Award referral — server-recorded first order satisfies the
    //    "both earn credits on first order" requirement. We additionally
    //    require this be the user's first qualifying order.
    const [orderCount] = await tx
      .select({ n: count() })
      .from(ordersTable)
      .where(eq(ordersTable.userId, args.userId));
    let referral: AwardReferralResult = {
      awarded: false,
      reason: "no_qualifying_activity",
    };
    if (Number(orderCount?.n ?? 0) === 1) {
      referral = await awardPendingReferralInTx(tx, {
        refereeUserId: args.userId,
        orderId: args.orderId,
      });
    }

    const balancePaise = await getCreditBalancePaise(args.userId, tx);
    return {
      orderId: args.orderId,
      serverOrderId,
      grossPaise: discountedGross,
      bundleDiscountPaise,
      preorderDiscountPaise,
      redeemedPaise: redeemed,
      finalPaise,
      balancePaise,
      duplicate: false,
      referral,
    };
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
    kind,
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

// Per-subscription loyalty progress for the UI.
export async function getSubscriptionLoyaltyProgress(
  userId: string,
): Promise<
  Array<{
    subscriptionId: number;
    deliveredCount: number;
    freeEveryN: number;
    deliveriesUntilFree: number;
    premiumUnlockAt: number;
    deliveriesUntilPremium: number;
    premiumUnlocked: boolean;
  }>
> {
  const config = await getLoyaltyConfig();
  const subs = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));
  const out = [];
  for (const sub of subs) {
    const [row] = await db
      .select({ n: count() })
      .from(subscriptionDeliveriesTable)
      .where(
        and(
          eq(subscriptionDeliveriesTable.subscriptionId, sub.id),
          eq(subscriptionDeliveriesTable.status, "delivered"),
        ),
      );
    const delivered = Number(row?.n ?? 0);
    const inCycle = delivered % config.loyaltyFreeEveryN;
    out.push({
      subscriptionId: sub.id,
      deliveredCount: delivered,
      freeEveryN: config.loyaltyFreeEveryN,
      deliveriesUntilFree:
        inCycle === 0 ? config.loyaltyFreeEveryN : config.loyaltyFreeEveryN - inCycle,
      premiumUnlockAt: config.premiumUnlockDeliveries,
      deliveriesUntilPremium: Math.max(
        0,
        config.premiumUnlockDeliveries - delivered,
      ),
      premiumUnlocked: delivered >= config.premiumUnlockDeliveries,
    });
  }
  return out;
}

/**
 * Sweep loyalty rules for users with any engagement signal. Idempotent
 * via dedupe keys + awardedAt guards.
 */
export async function runLoyaltyEngineForAll(): Promise<{
  scanned: number;
  triggered: number;
}> {
  const rows = await db.execute<{ user_id: string }>(
    sql`select distinct user_id from (
      select user_id from ${subscriptionsTable}
      union select user_id from ${userProfileTable}
      union select referee_user_id as user_id from ${referralRedemptionsTable}
    ) u`,
  );
  let triggered = 0;
  for (const r of rows.rows ?? []) {
    try {
      const out = await runLoyaltyEngineForUser(r.user_id);
      triggered += out.notifications.length;
    } catch {
      // best-effort sweep; continue
    }
  }
  return { scanned: rows.rows?.length ?? 0, triggered };
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  return db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt));
}
