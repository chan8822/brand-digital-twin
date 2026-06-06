"use client";

/**
 * One row of the Pareto COGS entry grid (C1, tactic 3). We ask only for the
 * top-spend SKUs the engine still can't cost — not the whole catalog. Each row
 * shows the spend at stake and the live contribution margin as you type, so the
 * brand sees why this SKU matters before entering a number.
 *
 * Presentational: the screen owns the entry state and persists via useSaveCogs.
 */
import { clsx } from "clsx";
import type { CogsGap } from "@/lib/types";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function CogsEntryRow({
  gap,
  value,
  onChange,
}: {
  gap: CogsGap;
  /** controlled input value (string so the field can be empty) */
  value: string;
  onChange: (next: string) => void;
}) {
  const entered = value.trim() === "" ? null : Number(value);
  const valid = entered !== null && Number.isFinite(entered) && entered >= 0;
  // Live margin preview off the typed cost, else the existing (maybe estimated) one.
  const effectiveCost = valid ? entered : gap.unitCost;
  const margin =
    effectiveCost != null ? gap.sellingPrice - effectiveCost : null;
  const marginPct =
    margin != null && gap.sellingPrice > 0
      ? (margin / gap.sellingPrice) * 100
      : null;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3">
      {/* Product */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-text-primary">
            {gap.productName}
          </p>
          {gap.estimatedCogs && (
            <span className="shrink-0 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
              estimated
            </span>
          )}
        </div>
        <p className="font-mono text-[11px] text-text-muted">{gap.sku}</p>
      </div>

      {/* Spend at stake */}
      <div className="shrink-0 text-right">
        <p className="text-[10px] uppercase tracking-wide text-text-muted">
          Ad spend
        </p>
        <p className="text-sm font-semibold tabular-nums text-text-primary">
          {money(gap.adSpend)}
        </p>
      </div>

      {/* Price */}
      <div className="shrink-0 text-right">
        <p className="text-[10px] uppercase tracking-wide text-text-muted">
          Price
        </p>
        <p className="text-sm tabular-nums text-text-muted">
          ${gap.sellingPrice}
        </p>
      </div>

      {/* Unit cost input */}
      <div className="shrink-0">
        <label className="block text-[10px] uppercase tracking-wide text-text-muted">
          Unit cost
        </label>
        <div className="mt-0.5 flex items-center gap-1 rounded-md border border-border bg-bg/60 px-2 py-1 focus-within:border-accent">
          <span className="text-xs text-text-muted">$</span>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={gap.unitCost != null ? String(gap.unitCost) : "—"}
            className="w-16 bg-transparent text-sm tabular-nums text-text-primary outline-none placeholder:text-muted"
          />
        </div>
      </div>

      {/* Live margin */}
      <div className="w-20 shrink-0 text-right">
        <p className="text-[10px] uppercase tracking-wide text-text-muted">
          Margin
        </p>
        {marginPct != null ? (
          <p
            className={clsx(
              "text-sm font-semibold tabular-nums",
              marginPct >= 30
                ? "text-success"
                : marginPct >= 0
                  ? "text-warning"
                  : "text-danger",
            )}
          >
            {marginPct.toFixed(0)}%
          </p>
        ) : (
          <p className="text-sm text-muted">—</p>
        )}
      </div>
    </div>
  );
}
