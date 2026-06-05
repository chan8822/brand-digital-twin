# [PRIORITY C] Phase C Build Spec — "Self-Serve Value + Money" (C1→C2)

> The final public-launch slice (`PUBLIC_LAUNCH_GAP.md` Gaps 7, 3). Makes POAS
> trustworthy without us in the room, and turns on revenue. In-house per this
> session's decision — no Codat/Rutter, no Stripe Billing product; build the
> connectors and the billing state machine directly. Grounded @ `8ccd11b`.
>
> Two workstreams: **C1 COGS aggregator · C2 billing + suggest-an-amount.**

---

## C1 — COGS aggregator (in-house connectors)

### Why this gates self-serve POAS
Internally we hand-hold brands into entering COGS. The public won't have that, and
POAS is only trustworthy with cost data. Without auto-pulled COGS, most public
signups get a confident-but-wrong number — an H3 failure at scale. So we automate
COGS ingestion and **hard-gate advice when coverage is too low.**

### The connector pattern (extend `tally_adapter.ts`)
`tally_adapter.ts` is the template: a `platform`, a `schemaVersion`, a real
`fetch` path with a mock fallback, and a `getInventoryCosts()` returning
`Record<sku, unitCost>`. Build the same shape for each accounting source.

```typescript
interface CostSource {
  readonly platform: string;            // 'quickbooks' | 'xero' | 'zoho' | 'tally'
  getInventoryCosts(): Promise<Record<string, number>>;   // sku → unit cost
}
```

| Source | Market | Auth | Notes |
|--------|--------|------|-------|
| Tally | India | local/cloud gateway URL | exists — conform to `CostSource` |
| Zoho Books | India/global | OAuth (reuse A2 pattern + vault) | items API → cost price |
| QuickBooks | global | OAuth | items → purchase cost |
| Xero | global | OAuth | items → `PurchaseDetails.UnitPrice` |

All four reuse the **A2 OAuth + CredentialVault** plumbing — no new auth surface.

### The four-tactic COGS easing (per `PROFIT_DATA_MODEL.md`)
Run in order, stop when coverage is sufficient:

1. **Silent sweep** — on connect, pull `getInventoryCosts()` from every connected
   `CostSource` and the storefront variant `cost_cogs`; auto-fill what's known.
2. **Category-average estimate** — for still-missing SKUs, infer from
   category-average margin; **tag `estimatedCogs: true`** (the healing engine
   already demotes confidence to `medium` on this flag — `risk_radar.ts:673`).
3. **Pareto entry UI** — ask the user for *only* the top 8–12 spend SKUs that are
   still missing (CSV + inline grid + %-of-price), not the whole catalog.
4. **Passive back-fill** — as orders/invoices flow, refine estimates toward actuals.

### Profit Readiness gate (the trust safeguard)
Expose `GET /api/v1/profit-readiness → { coveragePct, missingCostSkus[], basis }`
(also referenced by Phase A's UI gauge). The healing engine **must not emit
auto-executable ADVERTISING-side prescriptions when `coveragePct` is below
threshold** — it falls back to directional advice + a "complete your costs to
unlock" prompt. Coverage = share of *ad spend* (not SKU count) backed by real or
estimated cost.

### Build checklist
- [ ] `CostSource` interface; conform `tally_adapter.ts`
- [ ] `zoho_adapter.ts`, `quickbooks_adapter.ts`, `xero_adapter.ts` (OAuth via A2 + vault)
- [ ] Silent COGS sweep on connect → auto-fill
- [ ] Category-average estimator → `estimatedCogs` tag
- [ ] Pareto entry UI (top spend SKUs only)
- [ ] `GET /api/v1/profit-readiness` (coverage by spend)
- [ ] Healing-engine gate: low coverage → no auto-exec, directional only
- [ ] Tests: sweep fills known costs · estimate tags flagged · readiness gate blocks auto-exec under threshold

---

## C2 — Billing + suggest-an-amount (in-house)

### Decision: in-house orchestration over a payment processor primitive
Build the subscription state machine, trial lifecycle, and the bespoke
suggest-an-amount flow ourselves. Use a payment **processor** only as the raw
charge rail (Razorpay India / a card processor global) — not their full billing
product. The suggest-an-amount conversion is brand-defining and no vendor does it.

### Subscription state machine

```
trial(day0)  ──day14 nudge──>  trial(day14)  ──day15──>  suggest_amount
suggest_amount ──user submits amount+note──>  pending_review
pending_review ──human approves──>  active(amount)
active ──card fails──>  past_due ──grace──>  suspended
```

- Store on `orgs.plan` + a `subscriptions` table
  (`{orgId, status, amount, currency, period, nextChargeAt, note}`).
- Reuse the **durable `pending_jobs` queue** for time-based transitions
  (day-14 nudge, day-15 flip, recurring charge, dunning retries) — no new scheduler.

### The suggest-an-amount flow (the conversion moment)
1. **Day 14** — in-app + email nudge summarising their top diagnostic findings
   (pull from their stored sweep/healing results — remind them of value).
2. **Day 15** — "What would you pay?" screen: amount field + optional note + the
   soft anchors (~$299 / $799 / $2,500 per Decision #10, shown as reference only).
3. **Submit** → `pending_review`; account **stays live** during review (no cutoff).
4. **Human approves** (ops queue) → first charge on the processor → `active`.
5. Receipts/invoices generated in-house and emailed.

### Payment rail (thin)
- A `PaymentProcessor` interface (`charge`, `refund`, `tokenizeCard`) with a
  Razorpay impl (India) and a card-processor impl (global) — mirrors the
  `PlatformAdapter` dual-market pattern. Tokenise cards via the processor; we
  never store PAN. PCI scope stays with the processor.

### Build checklist
- [ ] `subscriptions` table + state machine
- [ ] Trial lifecycle jobs on `pending_jobs` (day-14 nudge, day-15 flip, recurring, dunning)
- [ ] Day-14 nudge composed from stored findings
- [ ] Day-15 suggest-an-amount screen (anchors as reference; account stays live)
- [ ] Ops review queue → approve → first charge
- [ ] `PaymentProcessor` interface + Razorpay + card-processor impls (tokenised, no PAN stored)
- [ ] In-house receipt/invoice generation
- [ ] Tests: trial→suggest→approve→active path · card-fail→dunning · account stays live during review

---

## Definition of done (public launch ready)
- [ ] A public brand connects an accounting source via OAuth; COGS auto-fills;
      Profit Readiness reflects real coverage; advice is gated until trustworthy.
- [ ] At day 15 the brand sees their findings, names a price, account stays live,
      ops approves, the first charge succeeds, a receipt is emailed.
- [ ] No PAN stored; card tokenised at the processor.

With C1 (trustworthy self-serve POAS) and C2 (money) done — on top of Phase A
(usable) and Phase B (lawful) — the product is launchable to the public. The
consciously-deferred 3-brands validation (`VALIDATION_PLAN.md`) can now run as a
soft-launch cohort on the real public product rather than a pre-build gate.
