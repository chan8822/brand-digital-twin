"use client";

/**
 * One diagnostic-sweep finding row. Severity-led, with the dollar at stake on
 * the right. Data: SweepFinding (risk_radar.ts scanners), verified @ 44ca4ba.
 */
import { motion } from "framer-motion";
import { clsx } from "clsx";
import type { Severity, SweepFinding } from "@/lib/types";

const SEVERITY_META: Record<
  Severity,
  { label: string; bar: string; chip: string }
> = {
  CRITICAL: {
    label: "Critical",
    bar: "bg-danger",
    chip: "border-danger/20 bg-danger/10 text-danger",
  },
  WARNING: {
    label: "Warning",
    bar: "bg-warning",
    chip: "border-warning/20 bg-warning/10 text-warning",
  },
  OPPORTUNITY: {
    label: "Opportunity",
    bar: "bg-success",
    chip: "border-success/20 bg-success/10 text-success",
  },
};

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function SweepFindingRow({
  finding,
  index,
}: {
  finding: SweepFinding;
  index: number;
}) {
  const meta = SEVERITY_META[finding.severity];
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: index * 0.04 }}
      className="flex items-stretch overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className={clsx("w-1 shrink-0", meta.bar)} />
      <div className="flex flex-1 items-start justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[11px]",
                meta.chip,
              )}
            >
              {meta.label}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-text-muted">
              {finding.check.replace(/_/g, " ")}
            </span>
            {finding.suggestedAction != null && (
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
                1-tap fix
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-text-primary">{finding.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
            {finding.detail}
          </p>
        </div>
        {finding.dollarImpact > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">
              At stake
            </p>
            <p className="text-base font-bold tabular-nums text-text-primary">
              {money(finding.dollarImpact)}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
