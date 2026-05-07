import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  creditLedgerTable,
  db,
  notificationsTable,
  referralCodesTable,
  referralRedemptionsTable,
  userProfileTable,
} from "@workspace/db";
import {
  finalizeOrder,
  getCreditBalancePaise,
  getLoyaltyConstantsSnapshot,
  getSubscriptionLoyaltyProgress,
  listNotifications,
  redeemCreditAtomic,
  runLoyaltyEngineForUser,
} from "../lib/loyaltyEngine";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return req.user.id;
}

function parseIdParam(raw: unknown, res: Response): number | null {
  const value = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    res.status(400).json({ error: "invalid id" });
    return null;
  }
  return n;
}

function generateCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

router.get("/referral/me", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  let [code] = await db
    .select()
    .from(referralCodesTable)
    .where(eq(referralCodesTable.userId, userId));
  if (!code) {
    let attempt = 0;
    while (attempt < 5 && !code) {
      const candidate = generateCode();
      const inserted = await db
        .insert(referralCodesTable)
        .values({ userId, code: candidate })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        code = inserted[0];
        break;
      }
      // Either the code was taken, or this user already had one inserted
      // by a concurrent request — read it back and use that.
      [code] = await db
        .select()
        .from(referralCodesTable)
        .where(eq(referralCodesTable.userId, userId));
      attempt++;
    }
    if (!code) {
      res.status(500).json({ error: "could not allocate code" });
      return;
    }
  }
  const [redemptions, awards] = await Promise.all([
    db
      .select()
      .from(referralRedemptionsTable)
      .where(eq(referralRedemptionsTable.referrerUserId, userId))
      .orderBy(desc(referralRedemptionsTable.createdAt)),
    getLoyaltyConstantsSnapshot(),
  ]);
  res.json({
    code: code.code,
    awards: {
      referrerPaise: awards.REFERRER_AWARD_PAISE,
      refereePaise: awards.REFEREE_AWARD_PAISE,
    },
    redemptions,
  });
});

const redeemSchema = z.object({
  code: z.string().min(4).max(32),
});

router.post("/referral/redeem", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const codeStr = parsed.data.code.trim().toUpperCase();
  const [code] = await db
    .select()
    .from(referralCodesTable)
    .where(eq(referralCodesTable.code, codeStr));
  if (!code) {
    res.status(404).json({ error: "code not found" });
    return;
  }
  if (code.userId === userId) {
    res.status(400).json({ error: "cannot redeem your own code" });
    return;
  }
  const [existing] = await db
    .select()
    .from(referralRedemptionsTable)
    .where(eq(referralRedemptionsTable.refereeUserId, userId));
  if (existing) {
    res.status(409).json({ error: "already redeemed a referral" });
    return;
  }
  const constants = await getLoyaltyConstantsSnapshot();
  let redemption;
  try {
    [redemption] = await db
      .insert(referralRedemptionsTable)
      .values({
        codeId: code.id,
        referrerUserId: code.userId,
        refereeUserId: userId,
        referrerAwardPaise: constants.REFERRER_AWARD_PAISE,
        refereeAwardPaise: constants.REFEREE_AWARD_PAISE,
      })
      .returning();
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "23505"
    ) {
      res.status(409).json({ error: "already redeemed a referral" });
      return;
    }
    throw e;
  }
  // Credits are released only inside finalizeOrder once the referee
  // places a first server-recorded order. Notify the referrer that
  // a pending redemption exists.
  await db
    .insert(notificationsTable)
    .values({
      userId: code.userId,
      kind: "referral_redeemed",
      title: "A friend joined with your code",
      body: `Credits land when they place their first order.`,
      status: "sent",
      sentAt: new Date(),
      dedupeKey: `referral_pending:${redemption.id}`,
      payload: { redemptionId: redemption.id, status: "pending" },
    })
    .onConflictDoNothing({
      target: [notificationsTable.userId, notificationsTable.dedupeKey],
    });
  res.json({ redemption, awardedPaise: 0, status: "pending_first_order" });
});

router.get("/credit-ledger", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const [entries, balance] = await Promise.all([
    db
      .select()
      .from(creditLedgerTable)
      .where(eq(creditLedgerTable.userId, userId))
      .orderBy(desc(creditLedgerTable.createdAt))
      .limit(100),
    getCreditBalancePaise(userId),
  ]);
  res.json({ entries, balancePaise: balance });
});

const redeemCreditSchema = z.object({
  paise: z.number().int().positive().max(10_000_000),
  note: z.string().max(128).optional(),
  refId: z.string().max(64).optional(),
});

router.post(
  "/credit-ledger/redeem",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const parsed = redeemCreditSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const result = await redeemCreditAtomic({
      userId,
      paise: parsed.data.paise,
      refId: parsed.data.refId,
      note: parsed.data.note,
    });
    if (!result.ok) {
      res.status(409).json({ error: "insufficient credit balance" });
      return;
    }
    res.json({
      redeemedPaise: parsed.data.paise,
      balancePaise: result.balancePaise,
    });
  },
);

const finalizeOrderSchema = z.object({
  orderId: z.string().min(1).max(64),
  items: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        name: z.string().min(1).max(128),
        qty: z.number().int().positive().max(100),
        price: z.number().int().nonnegative().max(1_000_000),
      }),
    )
    .min(1)
    .max(50),
  address: z
    .object({
      label: z.string().max(64).nullable().optional(),
      line: z.string().max(256).nullable().optional(),
      city: z.string().max(64).nullable().optional(),
      pincode: z.string().max(16).nullable().optional(),
      phone: z.string().max(32).nullable().optional(),
    })
    .optional(),
  applyCreditsPaise: z.number().int().nonnegative().max(10_000_000).optional(),
  scheduledFor: z.string().datetime().optional(),
});

router.post("/orders/finalize", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = finalizeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  try {
    const { scheduledFor, ...rest } = parsed.data;
    const out = await finalizeOrder({
      userId,
      ...rest,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    });
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "finalize order failed");
    res.status(500).json({ error: "finalize failed" });
  }
});

router.get("/notifications", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const items = await listNotifications(userId);
  res.json({ notifications: items });
});

router.post(
  "/notifications/:id/dismiss",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = parseIdParam(req.params.id, res);
    if (id === null) return;
    const [updated] = await db
      .update(notificationsTable)
      .set({ status: "dismissed" })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.userId, userId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ notification: updated });
  },
);

router.get("/loyalty/progress", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const progress = await getSubscriptionLoyaltyProgress(userId);
  res.json({ progress });
});

router.post("/loyalty/run", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const result = await runLoyaltyEngineForUser(userId);
  res.json({
    triggered: result.notifications.length,
    notifications: result.notifications,
  });
});

const profileSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  anniversaryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  proteinGoalGrams: z.number().int().positive().max(500).optional(),
  proteinShortfallStreak: z.number().int().min(0).max(60).optional(),
});

router.get("/profile", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const [profile] = await db
    .select()
    .from(userProfileTable)
    .where(eq(userProfileTable.userId, userId));
  res.json({ profile: profile ?? null });
});

async function upsertProfilePartial(
  userId: string,
  patch: z.infer<typeof profileSchema>,
) {
  // PATCH semantics: omitted fields stay untouched, including on first
  // insert (where they fall back to null/0 defaults).
  const insertValues = {
    userId,
    birthDate: patch.birthDate ?? null,
    anniversaryDate: patch.anniversaryDate ?? null,
    proteinGoalGrams: patch.proteinGoalGrams ?? null,
    proteinShortfallStreak: patch.proteinShortfallStreak ?? 0,
  };
  const updateSet: Record<string, unknown> = {};
  if (patch.birthDate !== undefined) updateSet["birthDate"] = patch.birthDate;
  if (patch.anniversaryDate !== undefined)
    updateSet["anniversaryDate"] = patch.anniversaryDate;
  if (patch.proteinGoalGrams !== undefined)
    updateSet["proteinGoalGrams"] = patch.proteinGoalGrams;
  if (patch.proteinShortfallStreak !== undefined)
    updateSet["proteinShortfallStreak"] = patch.proteinShortfallStreak;

  if (Object.keys(updateSet).length === 0) {
    const [existing] = await db
      .insert(userProfileTable)
      .values(insertValues)
      .onConflictDoNothing({ target: userProfileTable.userId })
      .returning();
    if (existing) return existing;
    const [row] = await db
      .select()
      .from(userProfileTable)
      .where(eq(userProfileTable.userId, userId));
    return row;
  }

  const [profile] = await db
    .insert(userProfileTable)
    .values(insertValues)
    .onConflictDoUpdate({ target: userProfileTable.userId, set: updateSet })
    .returning();
  return profile;
}

async function profileWriteHandler(req: Request, res: Response) {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const profile = await upsertProfilePartial(userId, parsed.data);
  res.json({ profile });
}

router.put("/profile", profileWriteHandler);
router.patch("/profile", profileWriteHandler);

export default router;
