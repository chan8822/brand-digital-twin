/**
 * RD Copilot — server routes.
 *
 * Surfaces:
 *   - GET    /rd/copilot/clients?rdSlug
 *   - GET    /rd/copilot/clients/:userId/summary?rdSlug
 *   - POST   /rd/copilot/clients/:userId/summary?rdSlug      (refresh)
 *   - POST   /rd/copilot/clients/:userId/proposals?rdSlug    (AI draft)
 *   - GET    /rd/copilot/proposals/:id?rdSlug
 *   - PATCH  /rd/copilot/proposals/:id?rdSlug                (RD edits)
 *   - POST   /rd/copilot/proposals/:id/approve?rdSlug
 *   - POST   /rd/copilot/proposals/:id/reject?rdSlug
 *   - GET    /rd/copilot/clients/:userId/adherence?rdSlug
 *   - POST   /rd/copilot/clients/:userId/nudge?rdSlug        (sends nudge as RD message)
 *   - GET    /rd/copilot/clients/:userId/audit?rdSlug
 *
 * Auth: every endpoint runs `requireRdRole(rdSlug)` AND verifies the
 * target client has an existing appointment with that RD (IDOR guard).
 *
 * Audit: every AI suggestion + every RD action writes an `rd_audit_log`
 * row so the copilot's quality can be reviewed downstream.
 */

import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { z } from "zod/v4";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  rdAppointmentsTable,
  rdAuditLogTable,
  rdClientSummariesTable,
  rdMessagesTable,
  type AdherenceEvent,
  rdPlanProposalsTable,
  rdUsersTable,
  mealPlansTable,
  adherenceEventsTable,
  type MealPlanDay,
  type MealPlanConstraints,
} from "@workspace/db";
import {
  generateClientSummary,
  draftPlanForReview,
  detectAdherenceForPlan,
  buildNudgeText,
  rewriteNudge,
  shouldEscalateToRd,
} from "../lib/rdCopilot";

const router: IRouter = Router();

const RD_SLUG_RE = /^rd-[a-z0-9-]{2,48}$/;

function getRdSlug(req: Request, res: Response): string | null {
  const rdSlug = String(req.query["rdSlug"] ?? "");
  if (!RD_SLUG_RE.test(rdSlug)) {
    res.status(400).json({ error: "invalid rdSlug" });
    return null;
  }
  return rdSlug;
}

async function requireRdRole(
  req: Request,
  res: Response,
  rdSlug: string,
): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  const rows = await db
    .select({ id: rdUsersTable.id })
    .from(rdUsersTable)
    .where(
      and(
        eq(rdUsersTable.userId, req.user.id),
        eq(rdUsersTable.rdSlug, rdSlug),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    res.status(403).json({ error: "not authorised for this RD" });
    return false;
  }
  return true;
}

/** Confirms the target client has an appointment with this RD. */
async function requireRelationship(
  res: Response,
  rdSlug: string,
  targetUserId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: rdAppointmentsTable.id })
    .from(rdAppointmentsTable)
    .where(
      and(
        eq(rdAppointmentsTable.userId, targetUserId),
        eq(rdAppointmentsTable.rdSlug, rdSlug),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "no relationship with this user" });
    return false;
  }
  return true;
}

async function audit(
  rdSlug: string,
  userId: string,
  kind:
    | "summary_generated"
    | "proposal_drafted"
    | "proposal_edited"
    | "proposal_approved"
    | "proposal_rejected"
    | "nudge_sent",
  actor: "ai" | "rd",
  proposalId: number | null,
  payload: Record<string, unknown>,
): Promise<void> {
  await db.insert(rdAuditLogTable).values({
    userId,
    rdSlug,
    proposalId,
    kind,
    actor,
    payload,
  });
}

// -----------------------------------------------------------------------
// Clients listing — appointments grouped by user with proposal/adherence
// counts so the RD console can show one row per client.
// -----------------------------------------------------------------------

router.get(
  "/rd/copilot/clients",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;

    const appts = await db
      .select({
        userId: rdAppointmentsTable.userId,
        startAt: rdAppointmentsTable.startAt,
        status: rdAppointmentsTable.status,
      })
      .from(rdAppointmentsTable)
      .where(eq(rdAppointmentsTable.rdSlug, rdSlug))
      .orderBy(desc(rdAppointmentsTable.startAt));

    const clients = new Map<
      string,
      {
        userId: string;
        appointmentCount: number;
        nextAppointmentAt: string | null;
        lastAppointmentAt: string | null;
      }
    >();
    for (const a of appts) {
      const cur = clients.get(a.userId) ?? {
        userId: a.userId,
        appointmentCount: 0,
        nextAppointmentAt: null as string | null,
        lastAppointmentAt: null as string | null,
      };
      cur.appointmentCount += 1;
      const iso = a.startAt.toISOString();
      if (a.status === "scheduled" && new Date(a.startAt) > new Date()) {
        if (!cur.nextAppointmentAt || iso < cur.nextAppointmentAt) {
          cur.nextAppointmentAt = iso;
        }
      }
      if (!cur.lastAppointmentAt || iso > cur.lastAppointmentAt) {
        cur.lastAppointmentAt = iso;
      }
      clients.set(a.userId, cur);
    }

    const list = Array.from(clients.values());
    if (list.length === 0) {
      res.json({ clients: [] });
      return;
    }

    // Per-client open proposals + adherence event counts.
    const userIds = list.map((c) => c.userId);
    const [proposals, drift] = await Promise.all([
      db
        .select({
          userId: rdPlanProposalsTable.userId,
          status: rdPlanProposalsTable.status,
        })
        .from(rdPlanProposalsTable)
        .where(
          and(
            eq(rdPlanProposalsTable.rdSlug, rdSlug),
            sql`${rdPlanProposalsTable.userId} = ANY(${userIds})`,
          ),
        ),
      db
        .select({
          userId: adherenceEventsTable.userId,
          count: sql<number>`count(*)::int`,
        })
        .from(adherenceEventsTable)
        .where(sql`${adherenceEventsTable.userId} = ANY(${userIds})`)
        .groupBy(adherenceEventsTable.userId),
    ]);

    const propByUser = new Map<string, { open: number; approved: number }>();
    for (const p of proposals) {
      const cur = propByUser.get(p.userId) ?? { open: 0, approved: 0 };
      if (p.status === "ai_drafted" || p.status === "rd_editing") cur.open += 1;
      else if (p.status === "rd_approved") cur.approved += 1;
      propByUser.set(p.userId, cur);
    }
    const driftByUser = new Map<string, number>();
    for (const d of drift) driftByUser.set(d.userId, d.count);

    res.json({
      clients: list.map((c) => ({
        ...c,
        proposalsOpen: propByUser.get(c.userId)?.open ?? 0,
        proposalsApproved: propByUser.get(c.userId)?.approved ?? 0,
        driftEvents: driftByUser.get(c.userId) ?? 0,
      })),
    });
  },
);

// -----------------------------------------------------------------------
// Client summary
// -----------------------------------------------------------------------

router.get(
  "/rd/copilot/clients/:userId/summary",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const userId = String(req.params["userId"] ?? "");
    if (!(await requireRelationship(res, rdSlug, userId))) return;

    const [row] = await db
      .select()
      .from(rdClientSummariesTable)
      .where(
        and(
          eq(rdClientSummariesTable.userId, userId),
          eq(rdClientSummariesTable.rdSlug, rdSlug),
        ),
      )
      .limit(1);

    res.json({ summary: row ?? null });
  },
);

router.post(
  "/rd/copilot/clients/:userId/summary",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const userId = String(req.params["userId"] ?? "");
    if (!(await requireRelationship(res, rdSlug, userId))) return;

    const result = await generateClientSummary({ userId, rdSlug });
    const [row] = await db
      .insert(rdClientSummariesTable)
      .values({
        userId,
        rdSlug,
        summary: result.summary,
        sources: result.sources,
        model: result.model,
      })
      .onConflictDoUpdate({
        target: [rdClientSummariesTable.userId, rdClientSummariesTable.rdSlug],
        set: {
          summary: result.summary,
          sources: result.sources,
          model: result.model,
          draftedAt: new Date(),
        },
      })
      .returning();
    await audit(rdSlug, userId, "summary_generated", "ai", null, {
      model: result.model,
      usedFallback: result.usedFallback,
    });
    res.json({ summary: row });
  },
);

// -----------------------------------------------------------------------
// Plan proposals
// -----------------------------------------------------------------------

const ConstraintOverridesSchema = z
  .object({
    dailyCalorieTarget: z.number().int().min(800).max(5000).nullable().optional(),
    dailyProteinTargetGrams: z
      .number()
      .int()
      .min(20)
      .max(400)
      .nullable()
      .optional(),
    weeklyBudgetPaise: z.number().int().min(0).nullable().optional(),
    maxRepetitionsPerDish: z.number().int().min(1).max(7).optional(),
    allergens: z.array(z.string()).optional(),
    dietaryStyle: z.string().nullable().optional(),
    spiceLevel: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
  })
  .strict();

const DraftRequestSchema = z.object({
  weekStartDate: z.iso.date(),
  overrides: ConstraintOverridesSchema.optional(),
});

router.post(
  "/rd/copilot/clients/:userId/proposals",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const userId = String(req.params["userId"] ?? "");
    if (!(await requireRelationship(res, rdSlug, userId))) return;

    const parsed = DraftRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const weekStart = new Date(`${parsed.data.weekStartDate}T00:00:00.000Z`);
    if (Number.isNaN(weekStart.getTime())) {
      res.status(400).json({ error: "invalid weekStartDate" });
      return;
    }

    try {
      const draft = await draftPlanForReview({
        userId,
        weekStart,
        overrides: parsed.data.overrides as Partial<MealPlanConstraints> | undefined,
      });
      const [row] = await db
        .insert(rdPlanProposalsTable)
        .values({
          userId,
          rdSlug,
          weekStartDate: parsed.data.weekStartDate,
          status: "ai_drafted",
          constraints: draft.constraints,
          days: draft.days,
          totals: draft.totals,
          aiRationale: draft.rationale,
          model: draft.model,
        })
        .returning();
      await audit(rdSlug, userId, "proposal_drafted", "ai", row!.id, {
        model: draft.model,
        notes: draft.notes,
      });
      res.json({ proposal: row });
    } catch (err) {
      req.log.error({ err }, "rd-copilot draft failed");
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

/**
 * Returns the most recent proposal for (userId, rdSlug) regardless of
 * status, so the RD console can show "where we left off" on mount
 * instead of forcing the RD to draft a new plan to see anything.
 */
router.get(
  "/rd/copilot/clients/:userId/proposals/latest",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const userId = String(req.params["userId"] ?? "");
    if (!(await requireRelationship(res, rdSlug, userId))) return;

    const [row] = await db
      .select()
      .from(rdPlanProposalsTable)
      .where(
        and(
          eq(rdPlanProposalsTable.userId, userId),
          eq(rdPlanProposalsTable.rdSlug, rdSlug),
        ),
      )
      .orderBy(desc(rdPlanProposalsTable.createdAt))
      .limit(1);
    res.json({ proposal: row ?? null });
  },
);

/**
 * Loads a proposal scoped to rdSlug AND verifies the RD still has an
 * existing relationship with the proposal's owner. Returns null and
 * responds with 404/403 if either guard fails. Used by every
 * proposal-id route to keep the IDOR control identical to the
 * /clients/:userId/* routes.
 */
async function loadGuardedProposal(
  res: Response,
  rdSlug: string,
  id: number,
): Promise<typeof rdPlanProposalsTable.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(rdPlanProposalsTable)
    .where(
      and(
        eq(rdPlanProposalsTable.id, id),
        eq(rdPlanProposalsTable.rdSlug, rdSlug),
      ),
    )
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return null;
  }
  if (!(await requireRelationship(res, rdSlug, row.userId))) return null;
  return row;
}

router.get(
  "/rd/copilot/proposals/:id",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const row = await loadGuardedProposal(res, rdSlug, id);
    if (!row) return;
    res.json({ proposal: row });
  },
);

// Strict shape for an edited day — mirrors the MealPlanDay TS interface
// in lib/db/src/schema/mealPlans.ts. We validate every slot so an RD
// edit can't smuggle malformed dish entries (missing macros, negative
// price, etc.) into a row the user-facing meal plan flow will trust.
const MealPlanSlotEntrySchema = z
  .object({
    dishId: z.number().int().nonnegative(),
    slug: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    image: z.string().max(1000),
    pricePaise: z.number().int().nonnegative(),
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  })
  .strict();

const MealPlanDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    breakfast: MealPlanSlotEntrySchema.optional(),
    lunch: MealPlanSlotEntrySchema.optional(),
    dinner: MealPlanSlotEntrySchema.optional(),
  })
  .strict();

const EditProposalSchema = z
  .object({
    days: z.array(MealPlanDaySchema).max(31).optional(),
    rdNotes: z.string().max(4000).nullable().optional(),
  })
  .strict();

router.patch(
  "/rd/copilot/proposals/:id",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const parsed = EditProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }

    const existing = await loadGuardedProposal(res, rdSlug, id);
    if (!existing) return;
    if (
      existing.status === "rd_approved" ||
      existing.status === "rejected"
    ) {
      res
        .status(409)
        .json({ error: `cannot edit ${existing.status} proposal` });
      return;
    }

    const update: Record<string, unknown> = { status: "rd_editing" };
    if (parsed.data.days) update["days"] = parsed.data.days as MealPlanDay[];
    if (parsed.data.rdNotes !== undefined) {
      update["rdNotes"] = parsed.data.rdNotes;
    }

    // Conditional WHERE prevents racing with a concurrent approve/reject:
    // if status moved to a terminal state between our load and write,
    // we report 409 instead of silently overwriting.
    const [row] = await db
      .update(rdPlanProposalsTable)
      .set(update)
      .where(
        and(
          eq(rdPlanProposalsTable.id, id),
          sql`${rdPlanProposalsTable.status} in ('ai_drafted', 'rd_editing')`,
        ),
      )
      .returning();
    if (!row) {
      res.status(409).json({ error: "proposal state changed; reload" });
      return;
    }
    await audit(rdSlug, existing.userId, "proposal_edited", "rd", id, {
      changedKeys: Object.keys(parsed.data),
    });
    res.json({ proposal: row });
  },
);

router.post(
  "/rd/copilot/proposals/:id/approve",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }

    // Pre-flight: scope to rdSlug + verify relationship before opening
    // the transaction so we never lock rows for an unauthorised request.
    const guard = await loadGuardedProposal(res, rdSlug, id);
    if (!guard) return;

    const result = await db.transaction(async (tx) => {
      // Re-read inside tx with row lock to serialise concurrent
      // approve/reject/edit on the same proposal.
      const lockedRows = await tx.execute(sql`
        select * from ${rdPlanProposalsTable}
         where ${rdPlanProposalsTable.id} = ${id}
           and ${rdPlanProposalsTable.rdSlug} = ${rdSlug}
         for update
      `);
      const existing = (
        lockedRows.rows as Array<typeof rdPlanProposalsTable.$inferSelect>
      )[0];
      if (!existing) return { kind: "not_found" as const };
      if (existing.status === "rd_approved") {
        return { kind: "already_approved" as const, proposal: existing };
      }
      if (existing.status === "rejected") {
        return { kind: "already_rejected" as const, proposal: existing };
      }

      // Refuse to overwrite a meal_plan the user has already accepted or
      // scheduled — that would silently invalidate live deliveries.
      // Force the RD to explicitly resolve the conflict (e.g. by
      // approving for a different week).
      const [conflict] = await tx
        .select({ id: mealPlansTable.id, status: mealPlansTable.status })
        .from(mealPlansTable)
        .where(
          and(
            eq(mealPlansTable.userId, existing.userId),
            eq(mealPlansTable.weekStartDate, existing.weekStartDate),
          ),
        )
        .limit(1);
      if (
        conflict &&
        (conflict.status === "accepted" || conflict.status === "scheduled")
      ) {
        return {
          kind: "plan_locked" as const,
          existingPlanStatus: conflict.status,
        };
      }

      // Materialise into user-facing meal_plans as a `draft` row tagged
      // model="rd-approved". The user can then tap Accept via the
      // existing meal-plans flow to schedule it onto their subscription.
      // Safe to overwrite a previous draft/discarded row for the same
      // week — but never an accepted/scheduled one (handled above).
      const [plan] = await tx
        .insert(mealPlansTable)
        .values({
          userId: existing.userId,
          weekStartDate: existing.weekStartDate,
          status: "draft",
          constraints: existing.constraints,
          days: existing.days,
          totals: existing.totals,
          model: "rd-approved",
          notes: `approved by ${rdSlug} (proposal #${id})`,
        })
        .onConflictDoUpdate({
          target: [mealPlansTable.userId, mealPlansTable.weekStartDate],
          set: {
            status: "draft",
            constraints: existing.constraints,
            days: existing.days,
            totals: existing.totals,
            model: "rd-approved",
            notes: `approved by ${rdSlug} (proposal #${id})`,
            acceptedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Conditional WHERE protects against the rare case where the row
      // lock was skipped (e.g. read-committed FOR UPDATE quirks).
      const [updated] = await tx
        .update(rdPlanProposalsTable)
        .set({
          status: "rd_approved",
          mealPlanId: plan!.id,
          approvedAt: new Date(),
        })
        .where(
          and(
            eq(rdPlanProposalsTable.id, id),
            sql`${rdPlanProposalsTable.status} in ('ai_drafted', 'rd_editing')`,
          ),
        )
        .returning();
      if (!updated) return { kind: "race" as const };
      return { kind: "ok" as const, proposal: updated, plan } as const;
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (result.kind === "already_approved" || result.kind === "already_rejected") {
      res
        .status(409)
        .json({ error: result.kind, proposal: result.proposal });
      return;
    }
    if (result.kind === "plan_locked") {
      res.status(409).json({
        error: "user already has an accepted/scheduled plan for this week",
        existingPlanStatus: result.existingPlanStatus,
      });
      return;
    }
    if (result.kind === "race") {
      res.status(409).json({ error: "proposal state changed; reload" });
      return;
    }

    await audit(
      rdSlug,
      result.proposal.userId,
      "proposal_approved",
      "rd",
      id,
      { mealPlanId: result.plan!.id },
    );
    res.json({ proposal: result.proposal, mealPlan: result.plan });
  },
);

router.post(
  "/rd/copilot/proposals/:id/reject",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const reason = String(req.body?.reason ?? "").slice(0, 1000);

    const existing = await loadGuardedProposal(res, rdSlug, id);
    if (!existing) return;
    if (existing.status === "rd_approved") {
      res.status(409).json({ error: "cannot reject approved proposal" });
      return;
    }

    // Conditional WHERE keeps reject from racing with a concurrent
    // approve — if status flipped to rd_approved, we 409 instead of
    // silently flipping back to rejected.
    const [row] = await db
      .update(rdPlanProposalsTable)
      .set({
        status: "rejected",
        rejectedAt: new Date(),
        rdNotes: reason || existing.rdNotes,
      })
      .where(
        and(
          eq(rdPlanProposalsTable.id, id),
          sql`${rdPlanProposalsTable.status} in ('ai_drafted', 'rd_editing')`,
        ),
      )
      .returning();
    if (!row) {
      res.status(409).json({ error: "proposal state changed; reload" });
      return;
    }
    await audit(rdSlug, existing.userId, "proposal_rejected", "rd", id, {
      reason,
    });
    res.json({ proposal: row });
  },
);

// -----------------------------------------------------------------------
// Adherence
// -----------------------------------------------------------------------

router.get(
  "/rd/copilot/clients/:userId/adherence",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const userId = String(req.params["userId"] ?? "");
    if (!(await requireRelationship(res, rdSlug, userId))) return;

    // Run scan against the most-recent rd-approved plan (if any).
    const [latestApproved] = await db
      .select()
      .from(mealPlansTable)
      .where(
        and(
          eq(mealPlansTable.userId, userId),
          // accept either draft (just-approved) or scheduled (user took action)
          sql`${mealPlansTable.model} = 'rd-approved'`,
        ),
      )
      .orderBy(desc(mealPlansTable.weekStartDate))
      .limit(1);

    let scan = null as
      | Awaited<ReturnType<typeof detectAdherenceForPlan>>
      | null;
    if (latestApproved) {
      scan = await detectAdherenceForPlan({ plan: latestApproved });
    }

    const events = await db
      .select()
      .from(adherenceEventsTable)
      .where(eq(adherenceEventsTable.userId, userId))
      .orderBy(desc(adherenceEventsTable.dayDate))
      .limit(50);

    res.json({
      mealPlanId: latestApproved?.id ?? null,
      weekStartDate: latestApproved?.weekStartDate ?? null,
      scan,
      events,
      escalateRecommended: shouldEscalateToRd(events),
    });
  },
);

const NudgeRequestSchema = z.object({
  eventId: z.number().int().positive().optional(),
  body: z.string().trim().min(1).max(2000).optional(),
});

router.post(
  "/rd/copilot/clients/:userId/nudge",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const userId = String(req.params["userId"] ?? "");
    if (!(await requireRelationship(res, rdSlug, userId))) return;
    const parsed = NudgeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }

    let event: AdherenceEvent | null = null;
    if (parsed.data.eventId) {
      const [row] = await db
        .select()
        .from(adherenceEventsTable)
        .where(
          and(
            eq(adherenceEventsTable.id, parsed.data.eventId),
            eq(adherenceEventsTable.userId, userId),
          ),
        )
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "event not found" });
        return;
      }
      event = row;
    }

    // RD-typed text always wins. Otherwise: when an event drives the
    // nudge, ask Gemini to rewrite the deterministic baseline as a
    // coach-style message, falling back to the baseline on failure.
    let body = parsed.data.body?.trim() ?? "";
    let baseline: string | null = null;
    let nudgeModel: string | null = null;
    let usedFallback: boolean | null = null;
    let fallbackReason: string | undefined;
    let rdAuthored = body.length > 0;

    if (!body && event) {
      baseline = buildNudgeText(event);
      const [summaryRow] = await db
        .select({ summary: rdClientSummariesTable.summary })
        .from(rdClientSummariesTable)
        .where(
          and(
            eq(rdClientSummariesTable.userId, userId),
            eq(rdClientSummariesTable.rdSlug, rdSlug),
          ),
        )
        .limit(1);
      const rewrite = await rewriteNudge({
        event,
        clientSummary: summaryRow?.summary ?? null,
        rdSlug,
      });
      body = rewrite.text;
      nudgeModel = rewrite.model;
      usedFallback = rewrite.usedFallback;
      fallbackReason = rewrite.fallbackReason;
    }

    if (!body) {
      res.status(400).json({ error: "body or eventId required" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(rdMessagesTable)
        .values({
          userId,
          rdSlug,
          senderRole: "rd",
          body,
        })
        .returning();
      if (event) {
        await tx
          .update(adherenceEventsTable)
          .set({ nudgeSentAt: new Date() })
          .where(eq(adherenceEventsTable.id, event.id));
      }
      return msg!;
    });

    await audit(rdSlug, userId, "nudge_sent", "rd", null, {
      messageId: result.id,
      eventId: event?.id ?? null,
      eventKind: event?.kind ?? null,
      // Record both the deterministic baseline and the message that was
      // actually sent so quality review can compare AI rewrites against
      // the template they replaced.
      baseline,
      sentBody: body,
      model: nudgeModel,
      usedFallback,
      fallbackReason: fallbackReason ?? null,
      rdAuthored,
    });
    res.json({
      message: result,
      nudge: event
        ? {
            baseline,
            model: nudgeModel,
            usedFallback,
            rdAuthored,
          }
        : null,
    });
  },
);

// -----------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------

router.get(
  "/rd/copilot/clients/:userId/audit",
  async (req: Request, res: Response) => {
    const rdSlug = getRdSlug(req, res);
    if (!rdSlug) return;
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const userId = String(req.params["userId"] ?? "");
    if (!(await requireRelationship(res, rdSlug, userId))) return;

    const rows = await db
      .select()
      .from(rdAuditLogTable)
      .where(
        and(
          eq(rdAuditLogTable.userId, userId),
          eq(rdAuditLogTable.rdSlug, rdSlug),
        ),
      )
      .orderBy(desc(rdAuditLogTable.createdAt))
      .limit(200);
    res.json({ entries: rows });
  },
);

export default router;
