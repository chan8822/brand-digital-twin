"use client";

/**
 * Lead pipeline — surfaces CrmLeadsSync (crm_leads_sync.ts) data:
 * the full journey from first ad click (awareness) through SQL to closed
 * revenue, with offline-conversion sync status back to Google and Meta.
 *
 * The canonical insight here: Meta Prospecting and brand search campaigns
 * originate awareness-stage leads that eventually close as high-value deals,
 * but without this view (and the offline sync) the ad platforms never see
 * that downstream value — they only see clicks, not revenue.
 */

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Nav } from "@/components/Nav";
import { usePipeline } from "@/lib/queries";
import { USE_MOCK } from "@/lib/api";
import type { CrmLead, LeadSource, LeadStatus } from "@/lib/types";

const STAGE_ORDER: LeadStatus[] = ["prospect", "sql", "closed_won"];

const STAGE_META: Record<
  LeadStatus,
  { label: string; bar: string; chip: string; description: string }
> = {
  prospect: {
    label: "Awareness / Prospect",
    bar: "bg-accent",
    chip: "border-accent/20 bg-accent/10 text-accent",
    description: "First ad touch — awareness campaigns driving initial interest.",
  },
  sql: {
    label: "Consideration / SQL",
    bar: "bg-warning",
    chip: "border-warning/20 bg-warning/10 text-warning",
    description: "Sales-qualified — showing genuine intent, retargeting active.",
  },
  closed_won: {
    label: "Converted / Closed Won",
    bar: "bg-success",
    chip: "border-success/20 bg-success/10 text-success",
    description: "Revenue realised — offline conversion synced back to ad platforms.",
  },
  lost: {
    label: "Lost",
    bar: "bg-danger",
    chip: "border-danger/20 bg-danger/10 text-danger",
    description: "Did not convert.",
  },
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  google: "Google",
  meta: "Meta",
  organic: "Organic",
  direct: "Direct",
};

const SOURCE_CHIP: Record<LeadSource, string> = {
  google: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  meta: "border-indigo-400/20 bg-indigo-400/10 text-indigo-300",
  organic: "border-success/20 bg-success/10 text-success",
  direct: "border-border bg-surface-raised text-text-muted",
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function syncBadge(lead: CrmLead) {
  const googleNeeded = !!lead.gclid && lead.googleSyncedStatus !== lead.status;
  const metaNeeded = !!lead.fbclid && lead.metaSyncedStatus !== lead.status;
  const pending = googleNeeded || metaNeeded;

  if (lead.status === "prospect") return null;
  if (pending) {
    return (
      <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
        sync pending
      </span>
    );
  }
  return (
    <span className="rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] text-success">
      synced
    </span>
  );
}

function LeadCard({ lead }: { lead: CrmLead }) {
  const stage = STAGE_META[lead.status] ?? STAGE_META.prospect;
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface">
      <div className={clsx("w-1 shrink-0", stage.bar)} />
      <div className="flex flex-1 items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[10px]",
                SOURCE_CHIP[lead.source],
              )}
            >
              {SOURCE_LABEL[lead.source]}
            </span>
            <span className="truncate text-xs text-text-muted">
              {lead.campaignName}
            </span>
          </div>
          <p className="text-sm font-medium text-text-primary">{lead.email}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {lead.gclid && (
              <span className="text-[10px] text-text-muted font-mono">
                gclid
              </span>
            )}
            {lead.fbclid && (
              <span className="text-[10px] text-text-muted font-mono">
                fbclid
              </span>
            )}
            {syncBadge(lead)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-wide text-text-muted">
            Value
          </p>
          <p className="text-base font-bold tabular-nums text-text-primary">
            {money(lead.value)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data, isLoading, isError, error } = usePipeline();
  const [activeStage, setActiveStage] = useState<LeadStatus | "all">("all");

  const byStage = useMemo(() => {
    if (!data) return {} as Record<LeadStatus, CrmLead[]>;
    return STAGE_ORDER.reduce(
      (acc, s) => {
        acc[s] = data.leads.filter((l) => l.status === s);
        return acc;
      },
      {} as Record<LeadStatus, CrmLead[]>,
    );
  }, [data]);

  const visible = useMemo(() => {
    if (!data) return [];
    if (activeStage === "all") return data.leads;
    return data.leads.filter((l) => l.status === activeStage);
  }, [data, activeStage]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Lead pipeline</h1>
            <p className="mt-1 text-sm text-text-muted">
              Awareness clicks → qualified leads → closed revenue, with offline
              conversion sync back to Google and Meta.
            </p>
          </div>
          {data && data.summary.syncPendingCount > 0 && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-warning">
                {data.summary.syncPendingCount} sync pending
              </p>
              <p className="text-[11px] text-text-muted">
                ad platforms missing downstream value
              </p>
            </div>
          )}
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire live CRM leads via <code className="font-mono">GET /api/v1/pipeline</code>.
          </div>
        )}

        {/* Summary strip */}
        {data && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Prospects", value: data.summary.prospects, color: "text-accent" },
              { label: "SQLs", value: data.summary.sqls, color: "text-warning" },
              { label: "Closed Won", value: data.summary.closedWon, color: "text-success" },
              { label: "Revenue", value: money(data.summary.totalValue), color: "text-text-primary" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-border bg-surface px-4 py-3"
              >
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  {s.label}
                </p>
                <p className={clsx("mt-1 text-2xl font-bold tabular-nums", s.color)}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Stage filter tabs */}
        {data && (
          <div className="mb-5 flex flex-wrap gap-2">
            {(["all", ...STAGE_ORDER] as const).map((s) => {
              const meta = s !== "all" ? STAGE_META[s] : null;
              const count =
                s === "all"
                  ? data.leads.length
                  : (byStage[s]?.length ?? 0);
              return (
                <button
                  key={s}
                  onClick={() => setActiveStage(s)}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    activeStage === s
                      ? meta
                        ? clsx(meta.chip, "font-semibold")
                        : "border-text-primary/20 bg-text-primary/10 text-text-primary font-semibold"
                      : "border-border text-text-muted hover:border-border/60 hover:text-text-primary",
                  )}
                >
                  {s === "all" ? "All" : STAGE_META[s].label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Stage description */}
        {activeStage !== "all" && (
          <p className="mb-4 text-xs text-text-muted">
            {STAGE_META[activeStage].description}
          </p>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Could not load pipeline: {(error as Error).message}
          </div>
        )}

        {!isLoading && !isError && visible.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">
            No leads in this stage.
          </div>
        )}

        <div className="space-y-3">
          {visible.map((lead) => (
            <LeadCard key={lead.leadId} lead={lead} />
          ))}
        </div>
      </main>
    </>
  );
}
