"use client";

/**
 * Autonomy screen (A3.2) — the trust dial beside the approvals queue.
 * Left: where autonomy stands and what each tier unlocks. Right: what the OS
 * has escalated for a human decision.
 */
import { useAutonomy, useApprovals } from "@/lib/queries";
import { AutonomyDial } from "@/components/AutonomyDial";
import { ApprovalRow } from "@/components/ApprovalRow";
import { Nav } from "@/components/Nav";
import { USE_MOCK } from "@/lib/api";

export default function AutonomyPage() {
  const tier = useAutonomy();
  const approvals = useApprovals();

  const pending = (approvals.data ?? []).filter((a) => a.status === "pending");

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Autonomy &amp; approvals</h1>
          <p className="mt-1 text-sm text-text-muted">
            What the OS may do on its own — and what it&apos;s holding for your call.
          </p>
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — the dial needs a{" "}
            <code className="font-mono">GET/POST /api/v1/autonomy</code> endpoint;
            approvals read the live <code className="font-mono">/approvals</code>.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
          {/* Dial */}
          <div>
            {tier.isLoading ? (
              <div className="h-80 animate-pulse rounded-xl border border-border bg-surface" />
            ) : tier.data ? (
              <AutonomyDial current={tier.data} />
            ) : null}
          </div>

          {/* Approvals queue */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Approvals queue</h2>
              {pending.length > 0 && (
                <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
                  {pending.length} pending
                </span>
              )}
            </div>

            {approvals.isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 animate-pulse rounded-xl border border-border bg-surface"
                  />
                ))}
              </div>
            )}

            {approvals.isError && (
              <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm text-danger">
                Couldn&apos;t load approvals: {(approvals.error as Error).message}
              </div>
            )}

            {!approvals.isLoading && !approvals.isError && pending.length === 0 && (
              <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-text-muted">
                Nothing waiting — the OS is acting within its tier.
              </div>
            )}

            <div className="space-y-3">
              {pending.map((a) => (
                <ApprovalRow key={a.approvalId} approval={a} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
