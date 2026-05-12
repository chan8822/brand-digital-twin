import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage. Used by the phone-OTP auth flow (Twilio Verify) — sessions
// are looked up by `sid` cookie / Bearer token. Required by the auth lib.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    // `withTimezone: true` to match every other timestamp column in
    // the codebase. Drizzle emits `timestamp with time zone`.
    expire: timestamp("expire", { withTimezone: true }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users are identified by their verified phone number (E.164). `email` is now
// optional and only set when the user explicitly adds one in their profile.
//
// Attribution + consent columns (added Phase 2 of CUJ audit):
//
//   signupSource / utm*   — Captured ONCE at user creation (verify-otp). Used
//                           by AI bidding / channel-mix analysis later. We
//                           never overwrite on subsequent sign-ins so the
//                           "first touch" semantics are preserved — that's
//                           usually the more meaningful attribution signal
//                           for low-frequency commerce like food orders.
//
//   referralCode          — Friend-referral code captured from `?ref=…`. Same
//                           first-touch semantics as UTMs.
//
//   marketingSmsConsent / dpdpConsent / tosAcceptedVersion
//                         — DPDP Act 2023 audit-trail. Each is the timestamp
//                           the user explicitly opted in / accepted; null
//                           means no consent on file. tosAcceptedVersion lets
//                           us prompt for re-acceptance when the doc changes.
//
// All new columns are nullable / default-null to make the migration safe for
// the existing prod row set (no `NOT NULL` backfill needed).
export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneE164: varchar("phone_e164").unique(),
  phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  // Attribution (first-touch — never overwritten after creation).
  signupSource: varchar("signup_source", { length: 32 }),
  utmSource: varchar("utm_source", { length: 64 }),
  utmMedium: varchar("utm_medium", { length: 64 }),
  utmCampaign: varchar("utm_campaign", { length: 128 }),
  referralCode: varchar("referral_code", { length: 64 }),
  // Consent ledger (DPDP Act 2023 audit-trail).
  marketingSmsConsentAt: timestamp("marketing_sms_consent_at", { withTimezone: true }),
  dpdpConsentAt: timestamp("dpdp_consent_at", { withTimezone: true }),
  tosAcceptedVersion: varchar("tos_accepted_version", { length: 16 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
