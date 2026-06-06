"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type ProfileFit = "paid_heavy" | "early" | "organic_led";

export default function FoundingCohortPage() {
  // Form state
  const [brandName, setBrandName] = useState("");
  const [website, setWebsite] = useState("");
  const [profileFit, setProfileFit] = useState<ProfileFit>("paid_heavy");
  const [monthlyAdSpend, setMonthlyAdSpend] = useState<number | "">("");
  const [platformsConnected, setPlatformsConnected] = useState<string[]>([]);
  const [untrustedNumberDetail, setUntrustedNumberDetail] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PLATFORM_OPTIONS = [
    { id: "shopify", label: "Shopify" },
    { id: "google", label: "Google Ads" },
    { id: "meta", label: "Meta Ads" },
    { id: "ga4", label: "GA4" },
    { id: "quickbooks", label: "QuickBooks" },
    { id: "xero", label: "Xero" },
    { id: "tally", label: "Tally" },
  ];

  const handlePlatformChange = (id: string, checked: boolean) => {
    if (checked) {
      setPlatformsConnected((prev) => [...prev, id]);
    } else {
      setPlatformsConnected((prev) => prev.filter((x) => x !== id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      brandName,
      website,
      profileFit,
      monthlyAdSpend: monthlyAdSpend === "" ? null : Number(monthlyAdSpend),
      platformsConnected,
      untrustedNumberDetail,
      email,
    };

    try {
      await apiFetch<{ applicationId: string }>("/api/v1/cohort/apply", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const scrollToApply = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById("apply-form-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-bold tracking-tight">
            Brand Digital Twin
          </Link>
          <div className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent animate-pulse">
            Cohort Recruitment: 3 spots remaining
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        
        {/* STAGE 1 — DISCOVER (Hero Hook) */}
        <section className="py-12 text-center">
          <h1 className="mb-6 text-4xl font-bold leading-tight sm:text-5xl">
            Your ROAS says you&apos;re winning.
            <br />
            <span className="text-accent">Your bank balance disagrees.</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-text-muted">
            We&apos;re building the system that shows what your campaigns <em>actually</em> return —
            after COGS, shipping, refunds, discounts, and the attribution double-counting your dashboards quietly do.
          </p>
          <p className="mx-auto mb-10 max-w-2xl text-base text-text-muted font-medium">
            We&apos;re opening it to <span className="text-accent font-bold">3 founding brands</span>. Free. Hands-on. You help us find where it breaks; we hand you a profit teardown most agencies charge five figures for.
          </p>
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={scrollToApply}
              className="rounded-lg bg-accent px-8 py-3.5 font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              Apply to the Founding Cohort
            </button>
            <p className="text-xs text-text-muted italic">
              Not a trial. A working partnership with the team building it.
            </p>
          </div>
        </section>

        <hr className="my-16 border-border" />

        {/* STAGE 2 — RECOGNISE */}
        <section className="py-8">
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-center sm:text-3xl">
            You&apos;ve felt this even if no tool ever showed it to you.
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                title: "OOS Traffic Bleed",
                desc: "A top campaign quietly running paid traffic to an out-of-stock product.",
              },
              {
                title: "Margin Evaporation",
                desc: "Profitable ROAS that evaporates once shipping, return fees, and gate costs land.",
              },
              {
                title: "Attribution Fraud",
                desc: "Three ad networks each claiming credit for the exact same sale.",
              },
              {
                title: "Cashflow Disconnect",
                desc: "A month that looked great on the performance dashboard, but left the bank account thin.",
              },
            ].map((item, idx) => (
              <div key={idx} className="rounded-xl border border-border p-5 bg-surface/40">
                <h3 className="mb-2 font-semibold text-accent">{item.title}</h3>
                <p className="text-sm leading-relaxed text-text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-text-muted italic">
            None of your dashboards flagged it — none were built to. They report performance. None of them report profit.
          </p>
        </section>

        <hr className="my-16 border-border" />

        {/* STAGE 3 — TRUST (Ledger Form) */}
        <section className="py-8">
          <h2 className="mb-4 text-2xl font-bold tracking-tight text-center sm:text-3xl">
            Here&apos;s exactly what works right now — and what doesn&apos;t yet.
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center text-sm text-text-muted">
            We&apos;d rather show you the seams than oversell. This is the verified status of our codebase today:
          </p>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Working Now Column */}
            <div className="rounded-xl border border-success/20 bg-success/5 p-6">
              <h3 className="mb-4 text-lg font-bold text-success flex items-center gap-2">
                <span>✓</span> Working Now (Live)
              </h3>
              <ul className="space-y-4 text-sm">
                <li>
                  <strong>POAS Truth Engine:</strong> Calculates real profit per campaign accounting for COGS, shipping, refunds, and last-touch attribution.
                </li>
                <li>
                  <strong>ROAS & POAS Contrast:</strong> Displays the discrepancy on a single screen to expose unprofitable spend.
                </li>
                <li>
                  <strong>Diagnostic Sweep:</strong> Automatically runs sweeps for stockouts, broken pixel signals, and uncapped budgets, ranking finding by dollar-drag.
                </li>
                <li>
                  <strong>Healing Actions:</strong> Provides contextual options to fix leaks (e.g. ad pauses or budget shifts) with clear explanations of what ad tools can/cannot solve.
                </li>
                <li>
                  <strong>Catalog Cold-Start:</strong> Scores variant margins from your catalog to recommend viable starter products before driving paid traffic.
                </li>
                <li>
                  <strong>Graduated Autonomy:</strong> Set your own thresholds (Observe, Review, Autonomous) and override choices.
                </li>
              </ul>
            </div>

            {/* In Progress Column */}
            <div className="rounded-xl border border-warning/20 bg-warning/5 p-6">
              <h3 className="mb-4 text-lg font-bold text-warning flex items-center gap-2">
                <span>◷</span> In Progress (Building)
              </h3>
              <ul className="space-y-4 text-sm">
                <li>
                  <strong>Direct Financial Connects:</strong> Auto-pulling bank balances (RBI AA / Plaid) — simulated right now.
                </li>
                <li>
                  <strong>Owned-Channel Depth:</strong> Incorporating email/SMS flows and organic social metrics into attribution.
                </li>
                <li>
                  <strong>Incrementality Holdouts:</strong> Custom geo-lift control groups to measure absolute conversion lift rather than simple attribution.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <hr className="my-16 border-border" />

        {/* STAGE 4 — SELF-QUALIFY */}
        <section className="py-8">
          <h2 className="mb-4 text-2xl font-bold tracking-tight text-center sm:text-3xl">
            We&apos;re looking for three specific kinds of brand.
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center text-sm text-text-muted">
            We are selecting exactly one partner for each profile to guide our early integrations.
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Profile 1 */}
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 flex flex-col justify-between">
              <div>
                <span className="mb-4 inline-block rounded-full bg-danger/25 px-3 py-0.5 text-xs font-semibold text-danger">
                  🔴 The Paid-Heavy Operator
                </span>
                <p className="text-sm font-semibold mb-2">Target criteria:</p>
                <ul className="text-xs text-text-muted space-y-1 list-disc list-inside mb-4">
                  <li>$20K–$80K/mo ad spend</li>
                  <li>Shopify storefront</li>
                  <li>Messy or partial COGS</li>
                </ul>
                <p className="text-xs leading-relaxed text-text-muted">
                  You spend aggressively on Meta/Google and suspect the profit picture in your bank account is far worse than what your dashboard claims.
                </p>
              </div>
              <button
                onClick={() => {
                  setProfileFit("paid_heavy");
                  scrollToApply({} as any);
                }}
                className="mt-6 w-full rounded-lg border border-danger/45 py-2 text-xs font-semibold text-danger hover:bg-danger/10 transition-colors"
              >
                Apply as Paid-Heavy
              </button>
            </div>

            {/* Profile 2 */}
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-6 flex flex-col justify-between">
              <div>
                <span className="mb-4 inline-block rounded-full bg-warning/25 px-3 py-0.5 text-xs font-semibold text-warning">
                  🟡 The Early Brand
                </span>
                <p className="text-sm font-semibold mb-2">Target criteria:</p>
                <ul className="text-xs text-text-muted space-y-1 list-disc list-inside mb-4">
                  <li>Active catalog</li>
                  <li>Under ~50 lifetime orders</li>
                  <li>Little to no ad history</li>
                </ul>
                <p className="text-xs leading-relaxed text-text-muted">
                  You want to know which products have the unit economics to survive paid acquisition before you burn through budget finding out.
                </p>
              </div>
              <button
                onClick={() => {
                  setProfileFit("early");
                  scrollToApply({} as any);
                }}
                className="mt-6 w-full rounded-lg border border-warning/45 py-2 text-xs font-semibold text-warning hover:bg-warning/10 transition-colors"
              >
                Apply as Early Brand
              </button>
            </div>

            {/* Profile 3 */}
            <div className="rounded-xl border border-success/30 bg-success/5 p-6 flex flex-col justify-between">
              <div>
                <span className="mb-4 inline-block rounded-full bg-success/25 px-3 py-0.5 text-xs font-semibold text-success">
                  🟢 The Organic-Led Brand
                </span>
                <p className="text-sm font-semibold mb-2">Target criteria:</p>
                <ul className="text-xs text-text-muted space-y-1 list-disc list-inside mb-4">
                  <li>Strong organic / SEO</li>
                  <li>Healthy email list</li>
                  <li>Modest paid ads budget</li>
                </ul>
                <p className="text-xs leading-relaxed text-text-muted">
                  You want to map the true incrementality of your paid spend against organic sales and set guardrails where ads aren&apos;t helping.
                </p>
              </div>
              <button
                onClick={() => {
                  setProfileFit("organic_led");
                  scrollToApply({} as any);
                }}
                className="mt-6 w-full rounded-lg border border-success/45 py-2 text-xs font-semibold text-success hover:bg-success/10 transition-colors"
              >
                Apply as Organic-Led
              </button>
            </div>
          </div>
        </section>

        <hr className="my-16 border-border" />

        {/* STAGE 5 — THE EXCHANGE */}
        <section className="py-8">
          <h2 className="mb-8 text-2xl font-bold tracking-tight text-center sm:text-3xl">
            A real partnership, stated plainly.
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-border p-6 bg-surface/20">
              <h3 className="mb-3 text-lg font-bold text-accent">What you get:</h3>
              <ul className="space-y-3 text-sm text-text-muted list-disc list-inside">
                <li>Full access to the platform free of charge for the cohort validation period.</li>
                <li>A complete, hands-on profit teardown of your ad accounts led by our team.</li>
                <li>Direct slack access to the builders to request custom views and integrations.</li>
                <li>Legacy founding pricing locked in permanently when public plans launch.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-border p-6 bg-surface/20">
              <h3 className="mb-3 text-lg font-bold text-accent">What we ask:</h3>
              <ul className="space-y-3 text-sm text-text-muted list-disc list-inside">
                <li>~3 weeks of active testing using real store/ad data.</li>
                <li>Three short check-ins: setup interview, mid-point, and cohort exit interview.</li>
                <li>Permission to observe where you hit usability blockers so we can rewrite code.</li>
                <li>Radical candour about what you find useful and what you ignore.</li>
              </ul>
            </div>
          </div>
        </section>

        <hr className="my-16 border-border" />

        {/* STAGE 6 — APPLY (Interactive Form) */}
        <section id="apply-form-section" className="py-8 max-w-xl mx-auto">
          <h2 className="mb-2 text-2xl font-bold tracking-tight text-center sm:text-3xl">
            Apply to the Founding Cohort
          </h2>
          <p className="mb-8 text-center text-sm text-text-muted">
            Takes 2 minutes. A human will review and reply within 2 business days.
          </p>

          {success ? (
            <div className="rounded-xl border border-success/30 bg-success/10 p-8 text-center">
              <h3 className="text-xl font-bold text-success mb-2">Application Received!</h3>
              <p className="text-sm text-text-muted leading-relaxed">
                Thank you for applying. We have saved your cohort application request. A team member will evaluate your profile and contact you by email within 48 hours to schedule the onboarding audit.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-1">Brand Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DTC Threads"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Website URL *</label>
                <input
                  type="url"
                  required
                  placeholder="e.g. https://dtcthreads.co"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Which profile fits your brand best? *</label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { val: "paid_heavy", label: "🔴 Paid-Heavy" },
                    { val: "early", label: "🟡 Early Brand" },
                    { val: "organic_led", label: "🟢 Organic-Led" },
                  ].map((opt) => (
                    <label
                      key={opt.val}
                      className={`flex items-center justify-center rounded-lg border p-3 cursor-pointer text-xs font-semibold transition-all ${
                        profileFit === opt.val
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border hover:bg-surface"
                      }`}
                    >
                      <input
                        type="radio"
                        name="profileFit"
                        value={opt.val}
                        checked={profileFit === opt.val}
                        onChange={() => setProfileFit(opt.val as ProfileFit)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Approximate Monthly Ad Spend ($) *</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 15000"
                  value={monthlyAdSpend}
                  onChange={(e) => setMonthlyAdSpend(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Which platforms would you connect?</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORM_OPTIONS.map((opt) => {
                    const isChecked = platformsConnected.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`rounded-full border px-4 py-1.5 text-xs font-medium cursor-pointer transition-all ${
                          isChecked
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border hover:bg-surface text-text-muted"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handlePlatformChange(opt.id, e.target.checked)}
                          className="sr-only"
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">
                  What is the one metric or number in your business you wish you could trust but don&apos;t? *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Blended POAS after COGS, or the exact impact of Meta retargeting campaigns..."
                  value={untrustedNumberDetail}
                  onChange={(e) => setUntrustedNumberDetail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm focus:border-accent focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Contact Email *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. founder@dtcthreads.co"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-xs font-semibold text-danger">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-accent py-3 font-semibold text-white transition-colors hover:bg-accent-hover disabled:bg-accent/50"
              >
                {loading ? "Submitting application..." : "Submit Application"}
              </button>

              <p className="text-center text-xs text-text-muted">
                No credit card required. A human reviews every submission and replies within 48 hours.
              </p>
            </form>
          )}
        </section>

        <hr className="my-16 border-border" />

        {/* STAGE 7 — ONBOARD */}
        <section className="py-8">
          <h2 className="mb-8 text-2xl font-bold tracking-tight text-center sm:text-3xl">
            If we&apos;re a fit, here&apos;s the first week.
          </h2>
          <div className="relative border-l border-accent/30 ml-4 md:ml-24 space-y-8 py-2">
            {[
              {
                step: "1. Brief Response & Call",
                desc: "We reply within 2 business days. If we align, we jump on a 20-minute onboarding call to review fit and baseline economics.",
              },
              {
                step: "2. Goal-First Setup",
                desc: "We identify your primary leak point and connect only the essential platforms (Shopify storefront, Google Ads, Meta) to audit it.",
              },
              {
                step: "3. Baseline Margin Scan",
                desc: "Our diagnostic sweep runs inObserve Mode, ranking findings by real-world dollar impact without executing any changes.",
              },
              {
                step: "4. Personal Teardown Call",
                desc: "We walk you through your live dashboard and prescription cards together, identifying where your ROAS is hiding capital loss.",
              },
              {
                step: "5. Three Weeks, Your Pace",
                desc: "Explore Observe Mode or test approvals at your own comfort level. We coordinate weekly to resolve friction and collect feedback.",
              },
            ].map((node, index) => (
              <div key={index} className="relative pl-8">
                {/* Timeline circle */}
                <div className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border border-accent bg-bg flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent"></div>
                </div>
                <h3 className="text-base font-bold text-accent mb-1">{node.step}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{node.desc}</p>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface mt-24">
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
