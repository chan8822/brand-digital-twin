import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { inventoryItemsTable } from "./inventory";

export const kitchenStockTable = pgTable(
  "kitchen_stock",
  {
    id: serial("id").primaryKey(),
    inventoryItemId: integer("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
    zone: varchar("zone", { length: 64 }).notNull().default("default"),
    onHandQty: doublePrecision("on_hand_qty").notNull().default(0),
    unit: varchar("unit", { length: 32 }).notNull().default("kg"),
    parLevel: doublePrecision("par_level").notNull().default(0),
    reorderQty: doublePrecision("reorder_qty").notNull().default(0),
    leadTimeDays: integer("lead_time_days").notNull().default(2),
    supplierName: varchar("supplier_name", { length: 128 }),
    supplierEmail: varchar("supplier_email", { length: 128 }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uniq_kitchen_stock_item_zone").on(
      table.inventoryItemId,
      table.zone,
    ),
  ],
);

export type KitchenStock = typeof kitchenStockTable.$inferSelect;

export const purchaseOrdersTable = pgTable(
  "purchase_orders",
  {
    id: serial("id").primaryKey(),
    supplierName: varchar("supplier_name", { length: 128 }).notNull(),
    supplierEmail: varchar("supplier_email", { length: 128 }),
    zone: varchar("zone", { length: 64 }).notNull().default("default"),
    status: varchar("status", { length: 32 }).notNull().default("draft"),
    totalPaise: integer("total_paise").notNull().default(0),
    etaDate: date("eta_date"),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 128 }),
    approvedBy: varchar("approved_by", { length: 128 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_po_status_created").on(table.status, table.createdAt)],
);

export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;

export const purchaseOrderLinesTable = pgTable("purchase_order_lines", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id")
    .notNull()
    .references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
  inventoryItemId: integer("inventory_item_id")
    .notNull()
    .references(() => inventoryItemsTable.id),
  qty: doublePrecision("qty").notNull(),
  unit: varchar("unit", { length: 32 }).notNull().default("kg"),
  unitPricePaise: integer("unit_price_paise").notNull().default(0),
  lineTotalPaise: integer("line_total_paise").notNull().default(0),
});

export type PurchaseOrderLine = typeof purchaseOrderLinesTable.$inferSelect;

/**
 * One row per (date, daypart, zone, dish) — captures forecast issued at the
 * start of the period and is later updated with the actual sold count so we
 * can report MAPE per SKU per zone.
 */
export const forecastSnapshotsTable = pgTable(
  "forecast_snapshots",
  {
    id: serial("id").primaryKey(),
    forDate: date("for_date").notNull(),
    daypart: varchar("daypart", { length: 16 }).notNull(),
    zone: varchar("zone", { length: 64 }).notNull(),
    dishSlug: varchar("dish_slug", { length: 128 }).notNull(),
    forecastQty: doublePrecision("forecast_qty").notNull(),
    actualQty: doublePrecision("actual_qty"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_forecast_date_daypart_zone_dish").on(
      table.forDate,
      table.daypart,
      table.zone,
      table.dishSlug,
    ),
    index("idx_forecast_for_date").on(table.forDate),
  ],
);

export type ForecastSnapshot = typeof forecastSnapshotsTable.$inferSelect;
