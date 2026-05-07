import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  inventoryItemsTable,
  packagingItemsTable,
  recipesTable,
  recipeIngredientsTable,
} from "@workspace/db";
import { asc, eq, ilike, or } from "drizzle-orm";

const router: IRouter = Router();

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
