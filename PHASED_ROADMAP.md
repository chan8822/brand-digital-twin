# Phased Roadmap — Brand Digital Twin OS → 360° Coverage

> Build the OS to earn the claim. LP publishes when Phase 2 ships.
> Both India and global markets in parallel via the shared PlatformAdapter interface.

---

## Baseline (current state @ commit 0bb1824)

**Real and working:**
POAS truth engine · multi-tenant isolation · governance + trust ledger ·
Shopify / WooCommerce / Magento order ingestion · Google Ads + Meta Ads spend ·
sGTM measurement spine · inventory-aware spend pause · cash runway throttle ·
MCC + GMC real enumeration · cold-start margin discovery · diagnostic sweep
(2 of 5 checks real) · **daily POAS scheduler · ROAS+POAS dual report · 5 semantic
autonomy tiers with per-tier caps · idempotency store · settling-window verification**
(all landed in 0bb1824).

**Coverage:** ~37% of 360° digital footprint. Strong paid + commerce core.
Organic, email, marketplace, support: zero or minimal.

---

## Phase 1 — Close Every Open Claim (make the current LP literally true)

*Target: every sentence in the landing page is backed by real code.*

| Item | What's needed | Market |
|------|--------------|--------|
| **Brand Baseline Scan (Stage 0)** | Observable-footprint scan on domain alone — presence, paid, perception, trust, social — via public sources. Becomes the healing engine's context layer + first-value-before-OAuth. See `BRAND_BASELINE_SCAN.md`. | Both |
| **Healing recommendations engine** | `diagnoseRootCause()` in `risk_radar.ts`; structured tier-1/2/3 prescriptions from `analyzeProfitability()`; three-zone card UX consulting the baseline context layer. See `HEALING_RECOMMENDATIONS.md`. | Both |
| **Incrementality flagging** | Add consistency check to `decide()` — suspected-non-incremental campaigns held at Tier 2. Holdout test prompt in healing card Zone 1. | Both |
| **ROAS + POAS dual display** | Render both metrics side-by-side; gap line as the hero number. | Both |
| **5-tier semantic naming + per-tier $ caps** | Name tiers Observe / Suggest / Optimize / Lead / Mastery. Enforce per-tier dollar limits, not just tenant-level cap. | Both |
| **Daily POAS scheduler** | Cron job invoking `PoasCalculator.calculate()` per tenant nightly. | Both |
| **Diagnostic sweep — 3 missing checks** | No conversion tracking · budget-capped POAS winners · checkout events not firing. | Both |
| **Idempotency store** | Dedup replayed POST requests — now that writes are real, a replay = a real duplicate budget change. | Both |
| **Time-delayed verification** | postMetrics settling window (24–72h) before VERIFY phase re-reads metrics. | Both |
| **Profit Readiness UI** | `PROFIT_DATA_MODEL.md` — progressive precision model, Pareto-prioritised COGS entry, bulk upload. | Both |
| **RBI AA real bank connection** | Replace mock HDFC account with real AA consent flow. | India |
| **Plaid bank connection** | Real bank balance for global markets. | Global |
| **Zero-order cold-start path** | `generateMarginDiscoveryCampaign()` currently needs some order history. Add catalog-cost path for brands with products but no orders. | Both |

*LP: not published. Internal use only until Phase 2 ships.*

---

## Phase 2 — Owned + Earned Media Layer

*Goal: useful to brands not running paid ads. The OS becomes a 360° growth tool
for organic, email, and content-led brands.*

| Domain | Connectors | India priority | Global priority |
|--------|-----------|---------------|-----------------|
| **Email marketing** | Klaviyo, Mailchimp (global), Netcore / MailerLite (India) | High | High |
| **Organic search** | Google Search Console — keyword rankings, indexing, impressions | High | High |
| **Web analytics** | GA4 API — session funnel, cohort analysis, conversion paths | High | High |
| **Reviews & reputation** | Google Business Profile, JustDial (India), Trustpilot (global) | High | High |
| **SMS** | MSG91 / Exotel (India), Twilio (global) | High | Medium |
| **Social organic** | Instagram Graph API, Facebook Page Insights, LinkedIn Pages | Medium | Medium |

*Deliverables: organic-only and email-primary onboarding journeys become real.
The healing engine covers email-side levers (list health, send frequency) and
organic gaps (indexing errors, high-margin SKU with zero organic traffic).*

**LP publishes at Phase 2 completion.** Paid + commerce + organic + email
story is real and defensible.

---

## Phase 3 — Commerce Expansion Layer

*Goal: every channel where a brand actually transacts.*

| Domain | Connectors | India priority | Global priority |
|--------|-----------|---------------|-----------------|
| **Marketplace** | Flipkart Seller API, Meesho (India) · Amazon SP-API (both) | Critical | High |
| **Customer LTV** | LTV calculation engine · customer segments · churn prediction per customer (not just client-level) | High | High |
| **Financial (real)** | Tally real HTTP (India) · QuickBooks / Xero (global) · Zoho Books | High | High |
| **Payment processors** | Razorpay (India) · Stripe / PayPal (global) — exact per-transaction fees | High | High |
| **Additional paid platforms** | TikTok Ads · LinkedIn Campaign Manager · Microsoft/Bing Ads · Pinterest | Medium | High |
| **Affiliate / influencer** | VCommission (India) · Impact.com (global) · UTM-based attribution | Medium | Medium |

*LP expands to full 360° claim — marketplace, full CRM, all paid platforms covered.*

---

## Phase 4 — Causal Intelligence Layer

*Goal: the OS closes the loop between advertising and its real-world consequences,
and optimises correctly rather than just observing.*

| Item | What it unlocks |
|------|----------------|
| **Incrementality (geo/time holdout)** | Upgrades POAS from correlational to causal. Required before raising the autonomy ceiling beyond Tier 2 on brand/retargeting campaigns. |
| **LTV-adjusted POAS** | Subscription and repeat-purchase brand economics. First purchase can be unprofitable if LTV justifies it — the OS knows when. |
| **Marginal returns curve** | Replaces average ROI scaling (`roi >= 3.0 → ×1.2`). Scales to the margin, not the average. Required before Tier 3+ autonomy is safe. |
| **Customer support signals** | Zendesk / Freshworks / Intercom — ticket spikes predict ad performance problems before the data shows them. |
| **Competitive signals (live)** | Competitor ad launches, price changes — flags when competitive context changes mid-flight. |

*LP leads with raised autonomy ceiling: "proven incrementality, LTV-aware,
autonomy up to Tier 4 on verified incremental campaigns."*

---

## LP Publishing Gates

| Gate | LP action |
|------|-----------|
| Phase 1 complete | Internal dogfood only. No public LP. |
| **Phase 2 complete** | **Publish LP.** Paid + commerce + organic + email. |
| Phase 3 complete | LP expands to full 360° — marketplace, LTV, all paid channels. |
| Phase 4 complete | LP leads with causal measurement and raised autonomy ceiling. |

---

## Both-Market Adapter Strategy

All connectors built against the shared `platform_adapter.ts` interface.
No market assumptions in shared logic.

**India adapters:** RBI AA · Tally · Flipkart · Meesho · MSG91 · Exotel · WhatsApp · JustDial · Razorpay · VCommission

**Global adapters:** Plaid · QuickBooks · Xero · Amazon SP-API · Twilio · Trustpilot · Stripe · PayPal · Impact.com · Klaviyo · Mailchimp

Each is a separate file registered in a connector catalog. The brand's goal
declaration (Phase 2 onboarding) determines which connectors are surfaced —
a Sales + India brand sees Razorpay, Flipkart, Shiprocket. A Lead Gen + Global
brand sees Stripe, HubSpot, Twilio.

---

## Coverage Progress

| Domain | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|---------|---------|---------|---------|
| Paid Search | ✅ | — | Bing added | — |
| Paid Social | ✅ Meta | — | TikTok/LinkedIn | — |
| Organic Search | — | ✅ | — | — |
| Email | — | ✅ | — | — |
| Web Analytics | Partial | ✅ GA4 | — | — |
| Reviews | — | ✅ | — | — |
| SMS / WhatsApp | Partial | ✅ SMS | — | — |
| Ecommerce | ✅ | — | — | — |
| Marketplace | — | — | ✅ | — |
| Customer / LTV | Partial | — | ✅ | LTV-adjusted |
| Financial | Partial | — | ✅ | — |
| Incrementality | Flagged | — | — | ✅ |
| Support signals | — | — | — | ✅ |
