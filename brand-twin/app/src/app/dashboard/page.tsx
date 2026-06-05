"use client";

/**
 * POAS dashboard — the first real screen (A3.2).
 * Renders the dual-metric hero grid from /api/v1/recommendations, sorted
 * worst-first by dollar drag so the most damaging lie surfaces at the top.
 */
import { useMemo } from "react";
import { useRecommendations, useProfitReadiness } from "@/lib/queries";
import { DualMetricCard } from "@/components/DualMetricCard";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { Nav } from "@/components/Nav";
import { USE_MOCK } from "@/lib/api";

export default function DashboardPage() {
  const { data, isLoading, isError, error } = useRecommendations();
  const readiness = useProfitReadiness();

  const ranked = useMemo(
    () => (data ? [...data].sort((a, b) => b.dollarDrag - a.dollarDrag) : []),
    [data],
  );

  const totalDrag = useMemo(
    () => ranked.reduce((sum, c) => sum + c.dollarDrag, 0),
    [ranked],
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profit on Ad Spend</h1>
          <p className="mt-1 text-sm text-text-muted">
            Every campaign&apos;s real profit, beside the ROAS that flatters it.
          </p>
        </div>
        {ranked.length > 0 && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Apparent profit that isn&apos;t real
            </p>
            <p className="text-2xl font-bold tabular-nums text-danger">
              ${totalDrag.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        )}
      </header>

      {USE_MOCK && (
        <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
          Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code> to
          wire the live engine.
        </div>
      )}

      {/* Readiness qualifies whether the POAS numbers below can be trusted */}
      {readiness.data && (
        <div className="mb-6">
          <ReadinessGauge readiness={readiness.data} />
        </div>
      )}

      {isLoading && <SkeletonGrid />}

      {isError && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
          Couldn&apos;t load recommendations: {(error as Error).message}
        </div>
      )}

      {!isLoading && !isError && ranked.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">
          No campaigns yet. Connect an ad platform to see your real POAS.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ranked.map((card) => (
          <DualMetricCard key={card.campaignId} card={card} />
        ))}
      </div>
      </main>
    </>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-40 animate-pulse rounded-xl border border-border bg-surface"
        />
      ))}
    </div>
  );
}
