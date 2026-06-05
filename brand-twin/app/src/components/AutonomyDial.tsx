"use client";

/**
 * Autonomy dial — the 5 trust tiers (governance_types.ts), current one
 * highlighted, with each tier's daily dollar cap. Earned, graduated, reversible.
 *
 * Read-only display for now: changing the tier needs `POST /api/v1/autonomy`
 * (tracked). New public accounts start at OBSERVE by design (abuse guard).
 */
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { TRUST_TIERS, type SemanticTrustTier } from "@/lib/types";

function cap(n: number) {
  if (n >= 1_000_000) return "no cap";
  if (n === 0) return "$0";
  return `$${n.toLocaleString()}/day`;
}

export function AutonomyDial({ current }: { current: SemanticTrustTier }) {
  const currentLevel =
    TRUST_TIERS.find((t) => t.tier === current)?.level ?? 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Autonomy</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            How much the OS may act on its own — earned and reversible.
          </p>
        </div>
        <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
          {current}
        </span>
      </div>

      <div className="space-y-2">
        {TRUST_TIERS.map((t) => {
          const active = t.tier === current;
          const reached = t.level <= currentLevel;
          return (
            <motion.div
              key={t.tier}
              initial={false}
              animate={{ opacity: reached ? 1 : 0.45 }}
              className={clsx(
                "flex items-center gap-3 rounded-lg border px-3 py-2",
                active
                  ? "border-accent/40 bg-accent/10"
                  : "border-border bg-bg/40",
              )}
            >
              <span
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  reached
                    ? "bg-accent text-white"
                    : "bg-border text-text-muted",
                )}
              >
                {t.level}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={clsx(
                      "text-sm font-medium",
                      active ? "text-accent" : "text-text-primary",
                    )}
                  >
                    {t.tier}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                    {cap(t.cap)}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted">{t.blurb}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
