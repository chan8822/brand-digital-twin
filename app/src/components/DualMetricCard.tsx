"use client";

/**
 * The product's core value claim, made visual: the same campaign's ROAS beside
 * its POAS, with the dollar gap the vanity metric hides called out explicitly.
 *
 * Data: RecommendationCard (healing_types.ts) — poas, roas, dollarDrag, caveat,
 * confidence. `dollarDrag` is the engine's own dollar-weighted drag figure.
 */
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { RecommendationCard } from "@/lib/types";

function poasHealthClass(poas: number) {
  if (poas >= 2) return "text-success";
  if (poas >= 1) return "text-warning";
  return "text-danger";
}

/** Count-up animation for a metric value. */
function useCountUp(target: number, durationMs = 600) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, durationMs]);
  return value;
}

function MetricColumn({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number;
  colorClass: string;
}) {
  const animated = useCountUp(value);
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={clsx("text-3xl font-bold tabular-nums", colorClass)}>
        {animated.toFixed(2)}×
      </p>
    </div>
  );
}

export function DualMetricCard({ card }: { card: RecommendationCard }) {
  const { campaignName, poas, roas, dollarDrag, caveat, confidence } = card;
  const gap = roas - poas;
  const isEstimated = /estimat/i.test(caveat);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="truncate text-sm text-text-muted">{campaignName}</span>
        {isEstimated && (
          <span className="shrink-0 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-xs text-warning">
            estimated COGS
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricColumn label="ROAS" value={roas} colorClass="text-text-muted" />
        <MetricColumn label="POAS" value={poas} colorClass={poasHealthClass(poas)} />
      </div>

      {gap > 0.05 && dollarDrag > 0 && (
        <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3">
          <p className="text-xs text-danger">
            ROAS overstates by{" "}
            <span className="font-semibold">{gap.toFixed(1)}×</span> —{" "}
            <span className="font-semibold">
              ${dollarDrag.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>{" "}
            of apparent profit isn&apos;t real.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span className="truncate">{caveat}</span>
        <span
          className={clsx(
            "ml-2 shrink-0 rounded px-1.5 py-0.5",
            confidence === "high" && "text-success",
            confidence === "medium" && "text-warning",
            confidence === "low" && "text-danger",
          )}
        >
          {confidence} confidence
        </span>
      </div>
    </motion.div>
  );
}
