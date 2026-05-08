import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  b2bPlannerApi,
  type AccountHealthSnapshot,
  type QbrDraft,
  type QbrSection,
  type SalesAccountRow,
} from "@/lib/b2bPlannerApi";

export default function AdminSalesAccount() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [company, setCompany] = useState<SalesAccountRow["company"] | null>(
    null,
  );
  const [health, setHealth] = useState<AccountHealthSnapshot | null>(null);
  const [qbr, setQbr] = useState<QbrDraft | null>(null);
  const [hasDietProfile, setHasDietProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editSections, setEditSections] = useState<QbrSection[]>([]);

  const refresh = async () => {
    try {
      const r = await b2bPlannerApi.getSalesAccount(slug);
      setCompany(r.company);
      setHealth(r.health);
      setQbr(r.qbr);
      setHasDietProfile(r.hasDietProfile);
      setEditSections(r.qbr?.payload.sections ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, [slug]);

  const recompute = async () => {
    setBusy("health");
    try {
      const r = await b2bPlannerApi.recomputeSalesHealth(slug);
      setHealth(r.snapshot);
      toast.success("Health recomputed");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const generateQbr = async () => {
    setBusy("qbr");
    try {
      const r = await b2bPlannerApi.generateQbr(slug);
      setQbr(r.qbr);
      setEditSections(r.qbr.payload.sections);
      toast.success("QBR draft generated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveQbr = async () => {
    if (!qbr) return;
    setBusy("save");
    try {
      const r = await b2bPlannerApi.saveQbr(qbr.id, editSections);
      setQbr(r.qbr);
      toast.success("QBR saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading || !company) {
    return <div className="p-6 text-sm text-clinical-zinc">Loading…</div>;
  }

  const drivers = health?.drivers;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <p className="text-sm text-clinical-zinc">/{company.slug}</p>
        </div>
        <Link
          to="/admin/sales-console"
          className="text-sm text-clinical-zinc underline"
        >
          ← Back to console
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Account health</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={recompute}
              disabled={busy === "health"}
            >
              {busy === "health" ? "Recomputing…" : "Recompute"}
            </Button>
          </div>
          {health ? (
            <>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold">{health.score}</span>
                <Badge variant="outline" className="capitalize">
                  {health.riskLevel.replace("_", " ")}
                </Badge>
                <span className="text-xs text-clinical-zinc">
                  as of {health.snapshotDate}
                </span>
              </div>
              <p className="text-sm">{health.commentary}</p>
              {drivers && (
                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  <Driver
                    label="Orders 30d"
                    value={`${drivers.ordersLast30} (vs ${drivers.ordersPrev30})`}
                  />
                  <Driver
                    label="Trend"
                    value={`${drivers.ordersTrendPct >= 0 ? "+" : ""}${drivers.ordersTrendPct}%`}
                  />
                  <Driver
                    label="Member activation"
                    value={`${drivers.memberActivationPct}% (${drivers.activeMembers}/${drivers.totalMembers})`}
                  />
                  <Driver
                    label="Budget used"
                    value={`${Math.round(drivers.budgetUtilization * 100)}%`}
                  />
                  <Driver
                    label="Days since last order"
                    value={
                      drivers.daysSinceLastOrder == null
                        ? "—"
                        : String(drivers.daysSinceLastOrder)
                    }
                  />
                  <Driver
                    label="Diet profile"
                    value={hasDietProfile ? "yes" : "no"}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-clinical-zinc">
              No snapshot yet. Click Recompute.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Quarterly business review</h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={generateQbr}
                disabled={busy === "qbr"}
              >
                {busy === "qbr" ? "Drafting…" : qbr ? "Regenerate draft" : "Generate draft"}
              </Button>
              {qbr && (
                <>
                  <Button size="sm" onClick={saveQbr} disabled={busy === "save"}>
                    {busy === "save" ? "Saving…" : "Save edits"}
                  </Button>
                  <a
                    href={b2bPlannerApi.exportQbrUrl(qbr.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button size="sm" variant="outline">
                      Export .md
                    </Button>
                  </a>
                </>
              )}
            </div>
          </div>
          {qbr ? (
            <div className="space-y-4">
              <p className="text-xs text-clinical-zinc">
                {qbr.periodStart} → {qbr.periodEnd} · status {qbr.status} ·{" "}
                model {qbr.payload.modelId}
                {qbr.editedBy ? ` · last edit by ${qbr.editedBy}` : ""}
              </p>
              <div className="space-y-3">
                {editSections.map((s, i) => (
                  <div key={i} className="space-y-1">
                    <Input
                      value={s.title}
                      onChange={(e) =>
                        setEditSections((cur) =>
                          cur.map((x, idx) =>
                            idx === i ? { ...x, title: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Textarea
                      value={s.body}
                      rows={4}
                      onChange={(e) =>
                        setEditSections((cur) =>
                          cur.map((x, idx) =>
                            idx === i ? { ...x, body: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-3">
                {qbr.payload.charts.map((c, idx) => (
                  <div key={idx}>
                    <h3 className="text-sm font-medium">{c.title}</h3>
                    <div className="mt-1 space-y-1">
                      {c.series.map((p) => (
                        <div
                          key={p.label}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="w-16 text-clinical-zinc">
                            {p.label}
                          </span>
                          <div
                            className="h-2 rounded bg-emerald-500/40"
                            style={{
                              width: `${Math.min(100, p.value / 50)}%`,
                            }}
                          />
                          <span className="text-clinical-zinc">
                            {p.value} {c.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-clinical-zinc">
              No QBR yet. Click Generate to draft one for the current quarter.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Driver({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 p-2">
      <div className="text-[10px] uppercase tracking-wide text-clinical-zinc">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
