import { index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Server-side rate-limit counters. Replaces the previous in-memory Map so
 * limits survive restart and apply across replicas. Keys embed the action
 * scope (e.g. `auth:otp:ip:1.2.3.4`, `auth:otp:ph:+91…`).
 */
export const rateLimitsTable = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 256 }).primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limits_reset_at_idx").on(table.resetAt)],
);
