import { db, ordersTable } from "@workspace/db";
import { and, gte, ne, sql } from "drizzle-orm";

export type Daypart = "breakfast" | "lunch" | "snacks" | "dinner";

const DAYPART_HOURS: Record<Daypart, [number, number]> = {
  breakfast: [5, 11],
  lunch: [11, 15],
  snacks: [15, 19],
  dinner: [19, 23],
};

export function dayparts(): Daypart[] {
  return Object.keys(DAYPART_HOURS) as Daypart[];
}

export function daypartFor(d: Date): Daypart {
  const h = d.getHours();
  for (const [name, [lo, hi]] of Object.entries(DAYPART_HOURS) as [
    Daypart,
    [number, number],
  ][]) {
    if (h >= lo && h < hi) return name;
  }
  return "dinner";
}

export interface ForecastRow {
  zone: string;
  dishSlug: string;
  dishName: string;
  daypart: Daypart;
  forecastQty: number;
  observedDays: number;
}

interface OrderItem {
  id?: number;
  slug?: string;
  name: string;
  qty: number;
  price?: number;
}

/**
 * Baseline forecast: rolling average of qty sold per
 * (zone, daypart, dayOfWeek, dish) over the last `lookbackDays`.
 *
 * Output is per-daypart predicted qty for the *next* matching daypart of
 * each weekday. We average across lookback days that match the same
 * weekday + daypart bucket. Designed so it can later be replaced by a real
 * ML model without changing the surface.
 */
export async function computeForecast(opts: {
  lookbackDays?: number;
  zone?: string;
  forDate?: Date;
}): Promise<ForecastRow[]> {
  const lookbackDays = opts.lookbackDays ?? 28;
  const since = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000);
  const target = opts.forDate ?? new Date();
  const targetDow = target.getDay();

  const conditions = [
    gte(ordersTable.createdAt, since),
    ne(ordersTable.status, "cancelled"),
  ];

  const rows = await db
    .select({
      city: ordersTable.city,
      items: ordersTable.items,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(and(...conditions));

  // bucket: zone|daypart|dow|dishSlug -> { totalQty, dayCount }
  const buckets = new Map<
    string,
    { qty: number; days: Set<string>; name: string }
  >();
  for (const r of rows) {
    const created = new Date(r.createdAt);
    const dow = created.getDay();
    const dp = daypartFor(created);
    const zone = (r.city ?? "default").toLowerCase();
    if (opts.zone && zone !== opts.zone.toLowerCase()) continue;
    const dayKey = created.toISOString().slice(0, 10);
    for (const it of (r.items as OrderItem[] | null) ?? []) {
      const slug =
        it.slug ??
        (typeof it.id === "number" ? `id-${it.id}` : it.name.toLowerCase());
      const key = `${zone}|${dp}|${dow}|${slug}`;
      const cur =
        buckets.get(key) ??
        { qty: 0, days: new Set<string>(), name: it.name };
      cur.qty += Number(it.qty) || 0;
      cur.days.add(dayKey);
      buckets.set(key, cur);
    }
  }

  const out: ForecastRow[] = [];
  for (const [key, val] of buckets) {
    const [zone, dp, dowStr, slug] = key.split("|");
    if (Number(dowStr) !== targetDow) continue;
    out.push({
      zone: zone!,
      dishSlug: slug!,
      dishName: val.name,
      daypart: dp as Daypart,
      forecastQty: val.qty / Math.max(val.days.size, 1),
      observedDays: val.days.size,
    });
  }
  out.sort((a, b) => b.forecastQty - a.forecastQty);
  return out;
}

/** MAPE per dishSlug per zone over snapshots that have actuals filled in. */
export async function forecastMape(opts: { sinceDays?: number }): Promise<
  Array<{ zone: string; dishSlug: string; mape: number; n: number }>
> {
  const since = new Date(
    Date.now() - (opts.sinceDays ?? 30) * 24 * 3600 * 1000,
  );
  const rows = await db.execute<{
    zone: string;
    dish_slug: string;
    mape: number;
    n: number;
  }>(sql`
    SELECT zone, dish_slug,
           AVG(ABS(forecast_qty - actual_qty) / NULLIF(actual_qty, 0)) AS mape,
           COUNT(*)::int AS n
    FROM forecast_snapshots
    WHERE actual_qty IS NOT NULL
      AND for_date >= ${since.toISOString().slice(0, 10)}
    GROUP BY zone, dish_slug
    ORDER BY mape ASC NULLS LAST
  `);
  return rows.rows.map((r) => ({
    zone: r.zone,
    dishSlug: r.dish_slug,
    mape: Number(r.mape),
    n: Number(r.n),
  }));
}
