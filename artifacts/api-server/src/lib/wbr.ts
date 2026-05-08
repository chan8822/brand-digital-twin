import { generateText } from "ai";
import { desc, eq, sql } from "drizzle-orm";
import { db, wbrReportsTable, type WbrReport } from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "./ai/model";
import { logger } from "./logger";

// All read paths in this file go through the curated `safe_*` views (see
// safeSql.ts / ensureSafeViews). The views expose only the non-PII columns
// the analytics pack is permitted to see, matching the same governance
// boundary the NL "Ask the data" surface uses.

export interface WbrInput {
  weekStart: Date;
  weekEnd: Date;
}

function isoMonday(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  const day = x.getUTCDay();
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
  const r = await db.execute<{ orders: number; revenue_paise: string; unique_users: number }>(
    sql`select count(*)::int as orders,
               coalesce(sum(total_paise), 0)::bigint as revenue_paise,
               count(distinct user_id)::int as unique_users
        from safe_orders
        where created_at >= ${start} and created_at < ${end}`,
  );
  const row = r.rows[0];
  return {
    orders: Number(row?.orders ?? 0),
    revenuePaise: Number(row?.revenue_paise ?? 0),
    uniqueUsers: Number(row?.unique_users ?? 0),
  };
}

async function ordersByDay(start: Date, end: Date) {
  const r = await db.execute<{ day: string; orders: number; revenue_paise: string }>(
    sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
               count(*)::int as orders,
               coalesce(sum(total_paise), 0)::bigint as revenue_paise
        from safe_orders
        where created_at >= ${start} and created_at < ${end}
        group by 1 order by 1`,
  );
  return r.rows.map((row) => ({
    day: String(row.day),
    orders: Number(row.orders),
    revenuePaise: Number(row.revenue_paise),
  }));
}

async function topDishes(start: Date, end: Date) {
  const r = await db.execute<{ name: string; units: string }>(
    sql`select item->>'name' as name,
               sum((item->>'qty')::int) as units
        from safe_orders
        cross join lateral jsonb_array_elements(items) as item
        where created_at >= ${start} and created_at < ${end}
          and item->>'name' is not null
        group by 1
        order by units desc nulls last
        limit 5`,
  );
  return r.rows.map((row) => ({
    name: String(row.name),
    units: Number(row.units),
  }));
}

async function anomaliesFired(start: Date, end: Date): Promise<number> {
  const r = await db.execute<{ c: number }>(
    sql`select count(*)::int as c
        from safe_anomaly_alerts
        where created_at >= ${start} and created_at < ${end}`,
  );
  return Number(r.rows[0]?.c ?? 0);
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
