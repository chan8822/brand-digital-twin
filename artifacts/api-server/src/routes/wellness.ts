import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuthUser as requireAuth } from "../middlewares/requireAuth";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  nutritionLogsTable,
  dailyTargetsTable,
  wearableLinksTable,
  streaksTable,
  userPreferencesTable,
  type NutritionLog,
  type DailyTargets,
  type WearableLink,
  type Streak,
  type WearableProvider,
} from "@workspace/db";

const router: IRouter = Router();

// requireAuth: see shared middleware/requireAuth.ts

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysStr(start: string, n: number): string {
  const d = new Date(`${start}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dayStr(d);
}

const ACTIVITY_BUMP: Record<string, number> = {
  sedentary: 0,
  light: 100,
  moderate: 200,
  active: 350,
  very_active: 500,
};

async function ensureTargets(userId: string): Promise<DailyTargets> {
  const [existing] = await db
    .select()
    .from(dailyTargetsTable)
    .where(eq(dailyTargetsTable.userId, userId));
  if (existing) return existing;
  // Seed from preferences when available so the UI starts with real numbers.
  const [prefs] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));
  const seed = {
    userId,
    calorieTarget: prefs?.calorieTarget ?? 2000,
    proteinTargetGrams: prefs?.proteinTargetGrams ?? 80,
    fiberTargetGrams: 28,
    waterTargetMl: 2500,
    vegTargetServings: 3,
  };
  const [created] = await db
    .insert(dailyTargetsTable)
    .values(seed)
    .onConflictDoNothing()
    .returning();
  return created ?? seed;
}

interface DayTotals {
  date: string;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  waterMl: number;
  vegServings: number;
}

function emptyDay(date: string): DayTotals {
  return {
    date,
    calories: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    fiberGrams: 0,
    waterMl: 0,
    vegServings: 0,
  };
}

async function aggregateRange(
  userId: string,
  fromInclusive: string,
  toInclusive: string,
): Promise<DayTotals[]> {
  const rows = await db
    .select({
      date: sql<string>`to_char(${nutritionLogsTable.loggedFor}, 'YYYY-MM-DD')`,
      calories: sql<number>`coalesce(sum(${nutritionLogsTable.calories}), 0)`,
      protein: sql<number>`coalesce(sum(${nutritionLogsTable.proteinGrams}), 0)`,
      carbs: sql<number>`coalesce(sum(${nutritionLogsTable.carbsGrams}), 0)`,
      fat: sql<number>`coalesce(sum(${nutritionLogsTable.fatGrams}), 0)`,
      fiber: sql<number>`coalesce(sum(${nutritionLogsTable.fiberGrams}), 0)`,
      water: sql<number>`coalesce(sum(${nutritionLogsTable.waterMl}), 0)`,
      veg: sql<number>`coalesce(sum(${nutritionLogsTable.vegServings}), 0)`,
    })
    .from(nutritionLogsTable)
    .where(
      and(
        eq(nutritionLogsTable.userId, userId),
        gte(nutritionLogsTable.loggedFor, fromInclusive),
        lte(nutritionLogsTable.loggedFor, toInclusive),
      ),
    )
    .groupBy(sql`to_char(${nutritionLogsTable.loggedFor}, 'YYYY-MM-DD')`);

  const byDay = new Map<string, DayTotals>();
  for (const r of rows) {
    byDay.set(r.date, {
      date: r.date,
      calories: Number(r.calories),
      proteinGrams: Number(r.protein),
      carbsGrams: Number(r.carbs),
      fatGrams: Number(r.fat),
      fiberGrams: Number(r.fiber),
      waterMl: Number(r.water),
      vegServings: Number(r.veg),
    });
  }
  // Fill missing days so the UI can render bars without holes.
  const out: DayTotals[] = [];
  let cursor = fromInclusive;
  while (cursor <= toInclusive) {
    out.push(byDay.get(cursor) ?? emptyDay(cursor));
    cursor = addDaysStr(cursor, 1);
  }
  return out;
}

async function loadStreaks(
  userId: string,
): Promise<Record<"protein" | "veg", Streak | null>> {
  const rows = await db
    .select()
    .from(streaksTable)
    .where(eq(streaksTable.userId, userId));
  const result: Record<"protein" | "veg", Streak | null> = {
    protein: null,
    veg: null,
  };
  for (const r of rows) result[r.kind] = r;
  return result;
}

async function loadWearables(userId: string): Promise<WearableLink[]> {
  return db
    .select()
    .from(wearableLinksTable)
    .where(eq(wearableLinksTable.userId, userId))
    .orderBy(asc(wearableLinksTable.id));
}

function effectiveCalorieTarget(
  base: number,
  wearables: WearableLink[],
): { effectiveCalorieTarget: number; activityKcal: number } {
  const today = todayStr();
  let activityKcal = 0;
  for (const w of wearables) {
    if (!w.connected || !w.lastSyncedAt) continue;
    if (dayStr(new Date(w.lastSyncedAt)) !== today) continue;
    activityKcal = Math.max(activityKcal, w.lastActivityKcal ?? 0);
  }
  return { effectiveCalorieTarget: base + activityKcal, activityKcal };
}

async function recomputeStreaks(userId: string): Promise<void> {
  const targets = await ensureTargets(userId);
  // Recompute for the trailing 30 days.
  const today = todayStr();
  const start = addDaysStr(today, -29);
  const days = await aggregateRange(userId, start, today);
  const proteinHits = new Set<string>();
  const vegHits = new Set<string>();
  for (const d of days) {
    if (d.proteinGrams >= targets.proteinTargetGrams) proteinHits.add(d.date);
    if (d.vegServings >= targets.vegTargetServings) vegHits.add(d.date);
  }
  for (const kind of ["protein", "veg"] as const) {
    const hits = kind === "protein" ? proteinHits : vegHits;
    let current = 0;
    let lastDayHit: string | null = null;
    // Walk backward from today as long as the day was a hit.
    let cursor = today;
    while (hits.has(cursor)) {
      current++;
      if (lastDayHit === null) lastDayHit = cursor;
      cursor = addDaysStr(cursor, -1);
    }
    // best of trailing 30
    let best = 0;
    let run = 0;
    for (const d of days) {
      if (hits.has(d.date)) {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    await db
      .insert(streaksTable)
      .values({
        userId,
        kind,
        currentDays: current,
        bestDays: Math.max(best, current),
        lastDayHit,
      })
      .onConflictDoUpdate({
        target: [streaksTable.userId, streaksTable.kind],
        set: {
          currentDays: current,
          bestDays: sql`greatest(${streaksTable.bestDays}, ${Math.max(
            best,
            current,
          )})`,
          lastDayHit,
        },
      });
  }
}

const manualLogSchema = z.object({
  label: z.string().min(1).max(128),
  loggedFor: z.string().optional(),
  calories: z.number().int().min(0).max(5000).default(0),
  proteinGrams: z.number().int().min(0).max(400).default(0),
  carbsGrams: z.number().int().min(0).max(800).default(0),
  fatGrams: z.number().int().min(0).max(300).default(0),
  fiberGrams: z.number().int().min(0).max(120).default(0),
  vegServings: z.number().int().min(0).max(20).default(0),
});

const waterLogSchema = z.object({
  ml: z.number().int().min(50).max(3000),
  loggedFor: z.string().optional(),
});

const targetsPatchSchema = z.object({
  calorieTarget: z.number().int().min(800).max(6000).optional(),
  proteinTargetGrams: z.number().int().min(20).max(400).optional(),
  fiberTargetGrams: z.number().int().min(5).max(120).optional(),
  waterTargetMl: z.number().int().min(500).max(8000).optional(),
  vegTargetServings: z.number().int().min(1).max(10).optional(),
});

const wearableConnectSchema = z.object({
  provider: z.enum(["apple_health", "google_fit"]),
});

const wearableSyncSchema = z.object({
  provider: z.enum(["apple_health", "google_fit"]),
  activityKcal: z.number().int().min(0).max(3000),
  steps: z.number().int().min(0).max(60000).optional(),
});

router.get("/wellness/today", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const targets = await ensureTargets(userId);
  const day = todayStr();
  const [days, logs, wearables, streaks] = await Promise.all([
    aggregateRange(userId, day, day),
    db
      .select()
      .from(nutritionLogsTable)
      .where(
        and(
          eq(nutritionLogsTable.userId, userId),
          eq(nutritionLogsTable.loggedFor, day),
        ),
      )
      .orderBy(asc(nutritionLogsTable.createdAt)),
    loadWearables(userId),
    loadStreaks(userId),
  ]);
  const totals = days[0];
  const { effectiveCalorieTarget: effCal, activityKcal } =
    effectiveCalorieTarget(targets.calorieTarget, wearables);
  res.json({
    date: day,
    targets: { ...targets, effectiveCalorieTarget: effCal, activityKcal },
    totals,
    logs,
    wearables,
    streaks,
  });
});

router.get("/wellness/week", async (req: Request, res: Response) => {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  const today = todayStr();
  const start = addDaysStr(today, -6);
  if (!userId) {
    res.json({ from: start, to: today, days: [], targets: null });
    return;
  }
  const targets = await ensureTargets(userId);
  const days = await aggregateRange(userId, start, today);
  res.json({ from: start, to: today, days, targets });
});

router.post("/wellness/log", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = manualLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const data = parsed.data;
  const day = data.loggedFor ?? todayStr();
  const [row] = await db
    .insert(nutritionLogsTable)
    .values({
      userId,
      loggedFor: day,
      source: "manual",
      label: data.label,
      calories: data.calories,
      proteinGrams: data.proteinGrams,
      carbsGrams: data.carbsGrams,
      fatGrams: data.fatGrams,
      fiberGrams: data.fiberGrams,
      vegServings: data.vegServings,
    })
    .returning();
  await recomputeStreaks(userId);
  res.status(201).json({ log: row });
});

router.delete("/wellness/log/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const result = await db
    .delete(nutritionLogsTable)
    .where(
      and(eq(nutritionLogsTable.id, id), eq(nutritionLogsTable.userId, userId)),
    )
    .returning();
  if (result.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await recomputeStreaks(userId);
  res.json({ ok: true });
});

router.post("/wellness/water", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = waterLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const day = parsed.data.loggedFor ?? todayStr();
  const [row] = await db
    .insert(nutritionLogsTable)
    .values({
      userId,
      loggedFor: day,
      source: "water",
      label: `Water ${parsed.data.ml} ml`,
      waterMl: parsed.data.ml,
    })
    .returning();
  res.status(201).json({ log: row });
});

router.put("/wellness/targets", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = targetsPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const current = await ensureTargets(userId);
  const next = { ...current, ...parsed.data };
  const [row] = await db
    .insert(dailyTargetsTable)
    .values(next)
    .onConflictDoUpdate({
      target: dailyTargetsTable.userId,
      set: {
        calorieTarget: next.calorieTarget,
        proteinTargetGrams: next.proteinTargetGrams,
        fiberTargetGrams: next.fiberTargetGrams,
        waterTargetMl: next.waterTargetMl,
        vegTargetServings: next.vegTargetServings,
      },
    })
    .returning();
  await recomputeStreaks(userId);
  res.json({ targets: row });
});

router.post(
  "/wellness/wearable/connect",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const parsed = wearableConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const provider = parsed.data.provider;
    const [row] = await db
      .insert(wearableLinksTable)
      .values({ userId, provider, connected: true })
      .onConflictDoUpdate({
        target: [wearableLinksTable.userId, wearableLinksTable.provider],
        set: { connected: true },
      })
      .returning();
    res.json({ link: row });
  },
);

router.post(
  "/wellness/wearable/disconnect",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const parsed = wearableConnectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    await db
      .update(wearableLinksTable)
      .set({ connected: false })
      .where(
        and(
          eq(wearableLinksTable.userId, userId),
          eq(wearableLinksTable.provider, parsed.data.provider),
        ),
      );
    res.json({ ok: true });
  },
);

router.post("/wellness/wearable/sync", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = wearableSyncSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const provider = parsed.data.provider as WearableProvider;
  const [link] = await db
    .select()
    .from(wearableLinksTable)
    .where(
      and(
        eq(wearableLinksTable.userId, userId),
        eq(wearableLinksTable.provider, provider),
      ),
    );
  if (!link || !link.connected) {
    res.status(409).json({ error: "wearable not connected" });
    return;
  }
  const [updated] = await db
    .update(wearableLinksTable)
    .set({
      lastSyncedAt: new Date(),
      lastActivityKcal: parsed.data.activityKcal,
      lastSteps: parsed.data.steps ?? link.lastSteps,
    })
    .where(eq(wearableLinksTable.id, link.id))
    .returning();
  res.json({ link: updated });
});

router.get("/wellness/streaks", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const streaks = await loadStreaks(userId);
  res.json({ streaks });
});

export default router;

// Exposed for the order-pipeline auto-logger.
export { ensureTargets, recomputeStreaks };
export type { NutritionLog };
