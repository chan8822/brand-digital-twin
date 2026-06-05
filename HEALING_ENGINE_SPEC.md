# Healing Engine — Implementation Spec

> Granular spec for `diagnoseRootCause()` and the recommendation data contract.
> This is the Layer-2 brain: it turns a low POAS number into a ranked, structured
> diagnosis with prescriptions. Directly implementable against the existing
> `poas_calculator.ts` / `risk_radar.ts` / `governance_engine.ts`.
>
> Parent: `HEALING_RECOMMENDATIONS.md` (the why). This doc is the how.

---

## 1. Where it sits

```
PoasCalculator.calculate(tenantId)        // Layer 1 — produces CampaignPoasReport[]
        │
        ▼
RiskRadar.diagnoseRootCause(report, ctx)  // Layer 2 — THIS SPEC
        │
        ▼
UnifiedBrain.analyzeProfitability()       // assembles RecommendationCard[]
        │
        ▼
Three-zone healing card (UI)              // OS acts / user decides / ads can't fix
```

The calculator already returns `spend`, `contributionMargin`, `poas`, `roas`
per campaign. The diagnosis engine needs the **decomposition** behind
`contributionMargin` — so the calculator must also expose the cost breakdown
(see §3).

---

## 2. Inputs

```typescript
interface DiagnosisInput {
  report: CampaignPoasReport;        // existing: campaignId, spend, poas, roas, contributionMargin
  breakdown: CampaignCostBreakdown;  // NEW — see §3
  clicks: number;                    // from touchpoints where type='click', attributed to campaign
  orders: number;                    // attributed order count
  context: BaselineContext;          // from Brand Baseline Scan — see §7
  benchmarks: CategoryBenchmarks;    // healthy bands, see §4
}
```

---

## 3. Required calculator extension — `CampaignCostBreakdown`

`PoasCalculator` already computes these per order line; it must aggregate and
expose them per campaign instead of collapsing to a single margin number.

```typescript
interface CampaignCostBreakdown {
  grossRevenue: number;      // Σ (unit_price - line_discount) * qty  for attributed orders
  discountAmount: number;    // Σ line_discount * qty
  cogs: number;              // Σ unit_cost * qty
  fulfillment: number;       // Σ allocated shipping_cost
  marketplaceFee: number;    // Σ allocated marketplace_fee
  refunds: number;           // Σ refund amount
  spend: number;             // campaign spend
  // derived:
  contributionMargin: number; // grossRevenue - cogs - fulfillment - marketplaceFee - refunds
  estimatedCogs: boolean;     // true if any line used category-average fallback (PROFIT_DATA_MODEL)
}
```

All ratios below are computed against `grossRevenue` (guard: if grossRevenue
<= 0, return `INSUFFICIENT_DATA`, see §8).

---

## 4. The component ratios and healthy bands

Each cost component is expressed as a fraction of gross revenue. A component is
a *drag* when it exceeds its healthy band. Bands are category-overridable via
`CategoryBenchmarks`; defaults below.

| Ratio | Formula | Healthy band (default) | Drag threshold |
|-------|---------|------------------------|----------------|
| `cogsRatio` | cogs / grossRevenue | ≤ 0.55 | > 0.70 |
| `discountRatio` | discountAmount / grossRevenue | ≤ 0.10 | > 0.20 |
| `fulfillmentRatio` | fulfillment / grossRevenue | ≤ 0.15 | > 0.25 |
| `marketplaceRatio` | marketplaceFee / grossRevenue | ≤ 0.15 | > 0.20 |
| `refundRatio` | refunds / grossRevenue | ≤ 0.05 | > 0.10 |
| `spendRatio` | spend / grossRevenue | ≤ 0.30 | > 0.40 |
| `cvr` | orders / clicks | ≥ category median | < 0.5× median |
| `cac` | spend / orders | ≤ contributionMargin/order | > contributionMargin/order |

---

## 5. The decision tree

The engine does **not** stop at the first match. It scores every component's
*excess drag*, ranks them, and returns the dominant cause plus secondary
contributors. This avoids the classic mistake of blaming the first threshold
crossed when a bigger driver sits underneath.

### Step 1 — Pre-margin vs. ad-cost split
First determine whether the problem is the **product economics** or the
**advertising**:

```
preAdContributionRate = contributionMargin / grossRevenue

IF preAdContributionRate >= 0.30 (healthy product margin)
   AND poas < 1.0
   → the drag is ADVERTISING-side (spend too high for the orders won)
   → go to Step 2A

IF preAdContributionRate < 0.30 (product margin already thin)
   → the drag is ECONOMICS-side (a cost component is eating margin)
   → go to Step 2B
```

This split maps directly to the card's "what we can do now" (ad-side, OS acts)
vs. "what needs your call / ads can't fix" (economics, user decides).

### Step 2A — Advertising-side diagnosis
```
IF cvr < 0.5 × categoryMedianCvr
   → ROOT = LOW_CONVERSION         (high clicks, few orders)
ELSE IF cac > contributionMarginPerOrder
   → ROOT = CPC_TOO_HIGH           (each order costs more than it yields)
ELSE
   → ROOT = SPEND_INEFFICIENT      (budget allocated to weak placements)
```

### Step 2B — Economics-side diagnosis
Score each component's excess and pick the largest dollar drag:
```
excess(component) = max(0, ratio - healthyBand) × grossRevenue   // dollar terms

candidates = {
  COGS_TOO_HIGH       : excess(cogsRatio),
  DISCOUNT_OVERUSE    : excess(discountRatio),
  SHIPPING_TOO_HIGH   : excess(fulfillmentRatio),
  MARKETPLACE_FEES    : excess(marketplaceRatio),
  HIGH_REFUND_RATE    : excess(refundRatio),
}
ROOT = argmax(candidates)              // largest absolute dollar drag
secondary = candidates sorted desc, excluding ROOT, where excess > 0
```

Dollar-weighting (not ratio-weighting) matters: a 5-point overage on a large
revenue base outranks a 15-point overage on a tiny one. Fix the biggest leak.

### Step 3 — Incrementality overlay (independent of 2A/2B)
```
IF roas >= categoryHighRoasThreshold (e.g. 4.0)
   AND poasVariance over trailing window < lowVarianceThreshold
   AND campaign type ∈ {brand, retargeting}
   → SET incrementalityFlag = true   // attribution may be inflated
```
This is an overlay, not a root cause — it modifies *confidence and autonomy*,
not the diagnosis (see §6, §9).

---

## 6. Output contract — `RootCauseDiagnosis`

```typescript
type RootCause =
  | 'LOW_CONVERSION' | 'CPC_TOO_HIGH' | 'SPEND_INEFFICIENT'   // ad-side
  | 'COGS_TOO_HIGH' | 'DISCOUNT_OVERUSE' | 'SHIPPING_TOO_HIGH'
  | 'MARKETPLACE_FEES' | 'HIGH_REFUND_RATE'                   // economics-side
  | 'INSUFFICIENT_DATA';

type Side = 'ADVERTISING' | 'ECONOMICS' | 'UNKNOWN';

interface RootCauseDiagnosis {
  campaignId: string;
  side: Side;
  rootCause: RootCause;
  secondaryCauses: RootCause[];
  evidence: {
    poas: number; roas: number; gap: number;     // gap = (poas - 1) × spend  (₹ bled/earned)
    drivingRatio: number;                         // the ratio behind rootCause
    healthyBand: number;
    dollarDrag: number;                           // monthly ₹ attributable to this cause
  };
  prescriptions: Prescription[];                  // §7
  incrementalityFlag: boolean;
  confidence: 'high' | 'medium' | 'low';          // see §8
  completeness: ContextCompleteness;              // §7 — what channels were/weren't visible
}
```

---

## 7. Prescription mapping + context consumption

Each `RootCause` maps to an ordered prescription list. Tier governs *who acts*.

| RootCause | Tier 1 (OS acts) | Tier 2 (user approves) | Tier 3 (ads can't fix) |
|-----------|------------------|------------------------|------------------------|
| LOW_CONVERSION | — | A/B creative; tighten audience-page match | Landing page UX |
| CPC_TOO_HIGH | Lower bid; add negatives | Shift to lower-funnel keywords | — |
| SPEND_INEFFICIENT | Reallocate to high-POAS twin campaign | Restructure placements | — |
| COGS_TOO_HIGH | — | — | Reprice / renegotiate supplier; pause paid on SKU |
| DISCOUNT_OVERUSE | — | Test removing promo on this campaign | Revisit promo strategy |
| SHIPPING_TOO_HIGH | Exclude low-AOV carts (raise break-even) | — | Raise free-ship threshold; carrier renegotiation |
| MARKETPLACE_FEES | — | — | Channel mix: D2C vs marketplace |
| HIGH_REFUND_RATE | Pause paid on high-return SKU | — | Product/sizing/expectations fix |

```typescript
interface Prescription {
  tier: 1 | 2 | 3;
  action: string;                 // human-readable
  executableOp?: ActionRequest;   // present only for Tier 1 — feeds governance.govern()
  estimatedRecovery: number;      // ₹/month if applied
}
```

### Context layer (`BaselineContext`) — the cross-channel guards
Before emitting Tier-1 executable prescriptions, the engine checks the baseline
scan context and **demotes or annotates** unsafe actions:

```
IF prescription pauses/reduces paid on a term
   AND context.organicRank(term) <= 3
   → demote Tier 1 → Tier 2, annotate: "you rank #{rank} organically; paid may
     be defending the SERP — verify before pausing"

IF context.competitorBiddingBrandTerms == true AND action pauses brand campaign
   → annotate: "{competitor} is bidding your brand terms; pausing cedes ground"

IF context.ratingTrend == 'declining' AND action scales spend
   → lower confidence to 'medium', annotate perception risk
```

```typescript
interface ContextCompleteness {
  visible: Channel[];      // e.g. ['paid','commerce']
  missing: Channel[];      // e.g. ['email','organic']
  caveat: string;          // rendered on the card
}
```
Every card declares completeness: *"Based on paid + commerce + observable
footprint. Email and organic not connected — connect them so this accounts for
cross-channel effects."*

---

## 8. Confidence & edge cases

| Condition | Result |
|-----------|--------|
| grossRevenue ≤ 0 or orders = 0 | `rootCause = INSUFFICIENT_DATA`, no prescriptions |
| `breakdown.estimatedCogs == true` | confidence capped at `medium`; card notes "COGS partly estimated" |
| clicks = 0 (display/awareness) | skip CVR/CAC branch; economics-side only |
| spend = 0 (organic pseudo-campaign) | not diagnosed (no ad lever) |
| trailing window < 7 days of data | confidence = `low`, annotate "early data" |
| dollarDrag below materiality floor (e.g. <₹500/mo) | suppress card (not worth user attention) |

Confidence default `high`; downgraded by any qualifier above. Confidence gates
autonomy: only `high`-confidence Tier-1 prescriptions auto-execute (subject to
the tier $ cap and incrementality flag).

---

## 9. Autonomy interaction (governance)

```
incrementalityFlag == true
   → cap autonomous execution at REVIEW/ASSISTED tier until a holdout confirms lift
   → Tier-1 prescriptions on this campaign become Tier-2 (user approves)

confidence != 'high'
   → no auto-execution regardless of tier; queue for approval
```

This is the safety bridge: the diagnosis can be confident about the *number*
while the OS stays humble about *acting* on a possibly-non-incremental campaign.

---

## 10. Worked example

```
Campaign: Summer Jackets   spend ₹40,000   grossRevenue ₹164,000
  cogs ₹82,000 (50%)  fulfillment ₹55,760 (34%)  refunds ₹4,920 (3%)
  discount ₹8,200 (5%)  marketplaceFee ₹0
  contributionMargin = 164,000 - 82,000 - 55,760 - 4,920 = ₹21,320
  poas = 21,320 / 40,000 = 0.53     roas = 164,000 / 40,000 = 4.1

Step 1: preAdContributionRate = 21,320/164,000 = 0.13  (<0.30) → ECONOMICS side
Step 2B excess (₹):
  COGS:        (0.50-0.55)→0
  FULFILLMENT: (0.34-0.15)=0.19 × 164,000 = ₹31,160   ← argmax
  REFUND:      (0.03-0.05)→0
  DISCOUNT:    (0.05-0.10)→0
ROOT = SHIPPING_TOO_HIGH,  dollarDrag ₹31,160/mo
secondary = []
Prescriptions:
  Tier 1: exclude carts < ₹1,200  (executableOp present)   est. recovery ₹12k
  Tier 3: raise free-ship threshold ₹500→₹999              est. recovery ₹19k
Context: organicRank('summer jackets') = 2
  → Tier-1 exclusion unaffected (doesn't pause the term); no demotion
incrementalityFlag: false (roas high but not brand/retargeting)
confidence: high
```

This produces exactly the three-zone card shown in `HEALING_RECOMMENDATIONS.md`.

---

## 11. Build checklist

- [ ] Extend `PoasCalculator` to emit `CampaignCostBreakdown` per campaign
- [ ] Add `clicks`/`orders` aggregation from touchpoints per campaign
- [ ] Implement `diagnoseRootCause(input): RootCauseDiagnosis` in `risk_radar.ts`
- [ ] Implement `CategoryBenchmarks` with overridable bands (default table §4)
- [ ] Wire `BaselineContext` consumption (guards in §7)
- [ ] `UnifiedBrain.analyzeProfitability()` returns `RecommendationCard[]` built from diagnoses
- [ ] Governance: honor `incrementalityFlag` + `confidence` gates (§9)
- [ ] Unit tests: one per RootCause branch + the three edge cases + the worked example
```
