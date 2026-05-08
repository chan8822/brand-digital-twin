import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  b2bPlannerApi,
  type SalesAccountRow,
} from "@/lib/b2bPlannerApi";

const RISK_COLOR: Record<string, string> = {
  critical: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  at_risk: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  watch: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  healthy: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

export default function AdminSalesConsole() {
  const [rows, setRows] = useState<SalesAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const r = await b2bPlannerApi.listSalesAccounts();
      setRows(r.accounts);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const recompute = async (slug: string) => {
    setRecomputing(slug);
    try {
      await b2bPlannerApi.recomputeSalesHealth(slug);
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRecomputing(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-clinical-zinc">Loading…</div>;
  }

  const byRisk = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.health?.riskLevel ?? "unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Sales console</h1>
        <p className="text-sm text-clinical-zinc">
          Accounts ranked by risk. Critical and at-risk land first so reps can
          act fast.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {(["critical", "at_risk", "watch", "healthy"] as const).map((k) => (
          <span
            key={k}
            className={`rounded-full border px-3 py-1 text-xs capitalize ${RISK_COLOR[k]}`}
          >
            {k.replace("_", " ")}: {byRisk[k] ?? 0}
          </span>
        ))}
        {byRisk["unknown"] ? (
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-clinical-zinc">
            no snapshot: {byRisk["unknown"]}
          </span>
        ) : null}
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-clinical-zinc">No B2B accounts yet.</p>
        )}
        {rows.map((row) => {
          const risk = row.health?.riskLevel ?? "unknown";
          const cls = RISK_COLOR[risk] ?? "border-zinc-700 text-clinical-zinc";
          return (
            <Card key={row.company.id}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/admin/sales-console/${row.company.slug}`}
                      className="text-base font-medium hover:underline"
                    >
                      {row.company.name}
                    </Link>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs capitalize ${cls}`}
                    >
                      {risk.replace("_", " ")}
                    </span>
                    {row.health && (
                      <Badge variant="outline">score {row.health.score}</Badge>
                    )}
                  </div>
                  {row.health ? (
                    <p className="text-xs text-clinical-zinc">
                      {row.health.commentary}
                    </p>
                  ) : (
                    <p className="text-xs text-clinical-zinc">
                      No snapshot — recompute to see drivers.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => recompute(row.company.slug)}
                    disabled={recomputing === row.company.slug}
                  >
                    {recomputing === row.company.slug
                      ? "Recomputing…"
                      : "Recompute"}
                  </Button>
                  <Link to={`/admin/sales-console/${row.company.slug}`}>
                    <Button size="sm">Open</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
