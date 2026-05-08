import {
  pgTable,
  serial,
  varchar,
  timestamp,
  doublePrecision,
  jsonb,
  text,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const anomalyAlertsTable = pgTable(
  "anomaly_alerts",
  {
    id: serial("id").primaryKey(),
    metric: varchar("metric", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    value: doublePrecision("value").notNull(),
    baseline: doublePrecision("baseline"),
    threshold: doublePrecision("threshold"),
    deviation: doublePrecision("deviation"),
    dimensions: jsonb("dimensions").$type<Record<string, unknown>>(),
    summary: text("summary").notNull(),
    suggestedAction: text("suggested_action").notNull(),
    ackedBy: varchar("acked_by", { length: 128 }),
    ackedAt: timestamp("acked_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    fingerprint: varchar("fingerprint", { length: 128 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_anomaly_alerts_status_created").on(table.status, table.createdAt),
    index("idx_anomaly_alerts_metric_created").on(table.metric, table.createdAt),
  ],
);

export const insertAnomalyAlertSchema = createInsertSchema(
  anomalyAlertsTable,
).omit({ id: true, createdAt: true });
export type InsertAnomalyAlert = z.infer<typeof insertAnomalyAlertSchema>;
export type AnomalyAlert = typeof anomalyAlertsTable.$inferSelect;
