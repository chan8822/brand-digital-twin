import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  premiumMembershipsTable,
  premiumMealsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

const PREMIUM_PRICE_PAISE = 99900;
const PERIOD_DAYS = 30;
const FREE_RD_CONSULTS_PER_PERIOD = 1;

// Slugs must exist in the live catalog (DB or static fallback) so the
// premium badge + gate are observable end-to-end. These are the most
// chef-driven dishes in the current catalog.
const SEED_PREMIUM_SLUGS = [
  { slug: "alfredo-pasta-prawns", reason: "Premium prawn pasta — chef's selection" },
  { slug: "pesto-pasta-prawns", reason: "Premium prawn pasta — chef's selection" },
  { slug: "crispy-peri-peri-chicken-burrito-wrap", reason: "Signature peri-peri build" },
];

let premiumSeeded = false;
async function ensurePremiumSeeded() {
  if (premiumSeeded) return;
  for (const s of SEED_PREMIUM_SLUGS) {
    await db
      .insert(premiumMealsTable)
      .values({ dishSlug: s.slug, reason: s.reason })
      .onConflictDoNothing({ target: premiumMealsTable.dishSlug });
  }
  premiumSeeded = true;
}

function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

// A membership is treated as "still premium" if it is `active` (renewing)
// OR `cancelled` (won't auto-renew but still inside its paid period).
// Both grant entitlements until `currentPeriodEnd`. Only `expired` /
// `pending_payment` are non-premium.
async function loadActive(userId: string) {
  const [row] = await db
    .select()
    .from(premiumMembershipsTable)
    .where(
      and(
        eq(premiumMembershipsTable.userId, userId),
        inArray(premiumMembershipsTable.status, ["active", "cancelled"]),
      ),
    )
    .orderBy(desc(premiumMembershipsTable.createdAt))
    .limit(1);
  if (!row) return null;
  if (new Date(row.currentPeriodEnd).getTime() <= Date.now()) {
    await db
      .update(premiumMembershipsTable)
      .set({ status: "expired" })
      .where(eq(premiumMembershipsTable.id, row.id));
    return null;
  }
  return row;
}

export async function userIsPremium(userId: string): Promise<boolean> {
  const m = await loadActive(userId);
  return !!m;
}

export async function getPremiumSlugSet(): Promise<Set<string>> {
  // Ensure the registry is seeded even on a fresh DB before checkout
  // finalize ever calls /premium/me — otherwise the gate would silently
  // pass premium meals through to non-members.
  await ensurePremiumSeeded();
  const rows = await db.select().from(premiumMealsTable);
  return new Set(rows.map((r) => r.dishSlug));
}

router.get("/premium/me", async (req: Request, res: Response) => {
  await ensurePremiumSeeded();
  if (!req.isAuthenticated()) {
    res.json({ membership: null, isPremium: false, pricePaise: PREMIUM_PRICE_PAISE });
    return;
  }
  const m = await loadActive(req.user.id);
  res.json({
    membership: m,
    isPremium: !!m,
    pricePaise: PREMIUM_PRICE_PAISE,
  });
});

router.post("/premium/subscribe", async (req: Request, res: Response) => {
  await ensurePremiumSeeded();
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const existing = await loadActive(req.user.id);
  if (existing) {
    if (existing.status === "cancelled") {
      // Resume auto-renewal on the same period.
      const [resumed] = await db
        .update(premiumMembershipsTable)
        .set({ status: "active", cancelledAt: null })
        .where(eq(premiumMembershipsTable.id, existing.id))
        .returning();
      res.json({ membership: resumed, isPremium: true, resumed: true });
      return;
    }
    res.status(409).json({ error: "already a premium member", membership: existing });
    return;
  }
  const now = new Date();
  const [created] = await db
    .insert(premiumMembershipsTable)
    .values({
      userId: req.user.id,
      status: "active",
      monthlyPricePaise: PREMIUM_PRICE_PAISE,
      startedAt: now,
      currentPeriodEnd: addDaysUtc(now, PERIOD_DAYS),
      rdConsultsUsedThisPeriod: 0,
      rdConsultsPerPeriod: FREE_RD_CONSULTS_PER_PERIOD,
    })
    .returning();
  res.status(201).json({ membership: created, isPremium: true });
});

router.post("/premium/cancel", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const m = await loadActive(req.user.id);
  if (!m) {
    res.status(404).json({ error: "no active membership" });
    return;
  }
  // The user keeps premium until the period ends; we just stop renewal.
  const [updated] = await db
    .update(premiumMembershipsTable)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(premiumMembershipsTable.id, m.id))
    .returning();
  res.json({ membership: updated });
});

router.post(
  "/premium/use-rd-consult",
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const m = await loadActive(req.user.id);
    if (!m) {
      res.status(403).json({ error: "premium membership required" });
      return;
    }
    if (m.rdConsultsUsedThisPeriod >= m.rdConsultsPerPeriod) {
      res
        .status(409)
        .json({ error: "no free RD consults remaining this period" });
      return;
    }
    const [updated] = await db
      .update(premiumMembershipsTable)
      .set({ rdConsultsUsedThisPeriod: m.rdConsultsUsedThisPeriod + 1 })
      .where(eq(premiumMembershipsTable.id, m.id))
      .returning();
    res.json({
      membership: updated,
      remaining: updated.rdConsultsPerPeriod - updated.rdConsultsUsedThisPeriod,
    });
  },
);

router.get("/premium/meals", async (_req: Request, res: Response) => {
  await ensurePremiumSeeded();
  const rows = await db.select().from(premiumMealsTable);
  res.json({ slugs: rows.map((r) => r.dishSlug), meals: rows });
});

export default router;
