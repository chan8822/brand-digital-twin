import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuthUser as requireAuth } from "../middlewares/requireAuth";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, userPreferencesTable } from "@workspace/db";
import { invalidateUserBrief } from "../lib/userBrief";

const router: IRouter = Router();

// requireAuth: see shared middleware/requireAuth.ts

const dietaryStyle = z.enum([
  "omnivore",
  "vegetarian",
  "vegan",
  "pescatarian",
  "keto",
]);
const spiceLevel = z.enum(["none", "mild", "medium", "hot"]);
const activityLevel = z.enum([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);
const goal = z.enum([
  "lose_weight",
  "maintain",
  "gain_muscle",
  "general_wellness",
]);

const stringList = z
  .array(z.string().trim().min(1).max(64))
  .max(50)
  .transform((arr) => Array.from(new Set(arr.map((s) => s.toLowerCase()))));

const preferencesSchema = z.object({
  allergens: stringList.optional(),
  dislikedIngredients: stringList.optional(),
  cuisines: stringList.optional(),
  spiceLevel: spiceLevel.optional(),
  dietaryStyle: dietaryStyle.optional(),
  goal: goal.optional(),
  activityLevel: activityLevel.optional(),
  calorieTarget: z.number().int().min(800).max(6000).nullable().optional(),
  proteinTargetGrams: z.number().int().min(20).max(400).nullable().optional(),
  carbsTargetGrams: z.number().int().min(0).max(800).nullable().optional(),
  fatTargetGrams: z.number().int().min(0).max(300).nullable().optional(),
  markQuizComplete: z.boolean().optional(),
});

router.get("/preferences", async (req: Request, res: Response) => {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) {
    res.json({ preferences: null });
    return;
  }
  const [row] = await db
    .select()
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));
  res.json({ preferences: row ?? null });
});

async function upsertPreferences(
  userId: string,
  patch: z.infer<typeof preferencesSchema>,
) {
  const insertValues = {
    userId,
    allergens: patch.allergens ?? [],
    dislikedIngredients: patch.dislikedIngredients ?? [],
    cuisines: patch.cuisines ?? [],
    spiceLevel: patch.spiceLevel ?? "medium",
    dietaryStyle: patch.dietaryStyle ?? "omnivore",
    goal: patch.goal ?? "general_wellness",
    activityLevel: patch.activityLevel ?? "moderate",
    calorieTarget: patch.calorieTarget ?? null,
    proteinTargetGrams: patch.proteinTargetGrams ?? null,
    carbsTargetGrams: patch.carbsTargetGrams ?? null,
    fatTargetGrams: patch.fatTargetGrams ?? null,
    quizCompletedAt: patch.markQuizComplete ? new Date() : null,
  };
  const updateSet: Record<string, unknown> = {};
  if (patch.allergens !== undefined) updateSet["allergens"] = patch.allergens;
  if (patch.dislikedIngredients !== undefined)
    updateSet["dislikedIngredients"] = patch.dislikedIngredients;
  if (patch.cuisines !== undefined) updateSet["cuisines"] = patch.cuisines;
  if (patch.spiceLevel !== undefined)
    updateSet["spiceLevel"] = patch.spiceLevel;
  if (patch.dietaryStyle !== undefined)
    updateSet["dietaryStyle"] = patch.dietaryStyle;
  if (patch.goal !== undefined) updateSet["goal"] = patch.goal;
  if (patch.activityLevel !== undefined)
    updateSet["activityLevel"] = patch.activityLevel;
  if (patch.calorieTarget !== undefined)
    updateSet["calorieTarget"] = patch.calorieTarget;
  if (patch.proteinTargetGrams !== undefined)
    updateSet["proteinTargetGrams"] = patch.proteinTargetGrams;
  if (patch.carbsTargetGrams !== undefined)
    updateSet["carbsTargetGrams"] = patch.carbsTargetGrams;
  if (patch.fatTargetGrams !== undefined)
    updateSet["fatTargetGrams"] = patch.fatTargetGrams;
  if (patch.markQuizComplete) updateSet["quizCompletedAt"] = new Date();

  if (Object.keys(updateSet).length === 0) {
    const [existing] = await db
      .insert(userPreferencesTable)
      .values(insertValues)
      .onConflictDoNothing({ target: userPreferencesTable.userId })
      .returning();
    if (existing) return existing;
    const [row] = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId));
    return row;
  }

  const [row] = await db
    .insert(userPreferencesTable)
    .values(insertValues)
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: updateSet,
    })
    .returning();
  return row;
}

async function preferencesWriteHandler(req: Request, res: Response) {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const preferences = await upsertPreferences(userId, parsed.data);
  invalidateUserBrief(userId);
  res.json({ preferences });
}

router.put("/preferences", preferencesWriteHandler);
router.patch("/preferences", preferencesWriteHandler);

export default router;
