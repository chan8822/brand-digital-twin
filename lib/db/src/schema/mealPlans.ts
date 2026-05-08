import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  timestamp,
  boolean,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export type MealPlanStatus = "draft" | "accepted" | "scheduled" | "discarded";
export type MealPlanSlot = "breakfast" | "lunch" | "dinner";
export const MEAL_SLOTS: MealPlanSlot[] = ["breakfast", "lunch", "dinner"];

export interface MealPlanSlotEntry {
  dishId: number;
  slug: string;
  name: string;
  image: string;
  pricePaise: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealPlanDay {
  date: string;
  // Slots are optional so the planner can surface a "missing-dish"
  // violation when no allergen-safe candidate exists for a slot,
  // instead of silently injecting an unsafe dish from the catalog.
  breakfast?: MealPlanSlotEntry;
  lunch?: MealPlanSlotEntry;
  dinner?: MealPlanSlotEntry;
}

/**
 * Per-day calendar context that scales daily calorie targets:
 *   gym    → +15% (training day)
 *   travel → light meals, prefer convenience-friendly dishes
 *   wfh    → baseline
 *   normal → baseline
 */
export type WeekDayCalendarKind = "normal" | "gym" | "travel" | "wfh";

export interface MealPlanConstraints {
  dailyCalorieTarget: number | null;
  dailyProteinTargetGrams: number | null;
  weeklyBudgetPaise: number | null;
  maxRepetitionsPerDish: number;
  allergens: string[];
  dietaryStyle: string | null;
  spiceLevel: string | null;
  goal: string | null;
  /** Optional 7-entry array (Mon..Sun) describing the user's week. */
  weekCalendar?: WeekDayCalendarKind[];
}

export interface MealPlanTotals {
  totalPaise: number;
  avgCalories: number;
  avgProteinGrams: number;
  avgCarbsGrams: number;
  avgFatGrams: number;
}

export const mealPlansTable = pgTable(
  "meal_plans",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(),
    status: varchar("status", { length: 16 })
      .$type<MealPlanStatus>()
      .notNull()
      .default("draft"),
    constraints: jsonb("constraints")
      .$type<MealPlanConstraints>()
      .notNull(),
    days: jsonb("days").$type<MealPlanDay[]>().notNull().default([]),
    totals: jsonb("totals").$type<MealPlanTotals>(),
    subscriptionId: integer("subscription_id"),
    model: varchar("model", { length: 64 }),
    notes: varchar("notes", { length: 512 }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_meal_plans_user").on(table.userId),
    uniqueIndex("uq_meal_plans_user_week").on(table.userId, table.weekStartDate),
  ],
);

export type MealPlan = typeof mealPlansTable.$inferSelect;
export type InsertMealPlan = typeof mealPlansTable.$inferInsert;

export const mealPlanSettingsTable = pgTable("meal_plan_settings", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  autoReplanEnabled: boolean("auto_replan_enabled").notNull().default(false),
  weeklyBudgetPaise: integer("weekly_budget_paise"),
  maxRepetitionsPerDish: integer("max_repetitions_per_dish")
    .notNull()
    .default(2),
  lastPlannedWeekStart: date("last_planned_week_start"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type MealPlanSettings = typeof mealPlanSettingsTable.$inferSelect;
export type InsertMealPlanSettings =
  typeof mealPlanSettingsTable.$inferInsert;
