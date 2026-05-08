import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Reservable delivery time-windows. capacity is the max number of orders the
// kitchen + rider pool can handle in this window for the given zone; the
// reservedCount column is incremented atomically on checkout.
export const deliverySlotsTable = pgTable(
  "delivery_slots",
  {
    id: serial("id").primaryKey(),
    slotDate: date("slot_date").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    zone: varchar("zone", { length: 64 }).notNull().default("default"),
    capacity: integer("capacity").notNull().default(20),
    reservedCount: integer("reserved_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_delivery_slot_zone_window").on(
      table.zone,
      table.startsAt,
      table.endsAt,
    ),
  ],
);

// Reservations are 1:1 with the thing holding the slot. We enforce that
// uniqueness with partial unique indexes so retried writes can't double-
// reserve and inflate the parent slot's reservedCount.
export const slotReservationsTable = pgTable(
  "slot_reservations",
  {
    id: serial("id").primaryKey(),
    slotId: integer("slot_id")
      .notNull()
      .references(() => deliverySlotsTable.id),
    userId: varchar("user_id"),
    orderId: integer("order_id"),
    subscriptionId: integer("subscription_id"),
    kind: varchar("kind", { length: 32 }).notNull().default("order"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_slot_reservation_order")
      .on(table.orderId)
      .where(sql`${table.orderId} is not null`),
    uniqueIndex("uniq_slot_reservation_subscription")
      .on(table.subscriptionId)
      .where(sql`${table.subscriptionId} is not null`),
  ],
);

export type DeliverySlot = typeof deliverySlotsTable.$inferSelect;
export type SlotReservation = typeof slotReservationsTable.$inferSelect;
