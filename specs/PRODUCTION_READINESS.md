# Production Readiness Plan — Brand Digital Twin OS

> **Single source of truth.** Verified against upstream
> `chandansinghr-ship-it/brand-digital-twin` @ `b472992` + `sync-google3-c2-ui`
> branch (fetched 2026-06-06).
>
> Engine work → `chandansinghr-ship-it/brand-digital-twin`  
> UI work → `brand-twin/app/` (this repo)
>
> **Legend:** ✅ done · 🟡 partial · ☐ to build  
> **Sizes:** S ≤0.5d · M 1–2d · L 3–5d · XL 1–2wk

---

## Where we are

| Phase | State | One-line |
|-------|-------|----------|
| **P0** — mock→live seams | ✅ | all 4 endpoints + sort + autonomy-409 |
| **P1** — hardening | ✅ | full suite: atomic jobs, observability, staging, migrations, secrets, security, load test |
| **Phase B** — lawful | ✅ | B1.4 credential revocation, B2.3 ToS re-prompt, B2.4 cookie consent, legal routes |
| **C2 billing endpoints** | ✅ | GET /billing/subscription + POST /billing/suggest + `subscriptions` table |
| **Phase C UI** | ✅ | Costs + Billing screens mock-gated; P2.1 dismiss UI built; synced to engine in `sync-google3-c2-ui` |
| **P2 beta** | 🟡 | onboarding data being gathered; dismiss *endpoint* writes mock-only |
| **C1 COGS engine** | ☐ | zero C1 endpoints in server.ts |
| **C2 billing lifecycle** | ☐ | no trial jobs, no Razorpay, no ops queue |
| **P4 GA** | ☐ | blocked on A0 external clocks — start now |

---

## Confirmed gaps (from code audit)

These are what actually blocks production — not what the specs say, what the code does:

1. **`recommendation_events` has no live DB persistence.** `saveRecommendationEvent` only
   writes in `mockMode`; live branch returns `[]`. Migration `0003` is missing. P2.1 is UI-only.

2. **B4 has zero per-tenant spend caps.** `rate_limiter.ts` = API token bucket for ad platform
   calls only. No daily spend cap, no new-account cap, no per-tenant quota table anywhere.

3. **C1 COGS endpoints absent.** `/cogs/coverage`, `/cogs/gaps`, `POST /cogs` not in
   `server.ts`. No `CostSource` interface. Coverage is by variant count, not by ad spend.

4. **C2 billing lifecycle not started.** No trial day-14 nudge, no day-15 flip, no dunning,
   no `PaymentProcessor`, no Razorpay, no ops review queue.

5. **`shown`/`approved`/`executed` events not emitted.** Only `dismissed` + `reversed` are
   tracked. H1 derived metrics (time-to-first-action, CRITICAL action-rate) aren't computable.

6. **Invite allowlist is OFF by default.** `isEmailAllowed()` exists with wildcard matching
   but `inviteAllowlistEnabled` defaults to false — signup is open to anyone right now.

7. **Signup ToS acceptance checkbox missing** in `brand-twin/app/src/app/signup/page.tsx`.
   Engine `3469815` added this to its own app/ but it was not ported to our UI.

8. **`sync-google3-c2-ui` branch needs PR → main merge** in the engine repo before C1/C2
   engine work begins there (so the UI code the engine will wire to is present).

---

## Phase 1 — Beta unlock  (~5 days · engine + UI)

*Goal: 3 beta brands can be onboarded with real measurement. No public signup.*

### 1.1 — recommendation_events live persistence (S · engine)
**Files:** `supabase_client.ts`, new `migrations/0003_create_recommendation_events.sql`

```sql
CREATE TABLE IF NOT EXISTS brand_twin.recommendation_events (
  event_id        TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  recommendation_id TEXT,
  finding_code    TEXT,
  severity        TEXT,
  action          TEXT NOT NULL,  -- shown|approved|executed|dismissed|reversed
  dollar_impact   NUMERIC,
  reason          TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON brand_twin.recommendation_events (tenant_id, created_at DESC);
```

Add live Supabase writes + reads in `supabase_client.ts` `saveRecommendationEvent` /
`getRecommendationEvents` (parallel to the subscription pattern in `19f80cc`).

### 1.2 — shown / approved / executed event hooks (S · engine)
**Files:** `server.ts` (`/recommendations` handler), `governance_engine.ts`

- Emit `shown` batch when `GET /recommendations` is served (one event per card).
- Emit `executed` in `GovernanceEngine` after an action completes successfully.
- Emit `approved` when a user-approved action is submitted.

### 1.3 — Close the invite allowlist (S · engine + UI)
**Engine:** `config.ts` → flip `inviteAllowlistEnabled: true` by default; seed the allowlist
with the 3 beta brand emails in the Supabase `invite_allowlist` table (or env-var list).  
**UI (`brand-twin/app/signup/page.tsx`):** show a clear "not on the list" message on 403.

### 1.4 — Per-tenant spend caps B4 (M · engine)
**Files:** `rate_limiter.ts` (extend), `user_auth.ts`, `schema.sql`, new migration

- New `tenant_limits` table: `{ tenant_id, daily_spend_cap, new_account_cap, period_spend, reset_at }`.
- `GovernanceEngine.executeAction()`: sum today's `cost` from `audit_log` before proceeding;
  reject with `429 SPEND_CAP_EXCEEDED` if over limit.
- New-account cap: tenants < 30 days old capped at $200/day until lifted by admin.
- Expose `GET /api/v1/account/limits` so the UI can show remaining headroom.

### 1.5 — Signup ToS acceptance (S · UI)
**File:** `brand-twin/app/src/app/signup/page.tsx`

Add checkbox "I agree to the Terms of Service and Privacy Policy" (links to `/legal/tos`,
`/legal/privacy`); `signup()` call blocked until checked; pass `tosAccepted: true` to engine.

---

## Phase 2 — COGS live: C1 endpoints  (~6 days · engine)

*Goal: Costs screen flips from mock to live. Pareto ask works. Readiness gate protects.*

### 2.1 — `CostSource` interface + tally_adapter wiring (S)
**Files:** new `cost_source.ts`, `tally_adapter.ts`

```ts
export interface CostSource {
  provider: CostSourceProvider;
  getUnitCosts(tenantId: string): Promise<{sku: string; unitCost: number}[]>;
}
```

Conform `TallyAdapter` to `CostSource`. Register as the default when Tally is connected.

### 2.2 — C1.a: GET /api/v1/cogs/coverage (S)
**File:** `server.ts` + `supabase_client.ts`

Coverage by **ad spend** (not variant count): for each variant in the sweep, check if
`cost_cogs` is present; weight by that variant's `adSpend`. Return `CogsCoverage`:
`{ coveragePct, realPct, estimatedPct, missingCostSkus, basis:'ad_spend' }`.

### 2.3 — C1.b: GET /api/v1/cogs/gaps (M)
**File:** `server.ts`, `poas_calculator.ts`

Top-spend variants with no confident `cost_cogs`. Sort by `adSpend` desc. Include
category-estimated rows (`estimatedCogs: true`, flagged but still surfaced).

### 2.4 — C1.c: POST /api/v1/cogs (S)
**File:** `server.ts`, `supabase_client.ts`

Persist `{ sku, unitCost }[]` with `provenance: 'manual'`; upsert into variants table;
invalidate profit-readiness cache; return updated coverage.

### 2.5 — Category-average estimator (M)
**File:** `poas_calculator.ts`

For each SKU missing a cost, derive `estimatedCogs` from the median `cost_cogs` of
same-category variants that do have costs. Tag as `provenance: 'category_estimate'`.
Feed into `C1.b` gaps list.

### 2.6 — Readiness gate (M)
**File:** `risk_radar.ts`

When `coveragePct` < 80% (by ad spend), `analyzeProfitability()` must not return
auto-executable advertising prescriptions in `osActs`. Demote them to `userApproves` +
add a caveat explaining the coverage gap. Engine already has `profit_readiness.ts`
`directional_only` status — wire this to the healing engine output.

---

## Phase 3 — Billing complete: C2 lifecycle + payment  (~10 days · engine)

*Goal: first self-serve paid conversion — brand names a price, human approves, Razorpay charges.*

### 3.1 — Trial lifecycle jobs (M)
**File:** `poas_scheduler.ts`

Add to the durable `pending_jobs` queue:
- **Day-14 nudge job**: fetch `subscriptions` where `trial_day = 14`; send email + push
  a notification to `activity_feed` recapping dollar drag + critical count.
- **Day-15 flip job**: `trial` → `suggest_amount`; surfaces conversion CTA in UI.
- **Recurring charge job**: on `active` subscriptions on billing anniversary.
- **Dunning job**: on `past_due` — retry 3× (day 1, 3, 7); then `suspended`.

Scheduler already runs `poas_scheduler.ts` daily — add a `billing_tick()` call there.

### 3.2 — Ops review queue (M)
**Files:** `server.ts` (admin endpoints), `brand-twin/app/src/app/(app)/admin/billing/page.tsx`

- `GET /api/v1/admin/billing/queue` — list `pending_review` subscriptions (admin-only).
- `POST /api/v1/admin/billing/approve/:orgId` — flip to `active`, trigger first charge.
- Simple read-only admin billing screen in UI (table + approve button per row).

### 3.3 — `PaymentProcessor` interface + Razorpay (L)
**Files:** new `payment_processor.ts`, `billing.ts`

```ts
export interface PaymentProcessor {
  createOrder(params: {amount: number, currency: string, notes?: string}): Promise<{orderId: string}>;
  capturePayment(orderId: string, paymentId: string): Promise<{success: boolean}>;
  savePaymentMethod(tenantId: string, tokenId: string): Promise<void>;
  chargeOnFile(tenantId: string, amount: number): Promise<{success: boolean, receiptUrl?: string}>;
}
```

Implement `RazorpayProcessor`. Store tokenized payment method (never PAN) in the
credential vault. Webhook handler for `payment.captured` / `payment.failed`.

### 3.4 — Receipt generation (S)
**File:** `billing.ts`

On each successful charge, create a structured receipt: `{ receiptId, orgId, amount, currency,
period, chargedAt, invoiceUrl }`. Store in `receipts` table. Expose
`GET /api/v1/billing/receipts` for the UI.

---

## Phase 4 — Accounting adapters (C1 OAuth)  (~8 days · engine, parallel with Phase 3)

*Goal: COGS auto-fill on connect — no manual entry needed for brands on Zoho/QBO/Xero.*

### 4.1 — Zoho Books adapter (M)
**File:** new `zoho_adapter.ts`

OAuth 2.0 flow via existing A2 + vault. `ZohoAdapter implements CostSource`.
Pull inventory items → `unitCost` mapping. Register in `onboarding_wizard.ts` silent sweep.

### 4.2 — QuickBooks Online adapter (M)
**File:** new `quickbooks_adapter.ts`

Same pattern. Intuit OAuth. Items/products API → COGS.

### 4.3 — Xero adapter (M)
**File:** new `xero_adapter.ts`

Xero OAuth 2.0. Inventory items → unit cost.

### 4.4 — Silent COGS sweep on connect (M)
**File:** `onboarding_wizard.ts`

When a new `CostSource` connects, immediately run `getUnitCosts()` → auto-fill
`cost_cogs` on matching variants → trigger coverage recompute → emit `onboarding/event`
stage `cogs_auto_filled`. No prompt needed if coverage clears the 80% gate.

---

## Phase 5 — GA hardening  (~4 days · engine + UI, parallel with Phase 4)

*These don't gate beta but are required before opening public doors.*

### 5.1 — Formal incident severity model (M · engine)
**File:** `incident_response.ts`

Extend `IncidentResponseManager` with SEV classification:

| Level | Condition | Action |
|-------|-----------|--------|
| SEV-0 | DB unreachable / cross-tenant leak | Page on-call immediately; halt all autonomous actions |
| SEV-1 | Billing charge failure / auth outage | Page on-call within 5 min |
| SEV-2 | Adapter error rate > 10% | Alert + auto-reroute (existing `reRouteBudget`) |
| SEV-3 | Sweep stale > 2h | Slack alert; no page |

Wire to MetricsTracker alert rules already in `observability.ts`.

### 5.2 — In-app support (M · UI)
**File:** `brand-twin/app/src/components/SupportWidget.tsx`, `Nav.tsx`

Add a "?" button in the Nav that opens a support modal with:
- Link to help center (placeholder URL)
- Pre-filled email template (`support@brandtwin.io`, subject auto-populated)
- Inline "report an issue" form → `POST /api/v1/support/ticket` (or mailto fallback)

### 5.3 — P2.2 COGS provenance per variant (S · engine)
**File:** `poas_scheduler.ts`, `supabase_client.ts`

Persist the `CogsGap.provenance` field on each variant row so audit queries can
distinguish `manual` vs `category_estimate` vs `accounting_sync` entries.

### 5.4 — P2.3 holdout analysis (M · engine + UI)
**Files:** `server.ts` (already has `/telemetry/lift`), `brand-twin/app/`

Config: per-brand holdout split (geo or time). On each POAS scheduler run, compute
treatment vs holdout POAS; call `/telemetry/lift`; persist `incremental_lift` per period.
Add a simple lift panel to the Dashboard screen.

---

## A0 — External clocks (start immediately, gate P4 only)

These have multi-week approval queues. Start all today.

| Item | Why it blocks |
|------|---------------|
| Google Ads Standard Access | Required for live ad data reads |
| Meta `ads_read`/`ads_management` App Review | Required for Meta integration |
| Google OAuth consent screen verification | Required for Google Ads OAuth |
| Shopify Partner app listing | Required for Shopify OAuth in production |
| Legal counsel for real ToS/Privacy/DPA copy | Current copy is placeholder — gates public launch |

---

## Critical path to GA

```
TODAY:  A0 applications (weeks wait, gate P4 only) ─────────────────────────────────────────► unblocks P4
        merge sync-google3-c2-ui → main in engine repo

Week 1:  Phase 1 — beta unlock
         (rec_events DB, shown/exec events, invite close, spend caps, ToS checkbox)

Week 2:  Phase 2 — C1 COGS endpoints  ◄── flips Costs screen live
         Phase 4 starts in parallel (Zoho/QBO/Xero adapters)

Week 2–3: Phase 3 — C2 billing lifecycle + Razorpay  ◄── first paid conversion possible

Week 3–4: Phase 4 continues (accounting adapters finish)
           Phase 5 — GA hardening (severity model, in-app support)

Week 5–6: A0 approvals clear → GA launch gate opens
```

**Exit gates before GA:**
- [ ] ≥1 beta brand with real POAS + healing cards + measured POAS lift
- [ ] P2.1 dismiss telemetry computable (all 5 events in DB, not just dismissed)
- [ ] Zero cross-tenant data leaks verified
- [ ] Billing end-to-end: trial → suggest → approve → first Razorpay charge
- [ ] Invite allowlist on; doors closed to public
- [ ] All A0 approvals received
- [ ] Real legal copy in ToS/Privacy/DPA

---

## Build order for the engine team

Sequential unblocking order within each phase:

```
1.1 (rec_events migration + live writes)
  └─► 1.2 (shown/exec events — needs table)
  └─► 2.2/2.3/2.4 (COGS endpoints — unblocks UI mock→live flip)
        └─► 2.5 (estimator — enriches gaps list)
        └─► 2.6 (readiness gate — uses coverage)
              └─► 4.x (adapters feed the same coverage)

1.4 (spend caps — needs new table)
1.3 (invite close — config flip, lowest risk)
1.5 (ToS checkbox — UI change)

3.1 (trial jobs — runs on scheduler tick)
  └─► 3.2 (ops queue — needs pending_review to exist)
        └─► 3.3 (Razorpay — approve triggers first charge)
              └─► 3.4 (receipts — on charge success)

5.1 (severity model — uses existing MetricsTracker)
5.2 (support widget — standalone UI)
```
