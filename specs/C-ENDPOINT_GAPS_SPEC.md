# [PRIORITY C · endpoints] UI-to-Engine Endpoint Gaps (Phase C + P2.1)

> The Phase C screens (Costs, Billing) and the P2.1 dismiss control are **built
> and mock-gated** in `brand-twin/app/`. This doc lists the engine endpoints they
> call so wiring them is a no-op flip (exactly as `A-ENDPOINT_GAPS_SPEC.md` did
> for Phase A). Each contract matches the TypeScript types in
> `brand-twin/app/src/lib/types.ts`. Full engine design lives in
> `C-PHASE_BUILD_SPEC.md` / `P2-EXECUTION.md`.
>
> **UI status:** all six endpoints have a `USE_MOCK` fallback + a banner naming
> the missing endpoint. Typecheck/lint/`next build` green.

---

## C1 — COGS aggregator (Costs screen → `/costs`)

### C1.a — `GET /api/v1/cogs/coverage`
Coverage of POAS by **ad spend** (not SKU count) — the basis the readiness gate uses.
```
→ { status, data: CogsCoverage, timestamp }
CogsCoverage = { coveragePct, realPct, estimatedPct, missingCostSkus, basis:'ad_spend' }
```
Built from the variant `cost_cogs` + connected `CostSource` results + category
estimates. Hook: `useCogsCoverage` (`queries.ts`).

### C1.b — `GET /api/v1/cogs/gaps`
Top-spend SKUs still missing a confident cost — the Pareto ask (tactic 3). Sorted
by `adSpend` desc; include category-estimated rows (flag `estimatedCogs`).
```
→ { status, data: { gaps: CogsGap[] }, timestamp }
CogsGap = { sku, productName, adSpend, sellingPrice, unitCost|null, provenance, estimatedCogs }
```
Hook: `useCogsGaps`.

### C1.c — `POST /api/v1/cogs`
Persist manual unit costs (provenance `manual`), then recompute coverage/readiness.
```
{ entries: { sku: string, unitCost: number }[] }  → { status:'success', ... }
```
Hook: `useSaveCogs` (invalidates `cogs-coverage`, `cogs-gaps`, `profit-readiness`).

### Engine work behind these (C-PHASE_BUILD_SPEC C1)
- `CostSource` interface; conform `tally_adapter.ts`; add `zoho`/`quickbooks`/`xero`
  adapters (OAuth via A2 + vault).
- Silent sweep on connect → auto-fill; category-average estimator → `estimatedCogs`.
- **Readiness gate:** healing engine must not emit auto-executable advertising-side
  prescriptions when `coveragePct` < threshold (the UI shows 80% by spend).

---

## C2 — Billing + suggest-an-amount (Billing screen → `/billing`)

### C2.a — `GET /api/v1/billing/subscription`
```
→ { status, data: Subscription, timestamp }
Subscription = { orgId, status, amount?, currency, period:'monthly',
                 trialDay, trialLengthDays, nextChargeAt?, note? }
status ∈ trial | suggest_amount | pending_review | active | past_due | suspended
```
Hook: `useSubscription`.

### C2.b — `POST /api/v1/billing/suggest`
The conversion moment. Moves the sub to `pending_review`; **account stays live**
(no cutoff). A human approves in the ops queue before the first charge.
```
{ amount: number, note?: string }  → { status:'success', ... }
```
Hook: `useSuggestAmount` (invalidates `subscription`).

### Engine work behind these (C-PHASE_BUILD_SPEC C2)
- `subscriptions` table + state machine; trial lifecycle jobs on the durable
  `pending_jobs` queue (day-14 nudge, day-15 flip, recurring, dunning).
- Ops review queue → approve → first charge.
- `PaymentProcessor` iface + Razorpay + tokenised card (no PAN stored).
- In-house receipt/invoice generation.

> The day-14 nudge "composed from stored findings" is already realised in the UI:
> the Billing screen recaps total dollar drag + critical count from the brand's
> own `/recommendations` + `/sweep`. The engine just needs to drive the email/job.

---

## P2.1 — Dismiss telemetry (Healing card dismiss control)

### `POST /api/v1/recommendations/:id/dismiss`
One `recommendation_events` row capturing the **richest H1 signal** — *why* a
brand walked away from the truth.
```
{ reason: DismissReason, note?: string }  → { status:'success', ... }
DismissReason ∈ dont_believe | cant_act | disagree | too_hard | other
```
Hook: `useDismissRecommendation`. The reason enum + free text are wired into the
card's dismiss control (`HealingCard.tsx`).

### Engine work behind it (P2-EXECUTION P2.1)
- `recommendation_events` table: `{ event_id, tenant_id, card_id, finding_code,
  severity, event:'shown'|'approved'|'executed'|'dismissed'|'reversed',
  dollar_impact, reason?, note?, created_at }`.
- Also emit `shown` / `approved` / `executed` events so the derived metrics
  (time-to-first-action, CRITICAL action-rate, reversal rate) are computable.

---

## Summary

| Item | Endpoint | UI hook | UI status |
|------|----------|---------|-----------|
| C1.a | `GET /cogs/coverage` | `useCogsCoverage` | built |
| C1.b | `GET /cogs/gaps` | `useCogsGaps` | built |
| C1.c | `POST /cogs` | `useSaveCogs` | built |
| C2.a | `GET /billing/subscription` | `useSubscription` | built |
| C2.b | `POST /billing/suggest` | `useSuggestAmount` | built |
| P2.1 | `POST /recommendations/:id/dismiss` | `useDismissRecommendation` | built |

Landing these six flips Costs + Billing + dismiss telemetry from mock to live.
The heavier engine lifts (COGS adapters, billing state machine + payment rail,
`recommendation_events`) sit behind them and are tracked in `00-REMAINING_WORK.md`.
