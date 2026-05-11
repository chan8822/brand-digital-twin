import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock } from "lucide-react";
import { API_BASE } from "@/lib/apiBase";

interface AccuracyRow {
  zone: string;
  day: string;
  predictions: number;
  meanAbsErrorMin: number;
  meanErrorMin: number;
  mape: number;
}

export default function EtaAccuracyPanel() {
  const [adminToken, setAdminToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem("rd-admin-token") ?? ""),
  );
  const [rows, setRows] = useState<AccuracyRow[]>([]);
  const [sinceDays, setSinceDays] = useState<7 | 14 | 30>(14);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("rd-admin-token", adminToken);
    }
  }, [adminToken]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const headers: Record<string, string> = {};
        if (adminToken) headers["x-admin-token"] = adminToken;
        const base = API_BASE;
        const r = await fetch(
          `${base}/delivery/eta/accuracy/by-zone?sinceDays=${sinceDays}`,
          { credentials: "include", headers },
        );
        if (r.status === 403) {
          if (!cancelled) {
            setError("Ops scope required — paste an admin token below.");
            setRows([]);
          }
          return;
        }
        if (!r.ok) {
          if (!cancelled) setError(`Failed (${r.status})`);
          return;
        }
        const data = (await r.json()) as { rows: AccuracyRow[] };
        if (!cancelled) {
          setError(null);
          setRows(data.rows ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(String((err as Error).message ?? err));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [adminToken, sinceDays]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            ETA accuracy by zone
          </span>
          <div className="flex gap-1">
            {([7, 14, 30] as const).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={sinceDays === d ? "default" : "outline"}
                className="h-6 text-[10px]"
                onClick={() => setSinceDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <p className="text-xs text-orange-400">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No graded predictions yet — actuals are recorded on `delivered`.
          </p>
        ) : (
          <div className="space-y-1">
            {rows.slice(0, 8).map((r) => (
              <div
                key={`${r.zone}-${r.day}`}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex flex-col">
                  <span className="font-mono">{r.zone}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {r.day} · {r.predictions} preds
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-bold">
                    {(r.mape * 100).toFixed(1)}% MAPE
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    ±{r.meanAbsErrorMin.toFixed(1)} min
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
