import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Saved natural-language analytics questions and their generated SQL +
// chart spec. We persist for reuse and audit (every query is read-only,
// allowlisted-column-only).
export const analyticsQueriesTable = pgTable(
  "analytics_queries",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 }),
    question: text("question").notNull(),
    sql: text("sql").notNull(),
    chartSpec: jsonb("chart_spec").$type<{
      kind: "bar" | "line" | "area" | "table" | "pie";
      xKey?: string;
      yKey?: string;
      seriesKey?: string;
      title?: string;
    }>(),
    rationale: text("rationale"),
    rowCount: integer("row_count").default(0).notNull(),
    saved: integer("saved").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_analytics_queries_created").on(t.createdAt)],
);
export type AnalyticsQuery = typeof analyticsQueriesTable.$inferSelect;

// Weekly business review snapshots. One per ISO week (Mon-anchored).
export const wbrReportsTable = pgTable(
  "wbr_reports",
  {
    id: serial("id").primaryKey(),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    weekEnd: timestamp("week_end", { withTimezone: true }).notNull(),
    kpis: jsonb("kpis")
      .notNull()
      .$type<{
        orders: number;
        ordersPrev: number;
        revenuePaise: number;
        revenuePaisePrev: number;
        activeCustomers: number;
        activeCustomersPrev: number;
        avgOrderPaise: number;
        topDishes: Array<{ name: string; units: number }>;
        anomaliesFired: number;
      }>(),
    chartSpec: jsonb("chart_spec").$type<{
      revenueByDay: Array<{ day: string; revenuePaise: number }>;
      ordersByDay: Array<{ day: string; orders: number }>;
    }>(),
    commentary: text("commentary").notNull(),
    modelId: varchar("model_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uniq_wbr_week").on(t.weekStart)],
);
export type WbrReport = typeof wbrReportsTable.$inferSelect;

// Voice-of-customer themes extracted weekly from reviews + support
// conversations + (future) NPS comments.
export const vocThemesTable = pgTable(
  "voc_themes",
  {
    id: serial("id").primaryKey(),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    weekEnd: timestamp("week_end", { withTimezone: true }).notNull(),
    theme: varchar("theme", { length: 128 }).notNull(),
    sentiment: varchar("sentiment", { length: 16 }).notNull(), // positive|negative|mixed
    mentionCount: integer("mention_count").notNull().default(0),
    exampleQuotes: jsonb("example_quotes")
      .notNull()
      .$type<Array<{ source: string; body: string }>>(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_voc_themes_week").on(t.weekStart),
    uniqueIndex("uniq_voc_week_theme").on(t.weekStart, t.theme),
  ],
);
export type VocTheme = typeof vocThemesTable.$inferSelect;
