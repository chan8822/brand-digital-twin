/**
 * Quarterly business review (QBR) drafter. Produces sectioned text +
 * simple bar charts a sales rep can edit and export to markdown.
 */
import { generateText } from "ai";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  companyBudgetUsageTable,
  companyMembersTable,
  db,
  officeOrdersTable,
  qbrDraftsTable,
  type Company,
  type QbrChart,
  type QbrDraft,
  type QbrPayload,
  type QbrSection,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "../ai/model";
import { logger } from "../logger";
import { computeDrivers } from "./accountHealth";

const TIMEOUT_MS = 14_000;

function quarterBoundsForToday(today: Date = new Date()): {
  start: string;
  end: string;
} {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const qStartMonth = m - (m % 3); // 0,3,6,9
  const start = new Date(Date.UTC(y, qStartMonth, 1));
  const end = new Date(Date.UTC(y, qStartMonth + 3, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function gatherFacts(company: Company, start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T23:59:59Z`);
  const orders = await db
    .select({
      id: officeOrdersTable.id,
      title: officeOrdersTable.title,
      status: officeOrdersTable.status,
      totalPaise: officeOrdersTable.totalPaise,
      scheduledFor: officeOrdersTable.scheduledFor,
    })
    .from(officeOrdersTable)
    .where(
      and(
        eq(officeOrdersTable.companyId, company.id),
        gte(officeOrdersTable.createdAt, startDate),
        lte(officeOrdersTable.createdAt, endDate),
      ),
    );
  const monthly = await db
    .select({
      period: companyBudgetUsageTable.periodMonth,
      spent: sql<number>`sum(${companyBudgetUsageTable.spentPaise})::int`,
    })
    .from(companyBudgetUsageTable)
    .where(eq(companyBudgetUsageTable.companyId, company.id))
    .groupBy(companyBudgetUsageTable.periodMonth)
    .orderBy(companyBudgetUsageTable.periodMonth);
  const members = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companyMembersTable)
    .where(eq(companyMembersTable.companyId, company.id));
  const totalMembers = members[0]?.n ?? 0;
  const drivers = await computeDrivers(company);
  return { orders, monthly, totalMembers, drivers };
}

function deterministicSections(
  company: Company,
  facts: Awaited<ReturnType<typeof gatherFacts>>,
  start: string,
  end: string,
): QbrSection[] {
  const ordersDelivered = facts.orders.filter((o) => o.status === "delivered").length;
  const totalSpentRupees = (
    facts.orders.reduce((a, o) => a + o.totalPaise, 0) / 100
  ).toFixed(0);
  return [
    {
      title: "Executive summary",
      body:
        `${company.name} ran ${facts.orders.length} office orders ` +
        `between ${start} and ${end}, with ${ordersDelivered} delivered. ` +
        `Member activation is ${facts.drivers.memberActivationPct}% across ` +
        `${facts.totalMembers} seats. Total spend: ₹${totalSpentRupees}.`,
    },
    {
      title: "Usage highlights",
      body:
        `Last 30 days: ${facts.drivers.ordersLast30} orders ` +
        `(prev 30: ${facts.drivers.ordersPrev30}, ` +
        `${facts.drivers.ordersTrendPct >= 0 ? "+" : ""}` +
        `${facts.drivers.ordersTrendPct}%). ` +
        `Budget utilization this month: ` +
        `${Math.round(facts.drivers.budgetUtilization * 100)}%.`,
    },
    {
      title: "Risks",
      body:
        facts.drivers.daysSinceLastOrder != null &&
        facts.drivers.daysSinceLastOrder > 14
          ? `Idle for ${facts.drivers.daysSinceLastOrder} days — re-engage with a sampler menu.`
          : facts.drivers.memberActivationPct < 60
            ? `Only ${facts.drivers.memberActivationPct}% of seats are active. Run an onboarding push.`
            : "No major risks detected this quarter.",
    },
    {
      title: "Recommendations",
      body: facts.drivers.hasDietProfile
        ? "Use the team diet profile to schedule the next two weeks of lunches."
        : "Capture a team diet profile so the planner can propose menus everyone can eat.",
    },
  ];
}

function deterministicCharts(
  facts: Awaited<ReturnType<typeof gatherFacts>>,
): QbrChart[] {
  return [
    {
      title: "Office orders over the last 6 months",
      unit: "orders",
      series: facts.monthly.slice(-6).map((m) => ({
        label: m.period,
        value: 0, // monthly orders count would need a separate query;
        // we keep this lightweight and let the AI talk through trends.
      })),
    },
    {
      title: "Budget spend per month (₹)",
      unit: "rupees",
      series: facts.monthly.slice(-6).map((m) => ({
        label: m.period,
        value: Math.round(m.spent / 100),
      })),
    },
  ];
}

async function aiSections(
  company: Company,
  facts: Awaited<ReturnType<typeof gatherFacts>>,
  start: string,
  end: string,
): Promise<{ sections: QbrSection[]; modelId: string } | null> {
  try {
    const prompt = [
      "You are drafting a Quarterly Business Review for a B2B nutrition",
      "delivery account. Return STRICT JSON of the form:",
      '{"sections":[{"title":"Executive summary","body":"..."},',
      '{"title":"Usage highlights","body":"..."},{"title":"Risks","body":"..."},',
      '{"title":"Recommendations","body":"..."}]}',
      "Each body must be plain English (<=120 words), no markdown.",
      "",
      `Account: ${company.name}`,
      `Period: ${start} to ${end}`,
      `Facts JSON: ${JSON.stringify({
        ordersDelivered: facts.orders.filter((o) => o.status === "delivered").length,
        ordersTotal: facts.orders.length,
        spentRupees: Math.round(
          facts.orders.reduce((a, o) => a + o.totalPaise, 0) / 100,
        ),
        drivers: facts.drivers,
        totalMembers: facts.totalMembers,
      })}`,
    ].join("\n");
    const { text } = await Promise.race([
      generateText({ model: getModel(), prompt, temperature: 0.4 }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("qbr timeout")), TIMEOUT_MS),
      ),
    ]);
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as {
      sections?: Array<{ title?: string; body?: string }>;
    };
    const sections: QbrSection[] = (parsed.sections ?? [])
      .filter((s): s is { title: string; body: string } =>
        Boolean(s.title) && Boolean(s.body),
      )
      .map((s) => ({
        title: String(s.title).slice(0, 80),
        body: String(s.body).slice(0, 1200),
      }));
    if (sections.length === 0) return null;
    return { sections, modelId: DEFAULT_MODEL_ID };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, company: company.slug },
      "qbr: AI fallback to deterministic",
    );
    return null;
  }
}

export async function generateQbr(
  company: Company,
  opts: { periodStart?: string; periodEnd?: string } = {},
): Promise<QbrDraft> {
  const { start, end } = quarterBoundsForToday();
  const periodStart = opts.periodStart ?? start;
  const periodEnd = opts.periodEnd ?? end;
  const facts = await gatherFacts(company, periodStart, periodEnd);
  const ai = await aiSections(company, facts, periodStart, periodEnd);
  const sections = ai?.sections ?? deterministicSections(company, facts, periodStart, periodEnd);
  const payload: QbrPayload = {
    sections,
    charts: deterministicCharts(facts),
    modelId: ai?.modelId ?? "deterministic",
  };
  const [row] = await db
    .insert(qbrDraftsTable)
    .values({
      companyId: company.id,
      periodStart,
      periodEnd,
      payload,
    })
    .onConflictDoUpdate({
      target: [
        qbrDraftsTable.companyId,
        qbrDraftsTable.periodStart,
        qbrDraftsTable.periodEnd,
      ],
      set: { payload, status: "draft" },
    })
    .returning();
  if (!row) throw new Error("failed to upsert QBR draft");
  return row;
}

export async function updateQbrSections(
  id: number,
  sections: QbrSection[],
  editor: string,
): Promise<QbrDraft | null> {
  const [existing] = await db
    .select()
    .from(qbrDraftsTable)
    .where(eq(qbrDraftsTable.id, id))
    .limit(1);
  if (!existing) return null;
  const payload: QbrPayload = {
    ...existing.payload,
    sections: sections.map((s) => ({
      title: String(s.title).slice(0, 80),
      body: String(s.body).slice(0, 4000),
    })),
  };
  const [row] = await db
    .update(qbrDraftsTable)
    .set({ payload, editedBy: editor.slice(0, 64) })
    .where(eq(qbrDraftsTable.id, id))
    .returning();
  return row ?? null;
}

export async function getLatestQbr(
  companyId: number,
): Promise<QbrDraft | null> {
  const [row] = await db
    .select()
    .from(qbrDraftsTable)
    .where(eq(qbrDraftsTable.companyId, companyId))
    .orderBy(sql`${qbrDraftsTable.periodStart} desc`)
    .limit(1);
  return row ?? null;
}

export function renderQbrMarkdown(company: Company, draft: QbrDraft): string {
  const lines: string[] = [];
  lines.push(`# Quarterly Business Review — ${company.name}`);
  lines.push("");
  lines.push(`Period: ${draft.periodStart} → ${draft.periodEnd}`);
  lines.push("");
  for (const s of draft.payload.sections) {
    lines.push(`## ${s.title}`);
    lines.push("");
    lines.push(s.body);
    lines.push("");
  }
  for (const c of draft.payload.charts) {
    lines.push(`## ${c.title}`);
    lines.push("");
    for (const p of c.series) {
      const bar = "▇".repeat(
        Math.max(0, Math.min(40, Math.round(p.value / 50))),
      );
      lines.push(`- ${p.label}: ${p.value} ${c.unit} ${bar}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
