# Strategy — Brand Digital Twin OS

> Strategic source of truth for positioning, go-to-market, and the phase-gate
> roadmap. The landing page (`app/src/app/page.tsx`) and the critical user journeys
> (`CUJS.md`) are drafted against this. Build status: `PROD-READY-PLAN.md`.

## The thesis

Ad platforms bid on **ROAS** — revenue over spend — which is margin-blind. A brand can
run campaigns that look healthy in the ad dashboard while they actively drain cash. The
Brand Digital Twin OS moves the optimisation metric from top-of-funnel vanity to
bottom-of-funnel reality:

```
ROAS = Attributed Revenue / Ad Spend                       ← what platforms optimise
POAS = (Revenue − COGS − Shipping − Fulfillment − Fees) / Ad Spend   ← what we optimise
```

Aligning ad spend with real unit economics is the entire product.

## Situational analysis

### Porter's Five Forces

| Force | Level | Read |
|-------|-------|------|
| New entrants | **Low** | Mapping schemas across commerce + ad + accounting platforms and running a stateful, rate-limited write loop is a high technical bar. |
| Supplier power (ad networks) | **High** | Networks control API quotas and policy. Mitigate with middleware adapters, rate limiting, and pre-flight policy checks. |
| Buyer power | **Medium** | Brands churn when efficiency drops — but proven profit lift creates strong lock-in. |
| Substitutes | **Medium** | Agencies with spreadsheets exist, but lack real-time write feedback loops and automated safety containment. |
| Rivalry | **Medium** | Many ad-automation tools; almost none are aware of inventory, unit margin, and real cash runway. |

### SWOT

**Strengths** — granular safety loops (variant→GMC→campaign mapping enables surgical
ad-group pauses); multi-platform ingestion; request-scoped tenant isolation (agency-safe).

**Weaknesses** — cold-start dependency on COGS accuracy (fallback: catalog-cost margin
basis); execution liability from autonomous budget changes (mitigated by governance +
approval gates).

**Opportunities** — DPI / real-time ledger integration in growth markets for cash-runway
automation; agency white-label as portfolio infrastructure.

**Threats** — ad-network policy bans on rapid automated bid changes if not properly
authenticated / human-verified.

## Strategic options

- **A — Enterprise private utility.** Direct to large merchants. High ACV, but long
  cycles and heavy custom integration. *(Not the near-term focus.)*
- **B — White-label agency infrastructure.** The "internal fulfillment layer" for
  agencies managing portfolios. One-to-many distribution over native multi-tenancy.
- **C — Product-led growth via the graduated-autonomy hook.** Free read-only "Observe"
  twin; upsell to write-optimization the moment a margin leak is flagged.

## Recommended direction — hybrid B + C

The **autonomy ladder** is the strongest acquisition and monetisation loop. Land users
in **OBSERVE** (read-only, no trust friction); the instant the Risk Radar makes an
operational save — e.g. pausing spend on an out-of-stock bestseller — value is proven in
context, converting a sales pitch into a trigger. Layer **agencies** on top: auto-linking
and MCC traversal let a growth agency index an entire portfolio with near-zero onboarding,
driving one-to-many adoption over the same isolated engine.

## Implementation roadmap (phase gates)

**Phase Gate 1 — Wave 0 (founding cohort activation).** Deploy omnichannel ingestion +
heuristic auto-linking. *Exit:* SKUs mapped across storefronts + GMC in `product_ad_links`;
catalog-cost fallback where COGS is missing.

**Phase Gate 2 — Wave 1 (governance & stateful approvals).** Stateful manual approval
queues that resume on verification, with strict role checks. *Exit:* out-of-stock signals
produce targeted pause commands captured safely in the queue, not fired blindly.

**Phase Gate 3 — Wave 2 (granular safety automation).** Continuous sweep loop monitoring
checkout mismatches, pixel signal loss, and stock state; isolated ad-group pauses while
healthy campaigns keep running. *Exit:* adversarial security tests pass; token-bucket
delay queues prevent API flooding.

→ See `CUJS.md` for how each gate maps to a concrete user journey.

## Build reality vs. strategy (honest scope)

The strategy is the destination; some of it is roadmap. What's live at engine `646a2cd`
vs. forward-looking:

| Strategy element | Status |
|------------------|--------|
| Graduated autonomy ladder (OBSERVE→C-SUITE) + caps + 409 guard | ✅ live |
| POAS engine, Risk Radar sweep, healing prescriptions | ✅ live |
| Suggest-an-amount billing + Razorpay + receipts | ✅ live |
| Request-scoped tenant isolation (agency-safe foundation) | ✅ live |
| Shopify + Google Ads + Meta + QuickBooks/Xero/Zoho/Tally | ✅ live |
| WooCommerce / Magento ingestion | 🧭 roadmap (next commerce adapters) |
| GMC product-level `product_ad_links` mapping | 🧭 roadmap (new adapter + migration) |
| Agency portfolio console + MCC traversal | 🧭 roadmap (multi-tenant UI layer) |
| Shipping/fulfillment as broken-out POAS inputs | 🟡 folded into COGS via accounting adapters today |

The LP and CUJs sell the genuine live strengths and mark agency-console / additional-
platform pieces as the next surfaces to build — not as shipped.
