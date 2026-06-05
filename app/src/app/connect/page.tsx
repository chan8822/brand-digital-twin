"use client";

/**
 * Connect-your-stack screen (A3.2) — the entry point of the self-serve flow.
 * Kicks off the live OAuth flow (A2, a09e913) per platform and reflects current
 * integration state. The core three for Phase A: Google Ads, Meta, Shopify.
 */
import { useMemo } from "react";
import { useIntegrations } from "@/lib/queries";
import { ConnectCard } from "@/components/ConnectCard";
import { Nav } from "@/components/Nav";
import { USE_MOCK } from "@/lib/api";
import type { IntegrationProvider, IntegrationState } from "@/lib/types";

const PLATFORMS: {
  provider: IntegrationProvider;
  name: string;
  blurb: string;
  connectKey: string;
}[] = [
  {
    provider: "shopify",
    name: "Shopify",
    blurb: "Orders, products, variant costs — the revenue + COGS truth.",
    connectKey: "shopify",
  },
  {
    provider: "google_ads",
    name: "Google Ads",
    blurb: "Spend, clicks, conversions — and the write path for fixes.",
    connectKey: "google",
  },
  {
    provider: "meta_ads",
    name: "Meta Ads",
    blurb: "Advantage+ and prospecting spend, with budget controls.",
    connectKey: "meta",
  },
];

export default function ConnectPage() {
  const { data, isLoading } = useIntegrations();

  // Index live state by provider; meta_ads_api also maps to the Meta tile.
  const byProvider = useMemo(() => {
    const map = new Map<string, IntegrationState>();
    for (const s of data ?? []) map.set(s.provider, s);
    return map;
  }, [data]);

  function stateFor(p: IntegrationProvider): IntegrationState | undefined {
    return byProvider.get(p) ?? (p === "meta_ads" ? byProvider.get("meta_ads_api") : undefined);
  }

  const connectedCount = (data ?? []).filter((s) => s.status === "active").length;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Connect your stack</h1>
            <p className="mt-1 text-sm text-text-muted">
              Link your store and ad accounts. The more you connect, the more
              trustworthy your POAS.
            </p>
          </div>
          {!isLoading && (
            <span className="rounded-full border border-border px-3 py-1 text-xs text-text-muted">
              {connectedCount} / {PLATFORMS.length} connected
            </span>
          )}
        </header>

        {USE_MOCK && (
          <div className="mb-6 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2 text-xs text-accent">
            Demo data — connect buttons explain the flow. Live mode redirects to
            real OAuth (A2). Linked state needs{" "}
            <code className="font-mono">GET /api/v1/integrations</code> (A2.4).
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-xl border border-border bg-surface"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PLATFORMS.map((p) => (
              <ConnectCard
                key={p.provider}
                provider={p.provider}
                name={p.name}
                blurb={p.blurb}
                connectKey={p.connectKey}
                state={stateFor(p.provider)}
              />
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-text-muted">
          Accounting sources (QuickBooks, Xero, Zoho) and bank connections come
          next — they sharpen COGS and cash truth (Phase C).
        </p>
      </main>
    </>
  );
}
