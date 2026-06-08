"use client";

/**
 * Attribution modelling — surfaces AttributionEngine (attribution_engine.ts):
 * three fractional-credit formulas side-by-side for a representative
 * multi-touch conversion journey.
 *
 * The core insight: under time-decay or last-touch, Meta Prospecting (the
 * awareness campaign that originated the lead 21 days before purchase) gets
 * almost no credit. Linear and position-based restore that credit — which
 * directly changes budget allocation decisions.
 */

import { useState } from "react";
import { clsx } from "clsx";
import { Nav } from "@/components/Nav";
import { useAttribution } from "@/lib/queries";
import { USE_MOCK } from "@/lib/api";
import type { AttributionModel, AttributionScenario, AttributionTouchpoint } from "@/lib/types";

const MODEL_ORDER: AttributionModel[] = ["linear", "time_decay", "position_based"];

const MODEL_CHIP: Record<AttributionModel, string> = {
  linear: "border-accent/20 bg-accent/10 text-accent",
  time_decay: "border-warning/20 bg-warning/10 text-warning",
  position_based: "border-success/20 bg-success/10 text-success",
};

const PLATFORM_COLOR: Record<string, string> = {
  google: "bg-blue-500",
  meta: "bg-indigo-400",
  organic: "bg-success",
  default: "bg-text-muted",
};

const TOUCH_TYPE_LABEL: Record<AttributionTouchpoint["type"], string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  conversion: "Conversion",
};

const TOUCH_TYPE_CHIP: Record<AttributionTouchpoint["type"], string> = {
  awareness: "border-accent/20 bg-accent/10 text-accent",
  consideration: "border-warning/20 bg-warning/10 text-warning",
  conversion: "border-success/20 bg-success/10 text-success",
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function platformColor(p: string) {
  return PLATFORM_COLOR[p.toLowerCase()] ?? PLATFORM_COLOR.default;
}

function ScenarioCard({
  scenario,
  active,
  onClick,
}: {
  scenario: AttributionScenario;
  active: boolean;
  onClick: () => void;
}) {
  const maxShare = Math.max(...scenario.credits.map((c) => c.share));
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full rounded-xl border p-4 text-left transition-all",
        active
          ? "border-accent/40 bg-surface ring-1 ring-accent/20"
          : "border-border bg-surface hover:border-border/60",
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className={clsx(
            "rounded-full border px-2 py-0.5 text-[10px]",
            MODEL_CHIP[scenario.model],
          )}
        >
          {scenario.label}
        </span>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-text-muted">
        {scenario.description}
      </p>
      <div className="space-y-2">
        {scenario.credits.map((c) => (
          <div key={c.platform}>
            <div className="mb-0.5 flex justify-between text-xs">
              <span className="capitalize text-text-primary">{c.platform}</span>
              <span className="tabular-nums text-text-muted">
                {pct(c.share)} · {money(c.allocatedValue)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-500",
                  platformColor(c.platform),
                  c.share < maxShare ? "opacity-50" : "",
                )}
                style={{ width: pct(c.share) }}
              />
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

function TouchpointTimeline({
  touchpoints,
}: {
  touchpoints: AttributionTouchpoint[];
}) {
  return (
    <div className="relative">
      {/* connecting line */}
      <div className="absolute left-3 top-4 bottom-4 w-px bg-border" />
      <div className="space-y-4">
        {touchpoints.map((tp, i) => (
          <div key={i} className="relative flex items-start gap-4">
            <div
              className={clsx(
                "relative z-10 mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 border-background",
                platformColor(tp.platform),
              )}
            />
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[10px]",
                    TOUCH_TYPE_CHIP[tp.type],
                  )}
                >
                  {TOUCH_TYPE_LABEL[tp.type]}
                </span>
                <span className="text-xs capitalize text-text-muted">
                  {tp.platform}
                </span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-text-primary">
                {tp.campaignName}
              </p>
              <p className="text-[11px] text-text-muted">
                {new Date(tp.occurredAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AttributionPage() {
  const { data, isLoading, isError, error } = useAttribution();
  const [activeModel, setActiveModel] = useState<AttributionModel>("position_based");

  const active = data?.scenarios.find((s) => s.model === activeModel);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Attribution</h1>
          <p className="mt-1 text-sm text-text-muted">
            Three credit models for the same conversion journey — reveals which
            awareness channels are undervalued by last-touch attribution.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — set <code className="font-mono">NEXT_PUBLIC_API_URL</code>{" "}
            to wire live touchpoint paths via{" "}
            <code className="font-mono">GET /api/v1/attribution</code>.
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
            Could not load attribution data: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-6">
              {/* Conversion value banner */}
              <div className="rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  Conversion value being attributed
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-text-primary">
                  {money(data.conversionValue)}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {data.touchpoints.length} touchpoints across{" "}
                  {[...new Set(data.touchpoints.map((t) => t.platform))].join(
                    " & ",
                  )}
                </p>
              </div>

              {/* Key insight callout */}
              <div className="rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Why this matters
                </p>
                <p className="mt-1 text-sm leading-relaxed text-text-primary">
                  The Meta Prospecting campaign drove the first click 21 days
                  before purchase. Under time-decay it receives minimal credit —
                  making it look like a cost centre. Linear and position-based
                  models restore its contribution, justifying continued awareness
                  investment.
                </p>
              </div>

              {/* Model cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                {MODEL_ORDER.map((m) => {
                  const scenario = data.scenarios.find((s) => s.model === m);
                  if (!scenario) return null;
                  return (
                    <ScenarioCard
                      key={m}
                      scenario={scenario}
                      active={activeModel === m}
                      onClick={() => setActiveModel(m)}
                    />
                  );
                })}
              </div>

              {/* Active model detail */}
              {active && (
                <div className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="mb-3 text-sm font-semibold text-text-primary">
                    {active.label} — channel breakdown
                  </h2>
                  <div className="space-y-3">
                    {active.credits.map((c) => (
                      <div
                        key={c.platform}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={clsx(
                              "h-3 w-3 rounded-full",
                              platformColor(c.platform),
                            )}
                          />
                          <span className="text-sm capitalize text-text-primary">
                            {c.platform}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold tabular-nums text-text-primary">
                            {money(c.allocatedValue)}
                          </span>
                          <span className="ml-2 text-xs text-text-muted">
                            {pct(c.share)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Touchpoint timeline */}
            <div>
              <h2 className="mb-4 text-sm font-semibold text-text-primary">
                Touchpoint journey
              </h2>
              <TouchpointTimeline touchpoints={data.touchpoints} />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
