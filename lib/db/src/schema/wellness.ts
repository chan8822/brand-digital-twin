import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  date,
  uniqueIndex,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";

export type NutritionLogSource =
  | "auto_order"
  | "manual"
  | "water"
  | "wearable_adjust";

export const nutritionLogsTable = pgTable(
  "nutrition_logs",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    loggedFor: date("logged_for").notNull(),
    source: varchar("source", { length: 24 })
      .$type<NutritionLogSource>()
      .notNull()
      .default("manual"),
    label: varchar("label", { length: 128 }).notNull(),
    calories: integer("calories").notNull().default(0),
    proteinGrams: integer("protein_grams").notNull().default(0),
    carbsGrams: integer("carbs_grams").notNull().default(0),
    fatGrams: integer("fat_grams").notNull().default(0),
    fiberGrams: integer("fiber_grams").notNull().default(0),
    waterMl: integer("water_ml").notNull().default(0),
    vegServings: integer("veg_servings").notNull().default(0),
    orderId: integer("order_id"),
    dedupeKey: varchar("dedupe_key", { length: 96 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_nutrition_logs_dedupe")
      .on(table.userId, table.dedupeKey)
      .where(sql`dedupe_key is not null`),
    index("idx_nutrition_logs_user_day").on(table.userId, table.loggedFor),
  ],
);

export type NutritionLog = typeof nutritionLogsTable.$inferSelect;

export const dailyTargetsTable = pgTable("daily_targets", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  calorieTarget: integer("calorie_target").notNull().default(2000),
  proteinTargetGrams: integer("protein_target_grams").notNull().default(80),
  fiberTargetGrams: integer("fiber_target_grams").notNull().default(28),
  waterTargetMl: integer("water_target_ml").notNull().default(2500),
  vegTargetServings: integer("veg_target_servings").notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type DailyTargets = typeof dailyTargetsTable.$inferSelect;

export type WearableProvider = "apple_health" | "google_fit";

export const wearableLinksTable = pgTable(
  "wearable_links",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 24 })
      .$type<WearableProvider>()
      .notNull(),
    connected: boolean("connected").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastActivityKcal: integer("last_activity_kcal"),
    lastSteps: integer("last_steps"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_wearable_links_user_provider").on(
      table.userId,
      table.provider,
    ),
  ],
);

export type WearableLink = typeof wearableLinksTable.$inferSelect;

export type StreakKind = "protein" | "veg";

export const streaksTable = pgTable(
  "streaks",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).$type<StreakKind>().notNull(),
    currentDays: integer("current_days").notNull().default(0),
    bestDays: integer("best_days").notNull().default(0),
    lastDayHit: date("last_day_hit"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uniq_streaks_user_kind").on(table.userId, table.kind),
  ],
);

export type Streak = typeof streaksTable.$inferSelect;
