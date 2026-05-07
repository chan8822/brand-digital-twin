import { pgTable, serial, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => usersTable.id),
  status: varchar("status", { length: 32 }).notNull().default("placed"),
  totalPaise: integer("total_paise").notNull(),
  addressLabel: varchar("address_label", { length: 64 }),
  addressLine: varchar("address_line", { length: 256 }),
  city: varchar("city", { length: 64 }),
  pincode: varchar("pincode", { length: 16 }),
  phone: varchar("phone", { length: 32 }),
  items: jsonb("items").notNull().$type<Array<{ id: number; name: string; qty: number; price: number }>>(),
  riderId: integer("rider_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
