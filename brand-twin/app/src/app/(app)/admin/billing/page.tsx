"use client";

/**
 * Admin billing ops queue — approve suggest-an-amount submissions.
 *
 * Shows all subscriptions in `pending_review`. Each row: org name, email,
 * suggested amount, optional note, and an approve button that triggers the
 * first charge (POST /api/v1/admin/billing/approve/:orgId) and flips status
 * to `active`. Account has already been live through review — no cutoff.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { useAdminBillingQueue, useApproveBilling } from "@/lib/queries";
import { Nav } from "@/components/Nav";
import { USE_MOCK } from "@/lib/api";
import type { BillingQueueEntry } from "@/lib/types";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function relativeTime(ts: number) {
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function QueueRow({ entry }: { entry: BillingQueueEntry }) {
  const approve = useApproveBilling();
  const [confirmed, setConfirmed] = useState(false);

  function handleApprove() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    approve.mutate(entry.orgId, {
      onSuccess: () => setConfirmed(false),
    });
  }

  const isApproved = approve.isSuccess;

  return (
    <motion.tr
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      className="border-b border-border last:border-0"
    >
      {/* Org */}
      <td className="py-4 pr-4">
        <p className="text-sm font-semibold text-text-primary">{entry.orgName}</p>
        <p className="mt-0.5 text-xs text-text-muted">{entry.email}</p>
      </td>

      {/* Amount */}
      <td className="py-4 pr-4">
        <span className="text-sm tabular-nums text-text-primary">
          {money(entry.amount, entry.currency)}
        </span>
        <span className="ml-1 text-xs text-text-muted">/ {entry.period === "monthly" ? "mo" : "mo"}</span>
      </td>

      {/* Note + time */}
      <td className="py-4 pr-4">
        <p className="text-xs text-text-muted">{relativeTime(entry.suggestedAt)}</p>
        {entry.note && (
          <p className="mt-0.5 max-w-xs text-xs italic text-text-secondary">
            &ldquo;{entry.note}&rdquo;
          </p>
        )}
      </td>

      {/* Action */}
      <td className="py-4 text-right">
        {isApproved ? (
          <span className="text-xs text-success">Approved ✓</span>
        ) : (
          <button
            type="button"
            onClick={handleApprove}
            disabled={approve.isPending}
            className={clsx(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              confirmed
                ? "bg-accent text-white hover:bg-accent-hover"
                : "border border-border bg-transparent text-text-secondary hover:border-accent hover:text-accent",
            )}
          >
            {approve.isPending
              ? "Approving…"
              : confirmed
              ? "Confirm charge →"
              : "Approve"}
          </button>
        )}
        {approve.isError && (
          <p className="mt-1 text-[11px] text-danger">
            {(approve.error as Error).message}
          </p>
        )}
      </td>
    </motion.tr>
  );
}

export default function AdminBillingPage() {
  const queue = useAdminBillingQueue();

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Billing Queue</h1>
          <p className="mt-1 text-sm text-text-muted">
            Brands in <code className="rounded bg-border/50 px-1 font-mono text-xs">pending_review</code>{" "}
            — approve to trigger first charge and flip status to active.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — needs{" "}
            <code className="font-mono">GET /api/v1/admin/billing/queue</code>{" "}
            and <code className="font-mono">POST /api/v1/admin/billing/approve/:orgId</code>.
          </div>
        )}

        {queue.isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-border bg-surface"
              />
            ))}
          </div>
        )}

        {queue.isError && (
          <div className="rounded-lg border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
            {(queue.error as Error).message}
          </div>
        )}

        {queue.data && queue.data.length === 0 && (
          <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center text-sm text-text-muted">
            No pending approvals — all clear.
          </div>
        )}

        {queue.data && queue.data.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-0 py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-text-muted first:pl-6">
                    Brand
                  </th>
                  <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Amount
                  </th>
                  <th className="py-3 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Note
                  </th>
                  <th className="py-3 pr-6 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y-0 px-6">
                <AnimatePresence>
                  {queue.data.map((entry) => (
                    <QueueRow key={entry.orgId} entry={entry} />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
