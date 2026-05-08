import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

interface ChartSpec {
  kind: "bar" | "line" | "area" | "table" | "pie";
  xKey?: string;
  yKey?: string;
  title?: string;
}
interface AskResult {
  question: string;
  sql: string;
  chartSpec: ChartSpec;
  rationale: string;
  result: { rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; durationMs: number };
}

interface SavedQuery {
  id: number;
  question: string;
  sql: string;
  chartSpec: ChartSpec | null;
  rationale: string | null;
  rowCount: number;
  saved: number;
  createdAt: string;
}

interface WbrReport {
  id: number;
  weekStart: string;
  weekEnd: string;
  kpis: {
    orders: number;
    ordersPrev: number;
    revenuePaise: number;
    revenuePaisePrev: number;
    activeCustomers: number;
    activeCustomersPrev: number;
    avgOrderPaise: number;
    topDishes: Array<{ name: string; units: number }>;
    anomaliesFired: number;
  };
  chartSpec: {
    revenueByDay: Array<{ day: string; revenuePaise: number }>;
    ordersByDay: Array<{ day: string; orders: number }>;
  } | null;
  commentary: string;
  modelId: string | null;
  createdAt: string;
}

interface VocTheme {
  id: number;
  weekStart: string;
  weekEnd: string;
  theme: string;
  sentiment: "positive" | "negative" | "mixed";
  mentionCount: number;
  exampleQuotes: Array<{ source: string; body: string }>;
  summary: string;
  createdAt: string;
}

interface SafeTable {
  name: string;
  description: string;
  columns: Array<{ name: string; type: string; description?: string }>;
}

function getToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("x-admin-token", token);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function deltaLabel(curr: number, prev: number): { text: string; positive: boolean } {
  if (prev <= 0) return { text: curr > 0 ? "new" : "0%", positive: curr > 0 };
  const d = ((curr - prev) / prev) * 100;
  return { text: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, positive: d >= 0 };
}

function SchemaPanel({ tables }: { tables: SafeTable[] }) {
  return (
    <ScrollArea className="max-h-[280px] text-xs border rounded p-3 bg-muted/20">
      {tables.map((t) => (
        <div key={t.name} className="mb-2">
          <div className="font-medium">{t.name}</div>
          <div className="text-muted-foreground italic">{t.description}</div>
          <div className="pl-3">
            {t.columns.map((c) => (
              <div key={c.name}>
                <span className="font-mono">{c.name}</span>{" "}
                <span className="text-muted-foreground">{c.type}</span>
                {c.description ? <span className="text-muted-foreground"> — {c.description}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </ScrollArea>
  );
}

function ResultChart({ chartSpec, rows }: { chartSpec: ChartSpec; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No rows.</p>;
  const xKey = chartSpec.xKey ?? Object.keys(rows[0] ?? {})[0] ?? "";
  const yKey = chartSpec.yKey ?? Object.keys(rows[0] ?? {})[1] ?? "";
  if (chartSpec.kind === "table" || !xKey || !yKey) {
    const cols = Object.keys(rows[0] ?? {});
    return (
      <ScrollArea className="max-h-[320px] border rounded">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>{cols.map((c) => <th key={c} className="text-left p-2">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                {cols.map((c) => <td key={c} className="p-2">{String(r[c] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    );
  }
  const data = rows.map((r) => ({ ...r, [yKey]: Number(r[yKey] ?? 0) }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        {chartSpec.kind === "line" || chartSpec.kind === "area" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey={yKey} stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey={yKey} fill="#0ea5e9" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function AskTab() {
  const [tables, setTables] = useState<SafeTable[]>([]);
  const [question, setQuestion] = useState("Top 5 dishes by units last 14 days");
  const [sql, setSql] = useState("");
  const [chartSpec, setChartSpec] = useState<ChartSpec>({ kind: "table" });
  const [rationale, setRationale] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [history, setHistory] = useState<SavedQuery[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => {
    void api<{ tables: SafeTable[] }>("/analytics/schema").then((r) => setTables(r.tables)).catch(() => undefined);
    void api<{ queries: SavedQuery[] }>("/analytics/queries").then((r) => setHistory(r.queries)).catch(() => undefined);
  };

  useEffect(() => { reload(); }, []);

  const ask = async () => {
    setBusy(true); setErr(null);
    try {
      const out = await api<AskResult>("/analytics/ask", {
        method: "POST", body: JSON.stringify({ question }),
      });
      setSql(out.sql); setChartSpec(out.chartSpec); setRationale(out.rationale); setRows(out.result.rows);
      reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const runEdited = async () => {
    setBusy(true); setErr(null);
    try {
      const out = await api<{ result: { rows: Record<string, unknown>[] } }>("/analytics/sql", {
        method: "POST", body: JSON.stringify({ sql, question, chartSpec }),
      });
      setRows(out.result.rows); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader><CardTitle>Ask the data</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. revenue by day for the last 30 days" />
              <Button onClick={ask} disabled={busy || !question.trim()}>{busy ? "Thinking…" : "Ask"}</Button>
            </div>
            {rationale && <p className="text-xs text-muted-foreground">{rationale}</p>}
            <Textarea value={sql} onChange={(e) => setSql(e.target.value)} rows={6} className="font-mono text-xs" placeholder="Generated SQL appears here. You can edit and re-run." />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={runEdited} disabled={busy || !sql.trim()}>Run edited SQL</Button>
              <span className="text-xs text-muted-foreground">{rows.length} rows</span>
            </div>
            {err && <p className="text-xs text-red-600">{err}</p>}
            <ResultChart chartSpec={chartSpec} rows={rows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent questions</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[260px]">
              <div className="space-y-2 text-xs">
                {history.map((h) => (
                  <button key={h.id} className="w-full text-left border rounded p-2 hover:bg-muted/50"
                    onClick={() => { setQuestion(h.question); setSql(h.sql); if (h.chartSpec) setChartSpec(h.chartSpec); }}>
                    <div className="font-medium">{h.question}</div>
                    <div className="text-muted-foreground">{new Date(h.createdAt).toLocaleString()} · {h.rowCount} rows</div>
                  </button>
                ))}
                {history.length === 0 && <p className="text-muted-foreground">No queries yet.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Safe schema</CardTitle></CardHeader>
        <CardContent><SchemaPanel tables={tables} /></CardContent>
      </Card>
    </div>
  );
}

function WbrTab() {
  const [reports, setReports] = useState<WbrReport[]>([]);
  const [active, setActive] = useState<WbrReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    void api<{ reports: WbrReport[] }>("/analytics/wbr")
      .then((r) => { setReports(r.reports); if (!active && r.reports[0]) setActive(r.reports[0]); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ report: WbrReport }>("/analytics/wbr/generate", { method: "POST", body: "{}" });
      setActive(r.report); load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const k = active?.kpis;
  const ordersDelta = k ? deltaLabel(k.orders, k.ordersPrev) : null;
  const revDelta = k ? deltaLabel(k.revenuePaise, k.revenuePaisePrev) : null;
  const custDelta = k ? deltaLabel(k.activeCustomers, k.activeCustomersPrev) : null;

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">{active ? `Week of ${new Date(active.weekStart).toLocaleDateString()}` : "Weekly Business Review"}</h2>
          <Button onClick={generate} disabled={busy}>{busy ? "Generating…" : "Generate latest"}</Button>
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        {active && k && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Orders</div><div className="text-xl font-bold">{k.orders}</div><div className={`text-xs ${ordersDelta?.positive ? "text-emerald-600" : "text-red-600"}`}>{ordersDelta?.text}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-xl font-bold">{rupees(k.revenuePaise)}</div><div className={`text-xs ${revDelta?.positive ? "text-emerald-600" : "text-red-600"}`}>{revDelta?.text}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active customers</div><div className="text-xl font-bold">{k.activeCustomers}</div><div className={`text-xs ${custDelta?.positive ? "text-emerald-600" : "text-red-600"}`}>{custDelta?.text}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">AOV</div><div className="text-xl font-bold">{rupees(k.avgOrderPaise)}</div><div className="text-xs text-muted-foreground">{k.anomaliesFired} anomalies</div></CardContent></Card>
            </div>
            <Card>
              <CardHeader><CardTitle>Commentary</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{active.commentary}</p>
                <p className="text-xs text-muted-foreground mt-2">Model: {active.modelId ?? "—"}</p>
              </CardContent>
            </Card>
            {active.chartSpec && (
              <Card>
                <CardHeader><CardTitle>Revenue by day</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={active.chartSpec.revenueByDay.map((d) => ({ day: d.day, revenue: d.revenuePaise / 100 }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>Top dishes</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">
                  {k.topDishes.map((d) => <li key={d.name} className="flex justify-between border-b py-1"><span>{d.name}</span><span className="font-medium">{d.units} units</span></li>)}
                  {k.topDishes.length === 0 && <li className="text-muted-foreground">No data.</li>}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle>Past reviews</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-2 text-xs">
              {reports.map((r) => (
                <button key={r.id} className={`w-full text-left border rounded p-2 hover:bg-muted/50 ${active?.id === r.id ? "bg-muted" : ""}`} onClick={() => setActive(r)}>
                  <div className="font-medium">{new Date(r.weekStart).toLocaleDateString()}</div>
                  <div className="text-muted-foreground">{r.kpis.orders} orders · {rupees(r.kpis.revenuePaise)}</div>
                </button>
              ))}
              {reports.length === 0 && <p className="text-muted-foreground">No reports yet — click Generate.</p>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

const SENT_COLOR: Record<VocTheme["sentiment"], string> = {
  positive: "bg-emerald-500 text-white",
  negative: "bg-rose-500 text-white",
  mixed: "bg-amber-500 text-white",
};

function VocTab() {
  const [themes, setThemes] = useState<VocTheme[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    void api<{ themes: VocTheme[] }>("/analytics/voc/themes")
      .then((r) => setThemes(r.themes))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };
  useEffect(load, []);

  const extract = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/analytics/voc/extract", { method: "POST", body: "{}" });
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // Group by week and compute trend per theme across weeks.
  const weeks = useMemo(() => {
    const map = new Map<string, VocTheme[]>();
    for (const t of themes) {
      const key = new Date(t.weekStart).toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [themes]);

  const trendByTheme = useMemo(() => {
    const m = new Map<string, Array<{ week: string; mentions: number }>>();
    for (const [week, list] of [...weeks].reverse()) {
      for (const t of list) {
        const arr = m.get(t.theme) ?? [];
        arr.push({ week, mentions: t.mentionCount });
        m.set(t.theme, arr);
      }
    }
    return m;
  }, [weeks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Voice of customer</h2>
        <Button onClick={extract} disabled={busy}>{busy ? "Mining…" : "Refresh this week"}</Button>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      {weeks.map(([week, list]) => (
        <Card key={week}>
          <CardHeader><CardTitle>Week of {new Date(week).toLocaleDateString()}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {list.map((t) => {
                const trend = trendByTheme.get(t.theme) ?? [];
                return (
                  <div key={t.id} className="border rounded p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={SENT_COLOR[t.sentiment]}>{t.sentiment}</Badge>
                      <span className="font-medium">{t.theme}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{t.mentionCount} mentions</span>
                    </div>
                    <p className="text-sm mt-2">{t.summary}</p>
                    {t.exampleQuotes.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {t.exampleQuotes.map((q, i) => (
                          <p key={i} className="text-xs italic text-muted-foreground border-l-2 pl-2">
                            “{q.body}” <span className="not-italic">— {q.source}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    {trend.length > 1 && (
                      <div className="h-16 mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trend}>
                            <Line type="monotone" dataKey="mentions" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
      {weeks.length === 0 && <p className="text-sm text-muted-foreground">No themes yet — click Refresh to mine the past week of reviews and support chats.</p>}
    </div>
  );
}

export default function AdminAnalytics() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Internal AI pack: ask the warehouse in plain English, generate the weekly business review,
          and mine voice-of-customer themes. All queries run read-only against a curated safe view.
        </p>
      </div>
      <Tabs defaultValue="ask">
        <TabsList>
          <TabsTrigger value="ask">Ask the data</TabsTrigger>
          <TabsTrigger value="wbr">Weekly review</TabsTrigger>
          <TabsTrigger value="voc">Voice of customer</TabsTrigger>
        </TabsList>
        <TabsContent value="ask"><AskTab /></TabsContent>
        <TabsContent value="wbr"><WbrTab /></TabsContent>
        <TabsContent value="voc"><VocTab /></TabsContent>
      </Tabs>
    </div>
  );
}
