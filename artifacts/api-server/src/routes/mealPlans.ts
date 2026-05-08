import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  mealPlansTable,
  mealPlanSettingsTable,
  subscriptionsTable,
  subscriptionDeliveriesTable,
  type MealPlan,
  type MealPlanConstraints,
  type MealPlanDay,
  MEAL_SLOTS,
  type MealPlanSlot,
} from "@workspace/db";
import {
  generateWeeklyPlan,
  regenerateDay,
  swapSlot,
  suggestSwapsForSlot,
  validatePlan,
  DEFAULT_MAX_REPETITIONS,
} from "../lib/mealPlanner";
import { invalidateUserBrief } from "../lib/userBrief";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return req.user.id;
}

function parseIdParam(raw: unknown, res: Response): number | null {
  const value =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    res.status(400).json({ error: "invalid id" });
    return null;
  }
  return n;
}

/** Snap a date to the upcoming Monday in UTC (or today if it's Monday). */
export function nextMonday(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 1 ? 0 : (8 - dow) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

const slotEnum = z.enum(["breakfast", "lunch", "dinner"]);

const overridesSchema = z.object({
  weeklyBudgetPaise: z.number().int().min(0).nullable().optional(),
  maxRepetitionsPerDish: z.number().int().min(1).max(7).optional(),
  dailyCalorieTarget: z.number().int().min(800).max(6000).nullable().optional(),
  dailyProteinTargetGrams: z.number().int().min(20).max(400).nullable().optional(),
  weekCalendar: z
    .array(z.enum(["normal", "gym", "travel", "wfh"]))
    .length(7)
    .optional(),
});

const generateSchema = z.object({
  weekStartDate: z.string().optional(),
  overrides: overridesSchema.optional(),
});

const swapSchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
  slot: slotEnum,
  dishId: z.number().int().positive(),
});

const regenDaySchema = z.object({
  dayIndex: z.number().int().min(0).max(6),
});

const settingsSchema = z.object({
  autoReplanEnabled: z.boolean().optional(),
  weeklyBudgetPaise: z.number().int().min(0).nullable().optional(),
  maxRepetitionsPerDish: z.number().int().min(1).max(7).optional(),
});

async function loadPlanForUser(
  planId: number,
  userId: string,
): Promise<MealPlan | null> {
  const rows = await db
    .select()
    .from(mealPlansTable)
    .where(
      and(eq(mealPlansTable.id, planId), eq(mealPlansTable.userId, userId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

router.get("/meal-plan-settings", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const [row] = await db
    .select()
    .from(mealPlanSettingsTable)
    .where(eq(mealPlanSettingsTable.userId, userId));
  res.json({
    settings: row ?? {
      userId,
      autoReplanEnabled: false,
      weeklyBudgetPaise: null,
      maxRepetitionsPerDish: DEFAULT_MAX_REPETITIONS,
      lastPlannedWeekStart: null,
    },
  });
});

router.put("/meal-plan-settings", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const patch = parsed.data;
  const insertValues = {
    userId,
    autoReplanEnabled: patch.autoReplanEnabled ?? false,
    weeklyBudgetPaise: patch.weeklyBudgetPaise ?? null,
    maxRepetitionsPerDish:
      patch.maxRepetitionsPerDish ?? DEFAULT_MAX_REPETITIONS,
  };
  const updateSet: Record<string, unknown> = {};
  if (patch.autoReplanEnabled !== undefined)
    updateSet["autoReplanEnabled"] = patch.autoReplanEnabled;
  if (patch.weeklyBudgetPaise !== undefined)
    updateSet["weeklyBudgetPaise"] = patch.weeklyBudgetPaise;
  if (patch.maxRepetitionsPerDish !== undefined)
    updateSet["maxRepetitionsPerDish"] = patch.maxRepetitionsPerDish;
  const [row] =
    Object.keys(updateSet).length === 0
      ? await db
          .insert(mealPlanSettingsTable)
          .values(insertValues)
          .onConflictDoNothing({ target: mealPlanSettingsTable.userId })
          .returning()
      : await db
          .insert(mealPlanSettingsTable)
          .values(insertValues)
          .onConflictDoUpdate({
            target: mealPlanSettingsTable.userId,
            set: updateSet,
          })
          .returning();
  const [final] = row
    ? [row]
    : await db
        .select()
        .from(mealPlanSettingsTable)
        .where(eq(mealPlanSettingsTable.userId, userId));
  res.json({ settings: final });
});

router.get("/meal-plans", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const plans = await db
    .select()
    .from(mealPlansTable)
    .where(eq(mealPlansTable.userId, userId))
    .orderBy(desc(mealPlansTable.weekStartDate))
    .limit(12);
  res.json({ plans });
});

router.get("/meal-plans/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const planId = parseIdParam(req.params.id, res);
  if (planId === null) return;
  const plan = await loadPlanForUser(planId, userId);
  if (!plan) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ plan });
});

router.post("/meal-plans/generate", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = generateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload", details: parsed.error.issues });
    return;
  }
  const weekStart = parsed.data.weekStartDate
    ? new Date(parsed.data.weekStartDate)
    : nextMonday();
  if (Number.isNaN(weekStart.getTime())) {
    res.status(400).json({ error: "invalid weekStartDate" });
    return;
  }
  weekStart.setUTCHours(0, 0, 0, 0);

  // Load saved settings to seed budget / repetition defaults
  const [savedSettings] = await db
    .select()
    .from(mealPlanSettingsTable)
    .where(eq(mealPlanSettingsTable.userId, userId));
  const overrides: Partial<MealPlanConstraints> = {};
  if (parsed.data.overrides) {
    if (parsed.data.overrides.weeklyBudgetPaise !== undefined)
      overrides.weeklyBudgetPaise = parsed.data.overrides.weeklyBudgetPaise;
    if (parsed.data.overrides.maxRepetitionsPerDish !== undefined)
      overrides.maxRepetitionsPerDish =
        parsed.data.overrides.maxRepetitionsPerDish;
    if (parsed.data.overrides.dailyCalorieTarget !== undefined)
      overrides.dailyCalorieTarget = parsed.data.overrides.dailyCalorieTarget;
    if (parsed.data.overrides.dailyProteinTargetGrams !== undefined)
      overrides.dailyProteinTargetGrams =
        parsed.data.overrides.dailyProteinTargetGrams;
    if (parsed.data.overrides.weekCalendar !== undefined)
      overrides.weekCalendar = parsed.data.overrides.weekCalendar;
  }
  if (overrides.weeklyBudgetPaise === undefined && savedSettings)
    overrides.weeklyBudgetPaise = savedSettings.weeklyBudgetPaise;
  if (overrides.maxRepetitionsPerDish === undefined && savedSettings)
    overrides.maxRepetitionsPerDish = savedSettings.maxRepetitionsPerDish;

  try {
    const result = await generateWeeklyPlan(userId, weekStart, overrides);
    const weekStartIso = weekStart.toISOString().slice(0, 10);

    // Refuse to clobber an accepted/scheduled plan for the same week —
    // doing so would desync the plan record from real subscription
    // deliveries we already created. Only `draft`/`discarded` rows are
    // safe to overwrite.
    const [existingPlan] = await db
      .select({ id: mealPlansTable.id, status: mealPlansTable.status })
      .from(mealPlansTable)
      .where(
        and(
          eq(mealPlansTable.userId, userId),
          eq(mealPlansTable.weekStartDate, weekStartIso),
        ),
      )
      .limit(1);
    if (
      existingPlan &&
      existingPlan.status !== "draft" &&
      existingPlan.status !== "discarded"
    ) {
      res.status(409).json({
        error: "plan already accepted for this week",
        planId: existingPlan.id,
        status: existingPlan.status,
      });
      return;
    }
    const [plan] = await db
      .insert(mealPlansTable)
      .values({
        userId,
        weekStartDate: weekStartIso,
        status: "draft",
        constraints: result.constraints,
        days: result.days,
        totals: result.totals,
        model: result.model,
        notes: result.notes.join(",") || null,
      })
      .onConflictDoUpdate({
        target: [mealPlansTable.userId, mealPlansTable.weekStartDate],
        set: {
          status: "draft",
          constraints: result.constraints,
          days: result.days,
          totals: result.totals,
          model: result.model,
          notes: result.notes.join(",") || null,
          subscriptionId: null,
          acceptedAt: null,
        },
      })
      .returning();
    res.status(201).json({ plan, usedFallback: result.usedFallback });
  } catch (err) {
    const e = err as Error & { status?: number; violations?: unknown };
    if (e.status === 422) {
      req.log.warn({ err }, "meal-plan generate produced no valid plan");
      res
        .status(422)
        .json({ error: "could not produce a valid plan", violations: e.violations ?? [] });
      return;
    }
    req.log.error({ err }, "meal-plan generate failed");
    res.status(500).json({ error: "generation failed" });
  }
});

router.post(
  "/meal-plans/:id/regenerate-day",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const planId = parseIdParam(req.params.id, res);
    if (planId === null) return;
    const parsed = regenDaySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const plan = await loadPlanForUser(planId, userId);
    if (!plan) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (plan.status !== "draft") {
      res.status(409).json({ error: "plan is not editable" });
      return;
    }
    try {
      const result = await regenerateDay(
        userId,
        plan.days,
        parsed.data.dayIndex,
        plan.constraints,
      );
      const [updated] = await db
        .update(mealPlansTable)
        .set({ days: result.days, totals: result.totals })
        .where(eq(mealPlansTable.id, plan.id))
        .returning();
      res.json({ plan: updated });
    } catch (err) {
      req.log.warn({ err }, "regenerate-day failed");
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

router.patch("/meal-plans/:id/slot", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const planId = parseIdParam(req.params.id, res);
  if (planId === null) return;
  const parsed = swapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const plan = await loadPlanForUser(planId, userId);
  if (!plan) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (plan.status !== "draft") {
    res.status(409).json({ error: "plan is not editable" });
    return;
  }
  try {
    const result = swapSlot(
      plan.days,
      parsed.data.dayIndex,
      parsed.data.slot,
      parsed.data.dishId,
      plan.constraints,
    );
    // swapSlot only enforces allergen / diet / repetition / unknown-dish.
    // Run the full validatePlan after the swap so an edit can never push
    // the plan over the budget cap or outside the calorie/protein band.
    const violations = validatePlan(result.days, plan.constraints);
    if (violations.length > 0) {
      res.status(400).json({
        error: "swap would violate plan constraints",
        violations,
      });
      return;
    }
    const [updated] = await db
      .update(mealPlansTable)
      .set({ days: result.days, totals: result.totals })
      .where(eq(mealPlansTable.id, plan.id))
      .returning();
    res.json({ plan: updated });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const swapSuggestionsSchema = z.object({
  planId: z.number().int().positive(),
  dayIndex: z.number().int().min(0).max(6),
  slot: slotEnum,
});

router.post(
  "/meal-plans/swap-suggestions",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const parsed = swapSuggestionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const plan = await loadPlanForUser(parsed.data.planId, userId);
    if (!plan) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const suggestions = await suggestSwapsForSlot(
      userId,
      plan.days,
      parsed.data.dayIndex,
      parsed.data.slot,
      plan.constraints,
    );
    res.json({ suggestions });
  },
);

router.post("/meal-plans/:id/accept", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const planId = parseIdParam(req.params.id, res);
  if (planId === null) return;
  const plan = await loadPlanForUser(planId, userId);
  if (!plan) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (plan.status !== "draft") {
    res.status(409).json({ error: "plan is not draft" });
    return;
  }
  // Re-validate before accepting in case the menu catalog moved under us.
  const violations = validatePlan(plan.days, plan.constraints);
  if (violations.length > 0) {
    res
      .status(400)
      .json({ error: "plan no longer valid", violations });
    return;
  }

  // Look for an active weekly subscription to attach deliveries to.
  const [activeSub] = await db
    .select()
    .from(subscriptionsTable)
    .where(
      and(
        eq(subscriptionsTable.userId, userId),
        eq(subscriptionsTable.status, "active"),
        eq(subscriptionsTable.cadence, "weekly"),
      ),
    )
    .limit(1);

  let createdDeliveryIds: number[] = [];
  if (activeSub) {
    // One delivery per day; lunch is the canonical entry, breakfast and
    // dinner ride along as additional items so totals are honest.
    const rows = plan.days.map((day) => ({
      subscriptionId: activeSub.id,
      scheduledFor: new Date(`${day.date}T12:00:00.000Z`),
      deliveryWindow: activeSub.deliveryWindow,
      status: "upcoming" as const,
      items: MEAL_SLOTS.flatMap((slot): {
        slug: string;
        name: string;
        image: string;
        quantity: number;
        unitPricePaise: number;
      }[] => {
        const entry = day[slot];
        if (!entry) return [];
        return [
          {
            slug: entry.slug,
            name: `${entry.name} (${slot})`,
            image: entry.image,
            quantity: 1,
            unitPricePaise: entry.pricePaise,
          },
        ];
      }),
      notes: `From meal plan #${plan.id}`,
    }));
    const inserted = await db
      .insert(subscriptionDeliveriesTable)
      .values(rows)
      .returning({ id: subscriptionDeliveriesTable.id });
    createdDeliveryIds = inserted.map((r) => r.id);
  }

  // Conditional update on status='draft' makes this safe under concurrent
  // accepts: the second request finds zero rows and returns 409 instead
  // of double-creating deliveries.
  const [updated] = await db
    .update(mealPlansTable)
    .set({
      status: activeSub ? "scheduled" : "accepted",
      acceptedAt: new Date(),
      subscriptionId: activeSub?.id ?? null,
    })
    .where(
      and(eq(mealPlansTable.id, plan.id), eq(mealPlansTable.status, "draft")),
    )
    .returning();
  if (!updated) {
    // Lost the race — roll back any deliveries we inserted so we don't
    // leave orphans attached to a plan we don't own anymore.
    if (createdDeliveryIds.length > 0) {
      await db
        .delete(subscriptionDeliveriesTable)
        .where(inArray(subscriptionDeliveriesTable.id, createdDeliveryIds));
    }
    res.status(409).json({ error: "plan is not draft" });
    return;
  }

  // Also record this as the "last planned week" so auto-replan won't
  // double-generate it.
  await db
    .insert(mealPlanSettingsTable)
    .values({
      userId,
      autoReplanEnabled: false,
      lastPlannedWeekStart: plan.weekStartDate,
    })
    .onConflictDoUpdate({
      target: mealPlanSettingsTable.userId,
      set: { lastPlannedWeekStart: plan.weekStartDate },
    });
  invalidateUserBrief(userId);

  res.json({
    plan: updated,
    subscriptionId: activeSub?.id ?? null,
    deliveryIds: createdDeliveryIds,
  });
});

router.post("/meal-plans/:id/discard", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const planId = parseIdParam(req.params.id, res);
  if (planId === null) return;
  const plan = await loadPlanForUser(planId, userId);
  if (!plan) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (plan.status !== "draft") {
    res.status(409).json({ error: "plan is not draft" });
    return;
  }
  // Conditional update keeps two concurrent discards safe.
  const [updated] = await db
    .update(mealPlansTable)
    .set({ status: "discarded" })
    .where(
      and(eq(mealPlansTable.id, plan.id), eq(mealPlansTable.status, "draft")),
    )
    .returning();
  if (!updated) {
    res.status(409).json({ error: "plan is not draft" });
    return;
  }
  res.json({ plan: updated });
});

export default router;
