"use client";

/**
 * Profit Readiness gauge — is the POAS number trustworthy enough to act on?
 * Data: ProfitReadiness (profit_readiness.ts) @ 8807aa8 — score 0–100, the
 * factor checklist, and the gating status. The honesty safeguard: low coverage
 * means advice stays directional, not auto-executed.
 */
import { motion } from "framer-motion";
import { clsx } from "clsx";
import type { ProfitReadiness } from "@/lib/types";

const STATUS_META: Record<
  ProfitReadiness["status"],
  { label: string; cls: string; note: string }
> = {
  ready: {
    label: "Ready",
    cls: "text-success",
    note: "POAS is trustworthy — the OS can act within its tier.",
  },
  directional_only: {
    label: "Directional only",
    cls: "text-warning",
    note: "Enough to guide, not to auto-execute. Complete the gaps below to unlock action.",
  },
  incomplete: {
    label: "Incomplete",
    cls: "text-danger",
    note: "Not enough cost data yet — POAS would be confident but wrong.",
  },
};

function ringColor(status: ProfitReadiness["status"]) {
  if (status === "ready") return "#22c55e";
  if (status === "directional_only") return "#f59e0b";
  return "#ef4444";
}

const FACTOR_LABELS: { key: keyof ProfitReadiness["factors"]; label: string }[] = [
  { key: "shopifyLinked", label: "Storefront connected" },
  { key: "googleAdsLinked", label: "Google Ads connected" },
  { key: "metaAdsLinked", label: "Meta Ads connected" },
  { key: "bankLinked", label: "Bank / cash connected" },
  { key: "historicalOrdersLoaded", label: "Order history loaded" },
];

export function ReadinessGauge({ readiness }: { readiness: ProfitReadiness }) {
  const { score, status, factors } = readiness;
  const meta = STATUS_META[status];

  // SVG ring geometry
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * C;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Profit readiness</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          How trustworthy your POAS is right now.
        </p>
      </div>

      <div className="flex items-center gap-5">
        {/* Ring */}
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="#262626" strokeWidth="10" />
            <motion.circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={ringColor(status)}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C - dash }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums">{score}</span>
            <span className="text-[10px] uppercase tracking-wide text-text-muted">
              / 100
            </span>
          </div>
        </div>

        {/* Status + COGS */}
        <div className="min-w-0 flex-1">
          <span className={clsx("text-sm font-semibold", meta.cls)}>
            {meta.label}
          </span>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">{meta.note}</p>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
              <span>COGS coverage</span>
              <span className="tabular-nums">{factors.cogsCoverage}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <motion.div
                className="h-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${factors.cogsCoverage}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Factor checklist */}
      <ul className="mt-5 grid grid-cols-1 gap-1.5 border-t border-border pt-4 sm:grid-cols-2">
        {FACTOR_LABELS.map((f) => {
          const ok = factors[f.key] as boolean;
          return (
            <li key={f.key} className="flex items-center gap-2 text-xs">
              <span
                className={clsx(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]",
                  ok ? "bg-success/15 text-success" : "bg-border text-text-muted",
                )}
              >
                {ok ? "✓" : "○"}
              </span>
              <span className={ok ? "text-text-primary" : "text-text-muted"}>
                {f.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
