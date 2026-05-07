import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export interface GroupOrderLine {
  lineId: string;
  dishId: number;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
  customizations: string[];
  addedBy: string;
  addedByName: string;
}

export const groupOrdersTable = pgTable("group_orders", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 8 }).notNull().unique(),
  hostUserId: varchar("host_user_id").references(() => usersTable.id),
  hostName: varchar("host_name", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("open"),
  items: jsonb("items").notNull().$type<GroupOrderLine[]>().default([]),
  participants: jsonb("participants")
    .notNull()
    .$type<Array<{ id: string; name: string }>>()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export type GroupOrder = typeof groupOrdersTable.$inferSelect;
