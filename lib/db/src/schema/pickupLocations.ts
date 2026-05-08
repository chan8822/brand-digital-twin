import {
  pgTable,
  serial,
  varchar,
  integer,
  doublePrecision,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// Partner-operated pickup spots near the customer (cafés, kiosks). Choosing
// pickup at checkout swaps the rider hop for a customer self-pickup and
// applies a flat per-order discount.
export const pickupLocationsTable = pgTable("pickup_locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  partnerName: varchar("partner_name", { length: 128 }),
  addressLine: varchar("address_line", { length: 256 }).notNull(),
  city: varchar("city", { length: 64 }).notNull(),
  pincode: varchar("pincode", { length: 16 }).notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  hours: varchar("hours", { length: 128 }),
  discountPaise: integer("discount_paise").notNull().default(3000),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PickupLocation = typeof pickupLocationsTable.$inferSelect;
