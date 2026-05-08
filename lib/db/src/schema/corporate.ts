import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export type CompanyMemberRole = "admin" | "member";
export type CompanyMemberStatus = "invited" | "active" | "removed";
export type OfficeOrderStatus = "open" | "closed" | "delivered" | "cancelled";
export type VoucherStatus = "active" | "redeemed" | "cancelled";

export interface OfficeOrderAddress {
  label?: string;
  line: string;
  city: string;
  pincode: string;
  phone?: string;
}

export interface OfficeOrderPick {
  userId: string;
  userName: string;
  pickedAt: string;
  items: Array<{
    dishId: number;
    name: string;
    image: string;
    unitPrice: number;
    quantity: number;
  }>;
  totalPaise: number;
}

export const companiesTable = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    ownerUserId: varchar("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    perEmployeeMonthlyBudgetPaise: integer("per_employee_monthly_budget_paise")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uniq_companies_slug").on(table.slug),
    index("idx_companies_owner").on(table.ownerUserId),
  ],
);

export const companyMembersTable = pgTable(
  "company_members",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    email: varchar("email", { length: 256 }).notNull(),
    role: varchar("role", { length: 16 })
      .notNull()
      .default("member")
      .$type<CompanyMemberRole>(),
    status: varchar("status", { length: 16 })
      .notNull()
      .default("invited")
      .$type<CompanyMemberStatus>(),
    inviteToken: varchar("invite_token", { length: 64 }),
    perEmployeeBudgetPaiseOverride: integer(
      "per_employee_budget_paise_override",
    ),
    invitedAt: timestamp("invited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uniq_company_members_company_email").on(
      table.companyId,
      table.email,
    ),
    uniqueIndex("uniq_company_members_invite_token").on(table.inviteToken),
    index("idx_company_members_user").on(table.userId),
  ],
);

export const companyBudgetUsageTable = pgTable(
  "company_budget_usage",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    periodMonth: varchar("period_month", { length: 7 }).notNull(), // yyyy-mm
    spentPaise: integer("spent_paise").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uniq_company_budget_usage_period").on(
      table.companyId,
      table.userId,
      table.periodMonth,
    ),
  ],
);

export const officeOrdersTable = pgTable(
  "office_orders",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    createdByUserId: varchar("created_by_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 128 }).notNull(),
    address: jsonb("address").notNull().$type<OfficeOrderAddress>(),
    perEmployeeBudgetPaise: integer("per_employee_budget_paise")
      .notNull()
      .default(0),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    windowClosesAt: timestamp("window_closes_at", {
      withTimezone: true,
    }).notNull(),
    status: varchar("status", { length: 16 })
      .notNull()
      .default("open")
      .$type<OfficeOrderStatus>(),
    picks: jsonb("picks").notNull().$type<OfficeOrderPick[]>().default([]),
    totalPaise: integer("total_paise").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_office_orders_company").on(table.companyId)],
);

export const vouchersTable = pgTable(
  "vouchers",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 24 }).notNull(),
    amountPaise: integer("amount_paise").notNull(),
    purchasedByUserId: varchar("purchased_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    recipientEmail: varchar("recipient_email", { length: 256 }),
    recipientName: varchar("recipient_name", { length: 128 }),
    message: varchar("message", { length: 512 }),
    status: varchar("status", { length: 16 })
      .notNull()
      .default("active")
      .$type<VoucherStatus>(),
    redeemedByUserId: varchar("redeemed_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_vouchers_code").on(table.code),
    index("idx_vouchers_purchaser").on(table.purchasedByUserId),
  ],
);

export type Company = typeof companiesTable.$inferSelect;
export type CompanyMember = typeof companyMembersTable.$inferSelect;
export type CompanyBudgetUsage = typeof companyBudgetUsageTable.$inferSelect;
export type OfficeOrder = typeof officeOrdersTable.$inferSelect;
export type Voucher = typeof vouchersTable.$inferSelect;
