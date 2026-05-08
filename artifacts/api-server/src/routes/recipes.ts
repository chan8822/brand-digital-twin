import { Router, type IRouter, type Request, type Response } from "express";
import {
  ensureRecipeSeeds,
  getRecipeBySlug,
  listRecipes,
} from "../lib/contentRecipes";

const router: IRouter = Router();

router.get("/recipes", async (req: Request, res: Response) => {
  await ensureRecipeSeeds();
  const goal = req.query["goal"] ? String(req.query["goal"]) : undefined;
  const diet = req.query["diet"] ? String(req.query["diet"]) : undefined;
  const maxTime = req.query["maxTime"]
    ? Number(req.query["maxTime"])
    : undefined;
  const q = req.query["q"] ? String(req.query["q"]) : undefined;
  const recipes = await listRecipes({ goal, diet, maxTime, q });
  res.json({ recipes });
});

router.get("/recipes/:slug", async (req: Request, res: Response) => {
  await ensureRecipeSeeds();
  const slug = String(req.params["slug"] ?? "");
  const recipe = await getRecipeBySlug(slug);
  if (!recipe) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ recipe });
});

export default router;
