import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export type PremiumStatus = "active" | "cancelled" | "expired";

export const premiumMembershipsTable = pgTable(
  "premium_memberships",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 })
      .$type<PremiumStatus>()
      .notNull()
      .default("active"),
    monthlyPricePaise: integer("monthly_price_paise").notNull().default(99900),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
    }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    rdConsultsUsedThisPeriod: integer("rd_consults_used_this_period")
      .notNull()
      .default(0),
    rdConsultsPerPeriod: integer("rd_consults_per_period")
      .notNull()
      .default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_premium_user").on(table.userId)],
);

// Curated registry of dish slugs that are gated to premium members. Kept
// as a separate table so editors can promote/demote items without altering
// menu_items columns. The frontend overlays a "Premium" badge for any slug
// listed here.
export const premiumMealsTable = pgTable("premium_meals", {
  id: serial("id").primaryKey(),
  dishSlug: varchar("dish_slug", { length: 128 }).notNull().unique(),
  reason: varchar("reason", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPremiumMembershipSchema = createInsertSchema(
  premiumMembershipsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type PremiumMembership = typeof premiumMembershipsTable.$inferSelect;
export type InsertPremiumMembership = z.infer<
  typeof insertPremiumMembershipSchema
>;
export type PremiumMeal = typeof premiumMealsTable.$inferSelect;
