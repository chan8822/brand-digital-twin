import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  db,
  contentRecipesTable,
  type ContentRecipe,
} from "@workspace/db";

export interface RecipeFilter {
  goal?: string;
  diet?: string;
  maxTime?: number;
  q?: string;
}

export async function listRecipes(
  filter: RecipeFilter,
  limit = 60,
): Promise<ContentRecipe[]> {
  const conds: SQL[] = [];
  if (filter.goal && filter.goal !== "all") {
    conds.push(eq(contentRecipesTable.goal, filter.goal));
  }
  if (filter.diet && filter.diet !== "all") {
    conds.push(eq(contentRecipesTable.diet, filter.diet));
  }
  if (filter.maxTime && filter.maxTime > 0) {
    conds.push(sql`${contentRecipesTable.timeMinutes} <= ${filter.maxTime}`);
  }
  if (filter.q && filter.q.trim()) {
    const like = `%${filter.q.trim().toLowerCase()}%`;
    conds.push(
      sql`(lower(${contentRecipesTable.title}) like ${like} or lower(${contentRecipesTable.summary}) like ${like})`,
    );
  }
  const where = conds.length === 1 ? conds[0] : conds.length > 1 ? and(...conds) : undefined;
  const q = db.select().from(contentRecipesTable);
  const rows = await (where ? q.where(where) : q)
    .orderBy(desc(contentRecipesTable.publishedAt))
    .limit(Math.min(200, Math.max(1, limit)));
  return rows;
}

export async function getRecipeBySlug(
  slug: string,
): Promise<ContentRecipe | null> {
  const [row] = await db
    .select()
    .from(contentRecipesTable)
    .where(eq(contentRecipesTable.slug, slug))
    .limit(1);
  return row ?? null;
}

const SEED: Array<Omit<ContentRecipe, "id" | "publishedAt">> = [
  {
    slug: "high-protein-paneer-bowl",
    title: "15-Minute High-Protein Paneer Bowl",
    summary:
      "A weeknight bowl built around 30g of protein with brown rice, charred paneer, and a tahini-yogurt drizzle.",
    body: "This is a fast, balanced bowl built for muscle recovery. Keep the paneer cubes large so they crisp instead of crumbling.",
    image:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1200&q=80",
    authorName: "Dr. Anika Rao",
    authorRole: "Lead RD",
    goal: "gain_muscle",
    diet: "vegetarian",
    timeMinutes: 15,
    calories: 480,
    proteinGrams: 30,
    tags: ["high-protein", "weeknight", "post-workout"],
    ingredients: [
      "200g paneer, cubed",
      "1 cup cooked brown rice",
      "1 cup spinach",
      "2 tbsp tahini",
      "2 tbsp Greek yogurt",
      "1 tsp olive oil",
      "Salt, pepper, smoked paprika",
    ],
    steps: [
      "Heat olive oil in a non-stick pan and sear paneer cubes 2 min per side.",
      "Wilt spinach in the same pan with a pinch of salt.",
      "Whisk tahini with yogurt and 2 tbsp warm water.",
      "Plate rice, top with paneer and spinach, drizzle the sauce.",
    ],
  },
  {
    slug: "anti-inflammatory-turmeric-soup",
    title: "Golden Turmeric & Lentil Soup",
    summary:
      "A 25-minute anti-inflammatory soup with red lentils, ginger, and a lemon finish.",
    body: "Lentils give you steady plant protein and fibre; turmeric and ginger do the heavy lifting on inflammation markers.",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?w=1200&q=80",
    authorName: "Dr. Meera Iyer",
    authorRole: "Wellness RD",
    goal: "general_wellness",
    diet: "vegan",
    timeMinutes: 25,
    calories: 320,
    proteinGrams: 18,
    tags: ["anti-inflammatory", "soup", "fiber"],
    ingredients: [
      "1 cup red lentils",
      "1 tbsp grated ginger",
      "1 tsp turmeric",
      "4 cups vegetable stock",
      "1 onion, diced",
      "Juice of 1 lemon",
      "Salt to taste",
    ],
    steps: [
      "Sauté onion until soft, add ginger and turmeric.",
      "Add lentils and stock, simmer 18 minutes.",
      "Blend partially for a creamy texture.",
      "Finish with lemon juice and salt.",
    ],
  },
  {
    slug: "low-gi-chicken-quinoa",
    title: "Low-GI Chicken & Quinoa Plate",
    summary:
      "A diabetes-friendly plate that keeps post-meal glucose steady — quinoa, lean chicken, and roasted vegetables.",
    body: "Quinoa swaps the rice for a lower glycaemic load. Pair with a 10-minute walk after the meal for the best response.",
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80",
    authorName: "Dr. Anika Rao",
    authorRole: "Lead RD",
    goal: "lose_weight",
    diet: "omnivore",
    timeMinutes: 30,
    calories: 420,
    proteinGrams: 35,
    tags: ["low-gi", "diabetes-friendly", "high-protein"],
    ingredients: [
      "150g chicken breast",
      "3/4 cup cooked quinoa",
      "1 cup broccoli + bell pepper",
      "1 tbsp olive oil",
      "Lemon, garlic, oregano",
    ],
    steps: [
      "Marinate chicken in lemon, garlic and oregano for 10 min.",
      "Pan-sear chicken 4 min per side, rest before slicing.",
      "Roast vegetables at 200°C for 12 minutes.",
      "Plate quinoa, top with chicken and veg, drizzle pan juices.",
    ],
  },
  {
    slug: "20min-mediterranean-wrap",
    title: "20-Minute Mediterranean Hummus Wrap",
    summary:
      "A balanced lunch wrap with hummus, cucumber, tomato, olives, and feta — packed in under 20 minutes.",
    body: "Use a whole-wheat wrap for fibre. Toast the wrap for 30 seconds before filling — it stops it from going soggy.",
    image:
      "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=1200&q=80",
    authorName: "Chef Karan Patel",
    authorRole: "Head Chef",
    goal: "maintain",
    diet: "vegetarian",
    timeMinutes: 20,
    calories: 380,
    proteinGrams: 14,
    tags: ["lunch", "mediterranean", "quick"],
    ingredients: [
      "1 whole-wheat wrap",
      "3 tbsp hummus",
      "1/2 cucumber, sliced",
      "1 tomato, sliced",
      "8 kalamata olives",
      "30g crumbled feta",
      "Handful of rocket",
    ],
    steps: [
      "Warm the wrap in a dry pan for 30 seconds per side.",
      "Spread hummus down the centre.",
      "Layer rocket, cucumber, tomato, olives, feta.",
      "Roll tightly, slice in half, serve.",
    ],
  },
];

let seeded = false;
export async function ensureRecipeSeeds(): Promise<void> {
  if (seeded) return;
  for (const r of SEED) {
    await db
      .insert(contentRecipesTable)
      .values(r)
      .onConflictDoNothing({ target: contentRecipesTable.slug });
  }
  seeded = true;
}
