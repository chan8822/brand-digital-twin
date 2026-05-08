import {
  pgTable,
  varchar,
  integer,
  text,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

/**
 * Cache of AI-generated "why this meal" rationales per (user, dish, brief
 * version). The brief hash is a sha256 over the redacted UserBrief subset
 * that actually influences the rationale (preferences, goal, allergens,
 * recent order names, calorie/protein targets). When the brief changes,
 * the hash changes and a fresh rationale is generated lazily.
 */
export const dishRationalesTable = pgTable(
  "dish_rationales",
  {
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    dishId: integer("dish_id").notNull(),
    briefHash: varchar("brief_hash", { length: 64 }).notNull(),
    rationale: text("rationale").notNull(),
    expanded: text("expanded").notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.dishId, table.briefHash] }),
    index("idx_dish_rationales_user").on(table.userId),
  ],
);

export type DishRationale = typeof dishRationalesTable.$inferSelect;
export type InsertDishRationale = typeof dishRationalesTable.$inferInsert;
