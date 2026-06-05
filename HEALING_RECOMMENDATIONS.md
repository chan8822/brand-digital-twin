# Healing Recommendations Engine

> The OS surfaces uncomfortable truths. This doc defines the system that turns
> every truth into a decision, not a report.
>
> Principle: every surfaced problem arrives with its fastest, safest path to
> resolution — and an honest statement of what is and isn't within the OS's power to fix.

---

## The Structure of a Complete Recommendation

```
1. WHAT      — the number (POAS 0.3×, ₹18,400 bled this month)
2. WHY       — root cause (which cost component is driving it)
3. FIX       — ranked prescriptions, ad-side first
4. BOUNDARY  — honest signal when the problem lives outside advertising
```

A tool that shows an uncomfortable number without a path forward is worse than
no tool. The insight has no value until someone acts on it.

---

## The Context Layer (Brand Baseline Scan)

Before the healing engine prescribes, it consults the observable baseline from
the Brand Baseline Scan (`BRAND_BASELINE_SCAN.md`) — presence, paid footprint,
perception, trust, social standing — assembled from public data with no
connection required. This is what keeps advice safe across channels the user
hasn't connected.

| Context signal | How it guards the prescription |
|----------------|-------------------------------|
| Organic rank on the SKU's terms | Blocks "pause paid" advice on terms where paid defends a ranked position |
| Competitor bidding on brand terms | Flags when pausing cedes ground to a named competitor |
| Perception / rating trend falling | Downgrades confidence on "scale this" advice |
| Channel whitespace | Informs where to expand, not only where to cut |

Every card declares its own completeness honestly:
> *"Based on paid + commerce data and your observable footprint. Email and
>  organic not connected — connect them so this accounts for cross-channel
>  effects."*

This is the same honesty principle as the incrementality hedge: the OS states
what it cannot see at the moment it advises, rather than pretending to full
visibility.

---

## Root Cause Attribution Engine

When POAS is low, `diagnoseRootCause()` traces which cost component is the
primary driver. The diagnosis determines the prescription — fixing the wrong
lever wastes time and trust.

| Root cause | Detection signal | Who fixes it |
|------------|-----------------|-------------|
| **CPCs too high for margin** | Spend/order ratio high; COGS and fulfilment normal | OS — tighten targeting, shift to lower-funnel |
| **Conversion rate too low** | High CTR, low CVR; audience-page mismatch | OS + user — creative/landing page |
| **Discount depth too high** | Revenue strong, contribution squeezed by promo | User — promo structure decision |
| **COGS too high for price point** | Unit cost consumes > 70% of revenue | User — reprice or renegotiate supplier |
| **Shipping cost too high** | `fulfilment_cost / revenue` > 25% | User — carrier, packaging, free-shipping threshold |
| **High refund rate** | `refunds / revenue` > 8–10% | User — product quality, sizing, expectations |
| **Marketplace fees** | GMV strong, contribution near zero | User — channel mix, D2C vs. marketplace economics |
| **Attribution inflation** | ROAS high, POAS low, suspiciously consistent; brand keywords | Incrementality — holdout test before any scaling |

---

## Prescription Tiers

Every recommendation is ranked by speed and reversibility. The OS leads with
what is **immediate, safe, and reversible** — not what is theoretically most
impactful but risky to execute.

### Tier 1 — This week (ad-side, the OS can act, 1-tap)
- Pause campaigns with POAS < 0 (losing money on every order)
- Reallocate budget from low-POAS to high-POAS campaigns (same audience)
- Tighten audience exclusions (existing customers receiving acquisition CPCs)
- Cap frequency on awareness campaigns converting below threshold
- Unlock budget on campaigns that are capped and POAS-positive

### Tier 2 — This month (ad-side, user approves)
- A/B test creative where CTR is high but CVR is low
- Shift bidding strategy to a target ROAS anchored to actual margin
- Add negative keywords from search term POAS analysis
- Test removing the discount on campaigns where promo is the POAS killer
- Exclude low-AOV traffic where fulfilment makes small orders unprofitable

### Tier 3 — This quarter (business-side flags, OS cannot execute)
The OS surfaces the evidence. The user makes the call.
- Reprice a product whose margin cannot support paid acquisition at any CPC
- Renegotiate supplier cost on SKUs with confirmed high spend and low margin
- Restructure fulfilment for heavy or bulky products consuming contribution
- Raise free-shipping threshold to improve contribution on shipped orders
- Reassess marketplace vs. D2C channel split where fees eliminate contribution

Framing for Tier 3: *"This campaign's economics cannot be fixed by optimising
the ads. At current costs, profitable paid acquisition is mathematically
impossible on this product. Here is the evidence."*

This is not failure — it is the most valuable thing the OS can say to a brand.
It prevents months of wasted optimisation effort on an unfixable problem.

---

## The Incrementality Hedge

Where attribution looks suspiciously strong — high POAS, very consistent
performance, brand or retargeting keywords — the OS flags before scaling:

> *"This campaign attributes well. Before we scale it further, a 2-week
>  geo holdout would confirm whether it is creating demand or capturing
>  demand that would have converted anyway. Want us to set that up?"*

This is the boundary between *confidently act* and *verify before scaling*.

**Autonomy implication:** campaigns flagged as potentially non-incremental are
held at Tier 2 (user approves) until a holdout test confirms incremental lift.
The trust ledger does not advance on attributed POAS alone for these campaigns.

Systems that never express uncertainty lose trust the first time they are wrong.
Systems that flag uncertainty at the right moment earn trust permanently.

---

## The Three-Zone Healing Card (UX)

Every diagnosed problem is presented as a three-zone card — not a report,
not a list of metrics, but a decision surface.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Campaign: Summer Jackets

  ROAS  4.1×    POAS  0.3×    Gap  ₹18,400 this month

  WHY
  Shipping cost (₹340/order) on ₹680 average order value.
  Fulfilment is consuming 50% of contribution margin on every order.

  WHAT WE CAN DO NOW
  ✓ Shift budget to Mens Trousers — same audience, POAS 2.8×   [Do it]
  ✓ Exclude cart values < ₹1,200 — raises AOV above break-even  [Do it]

  WHAT NEEDS YOUR CALL
  → Free shipping threshold is ₹500. Raising it to ₹999 makes
    this campaign profitable. That is a store-level change.      [Noted]

  WHAT ADS CANNOT FIX
  → At current courier rates, orders under ₹900 cannot be
    profitable on paid traffic regardless of bid strategy.
    Consider pausing paid on this SKU until rates renegotiated.  [Pause]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Zone 1 — What we can do now:** ad-side actions, 1-tap, reversible.
The OS executes these if the user's autonomy tier permits, or queues for approval.

**Zone 2 — What needs your call:** business-side levers (pricing, thresholds,
channel mix). The OS flags with evidence; the user decides and acts outside the OS.

**Zone 3 — What ads cannot fix:** structural economics problems. The OS
states this plainly and recommends pausing paid on the affected product.
No false confidence. No endless optimisation of an unfixable problem.

---

## Architecture Changes Required

### `risk_radar.ts`
Add `diagnoseRootCause(campaignId, tenantId)`:
- Pulls POAS components: COGS, fulfilment, payment fees, refunds, spend
- Identifies primary driver of low POAS (largest absolute gap vs. breakeven)
- Returns structured `{rootCause, evidence, prescriptionTier}` object

### `unified_brain.ts` — `analyzeProfitability()`
Currently returns a recommendation string.
Change to return structured:
```typescript
{
  poas: number,
  roas: number,
  gap: number,
  rootCause: RootCause,
  tier1Actions: Action[],   // OS can execute
  tier2Actions: Action[],   // user approves
  tier3Flags: Flag[],       // business-side, OS flags only
  incrementalityFlag: boolean,
}
```

### `governance_engine.ts` — `decide()`
Add incrementality consistency check:
- If POAS > threshold AND campaign is brand/retargeting AND performance
  variance is suspiciously low → set `requiresHoldout = true`
- Campaigns with `requiresHoldout` are capped at Tier 2 autonomous action
  until holdout result is logged

### Dashboard / sweep output
The three-zone healing card becomes the standard output format for every
low-POAS campaign surfaced in:
- The initial diagnostic sweep
- Daily dashboard alerts
- The trust ledger's VERIFY phase output

---

## What This Changes About the Trial Experience

The first session no longer ends with a number. It ends with a decision.

The user sees their three worst campaigns as three healing cards. Each card
tells them what's broken, why, what the OS will do right now, and what they
need to do themselves. The call to action is not "explore the dashboard" —
it is "approve these three actions and fix these two business levers."

That is the difference between a diagnostic and a treatment.
