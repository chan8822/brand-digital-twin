import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  addonsTable,
  orderAddonsTable,
  ordersTable,
  type Addon,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { userIsPremium as userIsPremiumUnsafe } from "./premium";

const router: IRouter = Router();

const SEED_ADDONS: Array<Omit<Addon, "id">> = [
  {
    slug: "cold-pressed-orange",
    name: "Cold-Pressed Orange Juice",
    description:
      "250ml single-origin Nagpur oranges, no added sugar. Pairs with breakfast bowls.",
    category: "juice",
    pricePaise: 14900,
    image:
      "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=80",
    rdVerified: true,
    premiumOnly: false,
    recommendedFor: ["breakfast", "vegan"],
    macros: { kcal: 110, proteinG: 2, carbsG: 26, fatG: 0 },
    isActive: true,
  },
  {
    slug: "whey-protein-shake",
    name: "Vanilla Whey Shake (30g protein)",
    description:
      "Grass-fed whey isolate, 30g protein per bottle. Perfect post-workout add-on.",
    category: "drink",
    pricePaise: 19900,
    image:
      "https://images.unsplash.com/photo-1622485831295-3eedf60d5b59?w=600&q=80",
    rdVerified: true,
    premiumOnly: false,
    recommendedFor: ["fitness", "performance", "lunch"],
    macros: { kcal: 180, proteinG: 30, carbsG: 8, fatG: 2 },
    isActive: true,
  },
  {
    slug: "almond-protein-bites",
    name: "Almond Protein Bites (5pc)",
    description:
      "Dates, almond butter, hemp protein. 9g protein, 4g fiber per pack.",
    category: "snack",
    pricePaise: 12900,
    image:
      "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=600&q=80",
    rdVerified: true,
    premiumOnly: false,
    recommendedFor: ["fitness", "snack", "vegan"],
    macros: { kcal: 220, proteinG: 9, carbsG: 24, fatG: 11 },
    isActive: true,
  },
  {
    slug: "magnesium-glycinate",
    name: "Magnesium Glycinate (30 capsules)",
    description:
      "300mg/serving, RD-formulated for sleep and muscle recovery. One bottle ships once.",
    category: "supplement",
    pricePaise: 49900,
    image:
      "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&q=80",
    rdVerified: true,
    premiumOnly: false,
    recommendedFor: ["fitness", "performance", "clinical"],
    macros: null,
    isActive: true,
  },
  {
    slug: "kombucha-ginger",
    name: "Ginger Lemon Kombucha",
    description:
      "Fermented green tea, live cultures, low sugar. Crisp pair with mains.",
    category: "drink",
    pricePaise: 17900,
    image:
      "https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?w=600&q=80",
    rdVerified: false,
    premiumOnly: false,
    recommendedFor: ["lunch", "dinner", "vegan"],
    macros: { kcal: 60, proteinG: 0, carbsG: 14, fatG: 0 },
    isActive: true,
  },
  {
    slug: "premium-collagen",
    name: "Marine Collagen Sachet",
    description:
      "Premium-only — 10g hydrolysed marine collagen, citrus flavor. Mix into any drink.",
    category: "supplement",
    pricePaise: 24900,
    image:
      "https://images.unsplash.com/photo-1628771065518-0d82f1938462?w=600&q=80",
    rdVerified: true,
    premiumOnly: true,
    recommendedFor: ["wellness", "performance"],
    macros: { kcal: 40, proteinG: 10, carbsG: 0, fatG: 0 },
    isActive: true,
  },
];

let addonsSeeded = false;
async function ensureAddonsSeeded() {
  if (addonsSeeded) return;
  for (const a of SEED_ADDONS) {
    await db
      .insert(addonsTable)
      .values(a)
      .onConflictDoNothing({ target: addonsTable.slug });
  }
  addonsSeeded = true;
}

// Re-uses the premium-status logic in routes/premium.ts so cancelled
// memberships still inside their paid period continue to grant access.
async function userIsPremium(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  return userIsPremiumUnsafe(userId);
}

router.get("/addons", async (req: Request, res: Response) => {
  await ensureAddonsSeeded();
  const tagsRaw = String(req.query.tags ?? "");
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const all = await db
    .select()
    .from(addonsTable)
    .where(eq(addonsTable.isActive, true));

  const isPremium = await userIsPremium(req.user?.id);

  // Score every addon by tag overlap; gate premium-only entries.
  const scored = all
    .filter((a) => (a.premiumOnly ? isPremium : true))
    .map((a) => {
      const overlap =
        tags.length === 0
          ? 0
          : a.recommendedFor.filter((r) => tags.includes(r.toLowerCase())).length;
      return { addon: a, score: overlap };
    })
    .sort((a, b) => b.score - a.score || a.addon.name.localeCompare(b.addon.name));

  res.json({
    addons: scored.map((s) => ({ ...s.addon, recommendedScore: s.score })),
    isPremium,
  });
});

const attachSchema = z.object({
  orderId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        addonId: z.number().int().positive(),
        qty: z.number().int().positive().max(20),
      }),
    )
    .min(1),
});

router.post("/addons/attach", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const { orderId, items } = parsed.data;

  // Verify the order belongs to this user
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.user.id)),
    )
    .limit(1);
  if (!order) {
    res.status(404).json({ error: "order not found" });
    return;
  }

  const addonIds = items.map((i) => i.addonId);
  const addons = await db
    .select()
    .from(addonsTable)
    .where(inArray(addonsTable.id, addonIds));
  const addonMap = new Map(addons.map((a) => [a.id, a]));

  const isPremium = await userIsPremium(req.user.id);
  const rows: Array<typeof orderAddonsTable.$inferInsert> = [];
  let totalAddedPaise = 0;
  for (const it of items) {
    const a = addonMap.get(it.addonId);
    if (!a || !a.isActive) continue;
    if (a.premiumOnly && !isPremium) {
      res.status(403).json({ error: `addon ${a.slug} is premium-only` });
      return;
    }
    rows.push({
      orderId,
      addonId: a.id,
      qty: it.qty,
      unitPricePaise: a.pricePaise,
    });
    totalAddedPaise += a.pricePaise * it.qty;
  }
  if (rows.length === 0) {
    res.status(400).json({ error: "no valid addons" });
    return;
  }
  const inserted = await db.insert(orderAddonsTable).values(rows).returning();
  // Bump the order total for transparency in Orders page.
  await db
    .update(ordersTable)
    .set({ totalPaise: order.totalPaise + totalAddedPaise })
    .where(eq(ordersTable.id, orderId));
  res.status(201).json({ addons: inserted, addedPaise: totalAddedPaise });
});

router.get("/orders/:id/addons", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const orderId = Number(req.params.id);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ error: "invalid order id" });
    return;
  }
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(eq(ordersTable.id, orderId), eq(ordersTable.userId, req.user.id)),
    )
    .limit(1);
  if (!order) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const rows = await db
    .select({
      id: orderAddonsTable.id,
      addonId: orderAddonsTable.addonId,
      qty: orderAddonsTable.qty,
      unitPricePaise: orderAddonsTable.unitPricePaise,
      slug: addonsTable.slug,
      name: addonsTable.name,
      image: addonsTable.image,
    })
    .from(orderAddonsTable)
    .innerJoin(addonsTable, eq(addonsTable.id, orderAddonsTable.addonId))
    .where(eq(orderAddonsTable.orderId, orderId));
  res.json({ addons: rows });
});

export default router;
export { ensureAddonsSeeded };
