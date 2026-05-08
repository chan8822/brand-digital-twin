/**
 * Weekly lunch planner.
 *
 * Strategy: deterministic shortlist first, then optional AI re-ordering
 * + rationale text. The deterministic step is always available so a
 * cohort always gets a plan even if the model is offline.
 *
 * Constraints we enforce per day:
 *   - Always include at least one veg item if vegCount > 0.
 *   - Always include a vegan item if veganCount > 0 and one is available.
 *   - Always include a gluten-free item if glutenFreeCount > 0.
 *   - Never include items whose `allergens` intersect with constraint.allergens.
 *   - Respect kcal floor/ceiling if set (warning only — we don't drop the day).
 *   - Maximise cuisine variety across the week.
 *
 * Idempotent per (companyId, weekStartDate) thanks to uq_lunch_plan_company_week.
 */
import { generateText } from "ai";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  lunchPlanProposalsTable,
  menuItemsTable,
  type LunchPlan,
  type LunchPlanDay,
  type LunchPlanProposal,
  type MenuItem,
  type TeamDietConstraints,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "../ai/model";
import { logger } from "../logger";

const TIMEOUT_MS = 12_000;
const ITEMS_PER_DAY = 4;
const WEEKDAYS = 5;

interface CandidateItem {
  id: number;
  slug: string;
  name: string;
  isVeg: boolean;
  tags: string[];
  allergens: string[];
  cuisineTags: string[];
  kcal: number | null;
  pricePaise: number;
}

function toCandidate(m: MenuItem): CandidateItem {
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    isVeg: m.isVeg,
    tags: m.tags ?? [],
    allergens: (m.allergens ?? []).map((a) => a.toLowerCase()),
    cuisineTags: (m.cuisineTags ?? []).map((c) => c.toLowerCase()),
    kcal: m.macros?.kcal ?? null,
    pricePaise: m.pricePaise,
  };
}

/** Days in the week starting `mondayIso` (YYYY-MM-DD), Mon..Fri. */
export function weekDates(mondayIso: string): string[] {
  const out: string[] = [];
  const start = new Date(`${mondayIso}T00:00:00Z`);
  for (let i = 0; i < WEEKDAYS; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function nextMonday(today: Date = new Date()): string {
  const d = new Date(today);
  const day = d.getUTCDay(); // 0..6, 1=Monday
  const delta = day === 1 ? 7 : (8 - day) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure deterministic plan builder. Exposed for tests.
 */
export function buildDeterministicPlan(args: {
  weekStartDate: string;
  constraints: TeamDietConstraints;
  items: CandidateItem[];
}): LunchPlan {
  const { weekStartDate, constraints, items } = args;
  const allergenSet = new Set(constraints.allergens.map((a) => a.toLowerCase()));
  const safeItems = items.filter(
    (it) => !it.allergens.some((a) => allergenSet.has(a)),
  );
  // Bucket by need.
  const veg = safeItems.filter((it) => it.isVeg);
  const nonVeg = safeItems.filter((it) => !it.isVeg);
  const vegan = veg.filter((it) => it.tags.includes("vegan"));
  const glutenFree = safeItems.filter((it) => it.tags.includes("gluten-free"));
  const jain = veg.filter((it) => it.tags.includes("jain"));

  const used = new Set<number>();
  // Cycle through cuisine prefs for variety. If empty, use whatever we have.
  const cuisineRotation =
    constraints.cuisinePrefs.length > 0
      ? constraints.cuisinePrefs
      : Array.from(
          new Set(safeItems.flatMap((it) => it.cuisineTags).filter(Boolean)),
        );

  const days: LunchPlanDay[] = [];
  const dates = weekDates(weekStartDate);
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const warnings: string[] = [];
    const picks: LunchPlanDay["picks"] = [];

    const tryPick = (
      pool: CandidateItem[],
      why: string,
      preferredCuisine?: string,
    ): CandidateItem | null => {
      const sorted = [...pool].sort((a, b) => {
        const aPref = preferredCuisine
          ? a.cuisineTags.includes(preferredCuisine)
            ? -1
            : 0
          : 0;
        const bPref = preferredCuisine
          ? b.cuisineTags.includes(preferredCuisine)
            ? -1
            : 0
          : 0;
        if (aPref !== bPref) return aPref - bPref;
        if (used.has(a.id) !== used.has(b.id)) {
          return used.has(a.id) ? 1 : -1;
        }
        return a.id - b.id;
      });
      const picked = sorted.find((it) => !picks.some((p) => p.menuItemId === it.id));
      if (!picked) return null;
      used.add(picked.id);
      picks.push({
        menuItemId: picked.id,
        slug: picked.slug,
        name: picked.name,
        why,
      });
      return picked;
    };

    const cuisine = cuisineRotation[i % Math.max(1, cuisineRotation.length)];
    if (constraints.veganCount > 0) {
      if (!tryPick(vegan, `serves ${constraints.veganCount} vegan teammates`, cuisine)) {
        warnings.push("no vegan option available");
      }
    }
    if (constraints.glutenFreeCount > 0) {
      if (
        !tryPick(
          glutenFree,
          `serves ${constraints.glutenFreeCount} gluten-free teammates`,
          cuisine,
        )
      ) {
        warnings.push("no gluten-free option available");
      }
    }
    if (constraints.jainCount > 0) {
      if (!tryPick(jain, `serves ${constraints.jainCount} Jain teammates`, cuisine)) {
        warnings.push("no Jain option available");
      }
    }
    if (constraints.vegCount > 0) {
      tryPick(veg, "vegetarian mainline", cuisine);
    }
    // Fill remaining slots with whichever pool is large enough, balancing
    // veg/non-veg roughly to the team mix.
    const wantNonVeg = constraints.headcount - constraints.vegCount > 0;
    while (picks.length < ITEMS_PER_DAY) {
      const pool =
        wantNonVeg && nonVeg.length > 0 && picks.filter((p) => !veg.find((v) => v.id === p.menuItemId)).length === 0
          ? nonVeg
          : safeItems;
      if (pool.length === 0) break;
      const picked = tryPick(pool, "round out the menu", cuisine);
      if (!picked) break;
    }

    if (constraints.calorieFloor != null || constraints.calorieCeiling != null) {
      const kcalPicks = picks
        .map((p) => safeItems.find((it) => it.id === p.menuItemId)?.kcal ?? null)
        .filter((k): k is number => k != null);
      const avg =
        kcalPicks.length > 0
          ? kcalPicks.reduce((a, b) => a + b, 0) / kcalPicks.length
          : null;
      if (avg != null) {
        if (constraints.calorieFloor != null && avg < constraints.calorieFloor) {
          warnings.push(`avg kcal ${Math.round(avg)} below floor`);
        }
        if (
          constraints.calorieCeiling != null &&
          avg > constraints.calorieCeiling
        ) {
          warnings.push(`avg kcal ${Math.round(avg)} above ceiling`);
        }
      }
    }

    days.push({ date, picks, warnings });
  }

  const summary =
    `Plan for ${dates[0]}–${dates[dates.length - 1]} for a team of ` +
    `${constraints.headcount}: ${constraints.vegCount} veg / ` +
    `${constraints.veganCount} vegan / ${constraints.glutenFreeCount} GF / ` +
    `${constraints.jainCount} Jain / ${constraints.halalCount} halal.`;
  return {
    weekStartDate,
    days,
    summary,
    modelId: "deterministic",
    generatedBy: "deterministic",
  };
}

async function loadCandidateItems(): Promise<CandidateItem[]> {
  const rows = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.isAvailable, true));
  return rows.map(toCandidate);
}

/**
 * Ask the model to write a one-line `why` per pick using the deterministic
 * plan as its scaffolding. We don't let it change the picks themselves.
 */
async function enrichWithAi(plan: LunchPlan): Promise<LunchPlan> {
  try {
    const slim = plan.days.map((d) => ({
      date: d.date,
      picks: d.picks.map((p) => ({ slug: p.slug, name: p.name })),
    }));
    const prompt = [
      "You write one-line rationales for an office lunch plan.",
      "For each pick on each day, return a 'why' under 18 words explaining",
      "why it suits the office team. Output STRICT JSON of the form:",
      '{"days":[{"date":"YYYY-MM-DD","picks":[{"slug":"x","why":"..."}]}]}',
      "",
      "Plan:",
      JSON.stringify(slim, null, 2),
    ].join("\n");
    const { text } = await Promise.race([
      generateText({ model: getModel(), prompt, temperature: 0.2 }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("planner timeout")), TIMEOUT_MS),
      ),
    ]);
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return plan;
    const parsed = JSON.parse(m[0]) as {
      days?: Array<{
        date?: string;
        picks?: Array<{ slug?: string; why?: string }>;
      }>;
    };
    const dayMap = new Map<string, Map<string, string>>();
    for (const d of parsed.days ?? []) {
      if (!d.date) continue;
      const m2 = new Map<string, string>();
      for (const p of d.picks ?? []) {
        if (p.slug && p.why) m2.set(p.slug, String(p.why).slice(0, 200));
      }
      dayMap.set(d.date, m2);
    }
    const merged: LunchPlan = {
      ...plan,
      modelId: DEFAULT_MODEL_ID,
      generatedBy: "ai",
      days: plan.days.map((d) => ({
        ...d,
        picks: d.picks.map((p) => ({
          ...p,
          why: dayMap.get(d.date)?.get(p.slug) ?? p.why,
        })),
      })),
    };
    return merged;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "lunch planner: AI rationale fallback",
    );
    return plan;
  }
}

export async function generateLunchPlan(args: {
  companyId: number;
  weekStartDate?: string;
  constraints: TeamDietConstraints;
}): Promise<LunchPlanProposal> {
  const weekStartDate = args.weekStartDate ?? nextMonday();
  const items = await loadCandidateItems();
  if (items.length === 0) {
    throw new Error("no menu items available to plan");
  }
  const draft = buildDeterministicPlan({
    weekStartDate,
    constraints: args.constraints,
    items,
  });
  const plan = await enrichWithAi(draft);
  // Idempotent upsert per (company, weekStartDate).
  const [row] = await db
    .insert(lunchPlanProposalsTable)
    .values({
      companyId: args.companyId,
      weekStartDate,
      plan,
    })
    .onConflictDoUpdate({
      target: [
        lunchPlanProposalsTable.companyId,
        lunchPlanProposalsTable.weekStartDate,
      ],
      set: { plan, status: "draft" },
    })
    .returning();
  if (!row) throw new Error("failed to upsert lunch plan proposal");
  return row;
}

export async function getCurrentLunchPlan(
  companyId: number,
): Promise<LunchPlanProposal | null> {
  const week = nextMonday();
  const [row] = await db
    .select()
    .from(lunchPlanProposalsTable)
    .where(
      and(
        eq(lunchPlanProposalsTable.companyId, companyId),
        eq(lunchPlanProposalsTable.weekStartDate, week),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listLunchPlans(
  companyId: number,
  limit = 12,
): Promise<LunchPlanProposal[]> {
  return db
    .select()
    .from(lunchPlanProposalsTable)
    .where(eq(lunchPlanProposalsTable.companyId, companyId))
    .orderBy(sql`${lunchPlanProposalsTable.weekStartDate} desc`)
    .limit(Math.max(1, Math.min(50, limit)));
}

export async function loadMenuItemsByIds(ids: number[]): Promise<MenuItem[]> {
  if (ids.length === 0) return [];
  return db.select().from(menuItemsTable).where(inArray(menuItemsTable.id, ids));
}
