/**
 * Routes for the B2B office lunch planner & account health agent
 * (Task #39).
 *
 * Two surfaces:
 *   1. /companies/:slug/diet-profile, /lunch-plan/* — for the company
 *      admin (must be an active admin member of the company).
 *   2. /sales/* — for internal sales reps (admin gate via x-admin-token
 *      or session.isAdmin).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  companiesTable,
  companyMembersTable,
  db,
  lunchPlanProposalsTable,
  officeOrdersTable,
  qbrDraftsTable,
  type Company,
  type CompanyMember,
} from "@workspace/db";
import {
  generateLunchPlan,
  getCurrentLunchPlan,
  getDietProfile,
  getLatestHealth,
  getLatestQbr,
  generateQbr,
  listAllAccountsWithHealth,
  listLunchPlans,
  recomputeHealth,
  renderQbrMarkdown,
  updateQbrSections,
  upsertDietProfile,
} from "../lib/b2b";

const router: IRouter = Router();

function isAdminRequest(req: Request): boolean {
  const expected = process.env["RD_ADMIN_TOKEN"];
  if (expected) {
    const header = req.header("x-admin-token");
    if (header && header === expected) return true;
  }
  const session = (req as Request & { session?: { isAdmin?: boolean } })
    .session;
  return session?.isAdmin === true;
}

function requireAuth(
  req: Request,
  res: Response,
): { id: string; email: string | null } | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  const u = req.user as { id: string; email?: string | null };
  return { id: u.id, email: u.email ?? null };
}

async function loadCompanyBySlug(slug: string): Promise<Company | undefined> {
  const [c] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.slug, slug));
  return c;
}

async function loadActiveMembership(
  companyId: number,
  userId: string,
): Promise<CompanyMember | undefined> {
  const [m] = await db
    .select()
    .from(companyMembersTable)
    .where(
      and(
        eq(companyMembersTable.companyId, companyId),
        eq(companyMembersTable.userId, userId),
      ),
    );
  return m;
}

/**
 * Resolve a company + caller. If the caller is an internal admin (x-admin-token
 * or session.isAdmin), the membership check is bypassed but mustBeAdmin is
 * still honoured for member-side surfaces. Returns null after writing a 4xx.
 */
async function resolveCompanyAccess(
  req: Request,
  res: Response,
  opts: { mustBeAdmin: boolean },
): Promise<{ company: Company; isInternalAdmin: boolean } | null> {
  const slug = String(req.params.slug ?? "");
  const company = await loadCompanyBySlug(slug);
  if (!company) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  if (isAdminRequest(req)) {
    return { company, isInternalAdmin: true };
  }
  const auth = requireAuth(req, res);
  if (!auth) return null;
  const m = await loadActiveMembership(company.id, auth.id);
  if (!m || m.status !== "active") {
    res.status(403).json({ error: "not a member" });
    return null;
  }
  if (opts.mustBeAdmin && m.role !== "admin") {
    res.status(403).json({ error: "admin only" });
    return null;
  }
  return { company, isInternalAdmin: false };
}

// ---------- Diet survey ----------

const dietSurveySchema = z.object({
  headcount: z.number().int().min(1).max(5_000),
  vegCount: z.number().int().min(0).max(5_000).default(0),
  veganCount: z.number().int().min(0).max(5_000).default(0),
  glutenFreeCount: z.number().int().min(0).max(5_000).default(0),
  jainCount: z.number().int().min(0).max(5_000).default(0),
  halalCount: z.number().int().min(0).max(5_000).default(0),
  allergens: z.array(z.string()).max(20).default([]),
  cuisinePrefs: z.array(z.string()).max(12).default([]),
  calorieFloor: z.number().int().min(200).max(1500).nullable().default(null),
  calorieCeiling: z.number().int().min(300).max(2500).nullable().default(null),
  notes: z.string().max(1000).default(""),
});

router.get(
  "/companies/:slug/diet-profile",
  async (req: Request, res: Response) => {
    const ctx = await resolveCompanyAccess(req, res, { mustBeAdmin: false });
    if (!ctx) return;
    const profile = await getDietProfile(ctx.company.id);
    res.json({ profile });
  },
);

router.put(
  "/companies/:slug/diet-profile",
  async (req: Request, res: Response) => {
    const ctx = await resolveCompanyAccess(req, res, { mustBeAdmin: true });
    if (!ctx) return;
    const parsed = dietSurveySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const profile = await upsertDietProfile(ctx.company.id, {
      ...parsed.data,
      vegPct: 0, // recomputed inside normaliseConstraints
    });
    res.json({ profile });
  },
);

// ---------- Lunch plan ----------

const generatePlanSchema = z
  .object({
    weekStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .default({});

router.post(
  "/companies/:slug/lunch-plan/generate",
  async (req: Request, res: Response) => {
    const ctx = await resolveCompanyAccess(req, res, { mustBeAdmin: true });
    if (!ctx) return;
    const profile = await getDietProfile(ctx.company.id);
    if (!profile) {
      res
        .status(409)
        .json({ error: "capture a team diet profile first" });
      return;
    }
    const parsed = generatePlanSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    try {
      const proposal = await generateLunchPlan({
        companyId: ctx.company.id,
        weekStartDate: parsed.data.weekStartDate,
        constraints: profile.constraints,
      });
      res.json({ proposal });
    } catch (err) {
      req.log?.warn?.(
        { err: (err as Error).message, slug: ctx.company.slug },
        "lunch-plan generate failed",
      );
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get(
  "/companies/:slug/lunch-plan/current",
  async (req: Request, res: Response) => {
    const ctx = await resolveCompanyAccess(req, res, { mustBeAdmin: false });
    if (!ctx) return;
    const proposal = await getCurrentLunchPlan(ctx.company.id);
    res.json({ proposal });
  },
);

router.get(
  "/companies/:slug/lunch-plan/history",
  async (req: Request, res: Response) => {
    const ctx = await resolveCompanyAccess(req, res, { mustBeAdmin: false });
    if (!ctx) return;
    const proposals = await listLunchPlans(ctx.company.id);
    res.json({ proposals });
  },
);

const scheduleSchema = z.object({
  scheduledHour: z.number().int().min(8).max(20).default(13),
  perEmployeeBudgetPaise: z.number().int().min(0).max(10_000_000).default(0),
  address: z
    .object({
      label: z.string().optional(),
      line: z.string().min(1),
      city: z.string().min(1),
      pincode: z.string().min(3),
      phone: z.string().optional(),
    })
    .optional(),
});

router.post(
  "/lunch-plans/:id/schedule",
  async (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const [proposal] = await db
      .select()
      .from(lunchPlanProposalsTable)
      .where(eq(lunchPlanProposalsTable.id, id))
      .limit(1);
    if (!proposal) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, proposal.companyId))
      .limit(1);
    if (!company) {
      res.status(404).json({ error: "company missing" });
      return;
    }
    // Auth: company admin OR internal admin.
    let actorId = "system";
    if (!isAdminRequest(req)) {
      const auth = requireAuth(req, res);
      if (!auth) return;
      const m = await loadActiveMembership(company.id, auth.id);
      if (!m || m.role !== "admin" || m.status !== "active") {
        res.status(403).json({ error: "admin only" });
        return;
      }
      actorId = auth.id;
    } else {
      actorId = company.ownerUserId;
    }
    if (proposal.status === "scheduled") {
      res.status(409).json({
        error: "already scheduled",
        scheduledOfficeOrderIds: proposal.scheduledOfficeOrderIds,
      });
      return;
    }
    const parsed = scheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const address = parsed.data.address ?? {
      line: "Office",
      city: "—",
      pincode: "000000",
    };
    const created: number[] = [];
    for (const day of proposal.plan.days) {
      const scheduledFor = new Date(`${day.date}T00:00:00Z`);
      scheduledFor.setUTCHours(parsed.data.scheduledHour, 0, 0, 0);
      const closes = new Date(scheduledFor);
      closes.setUTCHours(closes.getUTCHours() - 2);
      const title = `Office lunch — ${day.date}`;
      const [order] = await db
        .insert(officeOrdersTable)
        .values({
          companyId: company.id,
          createdByUserId: actorId,
          title,
          address,
          perEmployeeBudgetPaise: parsed.data.perEmployeeBudgetPaise,
          scheduledFor,
          windowClosesAt: closes,
          status: "open",
        })
        .returning();
      if (order) created.push(order.id);
    }
    const [updated] = await db
      .update(lunchPlanProposalsTable)
      .set({ status: "scheduled", scheduledOfficeOrderIds: created })
      .where(eq(lunchPlanProposalsTable.id, id))
      .returning();
    res.json({ proposal: updated, scheduledOfficeOrderIds: created });
  },
);

// ---------- Account health ----------

router.get("/companies/:slug/health", async (req: Request, res: Response) => {
  const ctx = await resolveCompanyAccess(req, res, { mustBeAdmin: false });
  if (!ctx) return;
  let snapshot = await getLatestHealth(ctx.company.id);
  if (!snapshot) {
    snapshot = await recomputeHealth(ctx.company);
  }
  res.json({ snapshot });
});

router.post(
  "/companies/:slug/health/recompute",
  async (req: Request, res: Response) => {
    const ctx = await resolveCompanyAccess(req, res, { mustBeAdmin: true });
    if (!ctx) return;
    const snapshot = await recomputeHealth(ctx.company);
    res.json({ snapshot });
  },
);

// ---------- Sales console (internal admin) ----------

router.get("/sales/accounts", async (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const accounts = await listAllAccountsWithHealth();
  res.json({ accounts });
});

router.get(
  "/sales/accounts/:slug",
  async (req: Request, res: Response) => {
    if (!isAdminRequest(req)) {
      res.status(403).json({ error: "admin only" });
      return;
    }
    const company = await loadCompanyBySlug(String(req.params.slug ?? ""));
    if (!company) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const [health, qbr, profile] = await Promise.all([
      getLatestHealth(company.id),
      getLatestQbr(company.id),
      getDietProfile(company.id),
    ]);
    res.json({ company, health, qbr, hasDietProfile: Boolean(profile) });
  },
);

router.post(
  "/sales/accounts/:slug/health/recompute",
  async (req: Request, res: Response) => {
    if (!isAdminRequest(req)) {
      res.status(403).json({ error: "admin only" });
      return;
    }
    const company = await loadCompanyBySlug(String(req.params.slug ?? ""));
    if (!company) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const snapshot = await recomputeHealth(company);
    res.json({ snapshot });
  },
);

router.post(
  "/sales/accounts/:slug/qbr/generate",
  async (req: Request, res: Response) => {
    if (!isAdminRequest(req)) {
      res.status(403).json({ error: "admin only" });
      return;
    }
    const company = await loadCompanyBySlug(String(req.params.slug ?? ""));
    if (!company) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const draft = await generateQbr(company);
    res.json({ qbr: draft });
  },
);

const qbrEditSchema = z.object({
  sections: z
    .array(z.object({ title: z.string().min(1), body: z.string().min(1) }))
    .min(1)
    .max(20),
});

router.put("/sales/qbr/:id", async (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const parsed = qbrEditSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const editor =
    (req.header("x-admin-actor") ?? "sales-rep").toString().slice(0, 64);
  const updated = await updateQbrSections(id, parsed.data.sections, editor);
  if (!updated) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ qbr: updated });
});

router.get("/sales/qbr/:id/export", async (req: Request, res: Response) => {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [draft] = await db
    .select()
    .from(qbrDraftsTable)
    .where(eq(qbrDraftsTable.id, id))
    .limit(1);
  if (!draft) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, draft.companyId))
    .limit(1);
  if (!company) {
    res.status(404).json({ error: "company missing" });
    return;
  }
  await db
    .update(qbrDraftsTable)
    .set({ status: "exported" })
    .where(eq(qbrDraftsTable.id, id));
  const md = renderQbrMarkdown(company, draft);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="qbr-${company.slug}-${draft.periodStart}.md"`,
  );
  res.send(md);
});

export default router;
