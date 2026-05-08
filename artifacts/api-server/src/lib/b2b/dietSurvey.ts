/**
 * Team diet profile storage. The B2B admin fills a short survey; we
 * persist it as the canonical constraints used by the lunch planner
 * and as a "hasDietProfile" signal for account health.
 */
import { eq } from "drizzle-orm";
import {
  db,
  teamDietProfilesTable,
  type TeamDietConstraints,
  type TeamDietProfile,
} from "@workspace/db";

const ALLERGEN_VOCAB = new Set([
  "peanut",
  "tree_nut",
  "milk",
  "egg",
  "wheat",
  "gluten",
  "soy",
  "shellfish",
  "fish",
  "sesame",
  "mustard",
]);

/** Defensive normaliser so survey input never produces nonsense rows. */
export function normaliseConstraints(
  raw: Partial<TeamDietConstraints>,
): TeamDietConstraints {
  const headcount = clamp(Math.round(Number(raw.headcount ?? 0)), 1, 5_000);
  const vegCount = clamp(Math.round(Number(raw.vegCount ?? 0)), 0, headcount);
  const veganCount = clamp(
    Math.round(Number(raw.veganCount ?? 0)),
    0,
    headcount,
  );
  const glutenFreeCount = clamp(
    Math.round(Number(raw.glutenFreeCount ?? 0)),
    0,
    headcount,
  );
  const jainCount = clamp(Math.round(Number(raw.jainCount ?? 0)), 0, headcount);
  const halalCount = clamp(
    Math.round(Number(raw.halalCount ?? 0)),
    0,
    headcount,
  );
  const allergens = Array.from(
    new Set(
      (raw.allergens ?? [])
        .map((a) => String(a).trim().toLowerCase().replace(/\s+/g, "_"))
        .filter((a) => ALLERGEN_VOCAB.has(a)),
    ),
  );
  const cuisinePrefs = Array.from(
    new Set(
      (raw.cuisinePrefs ?? [])
        .map((c) => String(c).trim().toLowerCase())
        .filter((c) => c.length > 0 && c.length < 32),
    ),
  ).slice(0, 12);
  const calorieFloor =
    raw.calorieFloor == null
      ? null
      : clamp(Math.round(Number(raw.calorieFloor)), 200, 1500);
  const calorieCeiling =
    raw.calorieCeiling == null
      ? null
      : clamp(Math.round(Number(raw.calorieCeiling)), 300, 2500);
  const vegPct =
    headcount > 0 ? Math.round((vegCount / headcount) * 100) : 0;
  const notes = String(raw.notes ?? "").slice(0, 1000);
  return {
    headcount,
    vegPct,
    vegCount,
    veganCount,
    glutenFreeCount,
    jainCount,
    halalCount,
    allergens,
    cuisinePrefs,
    calorieFloor,
    calorieCeiling,
    notes,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export async function upsertDietProfile(
  companyId: number,
  raw: Partial<TeamDietConstraints>,
): Promise<TeamDietProfile> {
  const constraints = normaliseConstraints(raw);
  const [row] = await db
    .insert(teamDietProfilesTable)
    .values({ companyId, constraints })
    .onConflictDoUpdate({
      target: teamDietProfilesTable.companyId,
      set: { constraints, lastSurveyAt: new Date() },
    })
    .returning();
  if (!row) throw new Error("failed to upsert diet profile");
  return row;
}

export async function getDietProfile(
  companyId: number,
): Promise<TeamDietProfile | null> {
  const [row] = await db
    .select()
    .from(teamDietProfilesTable)
    .where(eq(teamDietProfilesTable.companyId, companyId))
    .limit(1);
  return row ?? null;
}
