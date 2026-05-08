/**
 * B2B office lunch planner & account health agent (Task #39).
 *
 * - team_diet_profiles: aggregated team dietary constraints captured by a
 *   B2B admin via the diet survey. One per company.
 * - lunch_plan_proposals: weekly menu proposal (5 weekdays) produced by
 *   the planner agent. Idempotent per (company, week_start_date).
 * - account_health_snapshots: daily-recomputable score for each B2B
 *   account with deterministic drivers + AI commentary.
 * - qbr_drafts: AI-drafted quarterly business review the sales rep can
 *   edit and export.
 */
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { companiesTable } from "./corporate";

export type LunchPlanStatus = "draft" | "approved" | "scheduled";
export type AccountRiskLevel = "healthy" | "watch" | "at_risk" | "critical";
export type QbrStatus = "draft" | "approved" | "exported";

export interface TeamDietConstraints {
  /** total people on the lunch programme */
  headcount: number;
  /** % of team that prefers vegetarian (informational; vegCount is the cap) */
  vegPct: number;
  /** absolute counts that must be satisfied per meal */
  vegCount: number;
  veganCount: number;
  glutenFreeCount: number;
  jainCount: number;
  halalCount: number;
  /** team-wide hard exclusions */
  allergens: string[];
  /** preferred cuisine tags, used for variety */
  cuisinePrefs: string[];
  /** kcal floor/ceiling for any single meal */
  calorieFloor: number | null;
  calorieCeiling: number | null;
  /** free-text constraints the planner should respect */
  notes: string;
}

export interface LunchPlanDay {
  date: string; // YYYY-MM-DD
  /** menu items chosen for the day, with the constraints they satisfy */
  picks: Array<{
    menuItemId: number;
    slug: string;
    name: string;
    why: string;
  }>;
  /** flags for constraints we couldn't fully satisfy (informational) */
  warnings: string[];
}

export interface LunchPlan {
  weekStartDate: string; // YYYY-MM-DD (Monday)
  days: LunchPlanDay[];
  summary: string;
  modelId: string;
  generatedBy: "ai" | "deterministic";
}

export interface AccountHealthDrivers {
  /** office orders in the last 30 days vs prior 30 days */
  ordersLast30: number;
  ordersPrev30: number;
  ordersTrendPct: number; // negative = declining
  activeMembers: number;
  totalMembers: number;
  memberActivationPct: number;
  /** budget utilization for the current month, 0..1 */
  budgetUtilization: number;
  /** days since the last office order */
  daysSinceLastOrder: number | null;
  /** whether a team diet profile exists */
  hasDietProfile: boolean;
}

export interface QbrSection {
  title: string;
  body: string;
}

export interface QbrChart {
  /** simple bar series the frontend renders inline; no heavy charting */
  title: string;
  unit: string;
  series: Array<{ label: string; value: number }>;
}

export interface QbrPayload {
  sections: QbrSection[];
  charts: QbrChart[];
  modelId: string;
}

export const teamDietProfilesTable = pgTable(
  "team_diet_profiles",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    constraints: jsonb("constraints")
      .notNull()
      .$type<TeamDietConstraints>(),
    lastSurveyAt: timestamp("last_survey_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("uq_team_diet_company").on(t.companyId)],
);

export const lunchPlanProposalsTable = pgTable(
  "lunch_plan_proposals",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    weekStartDate: date("week_start_date").notNull(),
    plan: jsonb("plan").notNull().$type<LunchPlan>(),
    status: varchar("status", { length: 16 })
      .notNull()
      .default("draft")
      .$type<LunchPlanStatus>(),
    scheduledOfficeOrderIds: jsonb("scheduled_office_order_ids")
      .notNull()
      .$type<number[]>()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_lunch_plan_company_week").on(t.companyId, t.weekStartDate),
  ],
);

export const accountHealthSnapshotsTable = pgTable(
  "account_health_snapshots",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    score: integer("score").notNull(),
    riskLevel: varchar("risk_level", { length: 16 })
      .notNull()
      .$type<AccountRiskLevel>(),
    drivers: jsonb("drivers").notNull().$type<AccountHealthDrivers>(),
    commentary: text("commentary").notNull().default(""),
    modelId: varchar("model_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_health_company_date").on(t.companyId, t.snapshotDate),
    index("idx_health_risk").on(t.riskLevel, t.snapshotDate),
  ],
);

export const qbrDraftsTable = pgTable(
  "qbr_drafts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    payload: jsonb("payload").notNull().$type<QbrPayload>(),
    status: varchar("status", { length: 16 })
      .notNull()
      .default("draft")
      .$type<QbrStatus>(),
    editedBy: varchar("edited_by", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_qbr_company_period").on(
      t.companyId,
      t.periodStart,
      t.periodEnd,
    ),
  ],
);

export type TeamDietProfile = typeof teamDietProfilesTable.$inferSelect;
export type LunchPlanProposal = typeof lunchPlanProposalsTable.$inferSelect;
export type AccountHealthSnapshot =
  typeof accountHealthSnapshotsTable.$inferSelect;
export type QbrDraft = typeof qbrDraftsTable.$inferSelect;
