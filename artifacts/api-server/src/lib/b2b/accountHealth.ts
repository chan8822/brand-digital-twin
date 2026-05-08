/**
 * Account health agent. Computes a deterministic 0..100 score from real
 * usage signals and adds a one-paragraph AI commentary on top.
 *
 * The score is a weighted sum:
 *   ordersTrend     35  (±35, where -100% trend == -35)
 *   memberActivation 25
 *   budgetUtilization 20
 *   recency          15  (decays from 15 to 0 between 0..30 days idle)
 *   hasDietProfile    5
 * Bands:
 *   >=80 healthy, 65-79 watch, 40-64 at_risk, <40 critical
 */
import { generateText } from "ai";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  accountHealthSnapshotsTable,
  companiesTable,
  companyBudgetUsageTable,
  companyMembersTable,
  db,
  officeOrdersTable,
  type AccountHealthDrivers,
  type AccountHealthSnapshot,
  type AccountRiskLevel,
  type Company,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "../ai/model";
import { logger } from "../logger";
import { getDietProfile } from "./dietSurvey";

const TIMEOUT_MS = 8_000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function bandFromScore(score: number): AccountRiskLevel {
  if (score >= 80) return "healthy";
  if (score >= 65) return "watch";
  if (score >= 40) return "at_risk";
  return "critical";
}

export function scoreFromDrivers(d: AccountHealthDrivers): number {
  // ordersTrend: -100% -> -35, +100% -> +35 (clamped)
  const trend = Math.max(-100, Math.min(100, d.ordersTrendPct));
  const trendPts = Math.round((trend / 100) * 35);
  const activationPts = Math.round(d.memberActivationPct * 0.25);
  const budgetPts = Math.round(Math.min(1, Math.max(0, d.budgetUtilization)) * 20);
  const recencyPts = (() => {
    if (d.daysSinceLastOrder == null) return 0;
    if (d.daysSinceLastOrder >= 30) return 0;
    return Math.round(15 * (1 - d.daysSinceLastOrder / 30));
  })();
  const profilePts = d.hasDietProfile ? 5 : 0;
  // Base of 50 keeps healthy customers from over-rewarding flat trend.
  const raw = 50 + trendPts + activationPts + budgetPts + recencyPts + profilePts - 25;
  return Math.max(0, Math.min(100, raw));
}

export async function computeDrivers(
  company: Company,
): Promise<AccountHealthDrivers> {
  const start30 = daysAgo(30);
  const start60 = daysAgo(60);
  const [recent, prior] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(officeOrdersTable)
      .where(
        and(
          eq(officeOrdersTable.companyId, company.id),
          gte(officeOrdersTable.createdAt, start30),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(officeOrdersTable)
      .where(
        and(
          eq(officeOrdersTable.companyId, company.id),
          gte(officeOrdersTable.createdAt, start60),
          lte(officeOrdersTable.createdAt, start30),
        ),
      ),
  ]);
  const ordersLast30 = recent[0]?.n ?? 0;
  const ordersPrev30 = prior[0]?.n ?? 0;
  const ordersTrendPct =
    ordersPrev30 === 0
      ? ordersLast30 > 0
        ? 100
        : 0
      : Math.round(((ordersLast30 - ordersPrev30) / ordersPrev30) * 100);

  const members = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`sum(case when ${companyMembersTable.status} = 'active' then 1 else 0 end)::int`,
    })
    .from(companyMembersTable)
    .where(eq(companyMembersTable.companyId, company.id));
  const totalMembers = members[0]?.total ?? 0;
  const activeMembers = members[0]?.active ?? 0;
  const memberActivationPct =
    totalMembers === 0
      ? 0
      : Math.round((activeMembers / totalMembers) * 100);

  const period = isoDay(new Date()).slice(0, 7);
  const usage = await db
    .select({ spent: sql<number>`coalesce(sum(${companyBudgetUsageTable.spentPaise}),0)::int` })
    .from(companyBudgetUsageTable)
    .where(
      and(
        eq(companyBudgetUsageTable.companyId, company.id),
        eq(companyBudgetUsageTable.periodMonth, period),
      ),
    );
  const spent = usage[0]?.spent ?? 0;
  const budgetCapPaise =
    company.perEmployeeMonthlyBudgetPaise * Math.max(1, totalMembers);
  const budgetUtilization =
    budgetCapPaise === 0 ? 0 : Math.min(1, spent / budgetCapPaise);

  const [last] = await db
    .select({ at: sql<Date>`max(${officeOrdersTable.createdAt})` })
    .from(officeOrdersTable)
    .where(eq(officeOrdersTable.companyId, company.id));
  const lastAt = last?.at ? new Date(last.at) : null;
  const daysSinceLastOrder =
    lastAt == null
      ? null
      : Math.floor((Date.now() - lastAt.getTime()) / 86_400_000);

  const profile = await getDietProfile(company.id);
  return {
    ordersLast30,
    ordersPrev30,
    ordersTrendPct,
    activeMembers,
    totalMembers,
    memberActivationPct,
    budgetUtilization: Number(budgetUtilization.toFixed(3)),
    daysSinceLastOrder,
    hasDietProfile: Boolean(profile),
  };
}

async function aiCommentary(
  company: Company,
  drivers: AccountHealthDrivers,
  band: AccountRiskLevel,
): Promise<{ text: string; modelId: string }> {
  const fallback =
    band === "critical"
      ? `${company.name} hasn't ordered in ${
          drivers.daysSinceLastOrder ?? "many"
        } days; outreach now.`
      : band === "at_risk"
        ? `${company.name} usage is slipping (${drivers.ordersTrendPct}% vs prior 30d). Consider a check-in.`
        : band === "watch"
          ? `${company.name} usage is steady but room to grow on member activation (${drivers.memberActivationPct}%).`
          : `${company.name} is healthy with strong member activation and steady ordering.`;
  try {
    const prompt = [
      "You are a B2B account-health analyst. Write ONE paragraph (<=70 words)",
      "for a sales rep, in plain English, summarising the account state and",
      "the single most useful next action. No emojis. No markdown.",
      "",
      `Account: ${company.name}`,
      `Risk band: ${band}`,
      `Drivers JSON: ${JSON.stringify(drivers)}`,
    ].join("\n");
    const { text } = await Promise.race([
      generateText({ model: getModel(), prompt, temperature: 0.3 }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("commentary timeout")), TIMEOUT_MS),
      ),
    ]);
    const trimmed = text.trim().slice(0, 800);
    if (trimmed.length === 0) return { text: fallback, modelId: "deterministic" };
    return { text: trimmed, modelId: DEFAULT_MODEL_ID };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, company: company.slug },
      "account health: commentary fallback",
    );
    return { text: fallback, modelId: "deterministic" };
  }
}

export async function recomputeHealth(
  company: Company,
): Promise<AccountHealthSnapshot> {
  const drivers = await computeDrivers(company);
  const score = scoreFromDrivers(drivers);
  const riskLevel = bandFromScore(score);
  const { text: commentary, modelId } = await aiCommentary(
    company,
    drivers,
    riskLevel,
  );
  const snapshotDate = isoDay(new Date());
  const [row] = await db
    .insert(accountHealthSnapshotsTable)
    .values({
      companyId: company.id,
      snapshotDate,
      score,
      riskLevel,
      drivers,
      commentary,
      modelId,
    })
    .onConflictDoUpdate({
      target: [
        accountHealthSnapshotsTable.companyId,
        accountHealthSnapshotsTable.snapshotDate,
      ],
      set: { score, riskLevel, drivers, commentary, modelId },
    })
    .returning();
  if (!row) throw new Error("failed to insert health snapshot");
  return row;
}

export async function getLatestHealth(
  companyId: number,
): Promise<AccountHealthSnapshot | null> {
  const [row] = await db
    .select()
    .from(accountHealthSnapshotsTable)
    .where(eq(accountHealthSnapshotsTable.companyId, companyId))
    .orderBy(sql`${accountHealthSnapshotsTable.snapshotDate} desc`)
    .limit(1);
  return row ?? null;
}

export async function listAllAccountsWithHealth(): Promise<
  Array<{
    company: Company;
    health: AccountHealthSnapshot | null;
  }>
> {
  const companies = await db.select().from(companiesTable);
  const results = await Promise.all(
    companies.map(async (c) => ({
      company: c,
      health: await getLatestHealth(c.id),
    })),
  );
  // Sort risk first so the sales console leads with hot accounts.
  const order: Record<AccountRiskLevel, number> = {
    critical: 0,
    at_risk: 1,
    watch: 2,
    healthy: 3,
  };
  results.sort((a, b) => {
    const ar = a.health ? order[a.health.riskLevel] : -1;
    const br = b.health ? order[b.health.riskLevel] : -1;
    return ar - br;
  });
  return results;
}
