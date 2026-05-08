import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";

export type AddonCategory = "drink" | "snack" | "supplement" | "juice";

export const addonsTable = pgTable("addons", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description").notNull().default(""),
  category: varchar("category", { length: 32 })
    .$type<AddonCategory>()
    .notNull(),
  pricePaise: integer("price_paise").notNull(),
  image: varchar("image", { length: 512 }),
  rdVerified: boolean("rd_verified").notNull().default(false),
  premiumOnly: boolean("premium_only").notNull().default(false),
  // Pairs well with carts that contain dishes carrying any of these tags
  // (e.g. "fitness", "breakfast", "lunch", "vegan").
  recommendedFor: jsonb("recommended_for").$type<string[]>().notNull().default([]),
  macros: jsonb("macros").$type<{
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null>(),
  isActive: boolean("is_active").notNull().default(true),
});

export const orderAddonsTable = pgTable(
  "order_addons",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    addonId: integer("addon_id")
      .notNull()
      .references(() => addonsTable.id),
    qty: integer("qty").notNull().default(1),
    unitPricePaise: integer("unit_price_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_order_addons_order").on(table.orderId)],
);

export const insertAddonSchema = createInsertSchema(addonsTable).omit({
  id: true,
});
export type InsertAddon = z.infer<typeof insertAddonSchema>;
export type Addon = typeof addonsTable.$inferSelect;
export type OrderAddon = typeof orderAddonsTable.$inferSelect;
