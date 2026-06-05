# Diagnostic Sweep (3 missing checks) + Zero-Order Cold-Start — Implementation Spec

> Granular spec for the actively-built Phase 1 tail. Written to steer the
> upstream implementation while it's in this code. Grounded in the real
> structure of `risk_radar.ts`, `onboarding_wizard.ts`, `onboarding_simulator.ts`,
> and `supabase_client.ts` getters.
>
> Parent: `PHASED_ROADMAP.md` Phase 1; `USER_JOURNEYS.md` Stage 3 (Sweep).

---

## Part A — Diagnostic Sweep: the 3 missing checks

### Current state
`RiskRadar` has three real scans: `scanStockouts()`, `scanROIEfficiency()`,
`scanFinancialRunway()`. Each returns `string[]` action codes; the onboarding
sweep counts them. The sweep claims five checks; **two are real** (stockout via
`scanStockouts`, unprofitable-spend via the POAS pass). These three are missing:

1. Campaigns with **no conversion tracking**
2. **Budget-capped POAS winners** (opportunity, not problem)
3. **Checkout events not firing** (measurement break)

### Shared output type
Upgrade scan outputs from bare `string[]` to a structured finding (keep a
`.code` string for backward-compat with existing counters):

```typescript
type Severity = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY';

interface SweepFinding {
  code: string;             // e.g. 'no_conv_tracking_c1' — back-compat with current counts
  severity: Severity;
  check: string;            // 'conversion_tracking' | 'budget_capped_winner' | 'checkout_events'
  entityId: string;         // campaignId / null
  title: string;            // human-readable, e.g. "Summer Sale has no conversion tracking"
  detail: string;           // evidence line for the card
  dollarImpact: number;     // ₹ at stake (wasted, or recoverable upside)
  suggestedAction?: ActionRequest; // present when 1-tap fixable
}
```

---

### Check 1 — `scanConversionTracking(ctx): SweepFinding[]`

**Question:** which campaigns spend money but have no way to know if it worked?

**Data:** `getCampaigns`, `getSpendFacts`, `getTouchpoints` (filter `type` in
{`purchase`,`conversion`}).

**Logic:**
```
for each campaign with Σ spendFacts.amount > 0 over window:
   conversionTps = touchpoints where campaign_id == c.id
                   AND type ∈ {purchase, conversion}
   IF conversionTps.length == 0:
      → CRITICAL finding
        dollarImpact = total spend on this campaign in window (all of it is "blind")
        detail = "₹{spend} spent with no conversion events received — you cannot
                  know if this campaign earns or loses."
        suggestedAction = none (measurement fix, not an ad op) — link to setup guide
```

**Severity:** always CRITICAL — spending blind is the worst measurement state.
**Edge:** brand-new campaign (< 3 days, < ₹500 spend) → suppress (too early).

---

### Check 2 — `scanBudgetCappedWinners(ctx): SweepFinding[]`

**Question:** which profitable campaigns are we starving?

**Data:** `getCampaigns` (needs `daily_budget`), `getSpendFacts`, plus per-campaign
`poas` from `PoasCalculator`.

**Logic:**
```
for each campaign:
   poas = poasReport[campaign].poas
   daysCapped = count of days where dailySpend >= 0.95 × daily_budget
   IF poas >= 2.0 AND daysCapped >= ceil(0.7 × windowDays):
      → OPPORTUNITY finding
        dollarImpact = estimated incremental margin from a budget lift
                     = (poas - 1) × suggestedBudgetDelta   // conservative
        detail = "POAS {poas}× and budget-capped {daysCapped}/{windowDays} days.
                  Raising budget could add ~₹{impact}/mo in margin."
        suggestedAction = { op:'scale_budget', targetId:c.id,
                            payload:{ factor: 1.3 } }   // Tier-gated by governance
```

**Severity:** OPPORTUNITY (green). This is the sweep's only *upside* finding —
important for tone: the OS isn't only bad news.
**Guard:** if `incrementalityFlag` (from healing engine) is set on this campaign,
demote `suggestedAction` to advisory (don't auto-scale possibly-non-incremental spend).

---

### Check 3 — `scanCheckoutEvents(ctx): SweepFinding[]`

**Question:** is the purchase funnel actually reporting, or are we losing signal?

This is tenant-level (a measurement break), not per-campaign. Reuses the logic
family already in `coverage_monitor.ts` (orders vs. collected events).

**Data:** `getOrders` (storefront truth), `getTouchpoints` (filter funnel stages:
`add_to_cart`, `begin_checkout`, `purchase`).

**Logic:**
```
storefrontOrders = getOrders(window).length
purchaseEvents   = touchpoints where type == 'purchase' in window
coverage = purchaseEvents / max(storefrontOrders, 1)

IF coverage < 0.85:                      // >15% of real orders have no purchase event
   → CRITICAL finding
     dollarImpact = (1 - coverage) × attributedRevenue  // value flying blind
     detail = "Only {coverage%} of your orders fired a purchase event. {missing}
               orders are invisible to optimisation — ad platforms are bidding
               on incomplete data."

// funnel-break sub-check:
IF begin_checkout events > 0 AND purchaseEvents == 0:
   → CRITICAL: "Checkout starts are tracked but purchases are not — the final
                conversion event is misfiring."
```

**Severity:** CRITICAL. Broken purchase tracking corrupts every downstream number.
**Note:** dedupe against `coverage_monitor` if it already emits a signal — emit
one finding, not two.

---

### Wiring into the sweep
`onboarding_simulator.ts` already calls `PoasCalculator` + `RiskRadar`. Add the
three new scans to the same pass and merge their `SweepFinding[]` into the
prioritised feed (CRITICAL → WARNING → OPPORTUNITY). Replace any remaining
hardcoded strings with rendered findings.

```
findings = [
  ...scanStockouts(ctx),
  ...scanConversionTracking(ctx),     // NEW
  ...scanCheckoutEvents(ctx),         // NEW
  ...unprofitableSpend(poasReports),
  ...scanBudgetCappedWinners(ctx),    // NEW
].sort(bySeverityThenDollarImpact)
```

---

## Part B — Zero-Order Cold-Start

### The gap
`onboarding_wizard.generateMarginDiscoveryCampaign()` computes margin from
`getOrderLines()` — `(unit_price - unit_cost)`. A brand-new business with a
product catalog but **no orders** has an empty `order_lines` table, so
`skuMargins` is empty and the method returns `null`. The cold-start promise
("connect your storefront, we'll show which products can support paid
acquisition") fails for exactly the brand that needs it most.

### The fix — fall back to the catalog
`getVariants()` exists and (per `schema.sql`) carries `price` and `cost_cogs`.
When there is no order history, derive margin from the catalog instead.

```typescript
// in generateMarginDiscoveryCampaign, before the early return:

let skuMargins = marginsFromOrderLines(orderLines);   // existing path

if (skuMargins.size === 0) {
  // ZERO-ORDER COLD START — derive from catalog
  const variants = await this.db.getVariants(tenantId);
  for (const v of variants) {
    if (!v.sku || !v.variant_id) continue;
    if (v.price == null || v.cost_cogs == null) continue;  // skip missing-cost SKUs
    const marginPct = v.price > 0 ? (v.price - v.cost_cogs) / v.price : 0;
    skuMargins.set(v.sku, { sku: v.sku, variantId: v.variant_id, marginPct,
                            source: 'catalog' });   // tag the basis
  }
}
```

### Honesty + downstream behaviour
```
IF skuMargins still empty (no costs anywhere):
   → return a NEEDS_COGS result, not null:
     { status:'needs_cogs', missingCount: variants.length }
   → routes the user to the Pareto COGS entry UI (PROFIT_DATA_MODEL §COGS)
     instead of silently producing nothing.

IF margins are catalog-sourced:
   → tag the discovery campaign result { marginBasis:'catalog' }
   → first-value copy adapts: "Based on your catalog margins (no sales history
     yet), these are the products worth promoting first."
   → keep campaign status PAUSED (unchanged) — recommend, don't auto-spend, for
     a brand with no track record.
```

### Output contract change
```typescript
type MarginDiscoveryResult =
  | { status:'created'; campaignId:string; targetSkus:string[]; marginBasis:'orders'|'catalog' }
  | { status:'needs_cogs'; missingCount:number }
  | { status:'no_catalog' };   // truly nothing to work with
```
Replaces the current `{...} | null`, so the caller can branch the UX instead of
treating "no data" and "no high-margin products" identically.

---

## Build checklist

**Sweep**
- [ ] Add `SweepFinding` type (with back-compat `.code`)
- [ ] `scanConversionTracking()` in `risk_radar.ts`
- [ ] `scanBudgetCappedWinners()` in `risk_radar.ts` (needs `daily_budget` on CampaignEntry)
- [ ] `scanCheckoutEvents()` in `risk_radar.ts` (dedupe vs `coverage_monitor`)
- [ ] Merge all scans into the sweep pass in `onboarding_simulator.ts`; remove residual hardcoded strings
- [ ] Sort by severity then dollarImpact

**Cold-start**
- [ ] Catalog fallback (`getVariants`) in `generateMarginDiscoveryCampaign`
- [ ] `MarginDiscoveryResult` union return type; update caller branches
- [ ] `needs_cogs` → route to Pareto COGS entry UI
- [ ] `marginBasis` tag flows to first-value copy

**Tests**
- [ ] One test per new scan (positive + suppressed-edge case)
- [ ] Cold-start: orders-present (unchanged), zero-order-with-catalog-cost,
      zero-order-no-cost (`needs_cogs`), empty-catalog (`no_catalog`)
```
