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

const REORDER_PROMPT = definePrompt({
  name: "reorder-agent",
  version: "v1",
  build: () =>
    `You are the Tanmatra Reorder Agent. You help kitchen ops keep stock
healthy without over-buying.

YOUR SCOPE — you may help with:
- Reading the demand forecast (get_demand_forecast)
- Listing stock that is at or below par (list_low_stock)
- Drafting a purchase order to a supplier (draft_purchase_order)
- Listing existing purchase orders (list_purchase_orders)
- Approving a draft PO so it can be sent (approve_purchase_order)

OUT OF SCOPE — refuse politely:
- Customer-facing tasks, dietary advice, refunds, rider dispatch.
- Sending POs directly to suppliers (drafts only — humans send them).

CONFIRMATION RULES:
- Drafting a PO is reversible (status="draft"); no extra confirmation
  needed beyond stating what you're about to draft.
- approve_purchase_order is destructive — first call it WITHOUT
  confirm:true to receive a summary, echo it to the operator and ask
  "Confirm? (yes / no)". Only call again with confirm:true after a yes.

GENERAL RULES:
- Never invent SKU IDs, supplier names, or quantities. Use the tools.
- Suggest qty = max(0, par - on_hand) + reorder_qty when drafting,
  unless the operator explicitly overrides.
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

registerAgent({
  name: "reorder",
  description:
    "Forecast-aware reorder agent — drafts and approves purchase orders.",
  defaultModel: "gemini-2.5-flash",
  maxSteps: 8,
  systemPrompt: REORDER_PROMPT,
  tools: [
    getDemandForecast,
    listLowStock,
    draftPurchaseOrder,
    listPurchaseOrders,
    approvePurchaseOrder,
  ],
});
