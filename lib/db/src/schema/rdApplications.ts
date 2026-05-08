import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  text,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

export type RdApplicationPath = "partner" | "advisory" | "both";
export type RdApplicationStatus =
  | "new"
  | "contacted"
  | "approved"
  | "rejected";
export type RdNotifyPref = "daily" | "weekly" | "critical";

export const rdApplicationsTable = pgTable(
  "rd_applications",
  {
    id: serial("id").primaryKey(),
    path: varchar("path", { length: 16 })
      .$type<RdApplicationPath>()
      .notNull(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    email: varchar("email", { length: 200 }).notNull(),
    credentials: varchar("credentials", { length: 200 }).notNull(),
    registrationBody: varchar("registration_body", { length: 120 }),
    registrationNumber: varchar("registration_number", { length: 80 }),
    yearsExperience: integer("years_experience").notNull(),
    specializations: jsonb("specializations")
      .$type<string[]>()
      .notNull()
      .default([]),
    cityRegion: varchar("city_region", { length: 200 }).notNull(),
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    practiceSetting: varchar("practice_setting", { length: 32 }).notNull(),
    clientVolumeBucket: varchar("client_volume_bucket", { length: 32 }),
    interests: jsonb("interests").$type<string[]>().notNull().default([]),
    bio: text("bio"),
    whatsappCountryCode: varchar("whatsapp_country_code", { length: 8 }),
    whatsappPhone: varchar("whatsapp_phone", { length: 20 }),
    whatsappVerifiedAt: timestamp("whatsapp_verified_at", {
      withTimezone: true,
    }),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    notifyPref: varchar("notify_pref", { length: 16 })
      .$type<RdNotifyPref>()
      .notNull()
      .default("weekly"),
    status: varchar("status", { length: 16 })
      .$type<RdApplicationStatus>()
      .notNull()
      .default("new"),
    adminNotes: text("admin_notes"),
    reviewedBy: varchar("reviewed_by", { length: 128 }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** When the applicant chooses to attach an account, this is the
     * `users.id` they signed in as; the matching `rd_users` row holds
     * the slug. */
    linkedUserId: varchar("linked_user_id", { length: 128 }),
    linkedRdSlug: varchar("linked_rd_slug", { length: 64 }),
    /** Submission origin (so admins can see where the lead came from). */
    submitClientIp: varchar("submit_client_ip", { length: 64 }),
    submitUserAgent: varchar("submit_user_agent", { length: 400 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_rd_app_status_created").on(t.status, t.createdAt),
    uniqueIndex("uq_rd_app_email").on(t.email),
  ],
);

export type RdApplication = typeof rdApplicationsTable.$inferSelect;
export type InsertRdApplication = typeof rdApplicationsTable.$inferInsert;

/** Verified WhatsApp opt-ins. Persisted separately so future broadcast
 * tooling can rely on a single canonical opt-in registry independent of
 * the originating application row. */
export const rdWhatsappOptinsTable = pgTable(
  "rd_whatsapp_optins",
  {
    id: serial("id").primaryKey(),
    countryCode: varchar("country_code", { length: 8 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceApplicationId: integer("source_application_id"),
    notifyPref: varchar("notify_pref", { length: 16 })
      .$type<RdNotifyPref>()
      .notNull()
      .default("weekly"),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_rd_whatsapp_phone").on(t.countryCode, t.phone),
    index("idx_rd_whatsapp_pref").on(t.notifyPref),
  ],
);

export type RdWhatsappOptin = typeof rdWhatsappOptinsTable.$inferSelect;

/** Lightweight funnel-event log for the wizard. We intentionally keep
 * this in its own small table (not aiRuns) — it's a product analytics
 * stream, not an AI-call audit. */
export const rdWizardEventsTable = pgTable(
  "rd_wizard_events",
  {
    id: serial("id").primaryKey(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    eventName: varchar("event_name", { length: 64 }).notNull(),
    step: integer("step"),
    applicationId: integer("application_id"),
    extra: jsonb("extra").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_rd_wiz_event_name_created").on(t.eventName, t.createdAt),
    index("idx_rd_wiz_session").on(t.sessionId),
  ],
);

export type RdWizardEvent = typeof rdWizardEventsTable.$inferSelect;
