import { pgTable, serial, integer, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { ridersTable } from "./riders";

export const deliveryEventsTable = pgTable("delivery_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  riderId: integer("rider_id").references(() => ridersTable.id),
  event: varchar("event", { length: 64 }).notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDeliveryEventSchema = createInsertSchema(deliveryEventsTable).omit({ id: true, createdAt: true });
export type InsertDeliveryEvent = z.infer<typeof insertDeliveryEventSchema>;
export type DeliveryEvent = typeof deliveryEventsTable.$inferSelect;
