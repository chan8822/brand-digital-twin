"use client";

/**
 * Billing screen (Phase C2) — trial status and the suggest-an-amount conversion.
 *
 * The conversion moment is bespoke: at day 15 we don't show a pricing table, we
 * recap the value the OS already found (composed from the brand's stored sweep +
 * healing results) and ask "what would you pay?" with soft anchors for reference
 * only. Submitting moves to pending_review — the account stays live; a human
 * approves before the first charge. No vendor billing product does this.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import {
  useRecommendations,
  useSubscription,
  useSuggestAmount,
  useSweep,
} from "@/lib/queries";
import { Nav } from "@/components/Nav";
import { USE_MOCK } from "@/lib/api";
import { PRICE_ANCHORS, type Subscription } from "@/lib/types";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const SUGGEST_DAY = 15;

export default function BillingPage() {
  const sub = useSubscription();
  const recs = useRecommendations();
  const sweep = useSweep();
  const suggest = useSuggestAmount();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // The day-14 nudge value recap, composed from stored findings.
  const drag = useMemo(
    () => (recs.data ?? []).reduce((s, c) => s + c.dollarDrag, 0),
    [recs.data],
  );
  const criticalCount = useMemo(
    () => (sweep.data ?? []).filter((f) => f.severity === "CRITICAL").length,
    [sweep.data],
  );

  const s = sub.data;
  const parsed = Number(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  // Optimistic: once submitted in mock mode the status won't flip, so reflect it locally.
  const submitted = suggest.isSuccess;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-text-muted">
            Pay for what the OS is worth to you — named by you, not a price list.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — needs{" "}
            <code className="font-mono">GET /api/v1/billing/subscription</code>{" "}
            and <code className="font-mono">POST /api/v1/billing/suggest</code>{" "}
            (see C-ENDPOINT_GAPS_SPEC.md).
          </div>
        )}

        {sub.isLoading && (
          <div className="h-64 animate-pulse rounded-xl border border-border bg-surface" />
        )}

        {s && (
          <>
            <TrialStrip sub={s} />

            {submitted ? (
              <PendingReview amount={parsed} />
            ) : isSuggestStage(s) ? (
              <div className="mt-6 rounded-xl border border-border bg-surface p-6">
                {/* Value recap — the nudge, composed from their findings */}
                <div className="mb-5 rounded-lg border border-border bg-bg/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-muted">
                    What the OS found in your trial
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <span className="text-2xl font-bold tabular-nums text-danger">
                      {money(drag)}
                    </span>
                    <span className="text-sm text-text-muted">
                      of profit drag surfaced
                      {criticalCount > 0 && (
                        <> · {criticalCount} critical issue{criticalCount === 1 ? "" : "s"}</>
                      )}
                    </span>
                  </div>
                </div>

                <h2 className="text-sm font-semibold">What would you pay / month?</h2>
                <p className="mt-1 text-xs text-text-muted">
                  Name your price. These are reference points, not tiers — your
                  account stays live while we review.
                </p>

                {/* Soft anchors (reference only, never preselected) */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {PRICE_ANCHORS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAmount(String(a))}
                      className={clsx(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        Number(amount) === a
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border text-text-muted hover:text-text-primary",
                      )}
                    >
                      ${a.toLocaleString()}
                    </button>
                  ))}
                </div>

                {/* Amount */}
                <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-bg/60 px-3 py-2 focus-within:border-accent">
                  <span className="text-sm text-text-muted">$</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount"
                    className="w-32 bg-transparent text-base tabular-nums text-text-primary outline-none placeholder:text-muted"
                  />
                  <span className="text-xs text-text-muted">
                    {s.currency} / month
                  </span>
                </div>

                {/* Optional note */}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Anything you want us to know about this number (optional)"
                  className="mt-3 w-full resize-none rounded-md border border-border bg-bg/60 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-muted focus:border-accent"
                />

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[11px] text-text-muted">
                    Submitting holds for human review — no charge yet.
                  </span>
                  <button
                    type="button"
                    disabled={!amountValid || suggest.isPending}
                    onClick={() =>
                      suggest.mutate({
                        amount: parsed,
                        note: note.trim() || undefined,
                      })
                    }
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {suggest.isPending ? "Submitting…" : "Submit my amount"}
                  </button>
                </div>
              </div>
            ) : (
              <StatusPanel sub={s} />
            )}
          </>
        )}
      </main>
    </>
  );
}

/** True at day 15+ of the trial, or once the engine has flipped to suggest_amount. */
function isSuggestStage(s: Subscription): boolean {
  if (s.status === "suggest_amount") return true;
  return s.status === "trial" && s.trialDay >= SUGGEST_DAY - 1;
}

function TrialStrip({ sub }: { sub: Subscription }) {
  const pct = Math.min(100, Math.round((sub.trialDay / sub.trialLengthDays) * 100));
  const daysLeft = Math.max(0, sub.trialLengthDays - sub.trialDay);
  if (sub.status !== "trial") return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-text-primary">Free trial</span>
        <span className="tabular-nums text-text-muted">
          day {sub.trialDay} of {sub.trialLengthDays} · {daysLeft} left
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <motion.div
          className="h-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function PendingReview({ amount }: { amount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 rounded-xl border border-success/20 bg-success/10 p-6"
    >
      <h2 className="text-sm font-semibold text-success">Amount submitted</h2>
      <p className="mt-2 text-sm text-text-primary">
        You suggested{" "}
        <span className="font-bold tabular-nums">{money(amount)}/month</span>.
        We&apos;ll review it shortly — your account stays fully live, and nothing
        is charged until you&apos;re approved.
      </p>
    </motion.div>
  );
}

/** Non-conversion states: active / past_due / suspended / early trial. */
function StatusPanel({ sub }: { sub: Subscription }) {
  if (sub.status === "active") {
    return (
      <div className="mt-6 rounded-xl border border-success/20 bg-success/10 p-6">
        <h2 className="text-sm font-semibold text-success">Active</h2>
        <p className="mt-2 text-sm text-text-primary">
          {money(sub.amount ?? 0)}/month
          {sub.nextChargeAt && (
            <>
              {" "}
              · next charge{" "}
              {new Date(sub.nextChargeAt).toLocaleDateString()}
            </>
          )}
          . Thank you for backing the work.
        </p>
      </div>
    );
  }
  if (sub.status === "pending_review") {
    return <PendingReview amount={sub.amount ?? 0} />;
  }
  if (sub.status === "past_due" || sub.status === "suspended") {
    return (
      <div className="mt-6 rounded-xl border border-danger/20 bg-danger/10 p-6">
        <h2 className="text-sm font-semibold text-danger">
          {sub.status === "past_due" ? "Payment past due" : "Suspended"}
        </h2>
        <p className="mt-2 text-sm text-text-primary">
          Update your payment method to keep autonomous actions running.
        </p>
      </div>
    );
  }
  // Early trial — conversion not open yet.
  return (
    <div className="mt-6 rounded-xl border border-border bg-surface p-6 text-sm text-text-muted">
      Keep exploring — at day {SUGGEST_DAY} we&apos;ll recap what the OS found and
      ask what it&apos;s worth to you. No card needed until then.
    </div>
  );
}
