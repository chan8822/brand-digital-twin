import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  marketplaceItemsTable,
  marketplaceOrdersTable,
  ordersTable,
  type MarketplaceItem,
  type MarketplaceOrderLine,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const SEED_ITEMS: Array<Omit<MarketplaceItem, "id" | "createdAt" | "updatedAt">> = [
  {
    slug: "cold-pressed-evoo",
    name: "Cold-Pressed Extra Virgin Olive Oil",
    description: "First-press Spanish EVOO, RD-curated for everyday cooking.",
    longDescription:
      "First-press Spanish EVOO from Picual olives. Polyphenol-rich, low acidity. Use raw on salads or finish hot dishes — keeps smoke-point safe up to 190°C.",
    category: "oils",
    pricePaise: 89900,
    weightLabel: "500ml",
    supplierName: "Olivar de la Luz",
    image:
      "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&q=80",
    badges: ["RD-curated", "Single-origin"],
    rdVerified: true,
    stockQty: 80,
    isActive: true,
  },
  {
    slug: "schezwan-hot-sauce",
    name: "Small-Batch Schezwan Sauce",
    description: "Roasted byadgi chillies, garlic, soy. No preservatives.",
    longDescription:
      "Made in micro-batches with byadgi chillies, garlic, fermented black bean and aged soy. Heat: 7/10. 12-month shelf life unopened.",
    category: "sauces",
    pricePaise: 32900,
    weightLabel: "240g",
    supplierName: "Tanmatra Pantry",
    image:
      "https://images.unsplash.com/photo-1599050751795-6cdaafbc2319?w=600&q=80",
    badges: ["Small-batch"],
    rdVerified: false,
    stockQty: 120,
    isActive: true,
  },
  {
    slug: "vitamin-d3-k2",
    name: "Vitamin D3 + K2 (60 softgels)",
    description: "5000 IU D3 with 100mcg K2-MK7. 2-month supply.",
    longDescription:
      "Clinically-formulated D3+K2 stack — 5000 IU vitamin D3 paired with 100mcg K2 (MK-7) for calcium routing. Third-party tested for purity. 2-month supply at 1/day.",
    category: "supplements",
    pricePaise: 79900,
    weightLabel: "60 softgels",
    supplierName: "Tanmatra Wellness",
    image:
      "https://images.unsplash.com/photo-1550572017-edd951b55104?w=600&q=80",
    badges: ["Third-party tested", "RD-curated"],
    rdVerified: true,
    stockQty: 60,
    isActive: true,
  },
  {
    slug: "raw-honey-coorg",
    name: "Raw Coorg Forest Honey",
    description: "Single-origin, unprocessed, dark amber.",
    longDescription:
      "Wild-harvested from Coorg's coffee-blossom forests. Unfiltered, unpasteurised — natural granulation is normal and safe.",
    category: "pantry",
    pricePaise: 54900,
    weightLabel: "350g",
    supplierName: "Last Forest",
    image:
      "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&q=80",
    badges: ["Single-origin", "Unfiltered"],
    rdVerified: true,
    stockQty: 40,
    isActive: true,
  },
  {
    slug: "tamari-gluten-free",
    name: "Aged Tamari (Gluten-Free)",
    description: "18-month barrel-aged Japanese tamari. Wheat-free.",
    longDescription:
      "18-month barrel-aged in Japan. Pure soybean fermentation — no wheat. Deeper umami than regular soy sauce; perfect for marinades and dipping.",
    category: "sauces",
    pricePaise: 49900,
    weightLabel: "250ml",
    supplierName: "Yamasa",
    image:
      "https://images.unsplash.com/photo-1607301406259-dfb186e15de8?w=600&q=80",
    badges: ["Gluten-free"],
    rdVerified: false,
    stockQty: 70,
    isActive: true,
  },
  {
    slug: "almond-protein-mix",
    name: "Roasted Almond + Seed Mix",
    description: "Almonds, pumpkin & sunflower seeds. 8g protein/serving.",
    longDescription:
      "Slow-roasted in batches with sea salt and rosemary. 8g plant protein and 4g fiber per 30g serving. Resealable pouch.",
    category: "snacks",
    pricePaise: 39900,
    weightLabel: "200g",
    supplierName: "Tanmatra Pantry",
    image:
      "https://images.unsplash.com/photo-1502741338009-cac2772e18bc?w=600&q=80",
    badges: ["High-protein"],
    rdVerified: true,
    stockQty: 90,
    isActive: true,
  },
];

let marketplaceSeeded = false;
async function ensureMarketplaceSeeded() {
  if (marketplaceSeeded) return;
  for (const it of SEED_ITEMS) {
    await db
      .insert(marketplaceItemsTable)
      .values(it)
      .onConflictDoNothing({ target: marketplaceItemsTable.slug });
  }
  marketplaceSeeded = true;
}

router.get("/marketplace/items", async (req: Request, res: Response) => {
  await ensureMarketplaceSeeded();
  const category = String(req.query.category ?? "").trim();
  const rows = await db
    .select()
    .from(marketplaceItemsTable)
    .where(eq(marketplaceItemsTable.isActive, true))
    .orderBy(desc(marketplaceItemsTable.createdAt));
  const filtered =
    category && category !== "all"
      ? rows.filter((r) => r.category === category)
      : rows;
  res.json({ items: filtered });
});

router.get("/marketplace/items/:slug", async (req: Request, res: Response) => {
  await ensureMarketplaceSeeded();
  const slug = String(req.params.slug ?? "");
  const [row] = await db
    .select()
    .from(marketplaceItemsTable)
    .where(eq(marketplaceItemsTable.slug, slug))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ item: row });
});

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        qty: z.number().int().positive().max(20),
      }),
    )
    .min(1),
  deliveryMode: z.enum(["ship", "bundle_with_meal"]).default("ship"),
  bundleWithOrderId: z.number().int().positive().optional().nullable(),
  address: z
    .object({
      label: z.string().max(64).optional(),
      line: z.string().max(256).optional(),
      city: z.string().max(64).optional(),
      pincode: z.string().max(16).optional(),
      phone: z.string().max(32).optional(),
    })
    .optional(),
});

router.post("/marketplace/checkout", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const data = parsed.data;
  const ids = data.items.map((i) => i.itemId);
  const items = await db
    .select()
    .from(marketplaceItemsTable)
    .where(inArray(marketplaceItemsTable.id, ids));
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const lines: MarketplaceOrderLine[] = [];
  let totalPaise = 0;
  for (const it of data.items) {
    const item = itemMap.get(it.itemId);
    if (!item || !item.isActive) {
      res.status(400).json({ error: `item ${it.itemId} unavailable` });
      return;
    }
    if (item.stockQty < it.qty) {
      res.status(409).json({ error: `${item.name} out of stock` });
      return;
    }
    lines.push({
      itemId: item.id,
      slug: item.slug,
      name: item.name,
      qty: it.qty,
      unitPricePaise: item.pricePaise,
    });
    totalPaise += item.pricePaise * it.qty;
  }

  // If bundling with an existing meal order, the order id is required and
  // must belong to the current user.
  let bundleWithOrderId: number | null = null;
  if (data.deliveryMode === "bundle_with_meal") {
    if (!data.bundleWithOrderId) {
      res
        .status(400)
        .json({ error: "bundleWithOrderId required for bundle_with_meal" });
      return;
    }
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, data.bundleWithOrderId),
          eq(ordersTable.userId, req.user.id),
        ),
      )
      .limit(1);
    if (!order) {
      res.status(404).json({ error: "bundle target order not found" });
      return;
    }
    bundleWithOrderId = order.id;
  }

  const [created] = await db
    .insert(marketplaceOrdersTable)
    .values({
      userId: req.user.id,
      status: "placed",
      deliveryMode: data.deliveryMode,
      items: lines,
      totalPaise,
      addressLabel: data.address?.label,
      addressLine: data.address?.line,
      city: data.address?.city,
      pincode: data.address?.pincode,
      phone: data.address?.phone,
      bundleWithOrderId,
    })
    .returning();

  // Decrement stock for each item.
  for (const line of lines) {
    const item = itemMap.get(line.itemId);
    if (!item) continue;
    await db
      .update(marketplaceItemsTable)
      .set({ stockQty: Math.max(0, item.stockQty - line.qty) })
      .where(eq(marketplaceItemsTable.id, item.id));
  }

  res.status(201).json({ order: created });
});

router.get("/marketplace/orders", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(marketplaceOrdersTable)
    .where(eq(marketplaceOrdersTable.userId, req.user.id))
    .orderBy(desc(marketplaceOrdersTable.createdAt));
  res.json({ orders: rows });
});

export default router;
