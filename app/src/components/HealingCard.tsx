"use client";

/**
 * The three-zone healing card — the product's prescriptive core.
 * Splits each campaign's fixes into the honest three zones the engine returns:
 *   - OS acts        (osActs)      — autonomous, already-safe actions
 *   - You decide      (userApproves)— needs human approval
 *   - Ads can't fix   (adsCantFix)  — structural / economics-side; no ad lever helps
 *
 * Data: RecommendationCard (healing_types.ts), verified @ 44ca4ba. Every field
 * shown here is produced by `analyzeProfitability()` — nothing is invented in UI.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import {
  DISMISS_REASON_LABELS,
  type DismissReason,
  type Prescription,
  type RecommendationCard,
  type Side,
} from "@/lib/types";
import { ROOT_CAUSE_LABELS, SIDE_LABELS } from "@/lib/labels";
import { useDismissRecommendation } from "@/lib/queries";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function sideClass(side: Side) {
  if (side === "ADVERTISING") return "border-accent/20 bg-accent/10 text-accent";
  if (side === "ECONOMICS") return "border-warning/20 bg-warning/10 text-warning";
  return "border-border bg-surface text-text-muted";
}

type ZoneKind = "os" | "user" | "cant";

const ZONE_META: Record<
  ZoneKind,
  { title: string; hint: string; accent: string; dot: string }
> = {
  os: {
    title: "OS acts",
    hint: "Autonomous — within earned trust",
    accent: "text-success",
    dot: "bg-success",
  },
  user: {
    title: "You decide",
    hint: "Needs your approval",
    accent: "text-warning",
    dot: "bg-warning",
  },
  cant: {
    title: "Ads can't fix",
    hint: "Structural — no ad lever helps",
    accent: "text-danger",
    dot: "bg-danger",
  },
};

function Zone({
  kind,
  prescriptions,
}: {
  kind: ZoneKind;
  prescriptions: Prescription[];
}) {
  const meta = ZONE_META[kind];
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center gap-2">
        <span className={clsx("h-2 w-2 rounded-full", meta.dot)} />
        <span className={clsx("text-xs font-semibold", meta.accent)}>
          {meta.title}
        </span>
      </div>
      <p className="mb-3 text-[11px] text-text-muted">{meta.hint}</p>

      {prescriptions.length === 0 ? (
        <p className="text-xs text-muted">—</p>
      ) : (
        <ul className="space-y-2">
          {prescriptions.map((p, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-bg/40 px-3 py-2"
            >
              <p className="text-xs leading-relaxed text-text-primary">
                {p.action}
              </p>
              {p.estimatedRecovery > 0 && (
                <p className="mt-1 text-[11px] font-medium tabular-nums text-success">
                  +{money(p.estimatedRecovery)} est. recovery
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HealingCard({ card }: { card: RecommendationCard }) {
  const {
    campaignId,
    campaignName,
    poas,
    roas,
    dollarDrag,
    dominantCause,
    side,
    confidence,
    caveat,
    osActs,
    userApproves,
    adsCantFix,
  } = card;

  const dismiss = useDismissRecommendation();
  const [picking, setPicking] = useState(false);
  const [reason, setReason] = useState<DismissReason | null>(null);
  const [note, setNote] = useState("");
  const dismissed = dismiss.isSuccess;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: dismissed ? 0.5 : 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-xl border border-border bg-surface p-5"
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{campaignName}</h3>
          <p className="mt-1 text-xs text-text-muted">
            {ROOT_CAUSE_LABELS[dominantCause]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={clsx(
              "rounded-full border px-2 py-0.5 text-[11px]",
              sideClass(side),
            )}
          >
            {SIDE_LABELS[side]}
          </span>
          <span
            className={clsx(
              "text-[11px]",
              confidence === "high" && "text-success",
              confidence === "medium" && "text-warning",
              confidence === "low" && "text-danger",
            )}
          >
            {confidence}
          </span>
        </div>
      </div>

      {/* Metric strip */}
      <div className="mb-5 flex items-center gap-6 rounded-lg border border-border bg-bg/40 px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-text-muted">ROAS</p>
          <p className="text-lg font-bold tabular-nums text-text-muted">
            {roas.toFixed(2)}×
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-text-muted">POAS</p>
          <p
            className={clsx(
              "text-lg font-bold tabular-nums",
              poas >= 2 ? "text-success" : poas >= 1 ? "text-warning" : "text-danger",
            )}
          >
            {poas.toFixed(2)}×
          </p>
        </div>
        {dollarDrag > 0 && (
          <div className="ml-auto text-right">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">
              Dollar drag
            </p>
            <p className="text-lg font-bold tabular-nums text-danger">
              {money(dollarDrag)}
            </p>
          </div>
        )}
      </div>

      {/* Three zones */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Zone kind="os" prescriptions={osActs} />
        <Zone kind="user" prescriptions={userApproves} />
        <Zone kind="cant" prescriptions={adsCantFix} />
      </div>

      {/* Honesty caveat */}
      <p className="mt-5 border-t border-border pt-3 text-[11px] italic text-text-muted">
        {caveat}
      </p>

      {/* Dismiss with reason (P2.1) — the richest "did they act?" signal. The
          reason is the point: we learn why a brand walks away from the truth. */}
      <div className="mt-3 border-t border-border pt-3">
        {dismissed ? (
          <p className="text-[11px] text-text-muted">
            Dismissed — thanks, that tells us more than silence.
          </p>
        ) : !picking ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-[11px] text-text-muted underline-offset-2 transition-colors hover:text-text-primary hover:underline"
          >
            Dismiss this
          </button>
        ) : (
          <div>
            <p className="mb-2 text-[11px] font-medium text-text-primary">
              Why are you dismissing this?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(DISMISS_REASON_LABELS) as DismissReason[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    reason === r
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border text-text-muted hover:text-text-primary",
                  )}
                >
                  {DISMISS_REASON_LABELS[r]}
                </button>
              ))}
            </div>
            {reason === "other" && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Tell us more"
                className="mt-2 w-full rounded-md border border-border bg-bg/60 px-3 py-1.5 text-xs text-text-primary outline-none placeholder:text-muted focus:border-accent"
              />
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={!reason || dismiss.isPending}
                onClick={() =>
                  reason &&
                  dismiss.mutate({
                    campaignId,
                    reason,
                    note: note.trim() || undefined,
                  })
                }
                className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {dismiss.isPending ? "Saving…" : "Confirm dismiss"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPicking(false);
                  setReason(null);
                  setNote("");
                }}
                className="text-[11px] text-text-muted transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
