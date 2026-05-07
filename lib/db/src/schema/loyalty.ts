import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

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

export const referralCodesTable = pgTable(
  "referral_codes",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_referral_codes_code").on(table.code),
    uniqueIndex("uniq_referral_codes_user").on(table.userId),
  ],
);

export const referralRedemptionsTable = pgTable(
  "referral_redemptions",
  {
    id: serial("id").primaryKey(),
    codeId: integer("code_id")
      .notNull()
      .references(() => referralCodesTable.id, { onDelete: "cascade" }),
    referrerUserId: varchar("referrer_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    refereeUserId: varchar("referee_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    refereeAwardPaise: integer("referee_award_paise").notNull(),
    referrerAwardPaise: integer("referrer_award_paise").notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }),
    firstOrderId: varchar("first_order_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_referral_redemptions_referee").on(table.refereeUserId),
    index("idx_referral_redemptions_referrer").on(table.referrerUserId),
  ],
);

export const creditLedgerTable = pgTable(
  "credit_ledger",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    deltaPaise: integer("delta_paise").notNull(),
    reason: varchar("reason", { length: 32 })
      .$type<CreditLedgerReason>()
      .notNull(),
    refType: varchar("ref_type", { length: 32 }),
    refId: varchar("ref_id", { length: 64 }),
    note: varchar("note", { length: 256 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_credit_ledger_user").on(table.userId)],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).$type<NotificationKind>().notNull(),
    title: varchar("title", { length: 128 }).notNull(),
    body: varchar("body", { length: 512 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull().default("in_app"),
    status: varchar("status", { length: 16 })
      .$type<NotificationStatus>()
      .notNull()
      .default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    dedupeKey: varchar("dedupe_key", { length: 128 }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_notifications_user").on(table.userId),
    uniqueIndex("uniq_notifications_dedupe").on(table.userId, table.dedupeKey),
  ],
);

export const userProfileTable = pgTable("user_profile", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  birthDate: date("birth_date"),
  anniversaryDate: date("anniversary_date"),
  proteinGoalGrams: integer("protein_goal_grams"),
  lastNutritionLogAt: timestamp("last_nutrition_log_at", {
    withTimezone: true,
  }),
  proteinShortfallStreak: integer("protein_shortfall_streak")
    .notNull()
    .default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const orderClaimsTable = pgTable(
  "loyalty_order_claims",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    orderId: varchar("order_id", { length: 64 }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_loyalty_order_claims").on(table.userId, table.orderId),
  ],
);

export const loyaltyConfigTable = pgTable("loyalty_config", {
  id: integer("id").primaryKey(),
  referrerAwardPaise: integer("referrer_award_paise").notNull(),
  refereeAwardPaise: integer("referee_award_paise").notNull(),
  referralExpiryDays: integer("referral_expiry_days").notNull(),
  winbackPausedDays: integer("winback_paused_days").notNull(),
  winbackOfferPaise: integer("winback_offer_paise").notNull(),
  birthdayPaise: integer("birthday_paise").notNull(),
  anniversaryPaise: integer("anniversary_paise").notNull(),
  loyaltyFreeEveryN: integer("loyalty_free_every_n").notNull(),
  premiumUnlockDeliveries: integer("premium_unlock_deliveries").notNull(),
  premiumUnlockBonusPaise: integer("premium_unlock_bonus_paise").notNull(),
  proteinStreakThreshold: integer("protein_streak_threshold").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type LoyaltyConfig = typeof loyaltyConfigTable.$inferSelect;
export type ReferralCode = typeof referralCodesTable.$inferSelect;
export type ReferralRedemption = typeof referralRedemptionsTable.$inferSelect;
export type CreditLedgerEntry = typeof creditLedgerTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
export type UserProfile = typeof userProfileTable.$inferSelect;
