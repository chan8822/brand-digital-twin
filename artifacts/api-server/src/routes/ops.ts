import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  inventoryItemsTable,
  packagingItemsTable,
  recipesTable,
  recipeIngredientsTable,
} from "@workspace/db";
import { asc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import {
  ackAlert,
  buildDailyDigest,
  closeAlert,
  listAlerts,
  runAnomalyScan,
  snoozeAlert,
} from "../lib/anomalies";

const router: IRouter = Router();

function isOpsRequest(req: Request): boolean {
  const adminToken = process.env["RD_ADMIN_TOKEN"];
  const headerToken = req.header("x-admin-token");
  if (adminToken && headerToken && headerToken === adminToken) return true;
  const allowlist = (process.env["OPS_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (req.isAuthenticated() && allowlist.includes(req.user.id)) return true;
  return false;
}

function requireOps(req: Request, res: Response): boolean {
  if (!isOpsRequest(req)) {
    res.status(403).json({ error: "ops scope required" });
    return false;
  }
  return true;
}

router.get("/anomalies", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const status = (typeof req.query.status === "string" ? req.query.status : "active") as
    | "open"
    | "ack"
    | "snoozed"
    | "closed"
    | "active";
  const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
  const rows = await listAlerts({ status, limit });
  res.json({ rows });
});

router.post("/anomalies/scan", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const results = await runAnomalyScan();
  res.json({ results });
});

const idParam = z.object({ id: z.coerce.number().int().positive() });
const snoozeBody = z.object({
  minutes: z.number().int().positive().max(24 * 60),
});

router.post("/anomalies/:id/ack", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const parsed = idParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const row = await ackAlert(parsed.data.id, req.user?.id ?? null);
  if (!row) {
    res.status(404).json({ error: "alert not found" });
    return;
  }
  res.json({ alert: row });
});

router.post("/anomalies/:id/snooze", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const idP = idParam.safeParse(req.params);
  const bodyP = snoozeBody.safeParse(req.body);
  if (!idP.success || !bodyP.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const row = await snoozeAlert(
    idP.data.id,
    bodyP.data.minutes,
    req.user?.id ?? null,
  );
  if (!row) {
    res.status(404).json({ error: "alert not found" });
    return;
  }
  res.json({ alert: row });
});

router.post("/anomalies/:id/close", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const parsed = idParam.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const row = await closeAlert(parsed.data.id, req.user?.id ?? null);
  if (!row) {
    res.status(404).json({ error: "alert not found" });
    return;
  }
  res.json({ alert: row });
});

router.get("/anomalies/digest", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const digest = await buildDailyDigest();
  res.json(digest);
});

router.get("/packaging", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(packagingItemsTable)
    .orderBy(asc(packagingItemsTable.itemNo));
  res.json({ items: rows });
});

router.get("/measurements", (_req: Request, res: Response) => {
  res.json({
    weight: {
      base: { kg: 1, gm: 1000 },
      conversions: [
        { name: "1 cup", grams: 120 },
        { name: "1/2 cup", grams: 60 },
        { name: "1/4 cup", grams: 30 },
        { name: "1 tablespoon", grams: 8 },
        { name: "1/2 tablespoon", grams: 4 },
        { name: "1 teaspoon", grams: 3 },
        { name: "1/2 teaspoon", grams: 1.5 },
      ],
    },
    volume: {
      base: { ltr: 1, ml: 1000 },
      conversions: [
        { name: "1 cup", ml: 240 },
        { name: "1/2 cup", ml: 120 },
        { name: "1/4 cup", ml: 60 },
        { name: "1 tablespoon", ml: 15 },
        { name: "1/2 tablespoon", ml: 7.5 },
        { name: "1 teaspoon", ml: 5 },
        { name: "1/2 teaspoon", ml: 2.5 },
      ],
    },
  });
});

router.get("/inventory", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const baseQuery = db.select().from(inventoryItemsTable);
  const rows = q
    ? await baseQuery
        .where(ilike(inventoryItemsTable.product, `%${q}%`))
        .orderBy(asc(inventoryItemsTable.itemNo))
    : await baseQuery.orderBy(asc(inventoryItemsTable.itemNo));
  res.json({ items: rows });
});

router.get("/recipes", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const baseQuery = db
    .select({
      id: recipesTable.id,
      recipeNo: recipesTable.recipeNo,
      name: recipesTable.name,
      slug: recipesTable.slug,
      servingSize: recipesTable.servingSize,
      foodCostPaise: recipesTable.foodCostPaise,
    })
    .from(recipesTable);
  const rows = q
    ? await baseQuery
        .where(or(ilike(recipesTable.name, `%${q}%`), ilike(recipesTable.slug, `%${q}%`)))
        .orderBy(asc(recipesTable.recipeNo))
    : await baseQuery.orderBy(asc(recipesTable.recipeNo));
  res.json({ recipes: rows });
});

router.get("/recipes/:slug", async (req: Request, res: Response) => {
  const [recipe] = await db
    .select()
    .from(recipesTable)
    .where(eq(recipesTable.slug, String(req.params["slug"] ?? "")))
    .limit(1);
  if (!recipe) {
    res.status(404).json({ error: "recipe not found" });
    return;
  }
  const ingredients = await db
    .select()
    .from(recipeIngredientsTable)
    .where(eq(recipeIngredientsTable.recipeId, recipe.id))
    .orderBy(asc(recipeIngredientsTable.position));
  res.json({ recipe, ingredients });
});

export default router;
