import { z } from "zod/v4";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import {
  db,
  inventoryItemsTable,
  kitchenStockTable,
  purchaseOrdersTable,
  purchaseOrderLinesTable,
} from "@workspace/db";
import { definePrompt } from "../prompts";
import { defineTool } from "../tools";
import { registerAgent } from "../agentRegistry";
import { recordOpsAction } from "../../opsAudit";
import { computeForecast } from "../../forecast";
import { recommendReorder, exportPurchaseOrderCsv } from "../../reorder";

const REORDER_PROMPT = definePrompt({
  name: "reorder-agent",
  version: "v1",
  build: () =>
    `You are the Tanmatra Reorder Agent. You help kitchen ops keep stock
healthy without over-buying.

YOUR SCOPE — you may help with:
- Reading the demand forecast (get_demand_forecast)
- Listing stock that is at or below par (list_low_stock)
- Generating concrete reorder recommendations from stock + forecast
  + lead times (recommend_reorder)
- Drafting a purchase order to a supplier (draft_purchase_order)
- Listing existing purchase orders (list_purchase_orders)
- Approving a draft PO so it can be sent (approve_purchase_order)
- Exporting an approved PO to CSV for the buyer to email
  (export_purchase_order_csv)

OUT OF SCOPE — refuse politely:
- Customer-facing tasks, dietary advice, refunds, rider dispatch.
- Sending POs directly to suppliers (we only export — humans send).

PREFERRED FLOW:
1. recommend_reorder → review the suggested lines.
2. draft_purchase_order with those lines (one call per supplier).
3. approve_purchase_order (two-step confirmation).
4. export_purchase_order_csv to hand off to the buyer.

CONFIRMATION RULES:
- Drafting a PO is reversible (status="draft"); no extra confirmation.
- approve_purchase_order is destructive — first call it WITHOUT
  confirm:true to receive a summary, echo it to the operator and ask
  "Confirm? (yes / no)". Only call again with confirm:true after a yes.

GENERAL RULES:
- Never invent SKU IDs, supplier names, or quantities. Use the tools.
- EVERY tool call MUST include a \`reasoning\` arg. It is stored in the
  audit log alongside operator id and parameters.`,
});

const getDemandForecast = defineTool({
  name: "get_demand_forecast",
  description:
    "Read the rolling-average demand forecast for an upcoming day, optionally filtered by zone.",
  inputSchema: z.object({
    zone: z.string().optional(),
    lookbackDays: z.number().int().min(7).max(90).optional(),
    reasoning: z.string().min(3),
  }),
  authScope: "ops",
  handler: async ({ zone, lookbackDays, reasoning }, ctx) => {
    const rows = await computeForecast({ zone, lookbackDays });
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "get_demand_forecast",
      params: { zone: zone ?? null, lookbackDays: lookbackDays ?? null },
      beforeState: null,
      afterState: { rowCount: rows.length },
      status: "success",
      reasoning,
    });
    // Trim to top 25 to keep token usage reasonable.
    return { success: true as const, forecast: rows.slice(0, 25) };
  },
});

const listLowStock = defineTool({
  name: "list_low_stock",
  description:
    "List kitchen stock rows currently at or below their par level, joined with inventory item details.",
  inputSchema: z.object({
    zone: z.string().optional(),
    reasoning: z.string().min(3),
  }),
  authScope: "ops",
  handler: async ({ zone, reasoning }, ctx) => {
    const conds = [
      lte(kitchenStockTable.onHandQty, kitchenStockTable.parLevel),
    ];
    if (zone) conds.push(eq(kitchenStockTable.zone, zone));
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
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "list_low_stock",
      params: { zone: zone ?? null },
      beforeState: null,
      afterState: { rowCount: rows.length },
      status: "success",
      reasoning,
    });
    return { success: true as const, lowStock: rows };
  },
});

const draftPurchaseOrder = defineTool({
  name: "draft_purchase_order",
  description:
    "Draft a purchase order with one or more SKU lines. Status starts at 'draft' and requires a separate approve_purchase_order call.",
  inputSchema: z.object({
    supplierName: z.string().min(2),
    supplierEmail: z.string().email().optional(),
    zone: z.string().optional(),
    etaDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "etaDate must be YYYY-MM-DD")
      .optional(),
    notes: z.string().optional(),
    lines: z
      .array(
        z.object({
          inventoryItemId: z.number().int().positive(),
          qty: z.number().positive(),
          unit: z.string().default("kg"),
          unitPricePaise: z.number().int().nonnegative(),
        }),
      )
      .min(1),
    reasoning: z.string().min(3),
  }),
  authScope: "ops",
  handler: async (
    { supplierName, supplierEmail, zone, etaDate, notes, lines, reasoning },
    ctx,
  ) => {
    // Verify all inventory items exist before opening the txn.
    const itemIds = Array.from(new Set(lines.map((l) => l.inventoryItemId)));
    const items = await db
      .select({ id: inventoryItemsTable.id })
      .from(inventoryItemsTable)
      .where(inArray(inventoryItemsTable.id, itemIds));
    const known = new Set(items.map((i) => i.id));
    const unknown = itemIds.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      return {
        success: false as const,
        error: `Unknown inventory item ids: ${unknown.join(", ")}`,
      };
    }

    const totalPaise = lines.reduce(
      (sum, l) => sum + Math.round(l.qty * l.unitPricePaise),
      0,
    );

    const created = await db.transaction(async (tx) => {
      const [po] = await tx
        .insert(purchaseOrdersTable)
        .values({
          supplierName,
          supplierEmail: supplierEmail ?? null,
          zone: zone ?? "default",
          status: "draft",
          totalPaise,
          etaDate: etaDate ?? null,
          notes: notes ?? null,
          createdBy: ctx.userId ?? "reorder-agent",
        })
        .returning();
      if (!po) throw new Error("PO insert returned no row");
      const lineRows = lines.map((l) => ({
        purchaseOrderId: po.id,
        inventoryItemId: l.inventoryItemId,
        qty: l.qty,
        unit: l.unit,
        unitPricePaise: l.unitPricePaise,
        lineTotalPaise: Math.round(l.qty * l.unitPricePaise),
      }));
      await tx.insert(purchaseOrderLinesTable).values(lineRows);
      await recordOpsAction(
        {
          operatorId: ctx.userId,
          agent: ctx.agent,
          action: "draft_purchase_order",
          params: { supplierName, zone: zone ?? "default", lineCount: lines.length },
          beforeState: null,
          afterState: { purchaseOrderId: po.id, totalPaise },
          status: "success",
          reasoning,
        },
        tx,
      );
      return po;
    });

    return {
      success: true as const,
      purchaseOrderId: created.id,
      status: created.status,
      totalPaise,
      lineCount: lines.length,
    };
  },
});

const listPurchaseOrders = defineTool({
  name: "list_purchase_orders",
  description: "List recent purchase orders, optionally filtered by status.",
  inputSchema: z.object({
    status: z.enum(["draft", "approved", "sent", "cancelled"]).optional(),
    limit: z.number().int().positive().max(50).optional(),
    reasoning: z.string().min(3),
  }),
  authScope: "ops",
  handler: async ({ status, limit, reasoning }, ctx) => {
    const baseQuery = db.select().from(purchaseOrdersTable);
    const rows = await (status
      ? baseQuery.where(eq(purchaseOrdersTable.status, status))
      : baseQuery)
      .orderBy(desc(purchaseOrdersTable.createdAt))
      .limit(limit ?? 20);
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "list_purchase_orders",
      params: { status: status ?? null, limit: limit ?? null },
      beforeState: null,
      afterState: { rowCount: rows.length },
      status: "success",
      reasoning,
    });
    return { success: true as const, purchaseOrders: rows };
  },
});

const approvePurchaseOrder = defineTool({
  name: "approve_purchase_order",
  description:
    "Approve a draft purchase order. DESTRUCTIVE — requires confirm:true on the second call.",
  inputSchema: z.object({
    purchaseOrderId: z.number().int().positive(),
    reasoning: z.string().min(3),
    confirm: z.boolean().optional(),
  }),
  authScope: "ops",
  handler: async ({ purchaseOrderId, reasoning, confirm }, ctx) => {
    const [po] = await db
      .select()
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, purchaseOrderId))
      .limit(1);
    if (!po) {
      return { success: false as const, error: "PO not found" };
    }
    if (po.status !== "draft") {
      return {
        success: false as const,
        error: `PO is already ${po.status}; only drafts can be approved.`,
      };
    }
    if (!confirm) {
      return {
        requiresConfirmation: true as const,
        summary: `Will approve PO #${po.id} to ${po.supplierName} for ₹${(po.totalPaise / 100).toFixed(2)}. Call again with confirm:true to apply.`,
      };
    }
    const before = { status: po.status };
    await db.transaction(async (tx) => {
      await tx
        .update(purchaseOrdersTable)
        .set({
          status: "approved",
          approvedBy: ctx.userId ?? "reorder-agent",
          approvedAt: new Date(),
        })
        .where(eq(purchaseOrdersTable.id, purchaseOrderId));
      await recordOpsAction(
        {
          operatorId: ctx.userId,
          agent: ctx.agent,
          action: "approve_purchase_order",
          params: { purchaseOrderId },
          beforeState: before,
          afterState: { status: "approved" },
          status: "success",
          reasoning,
        },
        tx,
      );
    });
    return { success: true as const, purchaseOrderId, status: "approved" };
  },
});

const recommendReorderTool = defineTool({
  name: "recommend_reorder",
  description:
    "Compute concrete reorder recommendations: for each low-stock SKU in scope, qty = max(par - on_hand, 0) + reorder_qty, scaled up if forecast demand over the lead-time window exceeds the gap. Returns ready-to-use PO lines grouped by supplier.",
  inputSchema: z.object({
    zone: z.string().optional(),
    horizonDays: z.number().int().min(1).max(14).optional(),
    reasoning: z.string().min(3),
  }),
  authScope: "ops",
  handler: async ({ zone, horizonDays, reasoning }, ctx) => {
    const result = await recommendReorder({ zone, horizonDays });
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "recommend_reorder",
      params: { zone: zone ?? null, horizonDays: horizonDays ?? null },
      beforeState: null,
      afterState: { supplierCount: result.bySupplier.length },
      status: "success",
      reasoning,
    });
    return { success: true as const, ...result };
  },
});

const exportPurchaseOrderCsvTool = defineTool({
  name: "export_purchase_order_csv",
  description:
    "Export an approved (or draft) PO as CSV the buyer can email or attach. Returns the CSV string and a stable filename.",
  inputSchema: z.object({
    purchaseOrderId: z.number().int().positive(),
    allowDraft: z.boolean().optional(),
    reasoning: z.string().min(3),
  }),
  authScope: "ops",
  handler: async ({ purchaseOrderId, allowDraft, reasoning }, ctx) => {
    const exported = await exportPurchaseOrderCsv(purchaseOrderId, {
      allowDraft,
    });
    if ("error" in exported) {
      return {
        success: false as const,
        error:
          exported.error === "not-found"
            ? "PO not found"
            : `PO is ${exported.status}; only approved POs may be exported (set allowDraft:true to override).`,
      };
    }
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "export_purchase_order_csv",
      params: { purchaseOrderId },
      beforeState: null,
      afterState: { filename: exported.filename, bytes: exported.csv.length },
      status: "success",
      reasoning,
    });
    return { success: true as const, ...exported };
  },
});

registerAgent({
  name: "reorder",
  description:
    "Forecast-aware reorder agent — recommends, drafts, approves, and exports purchase orders.",
  defaultModel: "gemini-2.5-flash",
  maxSteps: 8,
  systemPrompt: REORDER_PROMPT,
  tools: [
    getDemandForecast,
    listLowStock,
    recommendReorderTool,
    draftPurchaseOrder,
    listPurchaseOrders,
    approvePurchaseOrder,
    exportPurchaseOrderCsvTool,
  ],
});
