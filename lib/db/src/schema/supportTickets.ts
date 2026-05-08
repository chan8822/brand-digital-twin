import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const supportTicketsTable = pgTable(
  "support_tickets",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 128 }),
    orderId: integer("order_id"),
    channel: varchar("channel", { length: 16 }).notNull().default("web"),
    subject: varchar("subject", { length: 200 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("new"),
    category: varchar("category", { length: 32 }),
    priority: varchar("priority", { length: 16 }),
    team: varchar("team", { length: 16 }),
    triageRunId: integer("triage_run_id"),
    triageReason: text("triage_reason"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    draftReply: text("draft_reply"),
    draftCitations: jsonb("draft_citations")
      .$type<string[]>()
      .notNull()
      .default([]),
    draftRunId: integer("draft_run_id"),
    draftedAt: timestamp("drafted_at", { withTimezone: true }),
    sentReply: text("sent_reply"),
    sentBy: varchar("sent_by", { length: 128 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    rejectedBy: varchar("rejected_by", { length: 128 }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_support_tickets_status_created").on(
      table.status,
      table.createdAt,
    ),
    index("idx_support_tickets_team_priority").on(table.team, table.priority),
    index("idx_support_tickets_user_created").on(table.userId, table.createdAt),
  ],
);

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type InsertSupportTicket = typeof supportTicketsTable.$inferInsert;

export const SUPPORT_CATEGORIES = [
  "delivery",
  "refund",
  "modification",
  "allergen",
  "subscription",
  "billing",
  "feedback",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_TEAMS = ["care", "ops", "kitchen", "rd", "billing"] as const;
export type SupportTeam = (typeof SUPPORT_TEAMS)[number];

export const SUPPORT_STATUSES = [
  "new",
  "triaged",
  "awaiting_human",
  "sent",
  "rejected",
  "resolved",
] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
