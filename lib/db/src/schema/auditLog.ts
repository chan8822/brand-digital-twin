import { index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Immutable audit trail for sensitive operations — RD patient reads, admin
 * moderation actions, clinical override submissions, and PHI access events.
 * Rows are INSERT-only; no UPDATE or DELETE is ever issued against this table.
 */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    // Who performed the action — userId (consumer), adminUsername, or rdId.
    actorId: varchar("actor_id", { length: 128 }).notNull(),
    // "user" | "rd" | "admin" | "system"
    actorRole: varchar("actor_role", { length: 32 }).notNull(),
    // e.g. "rd.patient_read" | "admin.review_hide" | "admin.post_hide"
    //      "admin.rd_application_approve" | "clinical.override_submitted"
    action: varchar("action", { length: 64 }).notNull(),
    // e.g. "patient_profile" | "dish_review" | "challenge_post"
    resourceType: varchar("resource_type", { length: 64 }),
    // The ID of the affected resource (userId, reviewId, postId, etc.)
    resourceId: varchar("resource_id", { length: 128 }),
    // Originating IP for forensic attribution.
    ipAddress: varchar("ip_address", { length: 64 }),
    // Optional extra context (e.g. { reason: "allergen conflict" }).
    meta: text("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_actor_created_idx").on(table.actorId, table.createdAt),
    index("audit_log_action_created_idx").on(table.action, table.createdAt),
    index("audit_log_resource_idx").on(table.resourceType, table.resourceId),
  ],
);

export type AuditLog = typeof auditLogTable.$inferSelect;
export type InsertAuditLog = typeof auditLogTable.$inferInsert;
