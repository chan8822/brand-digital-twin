import { pgTable, serial, varchar, integer, text, jsonb } from "drizzle-orm/pg-core";

export const bundlesTable = pgTable("bundles", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description").notNull().default(""),
  badge: varchar("badge", { length: 32 }),
  pricePaise: integer("price_paise").notNull(),
  originalPricePaise: integer("original_price_paise").notNull(),
  dishIds: jsonb("dish_ids").notNull().$type<number[]>(),
  image: varchar("image", { length: 512 }),
});

export type Bundle = typeof bundlesTable.$inferSelect;
