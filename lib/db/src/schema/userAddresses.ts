import {
  pgTable,
  serial,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const userAddressesTable = pgTable(
  "user_addresses",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    type: varchar("type", { length: 16 }).notNull().default("home"),
    line1: varchar("line1", { length: 256 }).notNull(),
    line2: varchar("line2", { length: 256 }),
    city: varchar("city", { length: 128 }).notNull(),
    pincode: varchar("pincode", { length: 16 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_user_addresses_user").on(table.userId)],
);

export type UserAddress = typeof userAddressesTable.$inferSelect;
export type NewUserAddress = typeof userAddressesTable.$inferInsert;
