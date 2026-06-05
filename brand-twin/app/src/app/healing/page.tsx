"use client";

/**
 * Healing screen (A3.2) — three-zone prescription cards, one per campaign.
 * Sorted worst-first by dollar drag so the biggest, most fixable leak is on top.
 */
import { useMemo } from "react";
import { useRecommendations } from "@/lib/queries";
import { HealingCard } from "@/components/HealingCard";
import { Nav } from "@/components/Nav";
import { USE_MOCK } from "@/lib/api";

export default function HealingPage() {
  const { data, isLoading, isError, error } = useRecommendations();

  const ranked = useMemo(
    () => (data ? [...data].sort((a, b) => b.dollarDrag - a.dollarDrag) : []),
    [data],
  );

  // Only show campaigns that actually have a prescription — a clean campaign
  // with no actions doesn't need a healing card.
  const actionable = ranked.filter(
    (c) =>
      c.osActs.length + c.userApproves.length + c.adsCantFix.length > 0,
  );

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Healing</h1>
          <p className="mt-1 text-sm text-text-muted">
            What the OS will fix, what needs your call, and what ads can&apos;t
            fix at all — ranked by dollar impact.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire the live engine.
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Couldn&apos;t load recommendations: {(error as Error).message}
          </div>
        )}

        {!isLoading && !isError && actionable.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">
            Nothing to heal right now — every campaign is contribution-positive.
          </div>
        )}

        <div className="space-y-4">
          {actionable.map((card) => (
            <HealingCard key={card.campaignId} card={card} />
          ))}
        </div>
      </main>
    </>
  );
}
