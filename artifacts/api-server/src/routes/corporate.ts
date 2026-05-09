import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  companiesTable,
  companyBudgetUsageTable,
  companyMembersTable,
  db,
  officeOrdersTable,
  vouchersTable,
  type CompanyMember,
  type OfficeOrderPick,
} from "@workspace/db";
import { resolveDishById, makeBatchDishResolver } from "../lib/menuResolver";

const router: IRouter = Router();

function requireAuth(
  req: Request,
  res: Response,
): { id: string; email: string | null; firstName: string | null } | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  const u = req.user as {
    id: string;
    email?: string | null;
    firstName?: string | null;
  };
  return { id: u.id, email: u.email ?? null, firstName: u.firstName ?? null };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function generateToken(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

function generateCode(prefix: string, bytes = 4): string {
  return `${prefix}-${randomBytes(bytes).toString("hex").toUpperCase()}`;
}

async function loadMembership(
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

async function loadCompanyBySlug(slug: string) {
  const [c] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.slug, slug));
  return c;
}

// ---------- Companies ----------

const createCompanySchema = z.object({
  name: z.string().min(2).max(128),
  perEmployeeMonthlyBudgetPaise: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .default(0),
});

router.post("/companies", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const parsed = createCompanySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const baseSlug = slugify(parsed.data.name) || "company";
  let slug = baseSlug;
  let attempt = 0;
  let inserted: typeof companiesTable.$inferSelect | undefined;
  while (attempt < 8 && !inserted) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${randomBytes(2).toString("hex")}`;
    const rows = await db
      .insert(companiesTable)
      .values({
        slug: candidate,
        name: parsed.data.name,
        ownerUserId: auth.id,
        perEmployeeMonthlyBudgetPaise: parsed.data.perEmployeeMonthlyBudgetPaise,
      })
      .onConflictDoNothing({ target: companiesTable.slug })
      .returning();
    if (rows[0]) {
      inserted = rows[0];
      slug = candidate;
    }
    attempt++;
  }
  if (!inserted) {
    res.status(500).json({ error: "could not allocate slug" });
    return;
  }
  // Owner becomes admin member automatically.
  if (auth.email) {
    await db
      .insert(companyMembersTable)
      .values({
        companyId: inserted.id,
        userId: auth.id,
        email: auth.email,
        role: "admin",
        status: "active",
        joinedAt: new Date(),
      })
      .onConflictDoNothing();
  }
  res.json({ company: inserted });
});

router.get("/companies/mine", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const rows = await db
    .select({
      company: companiesTable,
      role: companyMembersTable.role,
      status: companyMembersTable.status,
    })
    .from(companyMembersTable)
    .innerJoin(
      companiesTable,
      eq(companyMembersTable.companyId, companiesTable.id),
    )
    .where(
      and(
        eq(companyMembersTable.userId, auth.id),
        eq(companyMembersTable.status, "active"),
      ),
    );
  res.json({ companies: rows });
});

router.get("/companies/:slug", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const slug = String(req.params.slug ?? "");
  const company = await loadCompanyBySlug(slug);
  if (!company) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const membership = await loadMembership(company.id, auth.id);
  if (!membership || membership.status !== "active") {
    res.status(403).json({ error: "not a member" });
    return;
  }
  const members = await db
    .select()
    .from(companyMembersTable)
    .where(eq(companyMembersTable.companyId, company.id))
    .orderBy(desc(companyMembersTable.invitedAt));
  const period = currentMonth();
  const usage = await db
    .select()
    .from(companyBudgetUsageTable)
    .where(
      and(
        eq(companyBudgetUsageTable.companyId, company.id),
        eq(companyBudgetUsageTable.periodMonth, period),
      ),
    );
  const usageByUser = new Map(usage.map((u) => [u.userId, u.spentPaise]));
  res.json({
    company,
    membership,
    members: members.map((m) => ({
      ...m,
      spentThisMonthPaise: m.userId ? usageByUser.get(m.userId) ?? 0 : 0,
    })),
    period,
  });
});

const budgetSchema = z.object({
  perEmployeeMonthlyBudgetPaise: z.number().int().min(0).max(10_000_000),
});

router.put("/companies/:slug/budget", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const slug = String(req.params.slug ?? "");
  const company = await loadCompanyBySlug(slug);
  if (!company) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const m = await loadMembership(company.id, auth.id);
  if (!m || m.role !== "admin" || m.status !== "active") {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const parsed = budgetSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const [updated] = await db
    .update(companiesTable)
    .set({
      perEmployeeMonthlyBudgetPaise: parsed.data.perEmployeeMonthlyBudgetPaise,
    })
    .where(eq(companiesTable.id, company.id))
    .returning();
  res.json({ company: updated });
});

// ---------- Invites ----------

const inviteSchema = z.object({
  email: z.string().email().max(256),
  role: z.enum(["admin", "member"]).default("member"),
});

router.post("/companies/:slug/invite", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const slug = String(req.params.slug ?? "");
  const company = await loadCompanyBySlug(slug);
  if (!company) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const m = await loadMembership(company.id, auth.id);
  if (!m || m.role !== "admin" || m.status !== "active") {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const parsed = inviteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const token = generateToken(16);
  const [row] = await db
    .insert(companyMembersTable)
    .values({
      companyId: company.id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      status: "invited",
      inviteToken: token,
    })
    .onConflictDoUpdate({
      target: [companyMembersTable.companyId, companyMembersTable.email],
      set: {
        role: parsed.data.role,
        status: sql`case when ${companyMembersTable.status} = 'active' then 'active' else 'invited' end`,
        inviteToken: sql`case when ${companyMembersTable.status} = 'active' then ${companyMembersTable.inviteToken} else ${token} end`,
      },
    })
    .returning();
  res.json({ member: row, inviteUrl: `/corporate/invite/${row.inviteToken ?? token}` });
});

router.get(
  "/companies/invites/:token",
  async (req: Request, res: Response) => {
    const token = String(req.params.token ?? "");
    if (!token) {
      res.status(400).json({ error: "invalid token" });
      return;
    }
    const [m] = await db
      .select()
      .from(companyMembersTable)
      .where(eq(companyMembersTable.inviteToken, token));
    if (!m) {
      res.status(404).json({ error: "invite not found" });
      return;
    }
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, m.companyId));
    res.json({ invite: m, company });
  },
);

router.post(
  "/companies/invites/:token/accept",
  async (req: Request, res: Response) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const token = String(req.params.token ?? "");
    const [m] = await db
      .select()
      .from(companyMembersTable)
      .where(eq(companyMembersTable.inviteToken, token));
    if (!m) {
      res.status(404).json({ error: "invite not found" });
      return;
    }
    if (m.status === "active") {
      res.json({ ok: true, already: true });
      return;
    }
    // Authorization: the authenticated user's email must match the invited
    // email. Prevents anyone with the token from claiming a membership.
    const authEmail = (auth.email ?? "").trim().toLowerCase();
    const invitedEmail = (m.email ?? "").trim().toLowerCase();
    if (!authEmail || !invitedEmail || authEmail !== invitedEmail) {
      res.status(403).json({ error: "email mismatch" });
      return;
    }
    const [updated] = await db
      .update(companyMembersTable)
      .set({
        userId: auth.id,
        status: "active",
        joinedAt: new Date(),
        inviteToken: null,
      })
      .where(eq(companyMembersTable.id, m.id))
      .returning();
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, m.companyId));
    res.json({ member: updated, company });
  },
);

router.post(
  "/companies/:slug/members/:memberId/remove",
  async (req: Request, res: Response) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const slug = String(req.params.slug ?? "");
    const memberId = Number(req.params.memberId);
    if (!Number.isFinite(memberId) || memberId <= 0) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const company = await loadCompanyBySlug(slug);
    if (!company) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const m = await loadMembership(company.id, auth.id);
    if (!m || m.role !== "admin" || m.status !== "active") {
      res.status(403).json({ error: "admin only" });
      return;
    }
    const [target] = await db
      .select()
      .from(companyMembersTable)
      .where(eq(companyMembersTable.id, memberId));
    if (!target || target.companyId !== company.id) {
      res.status(404).json({ error: "member not found" });
      return;
    }
    if (target.userId === company.ownerUserId) {
      res.status(409).json({ error: "cannot remove owner" });
      return;
    }
    await db
      .update(companyMembersTable)
      .set({ status: "removed", inviteToken: null })
      .where(eq(companyMembersTable.id, memberId));
    res.json({ ok: true });
  },
);

// ---------- Subsidy at checkout ----------

router.get("/me/company-subsidy", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const subtotal = Math.max(0, Number(req.query.subtotal ?? 0));
  const period = currentMonth();
  // Pick the first active membership (v1: one company at a time).
  const [row] = await db
    .select({
      company: companiesTable,
      member: companyMembersTable,
    })
    .from(companyMembersTable)
    .innerJoin(
      companiesTable,
      eq(companyMembersTable.companyId, companiesTable.id),
    )
    .where(
      and(
        eq(companyMembersTable.userId, auth.id),
        eq(companyMembersTable.status, "active"),
      ),
    )
    .limit(1);
  if (!row) {
    res.json({ active: false });
    return;
  }
  const monthlyBudget =
    row.member.perEmployeeBudgetPaiseOverride ??
    row.company.perEmployeeMonthlyBudgetPaise;
  const [usage] = await db
    .select()
    .from(companyBudgetUsageTable)
    .where(
      and(
        eq(companyBudgetUsageTable.companyId, row.company.id),
        eq(companyBudgetUsageTable.userId, auth.id),
        eq(companyBudgetUsageTable.periodMonth, period),
      ),
    );
  const spent = usage?.spentPaise ?? 0;
  const remaining = Math.max(0, monthlyBudget - spent);
  const subsidyPaise = Math.min(remaining, subtotal);
  res.json({
    active: true,
    company: { id: row.company.id, slug: row.company.slug, name: row.company.name },
    monthlyBudgetPaise: monthlyBudget,
    spentThisMonthPaise: spent,
    remainingPaise: remaining,
    subsidyPaise,
  });
});

const chargeSchema = z.object({
  companyId: z.number().int().positive(),
  paise: z.number().int().positive(),
  orderRef: z.string().max(64).optional(),
});

router.post(
  "/me/company-subsidy/charge",
  async (req: Request, res: Response) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const parsed = chargeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const m = await loadMembership(parsed.data.companyId, auth.id);
    if (!m || m.status !== "active") {
      res.status(403).json({ error: "not a member" });
      return;
    }
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, parsed.data.companyId));
    if (!company) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const monthlyBudget =
      m.perEmployeeBudgetPaiseOverride ?? company.perEmployeeMonthlyBudgetPaise;
    const period = currentMonth();
    try {
      const out = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"subsidy:" + company.id + ":" + auth.id + ":" + period}, 0))`,
        );
        const [existing] = await tx
          .select()
          .from(companyBudgetUsageTable)
          .where(
            and(
              eq(companyBudgetUsageTable.companyId, company.id),
              eq(companyBudgetUsageTable.userId, auth.id),
              eq(companyBudgetUsageTable.periodMonth, period),
            ),
          );
        const currentSpent = existing?.spentPaise ?? 0;
        const remaining = Math.max(0, monthlyBudget - currentSpent);
        const charged = Math.min(remaining, parsed.data.paise);
        if (charged <= 0) {
          return { charged: 0, balanceRemaining: remaining };
        }
        if (existing) {
          await tx
            .update(companyBudgetUsageTable)
            .set({ spentPaise: currentSpent + charged })
            .where(eq(companyBudgetUsageTable.id, existing.id));
        } else {
          await tx.insert(companyBudgetUsageTable).values({
            companyId: company.id,
            userId: auth.id,
            periodMonth: period,
            spentPaise: charged,
          });
        }
        return { charged, balanceRemaining: remaining - charged };
      });
      res.json({ chargedPaise: out.charged, remainingPaise: out.balanceRemaining });
    } catch (err) {
      req.log.error({ err }, "subsidy charge failed");
      res.status(500).json({ error: "charge failed" });
    }
  },
);

// ---------- Office orders ----------

const createOfficeOrderSchema = z.object({
  companySlug: z.string().min(1),
  title: z.string().min(2).max(128),
  scheduledFor: z.string().datetime(),
  windowClosesAt: z.string().datetime(),
  perEmployeeBudgetPaise: z.number().int().min(0).max(10_000_000),
  address: z.object({
    label: z.string().max(64).optional(),
    line: z.string().min(2).max(256),
    city: z.string().min(1).max(64),
    pincode: z.string().min(3).max(16),
    phone: z.string().max(32).optional(),
  }),
});

router.post("/office-orders", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const parsed = createOfficeOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const company = await loadCompanyBySlug(parsed.data.companySlug);
  if (!company) {
    res.status(404).json({ error: "company not found" });
    return;
  }
  const m = await loadMembership(company.id, auth.id);
  if (!m || m.role !== "admin" || m.status !== "active") {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const [row] = await db
    .insert(officeOrdersTable)
    .values({
      companyId: company.id,
      createdByUserId: auth.id,
      title: parsed.data.title,
      address: parsed.data.address,
      perEmployeeBudgetPaise: parsed.data.perEmployeeBudgetPaise,
      scheduledFor: new Date(parsed.data.scheduledFor),
      windowClosesAt: new Date(parsed.data.windowClosesAt),
      status: "open",
      picks: [],
    })
    .returning();
  res.json({ officeOrder: row });
});

router.get(
  "/companies/:slug/office-orders",
  async (req: Request, res: Response) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const company = await loadCompanyBySlug(String(req.params.slug ?? ""));
    if (!company) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const m = await loadMembership(company.id, auth.id);
    if (!m || m.status !== "active") {
      res.status(403).json({ error: "not a member" });
      return;
    }
    const rows = await db
      .select()
      .from(officeOrdersTable)
      .where(eq(officeOrdersTable.companyId, company.id))
      .orderBy(desc(officeOrdersTable.createdAt));
    res.json({ officeOrders: rows });
  },
);

router.get("/office-orders/:id", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(officeOrdersTable)
    .where(eq(officeOrdersTable.id, id));
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const m = await loadMembership(row.companyId, auth.id);
  if (!m || m.status !== "active") {
    res.status(403).json({ error: "not a member" });
    return;
  }
  res.json({ officeOrder: row, membership: m });
});

const pickSchema = z.object({
  items: z
    .array(
      z.object({
        dishId: z.number().int().positive(),
        quantity: z.number().int().positive().max(10),
      }),
    )
    .min(1)
    .max(20),
});

router.post(
  "/office-orders/:id/pick",
  async (req: Request, res: Response) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const parsed = pickSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    // Resolve dish prices server-side. Use the batch resolver so we hit the
    // catalog once even when the office order has many line items (was N+1
    // round-trips per pick).
    const catalog = await makeBatchDishResolver();
    const resolvedItems: OfficeOrderPick["items"] = [];
    let total = 0;
    for (const it of parsed.data.items) {
      const dish = catalog.byId(it.dishId);
      if (!dish || !dish.isAvailable) {
        res.status(404).json({ error: `dish ${it.dishId} unavailable` });
        return;
      }
      const lineTotal = dish.price * it.quantity;
      total += lineTotal;
      resolvedItems.push({
        dishId: dish.id,
        name: dish.name,
        image: dish.image,
        unitPrice: dish.price,
        quantity: it.quantity,
      });
    }
    try {
      const out = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"office:" + id}, 0))`,
        );
        const [existing] = await tx
          .select()
          .from(officeOrdersTable)
          .where(eq(officeOrdersTable.id, id));
        if (!existing) return { error: "not_found" as const };
        const m = await tx
          .select()
          .from(companyMembersTable)
          .where(
            and(
              eq(companyMembersTable.companyId, existing.companyId),
              eq(companyMembersTable.userId, auth.id),
              eq(companyMembersTable.status, "active"),
            ),
          );
        if (!m[0]) return { error: "forbidden" as const };
        if (existing.status !== "open") {
          return { error: "closed" as const };
        }
        if (new Date(existing.windowClosesAt).getTime() < Date.now()) {
          return { error: "window_closed" as const };
        }
        if (total > existing.perEmployeeBudgetPaise) {
          return { error: "over_budget" as const, total, budget: existing.perEmployeeBudgetPaise };
        }
        const userName = auth.firstName || (auth.email ? auth.email.split("@")[0]! : "Employee");
        const picks = (existing.picks ?? []).filter((p) => p.userId !== auth.id);
        const newPick: OfficeOrderPick = {
          userId: auth.id,
          userName,
          pickedAt: new Date().toISOString(),
          items: resolvedItems,
          totalPaise: total,
        };
        picks.push(newPick);
        const newTotal = picks.reduce((s, p) => s + p.totalPaise, 0);
        const [updated] = await tx
          .update(officeOrdersTable)
          .set({ picks, totalPaise: newTotal })
          .where(eq(officeOrdersTable.id, id))
          .returning();
        return { officeOrder: updated };
      });
      if ("error" in out) {
        const code =
          out.error === "not_found"
            ? 404
            : out.error === "forbidden"
              ? 403
              : out.error === "over_budget"
                ? 422
                : 409;
        res.status(code).json({ error: out.error });
        return;
      }
      res.json({ officeOrder: out.officeOrder });
    } catch (err) {
      req.log.error({ err }, "office pick failed");
      res.status(500).json({ error: "pick failed" });
    }
  },
);

router.post(
  "/office-orders/:id/close",
  async (req: Request, res: Response) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(officeOrdersTable)
      .where(eq(officeOrdersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const m = await loadMembership(existing.companyId, auth.id);
    if (!m || m.role !== "admin" || m.status !== "active") {
      res.status(403).json({ error: "admin only" });
      return;
    }
    if (existing.status === "closed" || existing.status === "delivered") {
      res.json({ officeOrder: existing });
      return;
    }
    const [updated] = await db
      .update(officeOrdersTable)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(officeOrdersTable.id, id))
      .returning();
    res.json({ officeOrder: updated });
  },
);

// ---------- Vouchers ----------

const purchaseVoucherSchema = z.object({
  amountPaise: z.number().int().min(10_000).max(5_000_000),
  recipientEmail: z.string().email().max(256).optional(),
  recipientName: z.string().max(128).optional(),
  message: z.string().max(512).optional(),
});

router.post("/vouchers", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const parsed = purchaseVoucherSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  let attempt = 0;
  let inserted: typeof vouchersTable.$inferSelect | undefined;
  while (attempt < 5 && !inserted) {
    const code = generateCode("TM", 5);
    const rows = await db
      .insert(vouchersTable)
      .values({
        code,
        amountPaise: parsed.data.amountPaise,
        purchasedByUserId: auth.id,
        recipientEmail: parsed.data.recipientEmail?.toLowerCase(),
        recipientName: parsed.data.recipientName,
        message: parsed.data.message,
        status: "active",
      })
      .onConflictDoNothing({ target: vouchersTable.code })
      .returning();
    if (rows[0]) inserted = rows[0];
    attempt++;
  }
  if (!inserted) {
    res.status(500).json({ error: "could not allocate code" });
    return;
  }
  res.json({ voucher: inserted });
});

router.get("/vouchers/mine", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const purchased = await db
    .select()
    .from(vouchersTable)
    .where(eq(vouchersTable.purchasedByUserId, auth.id))
    .orderBy(desc(vouchersTable.createdAt));
  const redeemed = await db
    .select()
    .from(vouchersTable)
    .where(eq(vouchersTable.redeemedByUserId, auth.id))
    .orderBy(desc(vouchersTable.redeemedAt));
  res.json({ purchased, redeemed });
});

const previewVoucherSchema = z.object({ code: z.string().min(4).max(24) });

router.post("/vouchers/preview", async (req: Request, res: Response) => {
  const parsed = previewVoucherSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const [v] = await db
    .select()
    .from(vouchersTable)
    .where(eq(vouchersTable.code, parsed.data.code.toUpperCase()));
  if (!v) {
    res.status(404).json({ error: "voucher not found" });
    return;
  }
  res.json({
    code: v.code,
    amountPaise: v.amountPaise,
    status: v.status,
    redeemed: v.status !== "active",
  });
});

router.post("/vouchers/redeem", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const parsed = previewVoucherSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const code = parsed.data.code.toUpperCase();
  try {
    const out = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"voucher:" + code}, 0))`,
      );
      const [v] = await tx
        .select()
        .from(vouchersTable)
        .where(eq(vouchersTable.code, code));
      if (!v) return { error: "not_found" as const };
      if (v.status !== "active") return { error: "already_redeemed" as const };
      const [updated] = await tx
        .update(vouchersTable)
        .set({
          status: "redeemed",
          redeemedByUserId: auth.id,
          redeemedAt: new Date(),
        })
        .where(eq(vouchersTable.id, v.id))
        .returning();
      // Credit the user's wallet via the existing credit ledger so the
      // amount is automatically applied at checkout (same path as referral
      // / loyalty rewards). reason field is varchar; using a stable string.
      await tx.execute(
        sql`insert into credit_ledger (user_id, delta_paise, reason, ref_type, ref_id, note)
            values (${auth.id}, ${v.amountPaise}, ${"voucher_redeemed"}, ${"voucher"}, ${String(v.id)}, ${"Voucher " + v.code})`,
      );
      return { voucher: updated };
    });
    if ("error" in out) {
      res
        .status(out.error === "not_found" ? 404 : 409)
        .json({ error: out.error });
      return;
    }
    res.json({ voucher: out.voucher, creditedPaise: out.voucher.amountPaise });
  } catch (err) {
    req.log.error({ err }, "voucher redeem failed");
    res.status(500).json({ error: "redeem failed" });
  }
});

export default router;
