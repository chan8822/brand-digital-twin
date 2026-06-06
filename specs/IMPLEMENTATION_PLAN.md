# Consolidated Implementation Plan

> Turns every strategic objective into a sequenced, buildable plan.
> Source docs: `ARCHITECTURE_VISION` · `BRAND_BASELINE_SCAN` · `PROFIT_DATA_MODEL`
> · `HEALING_RECOMMENDATIONS` · `USER_JOURNEYS` · `INTEGRATIONS_3P` · `PHASED_ROADMAP`.

---

## Current State (verified @ commit 646a2cd)

**Real and working:**
POAS truth engine · multi-tenant isolation (DB-enforced) · governance + trust
ledger · Shopify/Woo/Magento orders · Google Ads + Meta spend · real Google Ads
write path · runway → spend throttle · MCC + GMC real enumeration · cold-start
margin discovery · diagnostic sweep (all 5 checks live).

**shipped in large merge (commit 646a2cd):**
- ✅ Daily POAS scheduler (`poas_scheduler.ts`)
- ✅ ROAS + POAS in every report (`poas_calculator.ts`)
- ✅ 5 semantic tiers with per-tier $ caps (OBSERVE/REVIEW/ASSISTED/AUTONOMOUS/C_SUITE)
- ✅ Idempotency store (`supabase_client.getAuditLog`)
- ✅ Settling window (`verifyWindowMs` before postMetrics read)
- ✅ Costs & billing engines + UI screens + support widget + admin queue

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
- [ ] Zero-order cloud billing: Ingest infrastructure costs (GCP/AWS billing APIs)

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
- [x] ROAS + POAS dual display (the "two numbers / gap" hero)
- [x] 5-tier semantic naming + per-tier $ caps (OBSERVE→C_SUITE)
- [x] Daily POAS scheduler (per tenant)
- [x] Diagnostic sweep — all 5 checks live: `scanConversionTracking`, `scanCheckoutEvents`, `scanBudgetCappedWinners` + existing 2
- [x] Idempotency store (replayed POST dedup)
- [x] Time-delayed verification (settling window)
- [x] Zero-order cold-start path (catalog fallback via `getVariants`, `MarginDiscoveryResult` union, `needs_cogs` routing)
- [ ] RBI AA real connection (India) · Plaid (global)

**F. Hardening Safety Safeguards**
- [ ] Harden scheduler: Migrate `poas_scheduler.ts` off in-process `setInterval` to a database-backed `pending_jobs` queue.
- [ ] Pre-flight limits: Deploy `CooldownManager` to enforce API rate limits and execution intervals.
- [ ] Telemetry circuit breaker: Connect `/metrics` failures to an automated fallback read-only state.
- [ ] Log scrubbing: Implement sanitization middleware to redact sensitive keys (Bearer tokens, PAN) from database error logs.

---

### PHASE 2 — Owned + Earned Media & Search AI-Readiveness
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

**C. AI Search & Optimization Diagnostics**
- [ ] GenAI Search Optimization (GEO) & SEO Diagnostics: landing page alt-tag/RAG sweeps, crawl health alerts.
- [ ] Merchant Feed Hygiene Control: GMC attribute validation sweep.

**D. Adoption 3P**
- [ ] Notifications: **Knock** → email/in-app/Slack/WhatsApp/SMS fan-out
- [ ] In-product guidance: **CommandAI/Userflow** — guided onboarding + ⌘K
- [ ] Billing: **Lago** — suggest-an-amount conversion flow

---

### PHASE 3 — Commerce & Multi-Vertical Expansion
*Goal: every channel where a brand transacts.*

- [ ] Marketplace: Flipkart/Meesho (India), Amazon SP-API (both)
- [ ] Customer LTV engine + segments + per-customer churn
- [ ] Real financials: Tally HTTP (India), QuickBooks/Xero (global) via Codat
- [ ] Payment processors: Razorpay (India), Stripe/PayPal (global) — exact fees
- [ ] Additional paid: TikTok, LinkedIn, Bing, Pinterest
- [ ] Affiliate: VCommission (India), Impact.com (global)
- [ ] No-code escape hatch: **Zapier/Make** embedded
- [ ] Lead Generation adaptation: HubSpot/Salesforce CRM ingestion, PROAS pipeline calculations.
- [ ] Google Ads Data Manager (GADM) Integration: offline lead uploads with WBRAID/GBRAID.

---

### PHASE 4 — Causal Intelligence & Media Sync
*Goal: optimize correctly, not just observe. Raise the autonomy ceiling safely.*

- [ ] Incrementality: geo/time holdout testing (upgrades POAS to causal)
- [ ] LTV-adjusted POAS (subscription/repeat economics)
- [ ] Marginal-returns curve (replaces average-ROI scaling)
- [ ] Customer support signals: Zendesk/Freshworks/Intercom (via Merge)
- [ ] Live competitive signals
- [ ] Offline Profit conversion sync: Daily gross profit uploads to Google/Meta APIs using transaction identifiers.
- [ ] Dynamic SKU-to-campaign budget reallocation.
- [ ] Brand Awareness adaptation: YouTube Brand Lift study APIs, Cost Per Lifted User, frequency capping.
