import { Router, type IRouter, type Request, type Response } from "express";
import type { ModelMessage } from "ai";
import {
  db,
  forecastSnapshotsTable,
  inventoryItemsTable,
  kitchenStockTable,
  purchaseOrdersTable,
  purchaseOrderLinesTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import {
  computeForecast,
  forecastMape,
  persistForecastSnapshots,
  backfillActuals,
  type Granularity,
} from "../lib/forecast";
import { recommendReorder, exportPurchaseOrderCsv } from "../lib/reorder";
import { runAgent, type GatewayEvent } from "../lib/ai";

const router: IRouter = Router();

function resolveOps(req: Request): { allowed: boolean; operatorId: string | null } {
  const adminToken = process.env["RD_ADMIN_TOKEN"];
  const headerToken = req.header("x-admin-token");
  if (adminToken && headerToken && headerToken === adminToken) {
    return { allowed: true, operatorId: req.user?.id ?? "admin-token" };
  }
  const allowlist = (process.env["OPS_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (req.isAuthenticated() && allowlist.includes(req.user.id)) {
    return { allowed: true, operatorId: req.user.id };
  }
  return { allowed: false, operatorId: null };
}

function gate(req: Request, res: Response): { operatorId: string | null } | null {
  const { allowed, operatorId } = resolveOps(req);
  if (!allowed) {
    res.status(403).json({ error: "ops scope required" });
    return null;
  }
  return { operatorId };
}

router.get("/forecasting/forecast", async (req: Request, res: Response) => {
  if (!gate(req, res)) return;
  const zone = typeof req.query.zone === "string" ? req.query.zone : undefined;
  const lookback = parseInt(String(req.query.lookbackDays ?? "28"), 10) || 28;
  const granularity: Granularity =
    req.query.granularity === "hour" ? "hour" : "daypart";
  const rows = await computeForecast({
    zone,
    lookbackDays: lookback,
    granularity,
  });
  res.json({ forecast: rows, granularity });
});

router.post("/forecasting/snapshots/run", async (req: Request, res: Response) => {
  if (!gate(req, res)) return;
  const zone = typeof req.body?.zone === "string" ? req.body.zone : undefined;
  const result = await persistForecastSnapshots({ zone });
  res.json(result);
});

router.post(
  "/forecasting/snapshots/backfill-actuals",
  async (req: Request, res: Response) => {
    if (!gate(req, res)) return;
    const sinceDays =
      parseInt(String(req.body?.sinceDays ?? "14"), 10) || 14;
    const result = await backfillActuals({ sinceDays });
    res.json(result);
  },
);

router.get("/forecasting/recommend-reorder", async (req: Request, res: Response) => {
  if (!gate(req, res)) return;
  const zone = typeof req.query.zone === "string" ? req.query.zone : undefined;
  const horizon = req.query.horizonDays
    ? parseInt(String(req.query.horizonDays), 10)
    : undefined;
  const result = await recommendReorder({ zone, horizonDays: horizon });
  res.json(result);
});

router.get("/forecasting/snapshots", async (req: Request, res: Response) => {
  if (!gate(req, res)) return;
  const sinceDays = parseInt(String(req.query.sinceDays ?? "14"), 10) || 14;
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const rows = await db
    .select()
    .from(forecastSnapshotsTable)
    .where(gte(forecastSnapshotsTable.forDate, since))
    .orderBy(desc(forecastSnapshotsTable.forDate));
  res.json({ snapshots: rows });
});

router.get("/forecasting/accuracy", async (req: Request, res: Response) => {
  if (!gate(req, res)) return;
  const sinceDays =
    parseInt(String(req.query.sinceDays ?? "30"), 10) || 30;
  const rows = await forecastMape({ sinceDays });
  res.json({ mape: rows });
});

router.get("/forecasting/stock", async (req: Request, res: Response) => {
  if (!gate(req, res)) return;
  const lowOnly = req.query.lowOnly === "true";
  const conds: SQL[] = [];
  if (lowOnly) {
    conds.push(lte(kitchenStockTable.onHandQty, kitchenStockTable.parLevel));
  }
  const baseQuery = db
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
    );
  const rows = await (conds.length > 0 ? baseQuery.where(and(...conds)) : baseQuery)
    .orderBy(asc(kitchenStockTable.onHandQty));
  res.json({ stock: rows });
});

router.get("/forecasting/purchase-orders", async (req: Request, res: Response) => {
  if (!gate(req, res)) return;
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const baseQuery = db.select().from(purchaseOrdersTable);
  const rows = await (status
    ? baseQuery.where(eq(purchaseOrdersTable.status, status))
    : baseQuery)
    .orderBy(desc(purchaseOrdersTable.createdAt))
    .limit(50);
  res.json({ purchaseOrders: rows });
});

router.get(
  "/forecasting/purchase-orders/:id/export.csv",
  async (req: Request, res: Response) => {
    if (!gate(req, res)) return;
    const id = parseInt(String(req.params["id"]), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const allowDraft = req.query.allowDraft === "true";
    const out = await exportPurchaseOrderCsv(id, { allowDraft });
    if ("error" in out) {
      if (out.error === "not-found") {
        res.status(404).json({ error: "not found" });
      } else {
        res.status(409).json({
          error: `PO is ${out.status}; only approved POs may be exported (pass allowDraft=true to override).`,
        });
      }
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${out.filename}"`,
    );
    res.send(out.csv);
  },
);

router.get(
  "/forecasting/purchase-orders/:id",
  async (req: Request, res: Response) => {
    if (!gate(req, res)) return;
    const id = parseInt(String(req.params["id"]), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const [po] = await db
      .select()
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.id, id))
      .limit(1);
    if (!po) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const lines = await db
      .select({
        id: purchaseOrderLinesTable.id,
        inventoryItemId: purchaseOrderLinesTable.inventoryItemId,
        qty: purchaseOrderLinesTable.qty,
        unit: purchaseOrderLinesTable.unit,
        unitPricePaise: purchaseOrderLinesTable.unitPricePaise,
        lineTotalPaise: purchaseOrderLinesTable.lineTotalPaise,
        product: inventoryItemsTable.product,
      })
      .from(purchaseOrderLinesTable)
      .innerJoin(
        inventoryItemsTable,
        eq(purchaseOrderLinesTable.inventoryItemId, inventoryItemsTable.id),
      )
      .where(eq(purchaseOrderLinesTable.purchaseOrderId, id));
    res.json({ purchaseOrder: po, lines });
  },
);

interface ChatTurn {
  role: "user" | "agent";
  text: string;
}

interface ChatBody {
  message: string;
  history?: ChatTurn[];
}

function writeEvent(res: Response, event: object): void {
  res.write(`${JSON.stringify(event)}\n`);
}

router.post("/forecasting/agent/chat", async (req: Request, res: Response) => {
  const auth = gate(req, res);
  if (!auth) return;
  const body = req.body as ChatBody;
  if (!body?.message || typeof body.message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const messages: ModelMessage[] = [
    ...((body.history ?? []).map(
      (m): ModelMessage => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }),
    )),
    { role: "user", content: body.message.trim() },
  ];

  const onEvent = (event: GatewayEvent) => {
    switch (event.type) {
      case "text-delta":
        writeEvent(res, { type: "text-delta", delta: event.delta });
        break;
      case "tool-call":
        writeEvent(res, { type: "tool-call", name: event.name, args: event.args });
        break;
      case "tool-result":
        writeEvent(res, { type: "tool-result", name: event.name, result: event.result });
        break;
      case "finish":
        writeEvent(res, {
          type: "finish",
          text: event.text,
          toolCalls: event.toolCalls.map((t) => ({
            name: t.name,
            args: t.input,
            result: t.output,
            ok: t.ok,
            ms: t.ms,
          })),
          escalated: event.escalated,
        });
        break;
      case "error":
        writeEvent(res, { type: "error", message: event.message });
        break;
      case "refusal":
        break;
    }
  };

  try {
    await runAgent({
      agent: "reorder",
      userId: auth.operatorId,
      isOps: true,
      messages,
      stream: true,
      onEvent,
    });
    res.end();
  } catch (err) {
    req.log.error({ err }, "reorder-agent error");
    writeEvent(res, { type: "error", message: "Reorder agent failed." });
    writeEvent(res, {
      type: "finish",
      text: "Sorry, the Reorder Agent ran into an error.",
      toolCalls: [],
      escalated: false,
    });
    res.end();
  }
});

export default router;
