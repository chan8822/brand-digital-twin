"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isAuthed, USE_MOCK } from "@/lib/api";

/**
 * Marketing landing page (`/`). Strategy: PLG via the graduated-autonomy hook
 * (Option C) + agency white-label channel (Option B). The narrative leads with
 * profit (POAS), proves value with an in-context operational save (Risk Radar),
 * and converts on the autonomy ladder — start free in OBSERVE, climb as you trust it.
 *
 * Live-mode authed users skip straight to the product; everyone else sees the LP.
 */

const TIERS = [
  { name: "OBSERVE", tag: "Free", desc: "Read-only twin. We watch, compute your real POAS, and flag leaks. We touch nothing." },
  { name: "REVIEW", tag: "", desc: "We propose every fix. Nothing executes without your explicit approval." },
  { name: "ASSISTED", tag: "", desc: "We execute small, capped fixes automatically. Anything bigger escalates to you." },
  { name: "AUTONOMOUS", tag: "", desc: "We act within a daily spend cap you set. Outliers queue for sign-off." },
  { name: "C‑SUITE", tag: "", desc: "Full autonomy inside the policies and caps you configure. The twin runs the desk." },
];

const INTEGRATIONS = [
  "Google Ads",
  "Meta Ads",
  "Shopify",
  "QuickBooks",
  "Xero",
  "Zoho Books",
  "Tally",
];

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Live mode: an authenticated visitor doesn't need the pitch — send them in.
    // Mock mode always shows the LP so the demo is explorable.
    if (!USE_MOCK && isAuthed()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const primaryHref = USE_MOCK ? "/connect" : "/signup";
  const primaryLabel = USE_MOCK ? "Explore the demo" : "Start free";

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      {/* ── Sticky nav ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-bold tracking-tight">Brand Digital Twin</span>
          <div className="flex items-center gap-4">
            <Link
              href="#agencies"
              className="hidden text-sm text-text-muted transition-colors hover:text-text-primary sm:inline"
            >
              For agencies
            </Link>
            <Link
              href="/login"
              className="text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              Sign in
            </Link>
            <Link
              href={primaryHref}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="mx-auto mb-5 w-fit rounded-full border border-accent/30 bg-accent/10 px-4 py-1 text-xs font-medium text-accent">
          Start free in Observe Mode — no card, no write access
        </div>
        <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
          Your ad platform optimises for clicks.
          <br />
          <span className="text-accent">We optimise for cash.</span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-text-muted">
          Brand Digital Twin connects your store, ad accounts, and books to compute your
          real Profit on Ad Spend — then diagnoses what&apos;s draining it and fixes it,
          on a leash you control. Watch-only to fully autonomous, you decide how far.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={primaryHref}
            className="rounded-lg bg-accent px-8 py-3 font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {primaryLabel}
          </Link>
          <Link
            href="#agencies"
            className="rounded-lg border border-border px-8 py-3 text-sm text-text-muted transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            I&apos;m an agency →
          </Link>
        </div>
        <p className="mt-5 text-xs text-text-muted">
          Connect in minutes · Bank-grade tenant isolation · You hold the kill switch
        </p>
      </section>

      {/* ── ROAS vs POAS ── */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-text-muted">
            The number that&apos;s lying to you
          </p>
          <p className="mx-auto mb-8 max-w-2xl text-center text-sm text-text-muted">
            Ad platforms bid on ROAS — revenue over spend. It&apos;s margin-blind. Strip out
            what an order actually costs you and the picture inverts.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-danger/25 bg-danger/5 p-7">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-danger">
                ROAS — what your dashboard shows
              </p>
              <p className="mb-2 font-mono text-4xl font-bold tabular-nums">4.2×</p>
              <p className="mb-3 font-mono text-xs text-text-muted">
                Revenue ÷ Ad&nbsp;Spend
              </p>
              <p className="text-sm leading-relaxed text-text-muted">
                Looks healthy. Ignores COGS, shipping, fulfillment, returns, marketplace
                and payment fees. This 4.2× can be losing money on every order.
              </p>
            </div>
            <div className="rounded-xl border border-success/25 bg-success/5 p-7">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-success">
                POAS — your real margin return
              </p>
              <p className="mb-2 font-mono text-4xl font-bold tabular-nums">1.8×</p>
              <p className="mb-3 font-mono text-xs text-text-muted">
                (Revenue − COGS − Shipping − Fees) ÷ Ad&nbsp;Spend
              </p>
              <p className="text-sm leading-relaxed text-text-muted">
                The actual profit your ads generate. Now you can see which campaigns make
                money, which quietly burn it, and exactly how much is at stake.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── The hook: in-context operational save ── */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="rounded-2xl border border-accent/20 bg-accent/5 p-8 sm:p-12">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
            The moment it pays for itself
          </p>
          <h2 className="mb-4 max-w-2xl text-3xl font-bold tracking-tight">
            It catches the leak you&apos;d have found in next month&apos;s P&amp;L
          </h2>
          <p className="mb-6 max-w-2xl leading-relaxed text-text-muted">
            Your bestseller just sold out — but the campaign promoting it is still
            spending. The Risk Radar sees the stockout the second it happens, isolates the
            affected ad group, and either pauses it or queues the pause for your nod. One
            save like that, and the twin has already earned its keep.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { k: "Out-of-stock spend", v: "Pause ads for SKUs about to stock out — before the budget bleeds." },
              { k: "Tracking gone dark", v: "Catch a pixel that stopped firing before a week of spend goes unattributed." },
              { k: "Capped winners", v: "Surface profitable campaigns throttled by their own budget cap — room to scale." },
            ].map((x) => (
              <div key={x.k} className="rounded-xl border border-border bg-bg p-5">
                <p className="mb-1.5 text-sm font-semibold">{x.k}</p>
                <p className="text-xs leading-relaxed text-text-muted">{x.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <h2 className="mb-3 text-center text-3xl font-bold tracking-tight">
          Profit clarity in three steps
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-text-muted">
          No data warehouse. No analyst. No card to start.
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Connect your stack",
              desc: "OAuth Google Ads, Meta, and Shopify in minutes. Add QuickBooks, Xero, Zoho Books, or Tally to lock in accurate COGS.",
            },
            {
              step: "02",
              title: "See your real POAS",
              desc: "The engine surfaces POAS beside ROAS for every campaign, ranked worst-first by dollar drag. No spreadsheets, no guesswork.",
            },
            {
              step: "03",
              title: "Let it fix what's broken",
              desc: "Get a precise prescription per campaign. Approve each fix yourself, or hand the twin a leash and let it execute within your caps.",
            },
          ].map((s) => (
            <div key={s.step} className="rounded-xl border border-border bg-surface p-6">
              <p className="mb-3 font-mono text-xs text-accent">{s.step}</p>
              <h3 className="mb-2 font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-text-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust Tiers / Autonomy ladder (the core hook) ── */}
      <section id="autonomy" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="mb-3 text-center text-3xl font-bold tracking-tight">
            You control how far it goes
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-text-muted">
            Five tiers, from read-only to fully autonomous. Start free in Observe. Climb
            the ladder as the twin earns your trust — and drop back down instantly, anytime.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {TIERS.map((t, i) => (
              <div
                key={t.name}
                className="flex-1 rounded-xl border border-border bg-bg p-4 transition-colors hover:border-accent/40"
                style={{ opacity: 0.55 + i * 0.11 }}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="font-mono text-xs font-semibold text-accent">{t.name}</p>
                  {t.tag && (
                    <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
                      {t.tag}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-text-muted">{t.desc}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-xl text-center text-xs text-text-muted">
            Every tier is governed by per-action and daily spend caps. Anything over the
            line queues for a human. Every action is logged, reversible, and auditable.
          </p>
        </div>
      </section>

      {/* ── For agencies (Option B) ── */}
      <section id="agencies" className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid items-center gap-10 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
              For agencies
            </p>
            <h2 className="mb-4 text-3xl font-bold tracking-tight">
              Run your whole portfolio on profit, not promises
            </h2>
            <p className="mb-6 leading-relaxed text-text-muted">
              Index every client from one console. Each brand is isolated at the database
              level — no cross-tenant leaks, ever — so you can manage a book of accounts
              programmatically and report real margin lift to every client, not just ROAS.
            </p>
            <ul className="space-y-3 text-sm text-text-muted">
              {[
                "One-to-many onboarding — connect a client and the twin self-indexes their stack",
                "Per-client autonomy tiers and spend caps you set on their behalf",
                "Request-scoped tenant isolation — client data never bleeds across accounts",
                "White-label ready — your brand, our engine underneath",
              ].map((x) => (
                <li key={x} className="flex gap-2.5">
                  <span className="mt-0.5 text-accent">→</span>
                  <span>{x}</span>
                </li>
              ))}
            </ul>
            <Link
              href={USE_MOCK ? "/connect" : "/signup"}
              className="mt-8 inline-block rounded-lg border border-accent/40 px-6 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              Talk to us about portfolios →
            </Link>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-text-muted">
              Portfolio view
            </p>
            <div className="space-y-3">
              {[
                { name: "Glow & Co", poas: "0.6×", state: "3 leaks flagged", tone: "danger" },
                { name: "Nutra Boost", poas: "0.3×", state: "Bundle bleeding", tone: "danger" },
                { name: "Cleansly", poas: "3.2×", state: "Scale candidate", tone: "success" },
              ].map((b) => (
                <div
                  key={b.name}
                  className="flex items-center justify-between rounded-lg border border-border bg-bg px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">{b.name}</p>
                    <p className="text-xs text-text-muted">{b.state}</p>
                  </div>
                  <span
                    className={`font-mono text-lg font-bold tabular-nums ${
                      b.tone === "success" ? "text-success" : "text-danger"
                    }`}
                  >
                    {b.poas}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight">
            Built for your whole stack
          </h2>
          <p className="mb-10 text-text-muted">
            Connect what you already run. Everything feeds one number: your POAS.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {INTEGRATIONS.map((name) => (
              <span
                key={name}
                className="rounded-full border border-border bg-bg px-5 py-2 text-sm text-text-muted"
              >
                {name}
              </span>
            ))}
          </div>
          <p className="mt-6 text-xs text-text-muted">
            More commerce and accounting platforms rolling out continuously.
          </p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h2 className="mb-4 text-3xl font-bold tracking-tight">
          Pay what it&apos;s worth to your business
        </h2>
        <p className="mb-8 text-text-muted">
          Start free in Observe Mode. When you&apos;re ready to act, we recap the profit
          we surfaced or protected and invite you to name a recurring monthly amount. No
          tiers, no feature gates — you pay what the value is genuinely worth to you.
        </p>
        <div className="rounded-xl border border-accent/20 bg-accent/10 p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
            Pricing model
          </p>
          <p className="mb-1 text-2xl font-bold">Suggest-an-amount</p>
          <p className="text-sm text-text-muted">
            Free Observe tier → value recap → you name a recurring monthly price
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-5xl px-6 pb-24 text-center">
        <h2 className="mb-4 text-4xl font-bold tracking-tight">
          See your real POAS today
        </h2>
        <p className="mb-8 text-text-muted">
          Free to start. No card. Connect your store and watch the twin go to work.
        </p>
        <Link
          href={primaryHref}
          className="rounded-lg bg-accent px-10 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          {primaryLabel}
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Trending Media Service Pvt. Ltd.</p>
          <nav className="flex gap-5">
            <Link href="/legal/tos" className="transition-colors hover:text-text-primary">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-text-primary">
              Privacy Policy
            </Link>
            <Link href="/legal/dpa" className="transition-colors hover:text-text-primary">
              DPA
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
