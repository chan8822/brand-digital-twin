import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Truck, Play } from "lucide-react";

interface ComparisonRow {
  day: string;
  decisions: number;
  smartTotalKm: number;
  baselineTotalKm: number;
  meanSavingsKm: number;
  batchedShare: number;
}

interface DecisionRow {
  id: number;
  orderId: number;
  chosenRiderId: number | null;
  baselineRiderId: number | null;
  chosenDistanceKm: number | null;
  baselineDistanceKm: number | null;
  strategy: string;
  notes: string | null;
  createdAt: string;
}

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export default function DispatchPanel() {
  const [adminToken, setAdminToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem("rd-admin-token") ?? ""),
  );
  const [comparison, setComparison] = useState<ComparisonRow[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [overrideOrderId, setOverrideOrderId] = useState("");
  const [overrideRiderId, setOverrideRiderId] = useState("");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rd-admin-token", adminToken);
    }
  }, [adminToken]);

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = {};
    if (adminToken) h["x-admin-token"] = adminToken;
    return h;
  };

  const load = async () => {
    try {
      const [c, d] = await Promise.all([
        fetch(`${apiBase}/delivery/dispatch/comparison?sinceDays=14`, {
          credentials: "include",
          headers: headers(),
        }),
        fetch(`${apiBase}/delivery/dispatch/decisions?limit=10`, {
          credentials: "include",
          headers: headers(),
        }),
      ]);
      if (c.status === 403 || d.status === 403) {
        setError("Ops scope required — paste an admin token below.");
        setComparison([]);
        setDecisions([]);
        return;
      }
      if (!c.ok || !d.ok) {
        setError(`Failed (${c.status}/${d.status})`);
        return;
      }
      const cj = (await c.json()) as { rows: ComparisonRow[] };
      const dj = (await d.json()) as { rows: DecisionRow[] };
      setError(null);
      setComparison(cj.rows ?? []);
      setDecisions(dj.rows ?? []);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const submitOverride = async () => {
    const orderId = parseInt(overrideOrderId, 10);
    const riderId = parseInt(overrideRiderId, 10);
    if (!Number.isFinite(orderId) || !Number.isFinite(riderId)) {
      setOverrideMessage("Need numeric order and rider IDs.");
      return;
    }
    setOverriding(true);
    setOverrideMessage(null);
    try {
      const r = await fetch(`${apiBase}/delivery/dispatch/override`, {
        method: "POST",
        credentials: "include",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          riderId,
          notes: overrideNotes || undefined,
        }),
      });
      const data = (await r.json()) as { ok?: boolean; reason?: string };
      if (!r.ok) {
        setOverrideMessage(data.reason ?? `Failed (${r.status})`);
        return;
      }
      setOverrideMessage(`Order #${orderId} reassigned to rider ${riderId}.`);
      setOverrideOrderId("");
      setOverrideRiderId("");
      setOverrideNotes("");
      await load();
    } catch (err) {
      setOverrideMessage(String((err as Error).message ?? err));
    } finally {
      setOverriding(false);
    }
  };

  const runDispatch = async () => {
    setRunning(true);
    setRunMessage(null);
    try {
      const r = await fetch(`${apiBase}/delivery/dispatch/run`, {
        method: "POST",
        credentials: "include",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: "{}",
      });
      if (!r.ok) {
        setRunMessage(`Run failed (${r.status})`);
        return;
      }
      const data = (await r.json()) as { attempted: number; assigned: number };
      setRunMessage(`Attempted ${data.attempted}, assigned ${data.assigned}`);
      await load();
    } catch (err) {
      setRunMessage(String((err as Error).message ?? err));
    } finally {
      setRunning(false);
    }
  };

  const totalSmart = comparison.reduce((s, r) => s + r.smartTotalKm, 0);
  const totalBaseline = comparison.reduce((s, r) => s + r.baselineTotalKm, 0);
  const totalDecisions = comparison.reduce((s, r) => s + r.decisions, 0);
  const savedKm = Math.max(0, totalBaseline - totalSmart);
  const savedPct =
    totalBaseline > 0 ? (savedKm / totalBaseline) * 100 : 0;
  const batchedAvg =
    comparison.length > 0
      ? (comparison.reduce((s, r) => s + r.batchedShare, 0) /
          comparison.length) *
        100
      : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Truck className="w-4 h-4" />
            Smart dispatch (14d)
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px]"
            onClick={runDispatch}
            disabled={running}
          >
            <Play className="w-3 h-3 mr-1" />
            {running ? "Running…" : "Run now"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p className="text-xs text-orange-400">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-base font-bold">
                  {savedKm.toFixed(1)} km
                </div>
                <div className="text-[10px] text-muted-foreground">
                  saved vs nearest ({savedPct.toFixed(0)}%)
                </div>
              </div>
              <div>
                <div className="text-base font-bold">{totalDecisions}</div>
                <div className="text-[10px] text-muted-foreground">
                  decisions
                </div>
              </div>
              <div>
                <div className="text-base font-bold">
                  {batchedAvg.toFixed(0)}%
                </div>
                <div className="text-[10px] text-muted-foreground">
                  batched
                </div>
              </div>
            </div>
            {runMessage ? (
              <p className="text-[10px] text-muted-foreground">{runMessage}</p>
            ) : null}
            <div className="space-y-1 pt-1">
              <div className="text-[10px] uppercase text-muted-foreground">
                Recent decisions
              </div>
              {decisions.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">
                  No decisions yet — orders auto-dispatch on `ready`.
                </p>
              ) : (
                decisions.slice(0, 6).map((d) => {
                  const delta =
                    (d.baselineDistanceKm ?? 0) - (d.chosenDistanceKm ?? 0);
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex flex-col">
                        <span className="font-mono">
                          #{d.orderId} → R{d.chosenRiderId ?? "-"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {d.strategy}
                          {d.notes ? ` · ${d.notes}` : ""}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">
                          {(d.chosenDistanceKm ?? 0).toFixed(1)} km
                        </div>
                        <div
                          className={`text-[10px] ${
                            delta > 0
                              ? "text-emerald-500"
                              : delta < 0
                                ? "text-orange-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {delta >= 0 ? "−" : "+"}
                          {Math.abs(delta).toFixed(1)} km vs nearest
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
        <div className="space-y-1 pt-2 border-t border-border/40">
          <div className="text-[10px] uppercase text-muted-foreground">
            Manual override
          </div>
          <div className="flex gap-1">
            <Input
              placeholder="Order #"
              value={overrideOrderId}
              onChange={(e) => setOverrideOrderId(e.target.value)}
              className="h-7 text-xs"
            />
            <Input
              placeholder="Rider #"
              value={overrideRiderId}
              onChange={(e) => setOverrideRiderId(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <Input
            placeholder="Reason (optional)"
            value={overrideNotes}
            onChange={(e) => setOverrideNotes(e.target.value)}
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-[10px]"
            onClick={submitOverride}
            disabled={overriding}
          >
            {overriding ? "Reassigning…" : "Reassign rider"}
          </Button>
          {overrideMessage ? (
            <p className="text-[10px] text-muted-foreground">
              {overrideMessage}
            </p>
          ) : null}
        </div>
        <Input
          placeholder="x-admin-token (or rely on OPS_USER_IDS allowlist)"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          className="h-7 text-xs"
        />
      </CardContent>
    </Card>
  );
}
