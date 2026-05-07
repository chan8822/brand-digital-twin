import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
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
  LOYALTY_CONSTANTS,
  getCreditBalancePaise,
  issueCredit,
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
    while (attempt < 5) {
      const candidate = generateCode();
      const inserted = await db
        .insert(referralCodesTable)
        .values({ userId, code: candidate })
        .onConflictDoNothing({ target: referralCodesTable.code })
        .returning();
      if (inserted[0]) {
        code = inserted[0];
        break;
      }
      attempt++;
    }
    if (!code) {
      res.status(500).json({ error: "could not allocate code" });
      return;
    }
  }
  const redemptions = await db
    .select()
    .from(referralRedemptionsTable)
    .where(eq(referralRedemptionsTable.referrerUserId, userId))
    .orderBy(desc(referralRedemptionsTable.createdAt));
  res.json({
    code: code.code,
    awards: {
      referrerPaise: LOYALTY_CONSTANTS.REFERRER_AWARD_PAISE,
      refereePaise: LOYALTY_CONSTANTS.REFEREE_AWARD_PAISE,
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
  const expiresAt = new Date();
  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + LOYALTY_CONSTANTS.REFERRAL_EXPIRY_DAYS,
  );
  let redemption;
  try {
    redemption = await db.transaction(async (tx) => {
      const [r] = await tx
        .insert(referralRedemptionsTable)
        .values({
          codeId: code.id,
          referrerUserId: code.userId,
          refereeUserId: userId,
          referrerAwardPaise: LOYALTY_CONSTANTS.REFERRER_AWARD_PAISE,
          refereeAwardPaise: LOYALTY_CONSTANTS.REFEREE_AWARD_PAISE,
        })
        .returning();
      await issueCredit(
        {
          userId: code.userId,
          deltaPaise: LOYALTY_CONSTANTS.REFERRER_AWARD_PAISE,
          reason: "referral_referrer_award",
          refType: "referral_redemption",
          refId: String(r.id),
          note: "Friend joined with your code",
          expiresAt,
        },
        tx,
      );
      await issueCredit(
        {
          userId,
          deltaPaise: LOYALTY_CONSTANTS.REFEREE_AWARD_PAISE,
          reason: "referral_referee_signup",
          refType: "referral_redemption",
          refId: String(r.id),
          note: "Welcome bonus",
          expiresAt,
        },
        tx,
      );
      await tx
        .insert(notificationsTable)
        .values({
          userId: code.userId,
          kind: "referral_redeemed",
          title: "Someone joined with your code!",
          body: `You earned Rs.${(LOYALTY_CONSTANTS.REFERRER_AWARD_PAISE / 100).toFixed(0)} in credits.`,
          status: "sent",
          sentAt: new Date(),
          dedupeKey: `referral:${r.id}`,
          payload: { redemptionId: r.id },
        })
        .onConflictDoNothing({
          target: [notificationsTable.userId, notificationsTable.dedupeKey],
        });
      return r;
    });
  } catch (e) {
    // Unique violation on referee means a concurrent request already
    // redeemed; surface the same conflict response.
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
  res.json({ redemption, awardedPaise: LOYALTY_CONSTANTS.REFEREE_AWARD_PAISE });
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

router.put("/profile", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const values = {
    userId,
    birthDate: parsed.data.birthDate ?? null,
    anniversaryDate: parsed.data.anniversaryDate ?? null,
    proteinGoalGrams: parsed.data.proteinGoalGrams ?? null,
    proteinShortfallStreak: parsed.data.proteinShortfallStreak ?? 0,
  };
  const [profile] = await db
    .insert(userProfileTable)
    .values(values)
    .onConflictDoUpdate({
      target: userProfileTable.userId,
      set: {
        birthDate: values.birthDate,
        anniversaryDate: values.anniversaryDate,
        proteinGoalGrams: values.proteinGoalGrams,
        proteinShortfallStreak: values.proteinShortfallStreak,
      },
    })
    .returning();
  res.json({ profile });
});

// Filter to use elsewhere (kept here for reference / not exported)
void sql;
void or;
void isNull;
void gt;

export default router;
