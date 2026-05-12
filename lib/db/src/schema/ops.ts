import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const dishAvailabilityTable = pgTable("dish_availability", {
  slug: varchar("slug", { length: 128 }).primaryKey(),
  available: boolean("available").notNull().default(true),
  reason: text("reason"),
  updatedBy: varchar("updated_by", { length: 128 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type DishAvailability = typeof dishAvailabilityTable.$inferSelect;

export const opsActionsTable = pgTable(
  "ops_actions",
  {
    id: serial("id").primaryKey(),
    operatorId: varchar("operator_id", { length: 128 }),
    agent: varchar("agent", { length: 64 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    params: jsonb("params").notNull(),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    status: varchar("status", { length: 32 }).notNull(),
    error: text("error"),
    reasoning: text("reasoning"),
    // Task #7 bulkhead: consumer-side idempotency. The outbox drainer
    // copies ops_audit_outbox.dedupe_key into this column with
    // ON CONFLICT DO NOTHING so concurrent drainers across pods can
    // never produce duplicate ops_actions rows for the same logical
    // event. Nullable for legacy/non-outbox callers (recordOpsAction);
    // Postgres treats NULLs as distinct in unique constraints, so a
    // regular UNIQUE on a nullable column works without a partial
    // predicate. We deliberately avoid a partial unique index because
    // Postgres ON CONFLICT inference cannot target a partial index by
    // column alone — it would require repeating the WHERE clause and
    // drizzle's `target:` builder doesn't emit that.
    dedupeKey: varchar("dedupe_key", { length: 128 }).unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_ops_actions_operator_created").on(
      table.operatorId,
      table.createdAt,
    ),
    index("idx_ops_actions_action_created").on(table.action, table.createdAt),
  ],
);

export type OpsAction = typeof opsActionsTable.$inferSelect;
export type InsertOpsAction = typeof opsActionsTable.$inferInsert;

// Task #7: outbox for the Manual-Mode bulkhead. Override (and any other
// latency-critical staff path) writes a single row here inside its own
// transaction; a background worker drains rows into `ops_actions`. This
// keeps audit-log writes off the override critical path.
//
// `dedupeKey` is producer-side dedupe: if a caller retries, only one
// row materialises. The drain worker uses FOR UPDATE SKIP LOCKED + a
// single-tx insert-then-mark-processed for consumer-side dedupe, so
// the pair gives at-least-once-with-dedupe == effectively-exactly-once.
export const opsAuditOutboxTable = pgTable(
  "ops_audit_outbox",
  {
    id: serial("id").primaryKey(),
    dedupeKey: varchar("dedupe_key", { length: 128 }).notNull().unique(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    // Lease: when a drainer claims a row it stamps claimed_at = now().
    // A separate drainer (different pod) ignores rows whose claim is
    // still fresh; once the lease expires (CLAIM_LEASE_SECONDS) the row
    // becomes claimable again so a crashed drainer can't strand work.
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (table) => [
    // Drain worker query: find unclaimed-or-expired unprocessed rows,
    // oldest first. Composite (processedAt, claimedAt, createdAt) so
    // the planner can range-scan unprocessed rows ordered by claim
    // freshness then age. We deliberately use a regular composite
    // index rather than a partial one so it remains writable from
    // any path (drizzle's index builder doesn't emit WHERE clauses
    // here); index bloat is bounded by the periodic outbox prune.
    index("idx_ops_audit_outbox_drain")
      .on(table.processedAt, table.claimedAt, table.createdAt),
  ],
);

export type OpsAuditOutbox = typeof opsAuditOutboxTable.$inferSelect;
export type InsertOpsAuditOutbox = typeof opsAuditOutboxTable.$inferInsert;
