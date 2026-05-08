import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Bot } from "lucide-react";

interface AlertRow {
  id: number;
  metric: string;
  severity: "low" | "medium" | "high";
  status: "open" | "ack" | "snoozed" | "closed";
  summary: string;
  suggestedAction: string;
  value: number;
  baseline: number | null;
  createdAt: string;
}

interface DigestRow {
  metric: string;
  severity: "low" | "medium" | "high";
  count: number;
  latestSummary: string;
  latestSuggestedAction: string;
}

const apiBase = "/api";

function readToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("rd-admin-token") ?? "";
}

function severityColor(s: AlertRow["severity"]): string {
  if (s === "high") return "bg-red-500/15 text-red-400 border-red-500/30";
  if (s === "medium")
    return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
}

interface AnomaliesPanelProps {
  onOpenAgent?: (prompt: string) => void;
}

export default function AnomaliesPanel({ onOpenAgent }: AnomaliesPanelProps = {}) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [digest, setDigest] = useState<{
    rows: DigestRow[];
    total: number;
  } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const t = readToken();
    return t ? { "x-admin-token": t } : {};
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, d] = await Promise.all([
        fetch(`${apiBase}/ops/anomalies?status=active&limit=20`, {
          credentials: "include",
          headers: headers(),
        }),
        fetch(`${apiBase}/ops/anomalies/digest`, {
          credentials: "include",
          headers: headers(),
        }),
      ]);
      if (!a.ok) throw new Error(`alerts ${a.status}`);
      if (!d.ok) throw new Error(`digest ${d.status}`);
      const aj = (await a.json()) as { rows: AlertRow[] };
      const dj = (await d.json()) as { rows: DigestRow[]; total: number };
      setAlerts(aj.rows);
      setDigest({ rows: dj.rows, total: dj.total });
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  }, [headers]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (id: number, action: "ack" | "snooze" | "close") => {
    setBusyId(id);
    try {
      const body =
        action === "snooze" ? JSON.stringify({ minutes: 30 }) : undefined;
      const r = await fetch(`${apiBase}/ops/anomalies/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { ...headers(), "Content-Type": "application/json" },
        body,
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `failed ${r.status}`);
      }
      await load();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusyId(null);
    }
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await fetch(`${apiBase}/ops/anomalies/scan`, {
        method: "POST",
        credentials: "include",
        headers: headers(),
      });
      if (!r.ok) throw new Error(`scan ${r.status}`);
      await load();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setScanning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Anomaly Alerts
            {alerts.length > 0 ? (
              <Badge variant="outline" className="text-[10px]">
                {alerts.length} active
              </Badge>
            ) : null}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px]"
            onClick={runScan}
            disabled={scanning}
          >
            {scanning ? "Scanning…" : "Scan now"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {error ? (
          <p className="text-[11px] text-red-400">{error}</p>
        ) : null}
        {alerts.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No active anomalies. The detector scans every 5 minutes against a
            7-day rolling baseline.
          </p>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className="space-y-1.5 rounded-md border border-border/40 p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{a.metric.replace(/_/g, " ")}</div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${severityColor(a.severity)}`}
                >
                  {a.severity}
                </Badge>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {a.summary}
              </p>
              <p className="text-[11px] leading-snug">
                <span className="text-muted-foreground">Suggested: </span>
                {a.suggestedAction}
              </p>
              <div className="flex gap-1 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => void act(a.id, "ack")}
                  disabled={busyId === a.id}
                >
                  Ack
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => void act(a.id, "snooze")}
                  disabled={busyId === a.id}
                >
                  Snooze 30m
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] flex-1"
                  onClick={() => void act(a.id, "close")}
                  disabled={busyId === a.id}
                >
                  Close
                </Button>
              </div>
              {onOpenAgent ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 text-[10px] w-full mt-1"
                  onClick={() =>
                    onOpenAgent(
                      `Look at anomaly alert #${a.id} (${a.metric}, severity ${a.severity}). ${a.summary} Suggested action: ${a.suggestedAction}. Investigate the underlying orders/riders/payments and recommend (or take) the next step. Acknowledge the alert when you're done.`,
                    )
                  }
                >
                  <Bot className="w-3 h-3 mr-1" /> Ask Ops Agent
                </Button>
              ) : null}
            </div>
          ))
        )}
        {digest && digest.total > 0 ? (
          <div className="pt-2 border-t border-border/40 space-y-1">
            <div className="text-[10px] uppercase text-muted-foreground">
              Last 24h digest ({digest.total})
            </div>
            {digest.rows.map((r) => (
              <div
                key={`${r.metric}-${r.severity}`}
                className="flex items-center justify-between text-[11px]"
              >
                <span>{r.metric.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">
                  {r.severity} · {r.count}×
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
