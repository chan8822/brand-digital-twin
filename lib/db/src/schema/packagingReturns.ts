import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Eco-packaging program. A row is created when a customer opts in at
// checkout (status = "opted_in"). On the next delivery the rider scans the
// returned container — status flips to "returned" and a credit is issued
// (status = "credited"). Default credit amount is 2000 paise (Rs. 20).
//
// One row per order — re-running checkout finalize for the same order must
// not create duplicate credit-eligible rows.
export const packagingReturnsTable = pgTable(
  "packaging_returns",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    orderId: integer("order_id").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("opted_in"),
    creditPaise: integer("credit_paise").notNull().default(2000),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    creditedAt: timestamp("credited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("uniq_packaging_return_order").on(table.orderId)],
);

export type PackagingReturn = typeof packagingReturnsTable.$inferSelect;
