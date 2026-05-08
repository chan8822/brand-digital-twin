import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

interface RunRow {
  id: number;
  runAt: string;
  windowStart: string;
  windowEnd: string;
  modelId: string;
  totalDishes: number;
  totalOrders: number;
}

interface StatRow {
  id: number;
  runId: number;
  slug: string;
  name: string;
  ordersCount: number;
  unitsSold: number;
  revenuePaise: number;
  marginPaise: number;
  popularityScore: number; // x100
  marginScore: number; // x100
  classification: "star" | "plowhorse" | "puzzle" | "dog";
  recommendation: "promote" | "reprice" | "retire" | "hold";
  commentary: string;
}

interface SummaryRow {
  slug: string;
  mostLoved: string;
  commonGripe: string;
  trend: string;
  sampleSize: number;
  averageRating: number; // x10
  generatedAt: string;
}

interface SuggestionRow {
  id: number;
  runId: number | null;
  slug: string;
  zone: string;
  daypart: string;
  currentPaise: number;
  suggestedPaise: number;
  expectedRevenueDeltaPctLow: number; // x10
  expectedRevenueDeltaPctHigh: number; // x10
  rationale: string;
  status: "pending" | "approved" | "dismissed";
  createdAt: string;
}

const CLASS_COLOR: Record<StatRow["classification"], string> = {
  star: "bg-emerald-500 text-white",
  puzzle: "bg-amber-500 text-white",
  plowhorse: "bg-sky-500 text-white",
  dog: "bg-rose-500 text-white",
};

const RECO_LABEL: Record<StatRow["recommendation"], string> = {
  promote: "Promote",
  reprice: "Reprice",
  retire: "Retire",
  hold: "Hold",
};

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function pct(x10: number): string {
  const pct = x10 / 10;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export default function AdminMenuEngineering() {
  const [adminToken, setAdminToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? ""),
  );
  const [run, setRun] = useState<RunRow | null>(null);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [summaries, setSummaries] = useState<SummaryRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [filter, setFilter] = useState<StatRow["classification"] | "all">("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (adminToken) window.localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  }, [adminToken]);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (adminToken) h["x-admin-token"] = adminToken;
    return h;
  };

  async function refresh() {
    try {
      const [matrixRes, suggRes] = await Promise.all([
        fetch("/api/menu-engineering/matrix", {
          credentials: "include",
          headers: headers(),
        }),
        fetch("/api/menu-engineering/pricing-suggestions", {
          credentials: "include",
          headers: headers(),
        }),
      ]);
      if (matrixRes.ok) {
        const data = await matrixRes.json();
        setRun(data.run);
        setStats(data.stats ?? []);
        setSummaries(data.summaries ?? []);
      }
      if (suggRes.ok) {
        const data = await suggRes.json();
        setSuggestions(data.rows ?? []);
      }
    } catch (err) {
      setMsg(`Refresh failed: ${(err as Error).message}`);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  async function runMe() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/menu-engineering/run", {
        method: "POST",
        credentials: "include",
        headers: headers(),
        body: JSON.stringify({ sinceDays: 30 }),
      });
      if (!res.ok) {
        setMsg(`Run failed: ${await res.text()}`);
        return;
      }
      setMsg("Menu engineering run complete.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function buildSuggestions() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(
        "/api/menu-engineering/pricing-suggestions/run",
        {
          method: "POST",
          credentials: "include",
          headers: headers(),
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        setMsg(`Suggestions failed: ${await res.text()}`);
        return;
      }
      setMsg("Pricing suggestions regenerated.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function summarizeAll() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/dish-reviews/summarize-all", {
        method: "POST",
        credentials: "include",
        headers: headers(),
      });
      if (!res.ok) {
        setMsg(`Summarize failed: ${await res.text()}`);
        return;
      }
      const out = await res.json();
      setMsg(
        `Summarised ${out.summarized}/${out.attempted} dishes with reviews.`,
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: number, action: "approve" | "dismiss") {
    if (
      action === "approve" &&
      !confirm(
        "Approving will update the catalog price (for an 'all' suggestion). Continue?",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/menu-engineering/pricing-suggestions/${id}/${action}`,
        {
          method: "POST",
          credentials: "include",
          headers: headers(),
        },
      );
      if (!res.ok) {
        setMsg(`Decision failed: ${await res.text()}`);
        return;
      }
      setMsg(`Suggestion ${action}d.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const summaryBySlug = useMemo(
    () => new Map(summaries.map((s) => [s.slug, s])),
    [summaries],
  );
  const filteredStats = useMemo(
    () =>
      filter === "all"
        ? stats
        : stats.filter((s) => s.classification === filter),
    [stats, filter],
  );
  const counts = useMemo(() => {
    const c = { star: 0, puzzle: 0, plowhorse: 0, dog: 0 } as Record<
      string,
      number
    >;
    stats.forEach((s) => (c[s.classification] = (c[s.classification] ?? 0) + 1));
    return c;
  }, [stats]);

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle>Menu Engineering</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="x-admin-token (or rely on OPS_USER_IDS allowlist)"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              className="max-w-md"
            />
            <Button onClick={runMe} disabled={busy}>
              {busy ? "Running…" : "Run analysis (30d)"}
            </Button>
            <Button
              variant="outline"
              onClick={buildSuggestions}
              disabled={busy || !run}
            >
              Build pricing suggestions
            </Button>
            <Button variant="outline" onClick={summarizeAll} disabled={busy}>
              Summarise reviews
            </Button>
          </div>
          {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
          {run ? (
            <p className="text-sm text-muted-foreground">
              Latest run #{run.id} • {new Date(run.runAt).toLocaleString()} •{" "}
              {run.totalDishes} dishes, {run.totalOrders} orders in window.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No run yet — start by clicking "Run analysis".
            </p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            {(["all", "star", "puzzle", "plowhorse", "dog"] as const).map(
              (k) => (
                <Button
                  key={k}
                  variant={filter === k ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(k)}
                >
                  {k === "all"
                    ? `All (${stats.length})`
                    : `${k} (${counts[k] ?? 0})`}
                </Button>
              ),
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dish matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[480px]">
            <div className="space-y-2">
              {filteredStats.map((s) => {
                const summary = summaryBySlug.get(s.slug);
                return (
                  <div
                    key={s.id}
                    className="border rounded p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={CLASS_COLOR[s.classification]}>
                        {s.classification}
                      </Badge>
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.slug}
                      </span>
                      <Badge variant="outline">
                        Reco: {RECO_LABEL[s.recommendation]}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground">
                        Pop {s.popularityScore} · Margin {s.marginScore}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.unitsSold} units · {rupees(s.revenuePaise)} revenue ·{" "}
                      {rupees(s.marginPaise)} margin contribution
                    </div>
                    {s.commentary ? (
                      <p className="text-sm">{s.commentary}</p>
                    ) : null}
                    {summary ? (
                      <div className="text-xs bg-muted/30 rounded p-2 space-y-1">
                        <div>
                          <strong>Most loved:</strong>{" "}
                          {summary.mostLoved || "—"}
                        </div>
                        <div>
                          <strong>Common gripe:</strong>{" "}
                          {summary.commonGripe || "—"}
                        </div>
                        <div>
                          <strong>Trend:</strong> {summary.trend} ·{" "}
                          {summary.sampleSize} reviews · avg{" "}
                          {(summary.averageRating / 10).toFixed(1)}★
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {filteredStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No dishes in this view.
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Pending pricing suggestions ({suggestions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            All suggestions are advisory. Approving an "all / all" suggestion
            updates the catalog price; slice-level (zone or daypart) suggestions
            are insight-only and won't change the price.
          </p>
          <ScrollArea className="max-h-[420px]">
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="border rounded p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.slug}</span>
                    <Badge variant="outline">{s.zone}</Badge>
                    <Badge variant="outline">{s.daypart}</Badge>
                    <span className="text-sm">
                      {rupees(s.currentPaise)} → {rupees(s.suggestedPaise)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Predicted revenue impact{" "}
                      {pct(s.expectedRevenueDeltaPctLow)} to{" "}
                      {pct(s.expectedRevenueDeltaPctHigh)}
                    </span>
                  </div>
                  <p className="text-sm">{s.rationale}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => decide(s.id, "approve")}
                      disabled={busy}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(s.id, "dismiss")}
                      disabled={busy}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No pending suggestions. Click "Build pricing suggestions"
                  after a run.
                </p>
              ) : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
