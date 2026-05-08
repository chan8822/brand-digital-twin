import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

// Customer reviews per dish (slug-keyed so reviews survive menu_items churn).
export const dishReviewsTable = pgTable(
  "dish_reviews",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").references(() => usersTable.id),
    slug: varchar("slug", { length: 128 }).notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull().default(""),
    photoUrl: varchar("photo_url", { length: 1024 }),
    sentiment: jsonb("sentiment").$type<{
      polarity: "pos" | "neu" | "neg";
      themes?: string[];
    } | null>(),
    hidden: integer("hidden").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_dish_reviews_slug").on(table.slug, table.createdAt)],
);

// AI-generated summary per dish, regenerated periodically.
export const dishReviewSummariesTable = pgTable("dish_review_summaries", {
  slug: varchar("slug", { length: 128 }).primaryKey(),
  mostLoved: text("most_loved").notNull().default(""),
  commonGripe: text("common_gripe").notNull().default(""),
  trend: varchar("trend", { length: 32 }).notNull().default("stable"),
  sampleSize: integer("sample_size").notNull().default(0),
  averageRating: integer("average_rating_x10").notNull().default(0),
  modelId: varchar("model_id", { length: 64 }).notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Each "menu engineering run" is a snapshot of how the catalog performed in a
// time window. We keep history so editors can compare runs over time.
export const menuEngineeringRunsTable = pgTable("menu_engineering_runs", {
  id: serial("id").primaryKey(),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  modelId: varchar("model_id", { length: 64 }).notNull(),
  totalDishes: integer("total_dishes").notNull().default(0),
  totalOrders: integer("total_orders").notNull().default(0),
});

// Per-dish stats + AI commentary inside a run. classification is the
// star/plowhorse/puzzle/dog quadrant from popularity x margin.
export const menuEngineeringDishStatsTable = pgTable(
  "menu_engineering_dish_stats",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => menuEngineeringRunsTable.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 128 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    ordersCount: integer("orders_count").notNull().default(0),
    unitsSold: integer("units_sold").notNull().default(0),
    revenuePaise: integer("revenue_paise").notNull().default(0),
    marginPaise: integer("margin_paise").notNull().default(0),
    popularityScore: integer("popularity_score_x100").notNull().default(0),
    marginScore: integer("margin_score_x100").notNull().default(0),
    classification: varchar("classification", { length: 16 }).notNull(),
    recommendation: varchar("recommendation", { length: 16 }).notNull(),
    commentary: text("commentary").notNull().default(""),
  },
  (table) => [
    uniqueIndex("uniq_me_dish_stats_run_slug").on(table.runId, table.slug),
  ],
);

// Pricing suggestions are advisory: editors must approve to apply.
export const pricingSuggestionsTable = pgTable(
  "pricing_suggestions",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id").references(() => menuEngineeringRunsTable.id, {
      onDelete: "set null",
    }),
    slug: varchar("slug", { length: 128 }).notNull(),
    zone: varchar("zone", { length: 32 }).notNull().default("all"),
    daypart: varchar("daypart", { length: 32 }).notNull().default("all"),
    currentPaise: integer("current_paise").notNull(),
    suggestedPaise: integer("suggested_paise").notNull(),
    expectedRevenueDeltaPctLow: integer("expected_revenue_delta_pct_low_x10")
      .notNull()
      .default(0),
    expectedRevenueDeltaPctHigh: integer("expected_revenue_delta_pct_high_x10")
      .notNull()
      .default(0),
    rationale: text("rationale").notNull().default(""),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    decidedBy: varchar("decided_by").references(() => usersTable.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_pricing_suggestions_status").on(table.status, table.createdAt),
    index("idx_pricing_suggestions_slug").on(table.slug),
  ],
);

export type DishReview = typeof dishReviewsTable.$inferSelect;
export type DishReviewSummary = typeof dishReviewSummariesTable.$inferSelect;
export type MenuEngineeringRun = typeof menuEngineeringRunsTable.$inferSelect;
export type MenuEngineeringDishStat =
  typeof menuEngineeringDishStatsTable.$inferSelect;
export type PricingSuggestion = typeof pricingSuggestionsTable.$inferSelect;

export type DishClassification = "star" | "plowhorse" | "puzzle" | "dog";
export type DishRecommendation = "promote" | "reprice" | "retire" | "hold";
export type PricingSuggestionStatus = "pending" | "approved" | "dismissed";
