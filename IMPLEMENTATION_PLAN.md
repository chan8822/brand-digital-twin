# Consolidated Implementation Plan

> Turns every revelation in this doc set into a sequenced, buildable plan.
> Source docs: `ARCHITECTURE_VISION` · `BRAND_BASELINE_SCAN` · `PROFIT_DATA_MODEL`
> · `HEALING_RECOMMENDATIONS` · `USER_JOURNEYS` · `INTEGRATIONS_3P` · `PHASED_ROADMAP`.

---

## Current State (verified @ commit 0bb1824)

**Real and working:**
POAS truth engine · multi-tenant isolation (DB-enforced) · governance + trust
ledger · Shopify/Woo/Magento orders · Google Ads + Meta spend · real Google Ads
write path · runway → spend throttle · MCC + GMC real enumeration · cold-start
margin discovery · diagnostic sweep (2 of 5 checks).

**Newly landed (commit 0bb1824 — closes most of Phase 1 Section E):**
- ✅ Daily POAS scheduler (`poas_scheduler.ts` — `setInterval`, per-tenant, signal dedup)
- ✅ ROAS + POAS in every report (`poas_calculator.ts` — both fields computed)
- ✅ 5 semantic tiers with per-tier $ caps (OBSERVE/REVIEW/ASSISTED/AUTONOMOUS/C_SUITE)
- ✅ Idempotency store (`supabase_client.getAuditLog` + cached-return in `govern()`)
- ✅ Settling window (`verifyWindowMs` — verification deferred before postMetrics read)

**Productionization caveats on the new work (hardening, not blockers):**
- Scheduler uses in-process `setInterval` — not durable across restarts; move to a
  queue/cron (BullMQ) for production.
- Settling window uses in-process `setTimeout` — a real 24–72h window must be a
  persisted/queued job, or a process restart loses the pending verification.

**Everything in our doc set since is still net-new and unbuilt:** baseline scan,
healing engine, profit-readiness/COGS easing, 3P adoption layer, the 360°
channel expansion.

---

## The Build, in Four Phases

Each phase ends at a usable milestone. The LP publishes at the end of Phase 2.

---

### PHASE 1 — Truth + Action + Adoption Foundation
*Goal: every current claim is literally true, and the insight→action loop works.*

**A. Foundation 3P (buy the plumbing first)**
- [ ] Auth: integrate **WorkOS/Clerk** — solo login + agency SSO/org hierarchy
- [ ] Unified aggregator: integrate **Codat/Rutter** — pulls COGS/financials from QuickBooks/Xero/Tally/Zoho
- [ ] Document parsing: **Mindee/Nanonets** — supplier-invoice → SKU cost mapping

**B. Profit data completeness (`PROFIT_DATA_MODEL`)**
- [ ] Silent COGS sweep across all connected sources before asking the user
- [ ] Category-average provisional estimate for missing-cost SKUs (flagged estimated)
- [ ] Pareto COGS entry UI — top 8–12 spend SKUs only; CSV + inline grid + % -of-price
- [ ] Profit Readiness indicator (live %, links to each fix)
- [ ] Payment-fee + shipping-cost ingestion (exact where connected, derive otherwise)

**C. Brand Baseline Scan — Stage 0 (`BRAND_BASELINE_SCAN`)**
- [ ] Observable scan on domain alone: presence, paid, perception, trust, social
- [ ] Baseline card UI + "fixes you can make today" improvement layer
- [ ] Persist baseline as the context layer for the healing engine

**D. Healing engine (`HEALING_RECOMMENDATIONS`)**
- [ ] `diagnoseRootCause()` in `risk_radar.ts` — trace POAS driver per campaign
- [ ] `analyzeProfitability()` returns structured tier-1/2/3 prescriptions
- [ ] Three-zone healing card (OS acts / user decides / ads can't fix)
- [ ] Context-completeness caveat on every card (declares what it can't see)
- [ ] Incrementality flag in `decide()` — suspect campaigns held at Tier 2

**E. Close the open correctness gaps**
- [x] ROAS + POAS dual display (the "two numbers / gap" hero) — *landed 0bb1824*
- [x] 5-tier semantic naming + per-tier $ caps (OBSERVE→C_SUITE) — *landed 0bb1824*
- [x] Daily POAS scheduler (per tenant) — *landed 0bb1824; harden: move off in-process setInterval*
- [x] Diagnostic sweep — all 5 checks live: `scanConversionTracking`, `scanCheckoutEvents`, `scanBudgetCappedWinners` + existing 2 — *landed d7bb573*
- [x] Idempotency store (replayed POST dedup) — *landed 0bb1824*
- [x] Time-delayed verification (settling window) — *landed 0bb1824; harden: persist the pending verification job*
- [x] Zero-order cold-start path (catalog fallback via `getVariants`, `MarginDiscoveryResult` union, `needs_cogs` routing) — *landed d7bb573*
- [ ] RBI AA real connection (India) · Plaid (global)

*Section E remaining: real bank connections only.*

*Exit: a brand connects, sees its baseline, gets true POAS, and receives
actionable healing cards. Internal dogfood. No public LP yet.*

---

### PHASE 2 — Owned + Earned Media + Decisions That Find You
*Goal: useful to brands not running paid ads. LP publishes here.*

**A. Channel ingestion (both markets via shared `platform_adapter.ts`)**
- [ ] Email: Klaviyo, Mailchimp (global), Netcore (India)
- [ ] Organic Search: Google Search Console
- [ ] Web Analytics: GA4 API — funnel, cohort, conversion paths
- [ ] Reviews: Google Business, Trustpilot (global), JustDial (India)
- [ ] SMS: MSG91/Exotel (India), Twilio (global)
- [ ] Social Organic: Instagram Graph, FB Page Insights, LinkedIn Pages

**B. Healing engine extends across channels**
- [ ] Cross-channel guards live (organic-rank check, competitor-defense, email-attribution context)
- [ ] Email + organic healing cards (list health, indexing, content gaps)

**C. Adoption 3P**
- [ ] Notifications: **Knock** → email/in-app/Slack/WhatsApp/SMS fan-out
- [ ] In-product guidance: **CommandAI/Userflow** — guided onboarding + ⌘K
- [ ] Billing: **Lago** — suggest-an-amount conversion flow

*Exit: organic-only and email-primary journeys are real. Decisions reach users
on WhatsApp/Slack without login. **Publish the landing page.***

---

### PHASE 3 — Commerce Expansion
*Goal: every channel where a brand transacts.*

- [ ] Marketplace: Flipkart/Meesho (India), Amazon SP-API (both)
- [ ] Customer LTV engine + segments + per-customer churn
- [ ] Real financials: Tally HTTP (India), QuickBooks/Xero (global) via Codat
- [ ] Payment processors: Razorpay (India), Stripe/PayPal (global) — exact fees
- [ ] Additional paid: TikTok, LinkedIn, Bing, Pinterest
- [ ] Affiliate: VCommission (India), Impact.com (global)
- [ ] No-code escape hatch: **Zapier/Make** embedded

*LP expands to full 360° claim.*

---

### PHASE 4 — Causal Intelligence
*Goal: optimize correctly, not just observe. Raise the autonomy ceiling safely.*

- [ ] Incrementality: geo/time holdout testing (upgrades POAS to causal)
- [ ] LTV-adjusted POAS (subscription/repeat economics)
- [ ] Marginal-returns curve (replaces average-ROI scaling)
- [ ] Customer support signals: Zendesk/Freshworks/Intercom (via Merge)
- [ ] Live competitive signals

*LP leads with proven incrementality + raised autonomy ceiling.*

---

## Public Launch Track (parallel to channel phases — decided this session)

Decisions: **build now** (validation deferred to soft-launch cohort), **build
in-house** (extend existing primitives, not WorkOS/Stripe/Codat). Specs:
`A-PHASE_BUILD_SPEC.md` · `B-PHASE_BUILD_SPEC.md` · `C-PHASE_BUILD_SPEC.md`.

**PUB-A — Usable by a stranger**
- [ ] A0: start Google/Meta/Shopify app review + legal engagement (external clocks)
- [ ] A1: in-house auth (extend `auth.ts`): signup/verify/login/refresh/reset + org→brand model
- [ ] A2: OAuth connect (Google Ads/Meta/Shopify) via `CredentialVault`
- [ ] A3: React/Next SPA, 9 screens wired to real endpoints + `GET /profit-readiness`

**PUB-B — Lawful & trustworthy**
- [ ] B1: in-house data deletion (cascade) + export (GDPR/DPDP)
- [ ] B2: legal pages + acceptance log
- [ ] B3: production ops (error tracking, metrics/alerts, CI/CD, backups, secrets, runbook)
- [ ] B4: abuse controls (quotas, OBSERVE-by-default + new-account spend cap)
- [ ] B5: atomic job claim (`FOR UPDATE SKIP LOCKED`) before multi-instance

**PUB-C — Self-serve value + money**
- [ ] C1: in-house COGS connectors (Zoho/QuickBooks/Xero on `tally_adapter` pattern) + readiness gate
- [ ] C2: in-house billing state machine + day-15 suggest-an-amount + Razorpay/card rail

*Exit: a stranger self-serves signup → connect → trustworthy POAS → healing cards
→ day-15 names a price → activates. Then the deferred 3-brands validation runs as
a soft-launch cohort.*

---

## Critical Path & Dependencies

```
Auth (WorkOS) ─┐
               ├─→ everything sits on this
Codat/Rutter ──┴─→ COGS sweep ─→ trustworthy POAS ─→ healing cards
                                                         │
Baseline Scan ───────────────────→ context layer ───────┤
                                                         ▼
                              Phase 2 channels ─→ cross-channel healing ─→ LP
                                                         │
                              Knock/WhatsApp ─→ decisions-without-login
```

**The gating dependency:** Codat/Rutter + COGS sweep gate trustworthy POAS,
which gates the healing cards, which are the product's core value. Build that
chain first. Everything else is expansion around a working core.

---

## Sequencing Principle

1. **Buy plumbing before building features** (auth, aggregator, OCR up front)
2. **Truth before action** — POAS must be trustworthy before healing prescribes
3. **Observable before owned** — baseline scan delivers value before any OAuth
4. **Decisions before dashboards** — healing cards + notifications over more charts
5. **Earn the claim before making it** — LP waits for Phase 2

---

## What I'd Validate Before Phase 2 (the honest check)

Per the earlier candid review: get Phase 1 in front of **3 real brands with
messy data** and watch where they stall. The plan assumes the COGS-easing and
healing cards land — but real brands stall in places no doc predicts. That
validation should gate the Phase 2 investment, not run parallel to it.
