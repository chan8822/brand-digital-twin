import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export type SubscriptionCadence = "weekly" | "fortnightly" | "monthly";
export type SubscriptionStatus = "active" | "paused" | "cancelled";
export type DeliveryStatus =
  | "upcoming"
  | "skipped"
  | "delivered"
  | "cancelled";
export type CreditReason =
  | "skipped_delivery"
  | "redemption"
  | "manual_grant";

export interface SubscriptionItem {
  slug: string;
  name: string;
  image: string;
  quantity: number;
  unitPricePaise: number;
  memberId?: number | null;
}

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    cadence: varchar("cadence", { length: 16 })
      .$type<SubscriptionCadence>()
      .notNull(),
    mealsPerDelivery: integer("meals_per_delivery").notNull(),
    deliveryWindow: varchar("delivery_window", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<SubscriptionStatus>()
      .notNull()
      .default("active"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    nextDeliveryAt: timestamp("next_delivery_at", {
      withTimezone: true,
    }).notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    addressLabel: varchar("address_label", { length: 64 }),
    addressLine: varchar("address_line", { length: 256 }),
    city: varchar("city", { length: 64 }),
    pincode: varchar("pincode", { length: 16 }),
    phone: varchar("phone", { length: 32 }),
    pricePerDeliveryPaise: integer("price_per_delivery_paise")
      .notNull()
      .default(0),
    notes: varchar("notes", { length: 512 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_subscriptions_user").on(table.userId)],
);

export const subscriptionMembersTable = pgTable(
  "subscription_members",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    diet: varchar("diet", { length: 16 }).notNull().default("any"),
    allergens: jsonb("allergens").$type<string[]>().notNull().default([]),
    lifestyle: varchar("lifestyle", { length: 32 }),
    spiceLevel: varchar("spice_level", { length: 16 }).default("medium"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_sub_members_sub").on(table.subscriptionId)],
);

export const subscriptionDeliveriesTable = pgTable(
  "subscription_deliveries",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", {
      withTimezone: true,
    }).notNull(),
    deliveryWindow: varchar("delivery_window", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<DeliveryStatus>()
      .notNull()
      .default("upcoming"),
    items: jsonb("items").$type<SubscriptionItem[]>().notNull().default([]),
    orderId: integer("order_id"),
    notes: varchar("notes", { length: 512 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_sub_deliveries_sub").on(table.subscriptionId),
    index("idx_sub_deliveries_scheduled").on(table.scheduledFor),
  ],
);

export const mealCreditsTable = pgTable(
  "meal_credits",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id").references(
      () => subscriptionsTable.id,
      { onDelete: "set null" },
    ),
    deliveryId: integer("delivery_id").references(
      () => subscriptionDeliveriesTable.id,
      { onDelete: "set null" },
    ),
    amount: integer("amount").notNull(),
    reason: varchar("reason", { length: 32 })
      .$type<CreditReason>()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_meal_credits_user").on(table.userId)],
);

export const insertSubscriptionSchema = createInsertSchema(
  subscriptionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;

export const insertSubscriptionMemberSchema = createInsertSchema(
  subscriptionMembersTable,
).omit({ id: true, createdAt: true });
export type InsertSubscriptionMember = z.infer<
  typeof insertSubscriptionMemberSchema
>;
export type SubscriptionMember =
  typeof subscriptionMembersTable.$inferSelect;

export const insertSubscriptionDeliverySchema = createInsertSchema(
  subscriptionDeliveriesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSubscriptionDelivery = z.infer<
  typeof insertSubscriptionDeliverySchema
>;
export type SubscriptionDelivery =
  typeof subscriptionDeliveriesTable.$inferSelect;

export type MealCredit = typeof mealCreditsTable.$inferSelect;
