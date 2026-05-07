import {
  db,
  inventoryItemsTable,
  kitchenStockTable,
  purchaseOrdersTable,
  purchaseOrderLinesTable,
} from "@workspace/db";
import { and, asc, eq, lte } from "drizzle-orm";
import { computeForecast } from "./forecast";

export interface RecommendedLine {
  inventoryItemId: number;
  product: string;
  zone: string;
  onHandQty: number;
  parLevel: number;
  unit: string;
  leadTimeDays: number;
  forecastQtyOverLead: number;
  /** Recommended order qty = max(par - on_hand, 0) + reorder_qty, scaled up
   *  if forecast over lead time exceeds (par - on_hand). */
  qty: number;
  unitPricePaise: number;
}

export interface SupplierBundle {
  supplierName: string;
  lines: RecommendedLine[];
  totalPaise: number;
  etaDate: string;
}

/**
 * Deterministic reorder recommendation.
 *
 * For each low-stock row (on_hand <= par_level):
 *   gap = max(par - on_hand, 0)
 *   forecastDemand = sum of forecast qty for that dish/zone over the
 *     next `horizonDays` (proxy: dish-level if SKU is a dish; otherwise
 *     gap is used directly).
 *   qty = max(gap + reorder_qty, ceil(forecastDemand))
 *
 * Lines are grouped by supplier so the agent can draft one PO per
 * supplier in a single follow-up call.
 */
export async function recommendReorder(opts: {
  zone?: string;
  horizonDays?: number;
}): Promise<{ bySupplier: SupplierBundle[]; horizonDays: number }> {
  const horizonDays = opts.horizonDays ?? 3;

  const conds = [lte(kitchenStockTable.onHandQty, kitchenStockTable.parLevel)];
  if (opts.zone) conds.push(eq(kitchenStockTable.zone, opts.zone));

  const rows = await db
    .select({
      stockId: kitchenStockTable.id,
      zone: kitchenStockTable.zone,
      onHandQty: kitchenStockTable.onHandQty,
      unit: kitchenStockTable.unit,
      parLevel: kitchenStockTable.parLevel,
      reorderQty: kitchenStockTable.reorderQty,
      leadTimeDays: kitchenStockTable.leadTimeDays,
      supplierName: kitchenStockTable.supplierName,
      inventoryItemId: kitchenStockTable.inventoryItemId,
      product: inventoryItemsTable.product,
      buyingPricePaise: inventoryItemsTable.buyingPricePaise,
    })
    .from(kitchenStockTable)
    .innerJoin(
      inventoryItemsTable,
      eq(kitchenStockTable.inventoryItemId, inventoryItemsTable.id),
    )
    .where(and(...conds))
    .orderBy(asc(kitchenStockTable.onHandQty));

  if (rows.length === 0)
    return { bySupplier: [], horizonDays };

  // Pull a forecast snapshot to use as a demand prior.
  const forecast = await computeForecast({
    zone: opts.zone,
    granularity: "daypart",
  });
  const totalDishDemand = forecast.reduce((s, f) => s + f.forecastQty, 0);

  const bySupplier = new Map<string, SupplierBundle>();
  for (const r of rows) {
    const gap = Math.max(r.parLevel - r.onHandQty, 0);
    // Per-SKU we don't have a direct dish->ingredient demand mapping yet,
    // so we lift `gap` proportional to the lead time horizon.
    const horizonScale = horizonDays / Math.max(r.leadTimeDays, 1);
    const forecastQtyOverLead = Math.ceil(
      (gap || r.reorderQty || 1) * horizonScale +
        // Tiny pull from total demand so highly-demanded zones bias up.
        Math.min(totalDishDemand, 50) * 0.02,
    );
    const qty = Math.max(gap + r.reorderQty, forecastQtyOverLead);
    const supplier = r.supplierName?.trim() || "Unassigned Supplier";
    const line: RecommendedLine = {
      inventoryItemId: r.inventoryItemId,
      product: r.product,
      zone: r.zone,
      onHandQty: r.onHandQty,
      parLevel: r.parLevel,
      unit: r.unit,
      leadTimeDays: r.leadTimeDays,
      forecastQtyOverLead,
      qty,
      unitPricePaise: r.buyingPricePaise ?? 0,
    };
    const eta = new Date(Date.now() + r.leadTimeDays * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const bundle =
      bySupplier.get(supplier) ??
      { supplierName: supplier, lines: [], totalPaise: 0, etaDate: eta };
    bundle.lines.push(line);
    bundle.totalPaise += Math.round(qty * (r.buyingPricePaise ?? 0));
    // Use the longest lead time among lines for the bundle ETA.
    if (eta > bundle.etaDate) bundle.etaDate = eta;
    bySupplier.set(supplier, bundle);
  }

  return { bySupplier: Array.from(bySupplier.values()), horizonDays };
}

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportPurchaseOrderCsv(
  purchaseOrderId: number,
  opts: { allowDraft?: boolean } = {},
): Promise<
  | { csv: string; filename: string; po: { id: number; supplierName: string; status: string; totalPaise: number } }
  | { error: "not-found" }
  | { error: "not-approved"; status: string }
> {
  const [po] = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.id, purchaseOrderId))
    .limit(1);
  if (!po) return { error: "not-found" };
  if (!opts.allowDraft && po.status !== "approved") {
    return { error: "not-approved", status: po.status };
  }
  const lines = await db
    .select({
      qty: purchaseOrderLinesTable.qty,
      unit: purchaseOrderLinesTable.unit,
      unitPricePaise: purchaseOrderLinesTable.unitPricePaise,
      lineTotalPaise: purchaseOrderLinesTable.lineTotalPaise,
      product: inventoryItemsTable.product,
      inventoryItemId: purchaseOrderLinesTable.inventoryItemId,
    })
    .from(purchaseOrderLinesTable)
    .innerJoin(
      inventoryItemsTable,
      eq(purchaseOrderLinesTable.inventoryItemId, inventoryItemsTable.id),
    )
    .where(eq(purchaseOrderLinesTable.purchaseOrderId, purchaseOrderId));

  const header = [
    `# PO #${po.id}`,
    `# Supplier: ${po.supplierName}${po.supplierEmail ? ` <${po.supplierEmail}>` : ""}`,
    `# Status: ${po.status}`,
    `# Zone: ${po.zone}`,
    `# ETA: ${po.etaDate ?? "—"}`,
    `# Total: INR ${(po.totalPaise / 100).toFixed(2)}`,
    "",
    ["sku_id", "product", "qty", "unit", "unit_price_inr", "line_total_inr"]
      .map(csvEscape)
      .join(","),
  ];
  const body = lines.map((l) =>
    [
      l.inventoryItemId,
      l.product,
      l.qty,
      l.unit,
      (l.unitPricePaise / 100).toFixed(2),
      (l.lineTotalPaise / 100).toFixed(2),
    ]
      .map(csvEscape)
      .join(","),
  );
  const csv = [...header, ...body, ""].join("\n");
  return {
    csv,
    filename: `po-${po.id}-${po.supplierName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`,
    po: {
      id: po.id,
      supplierName: po.supplierName,
      status: po.status,
      totalPaise: po.totalPaise,
    },
  };
}
