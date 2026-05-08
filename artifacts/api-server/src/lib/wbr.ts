import { generateText } from "ai";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  anomalyAlertsTable,
  db,
  ordersTable,
  wbrReportsTable,
  type WbrReport,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "./ai/model";
import { logger } from "./logger";

export interface WbrInput {
  weekStart: Date;
  weekEnd: Date;
}

function isoMonday(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  const day = x.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

export function lastFullWeek(now = new Date()): WbrInput {
  const thisMon = isoMonday(now);
  const weekStart = new Date(thisMon);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weekEnd = new Date(thisMon);
  return { weekStart, weekEnd };
}

interface OrderSlice {
  orders: number;
  revenuePaise: number;
  uniqueUsers: number;
}

async function aggregateWindow(start: Date, end: Date): Promise<OrderSlice> {
  const [row] = await db
    .select({
      orders: sql<number>`count(*)::int`,
      revenuePaise: sql<number>`coalesce(sum(${ordersTable.totalPaise}),0)::bigint`,
      uniqueUsers: sql<number>`count(distinct ${ordersTable.userId})::int`,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, start),
        lt(ordersTable.createdAt, end),
      ),
    );
  return {
    orders: Number(row?.orders ?? 0),
    revenuePaise: Number(row?.revenuePaise ?? 0),
    uniqueUsers: Number(row?.uniqueUsers ?? 0),
  };
}

async function ordersByDay(start: Date, end: Date) {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${ordersTable.createdAt}), 'YYYY-MM-DD')`,
      orders: sql<number>`count(*)::int`,
      revenuePaise: sql<number>`coalesce(sum(${ordersTable.totalPaise}),0)::bigint`,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, start),
        lt(ordersTable.createdAt, end),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows.map((r) => ({
    day: String(r.day),
    orders: Number(r.orders),
    revenuePaise: Number(r.revenuePaise),
  }));
}

async function topDishes(start: Date, end: Date) {
  // jsonb expansion to count units per dish name.
  const rows = await db.execute<{ name: string; units: number }>(
    sql`select item->>'name' as name,
               sum((item->>'qty')::int) as units
        from ${ordersTable}
        cross join lateral jsonb_array_elements(${ordersTable.items}) as item
        where ${ordersTable.createdAt} >= ${start}
          and ${ordersTable.createdAt} < ${end}
          and item->>'name' is not null
        group by 1
        order by units desc nulls last
        limit 5`,
  );
  return rows.rows.map((r: { name: string; units: number | string }) => ({
    name: String(r.name),
    units: Number(r.units),
  }));
}

async function anomaliesFired(start: Date, end: Date): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(anomalyAlertsTable)
    .where(
      and(
        gte(anomalyAlertsTable.createdAt, start),
        lt(anomalyAlertsTable.createdAt, end),
      ),
    );
  return Number(row?.c ?? 0);
}

function pctDelta(curr: number, prev: number): string {
  if (prev <= 0) return curr > 0 ? "new" : "0%";
  const d = ((curr - prev) / prev) * 100;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}%`;
}

function templateCommentary(kpis: WbrReport["kpis"]): string {
  return [
    `Last week we shipped ${kpis.orders} orders (${pctDelta(kpis.orders, kpis.ordersPrev)} vs the prior week) for ₹${(kpis.revenuePaise / 100).toFixed(0)} revenue (${pctDelta(kpis.revenuePaise, kpis.revenuePaisePrev)}).`,
    `Active customers: ${kpis.activeCustomers} (${pctDelta(kpis.activeCustomers, kpis.activeCustomersPrev)}). AOV ₹${(kpis.avgOrderPaise / 100).toFixed(0)}.`,
    kpis.topDishes.length
      ? `Top dishes: ${kpis.topDishes.map((d) => `${d.name} (${d.units})`).join(", ")}.`
      : "",
    kpis.anomaliesFired
      ? `${kpis.anomaliesFired} metric anomalies fired — review on the Ops page.`
      : "No anomalies fired this week.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function aiCommentary(kpis: WbrReport["kpis"]): Promise<{ text: string; modelId: string }> {
  try {
    const { text } = await generateText({
      model: getModel(DEFAULT_MODEL_ID),
      system:
        "You are an analyst writing a short weekly business review for a wellness food brand. 4-6 sentences. Lead with the headline number, mention week-over-week change, call out one risk and one opportunity. No emoji.",
      prompt: `KPIs (paise = 1/100 INR):\n${JSON.stringify(kpis, null, 2)}`,
      temperature: 0.4,
    });
    if (text.trim()) return { text: text.trim(), modelId: DEFAULT_MODEL_ID };
  } catch (err) {
    logger.warn({ err }, "wbr ai commentary failed; using template");
  }
  return { text: templateCommentary(kpis), modelId: "template" };
}

export async function generateWbr(input?: Partial<WbrInput>): Promise<WbrReport> {
  const { weekStart, weekEnd } = {
    ...lastFullWeek(),
    ...input,
  } as WbrInput;
  const prevStart = new Date(weekStart);
  prevStart.setUTCDate(prevStart.getUTCDate() - 7);
  const prevEnd = new Date(weekStart);

  const [curr, prev, byDay, top, fired] = await Promise.all([
    aggregateWindow(weekStart, weekEnd),
    aggregateWindow(prevStart, prevEnd),
    ordersByDay(weekStart, weekEnd),
    topDishes(weekStart, weekEnd),
    anomaliesFired(weekStart, weekEnd),
  ]);

  const kpis: WbrReport["kpis"] = {
    orders: curr.orders,
    ordersPrev: prev.orders,
    revenuePaise: curr.revenuePaise,
    revenuePaisePrev: prev.revenuePaise,
    activeCustomers: curr.uniqueUsers,
    activeCustomersPrev: prev.uniqueUsers,
    avgOrderPaise: curr.orders > 0 ? Math.round(curr.revenuePaise / curr.orders) : 0,
    topDishes: top,
    anomaliesFired: fired,
  };
  const chartSpec = {
    revenueByDay: byDay.map((d) => ({ day: d.day, revenuePaise: d.revenuePaise })),
    ordersByDay: byDay.map((d) => ({ day: d.day, orders: d.orders })),
  };
  const { text: commentary, modelId } = await aiCommentary(kpis);

  // Upsert by weekStart so re-running for the same week refreshes the row.
  const [row] = await db
    .insert(wbrReportsTable)
    .values({ weekStart, weekEnd, kpis, chartSpec, commentary, modelId })
    .onConflictDoUpdate({
      target: wbrReportsTable.weekStart,
      set: { weekEnd, kpis, chartSpec, commentary, modelId },
    })
    .returning();
  if (!row) throw new Error("wbr insert failed");
  return row;
}

export async function listWbrReports(limit = 12): Promise<WbrReport[]> {
  return db
    .select()
    .from(wbrReportsTable)
    .orderBy(desc(wbrReportsTable.weekStart))
    .limit(limit);
}

export async function getWbrReport(id: number): Promise<WbrReport | null> {
  const [row] = await db
    .select()
    .from(wbrReportsTable)
    .where(eq(wbrReportsTable.id, id))
    .limit(1);
  return row ?? null;
}
