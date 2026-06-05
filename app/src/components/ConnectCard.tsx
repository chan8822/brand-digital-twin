"use client";

/**
 * One platform connect tile. Reflects live integration state and kicks off the
 * real OAuth flow (A2 — GET /connect/:platform). When suspended (refresh
 * failed), it surfaces the reconnect path (A2.3).
 */
import { clsx } from "clsx";
import { connectUrl, USE_MOCK } from "@/lib/api";
import type { IntegrationProvider, IntegrationState } from "@/lib/types";

type Status = IntegrationState["status"] | "disconnected";

const STATUS_META: Record<
  Status,
  { label: string; cls: string }
> = {
  active: { label: "Connected", cls: "border-success/20 bg-success/10 text-success" },
  suspended: { label: "Reconnect needed", cls: "border-warning/20 bg-warning/10 text-warning" },
  expired: { label: "Expired", cls: "border-danger/20 bg-danger/10 text-danger" },
  disconnected: { label: "Not connected", cls: "border-border bg-bg/40 text-text-muted" },
};

export function ConnectCard({
  provider,
  name,
  blurb,
  connectKey,
  state,
}: {
  provider: IntegrationProvider;
  name: string;
  blurb: string;
  /** platform slug used by the connect endpoint (google | meta | shopify) */
  connectKey: string;
  state?: IntegrationState;
}) {
  const status: Status = state?.status ?? "disconnected";
  const meta = STATUS_META[status];
  const isConnected = status === "active";
  const account =
    (state?.settings?.account as string) ||
    (state?.settings?.shop as string) ||
    undefined;

  function onConnect() {
    if (USE_MOCK) {
      // No live engine in demo mode — show what would happen.
      alert(
        `Demo mode — in production this redirects to the ${name} OAuth consent screen.`,
      );
      return;
    }
    window.location.href = connectUrl(connectKey);
  }

  return (
    <div className="flex flex-col rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{name}</h3>
          <p className="mt-0.5 text-xs text-text-muted">{blurb}</p>
        </div>
        <span
          className={clsx(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px]",
            meta.cls,
          )}
        >
          {meta.label}
        </span>
      </div>

      {account && (
        <p className="mb-3 truncate font-mono text-[11px] text-text-muted">
          {account}
        </p>
      )}

      <button
        type="button"
        onClick={onConnect}
        className={clsx(
          "mt-auto rounded-md px-3 py-2 text-xs font-medium transition-colors",
          isConnected
            ? "border border-border text-text-muted hover:text-text-primary"
            : status === "suspended"
              ? "bg-warning text-black hover:opacity-90"
              : "bg-accent text-white hover:bg-accent-hover",
        )}
      >
        {isConnected
          ? "Manage"
          : status === "suspended"
            ? `Reconnect ${name}`
            : `Connect ${name}`}
      </button>
    </div>
  );
}
