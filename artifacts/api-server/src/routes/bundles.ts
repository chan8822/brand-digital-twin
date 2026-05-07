import { Router, type IRouter, type Request, type Response } from "express";
import { db, bundlesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

/**
 * Seed bundles on first read so the menu always has something to show.
 * Idempotent — onConflictDoNothing on `slug` ensures repeated reads
 * never duplicate rows.
 */
const SEED_BUNDLES = [
  {
    slug: "morning-power",
    name: "Morning Power Combo",
    description:
      "Power House Smoothie + Activated Charcoal Smoothie. Start your day with 18g protein and antioxidant detox in one bundle.",
    badge: "BREAKFAST",
    pricePaise: 11500,
    originalPricePaise: 13000,
    dishIds: [97, 1],
    image:
      "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
  },
  {
    slug: "lunch-balance",
    name: "Lunch Balance Combo",
    description:
      "Peri Peri Paneer Rice Bowl + Tomato Basil Soup. A warm, balanced lunch with 28g protein and high fiber.",
    badge: "LUNCH",
    pricePaise: 23500,
    originalPricePaise: 26000,
    dishIds: [92, 107],
    image:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
  },
  {
    slug: "performance-stack",
    name: "Performance Stack",
    description:
      "Aglio Olio (Chicken) + Power House Smoothie. 43g protein for muscle recovery after training.",
    badge: "FITNESS",
    pricePaise: 23500,
    originalPricePaise: 26000,
    dishIds: [3, 97],
    image:
      "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
  },
  {
    slug: "wellness-light",
    name: "Wellness Light Combo",
    description:
      "Quinoa Salad + Tomato Basil Soup. Plant-based, under 360 kcal total, high in fiber and antioxidants.",
    badge: "LIGHT",
    pricePaise: 16500,
    originalPricePaise: 18500,
    dishIds: [102, 107],
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
  },
];

let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  for (const b of SEED_BUNDLES) {
    await db
      .insert(bundlesTable)
      .values(b)
      .onConflictDoNothing({ target: bundlesTable.slug });
  }
  seeded = true;
}

router.get("/bundles", async (_req: Request, res: Response) => {
  await ensureSeeded();
  const rows = await db.select().from(bundlesTable);
  res.json({ bundles: rows });
});

router.get("/bundles/:slug", async (req: Request, res: Response) => {
  await ensureSeeded();
  const slug = String(req.params.slug ?? "");
  const [row] = await db
    .select()
    .from(bundlesTable)
    .where(eq(bundlesTable.slug, slug));
  if (!row) {
    res.status(404).json({ error: "bundle not found" });
    return;
  }
  res.json({ bundle: row });
});

export default router;
