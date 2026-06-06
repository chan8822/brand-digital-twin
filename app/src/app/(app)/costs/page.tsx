"use client";

/**
 * Costs screen (Phase C1) — the COGS coverage gate + Pareto entry.
 *
 * POAS is only trustworthy with cost data. The engine auto-fills what it can
 * (silent sweep + accounting sync + category estimate); this screen shows the
 * resulting coverage *by ad spend* and asks the brand for only the top-spend
 * SKUs still missing — never the whole catalog. Below the threshold, advice
 * stays directional (the honesty gate), so closing these gaps unlocks action.
 */
import { useMemo, useState } from "react";
import { useCogsCoverage, useCogsGaps, useSaveCogs } from "@/lib/queries";
import { CogsEntryRow } from "@/components/CogsEntryRow";
import { Nav } from "@/components/Nav";
import { USE_MOCK } from "@/lib/api";

const COVERAGE_THRESHOLD = 80; // advice gated below this (by spend)

export default function CostsPage() {
  const coverage = useCogsCoverage();
  const gaps = useCogsGaps();
  const save = useSaveCogs();

  // sku -> typed unit cost (string so the field can be empty)
  const [entries, setEntries] = useState<Record<string, string>>({});

  const pending = useMemo(() => {
    return Object.entries(entries)
      .map(([sku, raw]) => ({ sku, unitCost: Number(raw) }))
      .filter(
        (e) =>
          String(entries[e.sku]).trim() !== "" &&
          Number.isFinite(e.unitCost) &&
          e.unitCost >= 0,
      );
  }, [entries]);

  const cov = coverage.data;
  const gated = cov ? cov.coveragePct < COVERAGE_THRESHOLD : false;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Costs</h1>
            <p className="mt-1 text-sm text-text-muted">
              POAS is only as honest as your cost data. Fill the biggest gaps to
              make it trustworthy.
            </p>
          </div>
          {cov && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Coverage by spend
              </p>
              <p className="text-2xl font-bold tabular-nums text-text-primary">
                {cov.coveragePct}%
              </p>
            </div>
          )}
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — needs{" "}
            <code className="font-mono">GET /api/v1/cogs/coverage</code>,{" "}
            <code className="font-mono">/cogs/gaps</code>, and{" "}
            <code className="font-mono">POST /api/v1/cogs</code> (see
            C-ENDPOINT_GAPS_SPEC.md).
          </div>
        )}

        {/* Coverage bar + gate */}
        {coverage.isLoading && (
          <div className="mb-8 h-28 animate-pulse rounded-xl border border-border bg-surface" />
        )}
        {cov && (
          <div className="mb-8 rounded-xl border border-border bg-surface p-5">
            <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
              <span>
                {cov.realPct}% real · {cov.estimatedPct}% estimated ·{" "}
                {cov.missingCostSkus} SKUs open
              </span>
              <span className="tabular-nums">
                threshold {COVERAGE_THRESHOLD}%
              </span>
            </div>
            {/* Stacked bar: real (solid) + estimated (hatched) toward threshold */}
            <div className="relative h-2.5 overflow-hidden rounded-full bg-border">
              <div
                className="absolute inset-y-0 left-0 bg-success"
                style={{ width: `${cov.realPct}%` }}
              />
              <div
                className="absolute inset-y-0 bg-warning/60"
                style={{ left: `${cov.realPct}%`, width: `${cov.estimatedPct}%` }}
              />
              <div
                className="absolute inset-y-0 w-px bg-text-primary/60"
                style={{ left: `${COVERAGE_THRESHOLD}%` }}
              />
            </div>
            <p
              className={clsxGate(gated)}
            >
              {gated
                ? "Below threshold — advice stays directional until coverage clears 80% of spend."
                : "Coverage clears the threshold — the OS can act on advertising-side fixes within its tier."}
            </p>
          </div>
        )}

        {/* Pareto entry grid */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Top spend, still missing cost</h2>
          {pending.length > 0 && (
            <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
              {pending.length} to save
            </span>
          )}
        </div>

        {gaps.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        )}

        {gaps.isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Couldn&apos;t load cost gaps: {(gaps.error as Error).message}
          </div>
        )}

        {!gaps.isLoading && !gaps.isError && (gaps.data ?? []).length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">
            No gaps — every spending SKU has a cost. POAS is fully grounded.
          </div>
        )}

        <div className="space-y-3">
          {(gaps.data ?? []).map((gap) => (
            <CogsEntryRow
              key={gap.sku}
              gap={gap}
              value={entries[gap.sku] ?? ""}
              onChange={(next) =>
                setEntries((prev) => ({ ...prev, [gap.sku]: next }))
              }
            />
          ))}
        </div>

        {/* Save */}
        {(gaps.data ?? []).length > 0 && (
          <div className="mt-6 flex items-center justify-end gap-3">
            {save.isSuccess && pending.length === 0 && (
              <span className="text-xs text-success">Costs saved.</span>
            )}
            <button
              type="button"
              disabled={pending.length === 0 || save.isPending}
              onClick={() => save.mutate(pending)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {save.isPending
                ? "Saving…"
                : `Save ${pending.length || ""} cost${pending.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </main>
    </>
  );
}

/** Gate note styling — green when clear, amber when advice is held back. */
function clsxGate(gated: boolean) {
  return gated
    ? "mt-3 text-xs text-warning"
    : "mt-3 text-xs text-success";
}
