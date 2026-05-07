import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  subscriptionsTable,
  subscriptionMembersTable,
  subscriptionDeliveriesTable,
  mealCreditsTable,
  type SubscriptionCadence,
  type SubscriptionItem,
  type SubscriptionDelivery,
} from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const cadenceSchema = z.enum(["weekly", "fortnightly", "monthly"]);
const dietSchema = z.enum(["any", "veg", "nonveg"]);

const memberInputSchema = z.object({
  name: z.string().min(1).max(64),
  diet: dietSchema.default("any"),
  allergens: z.array(z.string()).default([]),
  lifestyle: z.string().max(32).optional(),
  spiceLevel: z.enum(["mild", "medium", "hot"]).default("medium"),
});

const itemSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  image: z.string(),
  quantity: z.number().int().positive(),
  unitPricePaise: z.number().int().nonnegative(),
  memberId: z.number().int().positive().optional().nullable(),
});

const createSubscriptionSchema = z.object({
  cadence: cadenceSchema,
  mealsPerDelivery: z.number().int().positive().max(50),
  deliveryWindow: z.string().min(3).max(32),
  startDate: z.string().or(z.date()),
  addressLabel: z.string().max(64).optional(),
  addressLine: z.string().max(256).optional(),
  city: z.string().max(64).optional(),
  pincode: z.string().max(16).optional(),
  phone: z.string().max(32).optional(),
  notes: z.string().max(512).optional(),
  members: z.array(memberInputSchema).min(1),
  defaultItems: z.array(itemSchema).default([]),
});

const swapItemsSchema = z.object({
  items: z.array(itemSchema).min(1),
});

const rescheduleSchema = z.object({
  scheduledFor: z.string().or(z.date()),
  deliveryWindow: z.string().min(3).max(32).optional(),
});

const CADENCE_DAYS: Record<SubscriptionCadence, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
};

const PER_MEAL_PAISE = 26000;
const CADENCE_DISCOUNT: Record<SubscriptionCadence, number> = {
  weekly: 0.95,
  fortnightly: 0.9,
  monthly: 0.85,
};

function computeDeliveryPricePaise(
  cadence: SubscriptionCadence,
  meals: number,
): number {
  return Math.round(meals * PER_MEAL_PAISE * CADENCE_DISCOUNT[cadence]);
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return req.user.id;
}

async function loadSubscriptionForUser(
  subId: number,
  userId: string,
): Promise<typeof subscriptionsTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.id, subId),
        eq(subscriptionsTable.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function loadDeliveryForUser(
  deliveryId: number,
  userId: string,
): Promise<{
  delivery: SubscriptionDelivery;
  subscription: typeof subscriptionsTable.$inferSelect;
} | null> {
  const rows = await db
    .select({
      delivery: subscriptionDeliveriesTable,
      subscription: subscriptionsTable,
    })
    .from(subscriptionDeliveriesTable)
    .innerJoin(
      subscriptionsTable,
      eq(subscriptionDeliveriesTable.subscriptionId, subscriptionsTable.id),
    )
    .where(
      and(
        eq(subscriptionDeliveriesTable.id, deliveryId),
        eq(subscriptionsTable.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function generateDeliveriesForSubscription(
  subscriptionId: number,
  cadence: SubscriptionCadence,
  startFrom: Date,
  count: number,
  deliveryWindow: string,
  defaultItems: SubscriptionItem[],
): Promise<SubscriptionDelivery[]> {
  const stepDays = CADENCE_DAYS[cadence];
  const rows: Array<typeof subscriptionDeliveriesTable.$inferInsert> = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      subscriptionId,
      scheduledFor: addDays(startFrom, i * stepDays),
      deliveryWindow,
      status: "upcoming",
      items: defaultItems,
    });
  }
  if (rows.length === 0) return [];
  return db.insert(subscriptionDeliveriesTable).values(rows).returning();
}

router.post("/subscriptions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = createSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  const startDate = new Date(data.startDate);
  if (Number.isNaN(startDate.getTime())) {
    res.status(400).json({ error: "invalid startDate" });
    return;
  }
  const minStart = new Date();
  minStart.setUTCHours(0, 0, 0, 0);
  if (startDate < minStart) {
    res.status(400).json({ error: "startDate must be today or later" });
    return;
  }
  const pricePerDeliveryPaise = computeDeliveryPricePaise(
    data.cadence,
    data.mealsPerDelivery,
  );

  const [sub] = await db
    .insert(subscriptionsTable)
    .values({
      userId,
      cadence: data.cadence,
      mealsPerDelivery: data.mealsPerDelivery,
      deliveryWindow: data.deliveryWindow,
      status: "active",
      startDate,
      nextDeliveryAt: startDate,
      pricePerDeliveryPaise,
      addressLabel: data.addressLabel,
      addressLine: data.addressLine,
      city: data.city,
      pincode: data.pincode,
      phone: data.phone,
      notes: data.notes,
    })
    .returning();

  if (data.members.length > 0) {
    await db.insert(subscriptionMembersTable).values(
      data.members.map((m) => ({
        subscriptionId: sub.id,
        name: m.name,
        diet: m.diet,
        allergens: m.allergens,
        lifestyle: m.lifestyle,
        spiceLevel: m.spiceLevel,
      })),
    );
  }

  const deliveries = await generateDeliveriesForSubscription(
    sub.id,
    data.cadence,
    startDate,
    4,
    data.deliveryWindow,
    data.defaultItems,
  );

  res.status(201).json({ subscription: sub, deliveries });
});

router.get("/subscriptions", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const subs = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .orderBy(desc(subscriptionsTable.createdAt));
  res.json({ subscriptions: subs });
});

router.get("/subscriptions/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const subId = Number(req.params.id);
  if (!Number.isFinite(subId)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const sub = await loadSubscriptionForUser(subId, userId);
  if (!sub) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const [members, deliveries] = await Promise.all([
    db
      .select()
      .from(subscriptionMembersTable)
      .where(eq(subscriptionMembersTable.subscriptionId, subId))
      .orderBy(asc(subscriptionMembersTable.id)),
    db
      .select()
      .from(subscriptionDeliveriesTable)
      .where(eq(subscriptionDeliveriesTable.subscriptionId, subId))
      .orderBy(asc(subscriptionDeliveriesTable.scheduledFor)),
  ]);
  res.json({ subscription: sub, members, deliveries });
});

router.post("/subscriptions/:id/pause", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const subId = Number(req.params.id);
  const sub = await loadSubscriptionForUser(subId, userId);
  if (!sub) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const [updated] = await db
    .update(subscriptionsTable)
    .set({ status: "paused", pausedAt: new Date() })
    .where(eq(subscriptionsTable.id, subId))
    .returning();
  res.json({ subscription: updated });
});

router.post(
  "/subscriptions/:id/resume",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const subId = Number(req.params.id);
    const sub = await loadSubscriptionForUser(subId, userId);
    if (!sub) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const [updated] = await db
      .update(subscriptionsTable)
      .set({ status: "active", pausedAt: null })
      .where(eq(subscriptionsTable.id, subId))
      .returning();
    res.json({ subscription: updated });
  },
);

router.post(
  "/subscriptions/:id/cancel",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const subId = Number(req.params.id);
    const sub = await loadSubscriptionForUser(subId, userId);
    if (!sub) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const [updated] = await db
      .update(subscriptionsTable)
      .set({ status: "cancelled" })
      .where(eq(subscriptionsTable.id, subId))
      .returning();
    await db
      .update(subscriptionDeliveriesTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(subscriptionDeliveriesTable.subscriptionId, subId),
          eq(subscriptionDeliveriesTable.status, "upcoming"),
        ),
      );
    res.json({ subscription: updated });
  },
);

router.post(
  "/subscriptions/:id/members",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const subId = Number(req.params.id);
    const sub = await loadSubscriptionForUser(subId, userId);
    if (!sub) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const parsed = memberInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const [member] = await db
      .insert(subscriptionMembersTable)
      .values({ subscriptionId: subId, ...parsed.data })
      .returning();
    res.status(201).json({ member });
  },
);

router.delete(
  "/subscriptions/:id/members/:memberId",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const subId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    const sub = await loadSubscriptionForUser(subId, userId);
    if (!sub) {
      res.status(404).json({ error: "not found" });
      return;
    }
    await db
      .delete(subscriptionMembersTable)
      .where(
        and(
          eq(subscriptionMembersTable.id, memberId),
          eq(subscriptionMembersTable.subscriptionId, subId),
        ),
      );
    res.json({ ok: true });
  },
);

router.post(
  "/subscription-deliveries/:id/skip",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const deliveryId = Number(req.params.id);
    const found = await loadDeliveryForUser(deliveryId, userId);
    if (!found) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (found.delivery.status !== "upcoming") {
      res.status(400).json({ error: "delivery is not upcoming" });
      return;
    }
    const [updated] = await db
      .update(subscriptionDeliveriesTable)
      .set({ status: "skipped" })
      .where(eq(subscriptionDeliveriesTable.id, deliveryId))
      .returning();

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 60);
    await db.insert(mealCreditsTable).values({
      userId,
      subscriptionId: found.subscription.id,
      deliveryId,
      amount: found.subscription.mealsPerDelivery,
      reason: "skipped_delivery",
      expiresAt,
    });

    res.json({ delivery: updated });
  },
);

router.post(
  "/subscription-deliveries/:id/swap",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const deliveryId = Number(req.params.id);
    const found = await loadDeliveryForUser(deliveryId, userId);
    if (!found) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (found.delivery.status !== "upcoming") {
      res.status(400).json({ error: "delivery is not upcoming" });
      return;
    }
    const parsed = swapItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const [updated] = await db
      .update(subscriptionDeliveriesTable)
      .set({ items: parsed.data.items })
      .where(eq(subscriptionDeliveriesTable.id, deliveryId))
      .returning();
    res.json({ delivery: updated });
  },
);

router.post(
  "/subscription-deliveries/:id/reschedule",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const deliveryId = Number(req.params.id);
    const found = await loadDeliveryForUser(deliveryId, userId);
    if (!found) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (found.delivery.status !== "upcoming") {
      res.status(400).json({ error: "delivery is not upcoming" });
      return;
    }
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const newDate = new Date(parsed.data.scheduledFor);
    if (Number.isNaN(newDate.getTime())) {
      res.status(400).json({ error: "invalid scheduledFor" });
      return;
    }
    const minDate = new Date();
    minDate.setUTCHours(0, 0, 0, 0);
    if (newDate < minDate) {
      res.status(400).json({ error: "cannot reschedule to the past" });
      return;
    }
    const [updated] = await db
      .update(subscriptionDeliveriesTable)
      .set({
        scheduledFor: newDate,
        deliveryWindow:
          parsed.data.deliveryWindow ?? found.delivery.deliveryWindow,
      })
      .where(eq(subscriptionDeliveriesTable.id, deliveryId))
      .returning();
    res.json({ delivery: updated });
  },
);

router.get("/meal-credits", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const credits = await db
    .select()
    .from(mealCreditsTable)
    .where(eq(mealCreditsTable.userId, userId))
    .orderBy(desc(mealCreditsTable.createdAt));
  const totalRows = await db
    .select({
      total: sql<number>`coalesce(sum(${mealCreditsTable.amount}), 0)`,
    })
    .from(mealCreditsTable)
    .where(
      and(
        eq(mealCreditsTable.userId, userId),
        sql`${mealCreditsTable.consumedAt} is null`,
      ),
    );
  res.json({ credits, balance: Number(totalRows[0]?.total ?? 0) });
});

router.post(
  "/subscriptions/:id/generate-next",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const subId = Number(req.params.id);
    const sub = await loadSubscriptionForUser(subId, userId);
    if (!sub) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const last = await db
      .select()
      .from(subscriptionDeliveriesTable)
      .where(eq(subscriptionDeliveriesTable.subscriptionId, subId))
      .orderBy(desc(subscriptionDeliveriesTable.scheduledFor))
      .limit(1);
    const lastDate = last[0]?.scheduledFor ?? sub.startDate;
    const startFrom = addDays(new Date(lastDate), CADENCE_DAYS[sub.cadence]);
    const newOnes = await generateDeliveriesForSubscription(
      subId,
      sub.cadence,
      startFrom,
      4,
      sub.deliveryWindow,
      [],
    );
    res.json({ deliveries: newOnes });
  },
);

export default router;
