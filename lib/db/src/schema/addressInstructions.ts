import {
  pgTable,
  serial,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Per-address rider instructions that persist across orders. Keyed by
// (userId, addressLabel) since the front-end currently identifies saved
// addresses by their human label.
export const addressInstructionsTable = pgTable(
  "address_instructions",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    addressLabel: varchar("address_label", { length: 128 }).notNull(),
    instructions: varchar("instructions", { length: 512 }).notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uniq_addr_instructions_user_label").on(
      table.userId,
      table.addressLabel,
    ),
  ],
);

export type AddressInstructions = typeof addressInstructionsTable.$inferSelect;
