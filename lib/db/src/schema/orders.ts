import { index, pgTable, serial, varchar, integer, timestamp, jsonb, uniqueIndex, doublePrecision } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";
import { ridersTable } from "./riders";
import { deliverySlotsTable } from "./deliverySlots";
import { pickupLocationsTable } from "./pickupLocations";

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").references(() => usersTable.id),
    externalOrderId: varchar("external_order_id", { length: 64 }),
    status: varchar("status", { length: 32 }).notNull().default("placed"),
    totalPaise: integer("total_paise").notNull(),
    addressLabel: varchar("address_label", { length: 64 }),
    addressLine: varchar("address_line", { length: 256 }),
    city: varchar("city", { length: 64 }),
    pincode: varchar("pincode", { length: 16 }),
    phone: varchar("phone", { length: 32 }),
    // Real geocoded drop coordinates from the customer address.
    // Populated at checkout (see geocodeAddress / finalizeOrder) so the
    // dispatcher computes real distances and batching radii instead of
    // synthesising a (lat,lng) from the pincode prefix. Nullable so legacy
    // rows and pickup orders (no delivery address) remain valid; the
    // backfill script in scripts/src/backfill-order-coords.ts fills these
    // in for historical rows.
    dropLat: doublePrecision("drop_lat"),
    dropLng: doublePrecision("drop_lng"),
    items: jsonb("items").notNull().$type<Array<{ id: number; name: string; qty: number; price: number }>>(),
    riderId: integer("rider_id").references(() => ridersTable.id, { onDelete: "set null" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    deliverySlotId: integer("delivery_slot_id").references(() => deliverySlotsTable.id, { onDelete: "set null" }),
    pickupLocationId: integer("pickup_location_id").references(() => pickupLocationsTable.id, { onDelete: "set null" }),
    fulfillmentType: varchar("fulfillment_type", { length: 16 }).notNull().default("delivery"),
    ecoPackagingOptIn: integer("eco_packaging_opt_in").notNull().default(0),
    deliveryInstructions: varchar("delivery_instructions", { length: 512 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uniq_orders_user_external")
      .on(table.userId, table.externalOrderId)
      .where(sql`external_order_id is not null`),
    // Postgres does NOT auto-index FK columns. These three indexes back
    // the most common access patterns:
    //   - "my orders" page (filter by user, sort by createdAt desc)
    //   - ops dashboards (filter by status, sort by createdAt desc)
    //   - rider load heuristics (filter by riderId)
    index("idx_orders_user_created").on(table.userId, table.createdAt.desc()),
    index("idx_orders_status_created").on(table.status, table.createdAt.desc()),
    index("idx_orders_rider").on(table.riderId),
  ],
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
