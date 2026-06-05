"use client";

/**
 * Live sweep screen (A3.2) — the 5 diagnostic scanners' findings, sorted
 * severity → dollar impact (the engine's own ordering). The "what's bleeding
 * right now" surface.
 */
import { useMemo } from "react";
import { useSweep } from "@/lib/queries";
import { SweepFindingRow } from "@/components/SweepFindingRow";
import { Nav } from "@/components/Nav";
import { USE_MOCK } from "@/lib/api";
import type { Severity } from "@/lib/types";

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  OPPORTUNITY: 2,
};

export default function SweepPage() {
  const { data, isLoading, isError, error } = useSweep();

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        b.dollarImpact - a.dollarImpact,
    );
  }, [data]);

  const totalAtStake = useMemo(
    () => sorted.reduce((sum, f) => sum + f.dollarImpact, 0),
    [sorted],
  );

  const criticalCount = sorted.filter((f) => f.severity === "CRITICAL").length;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Live sweep</h1>
            <p className="mt-1 text-sm text-text-muted">
              Tracking, stockouts, checkout, efficiency, capped winners — what&apos;s
              bleeding or recoverable right now.
            </p>
          </div>
          {sorted.length > 0 && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                {criticalCount} critical · total at stake
              </p>
              <p className="text-2xl font-bold tabular-nums text-text-primary">
                ${totalAtStake.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — the rich sweep needs a{" "}
            <code className="font-mono">GET /api/v1/sweep</code> endpoint
            (tracked in 00-REMAINING_WORK.md).
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Couldn&apos;t load the sweep: {(error as Error).message}
          </div>
        )}

        {!isLoading && !isError && sorted.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">
            All clear — no findings in the latest sweep.
          </div>
        )}

        <div className="space-y-3">
          {sorted.map((f, i) => (
            <SweepFindingRow key={f.code} finding={f} index={i} />
          ))}
        </div>
      </main>
    </>
  );
}
