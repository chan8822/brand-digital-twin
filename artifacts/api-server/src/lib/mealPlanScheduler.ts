/**
 * Auto-replan scheduler for the smart weekly meal planner.
 *
 * Runs once per UTC day. For every user with `autoReplanEnabled = true`,
 * pre-generates a draft plan for the next ISO week so it's waiting in
 * the planner UI when they open the app. The user still has to swap /
 * accept manually — we never auto-schedule deliveries.
 *
 * Idempotency: `meal_plans` has a unique (user_id, week_start_date)
 * index and we insert with `onConflictDoNothing`, so multiple ticks in
 * the same day never produce duplicates and never clobber a plan the
 * user has already touched.
 */

import { and, eq } from "drizzle-orm";
import {
  db,
  mealPlanSettingsTable,
  mealPlansTable,
} from "@workspace/db";
import { logger } from "./logger";
import { generateWeeklyPlan } from "./mealPlanner";
import { nextMonday } from "../routes/mealPlans";

const SWEEP_HOUR_UTC = clampHour(
  Number(process.env["MEAL_PLAN_SWEEP_HOUR_UTC"] ?? 1),
);
const FORCE_INTERVAL_MS = Number(
  process.env["MEAL_PLAN_SWEEP_INTERVAL_MS"] ?? 0,
);

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function clampHour(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(23, Math.max(0, Math.floor(n)));
}

function msUntilNextSweep(now: Date): number {
  const next = new Date(now);
  next.setUTCHours(SWEEP_HOUR_UTC, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

export async function autoReplanTick(): Promise<{
  considered: number;
  generated: number;
  skipped: number;
  errors: number;
}> {
  const optedIn = await db
    .select()
    .from(mealPlanSettingsTable)
    .where(eq(mealPlanSettingsTable.autoReplanEnabled, true));

  // Always plan for the *next* ISO week. `nextMonday()` returns today
  // if invoked on a Monday, which would generate the current week. Add
  // one day so Monday ticks correctly land on the following Monday.
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const weekStart = nextMonday(tomorrow);
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  let generated = 0;
  let skipped = 0;
  let errors = 0;
  for (const s of optedIn) {
    try {
      const existing = await db
        .select({ id: mealPlansTable.id })
        .from(mealPlansTable)
        .where(
          and(
            eq(mealPlansTable.userId, s.userId),
            eq(mealPlansTable.weekStartDate, weekStartIso),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        skipped++;
        continue;
      }
      const result = await generateWeeklyPlan(s.userId, weekStart, {
        weeklyBudgetPaise: s.weeklyBudgetPaise ?? null,
        maxRepetitionsPerDish: s.maxRepetitionsPerDish,
      });
      await db
        .insert(mealPlansTable)
        .values({
          userId: s.userId,
          weekStartDate: weekStartIso,
          status: "draft",
          constraints: result.constraints,
          days: result.days,
          totals: result.totals,
          model: result.model,
          notes: ["auto", ...result.notes].join(","),
        })
        .onConflictDoNothing({
          target: [mealPlansTable.userId, mealPlansTable.weekStartDate],
        });
      generated++;
    } catch (err) {
      errors++;
      logger.warn({ err, userId: s.userId }, "auto-replan failed for user");
    }
  }
  logger.info(
    { considered: optedIn.length, generated, skipped, errors },
    "meal-plan auto-replan tick complete",
  );
  return { considered: optedIn.length, generated, skipped, errors };
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await autoReplanTick();
  } catch (err) {
    logger.error({ err }, "meal-plan scheduler tick failed");
  } finally {
    running = false;
  }
}

export function startMealPlanScheduler(): void {
  if (timer) return;
  if (FORCE_INTERVAL_MS > 0) {
    timer = setInterval(() => void tick(), FORCE_INTERVAL_MS);
    return;
  }
  const schedule = (): void => {
    const wait = msUntilNextSweep(new Date());
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, wait);
  };
  schedule();
}

export function stopMealPlanScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    clearInterval(timer);
    timer = null;
  }
}
