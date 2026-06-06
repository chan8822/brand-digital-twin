# Production Readiness Plan — Brand Digital Twin OS

> **Single source of truth.** Verified against upstream
> `chandansinghr-ship-it/brand-digital-twin` @ `646a2cd` on `main`
> (fetched 2026-06-06). **Engine main is complete** — all P0→P3C work landed.
>
> Engine work → `chandansinghr-ship-it/brand-digital-twin`  
> UI work → `brand-twin/app/` (this repo)
>
> **Legend:** ✅ done · 🟡 partial · ☐ to build  
> **Sizes:** S ≤0.5d · M 1–2d · L 3–5d · XL 1–2wk

---

## Where we are (@ `646a2cd` on engine `main` · UI @ `chan8822/Wellness-Foods`)

| Area | State | One-line |
|------|-------|----------|
| P0 — mock→live seams | ✅ | all 4 endpoints + sort + autonomy-409 |
| P1 — hardening | ✅ | atomic jobs, observability, staging, migrations, secrets, security, load test |
| Phase B — lawful | ✅ | B1.4 revocation, B2.3 ToS re-prompt, B2.4 cookie banner, SEV model, legal routes |
| C1 COGS engine | ✅ | `CostSource` + Tally/Zoho/QBO/Xero adapters + 3 endpoints + estimator + readiness gate |
| C2 billing engine | ✅ | subscriptions table + lifecycle jobs + Razorpay + receipts + ops queue + support ticket |
| Phase C UI | ✅ | Costs + Billing + Admin billing queue screens; all hooks wired; P2.1 dismiss UI |
| B3.8 support widget | ✅ | `SupportWidget.tsx` + `Nav.tsx` button + `useSupportTicket` hook |
| recommendation_events live | ✅ | migration 0003+0006; live Supabase writes |
| shown / approved / dismissed / reversed events | ✅ | all tracked |
| executed events (osActs) | 🟡 | `POST /actions` handler needs one S-fix to emit `recommendation_events` row |
| P2 beta (3 brands) | 🟡 | not yet onboarded — real OAuth + POAS needed for exit gate |
| P4 GA | ☐ | blocked on A0 external clocks — start applications now |

---

## Immediate action required

**Onboard 3 beta brands** with real Google Ads + Shopify OAuth. Engine is complete
at `646a2cd`. All screens are mock-gated — setting `NEXT_PUBLIC_API_URL` flips them
live. The only remaining code work is two S-fixes.

---

## Remaining work

### 1. `executed` event for autonomous osActs (S · engine)
**File:** `server.ts` — `POST /api/v1/actions` handler

After `outcome.status === 'executed'`, emit a `recommendation_events` row with
`action: 'executed'`. Mirrors the pattern for `approved` in the approvals handler.
Without this, H1 time-to-first-action is uncomputable for OS-initiated actions.

```ts
if (outcome.status === 'executed') {
  const event: RecommendationEventEntry = {
    event_id: `evt_exec_${req.idempotencyKey}_${crypto.randomUUID()}`,
    recommendation_id: req.idempotencyKey,
    tenant_id: ctx.tenant.tenantId,
    action: 'executed',
    reason: null,
    created_at: new Date().toISOString(),
  };
  void requestDb.saveRecommendationEvent(event).catch(console.error);
}
```

### 2. ✅ C1 COGS engine — DONE (`646a2cd`)
`CostSource` interface, `cost_source.ts`, `zoho_books_adapter.ts`, `quickbooks_adapter.ts`,
`xero_adapter.ts`, `cogs_manager.ts` (ad-spend-weighted coverage), `GET /cogs/coverage`,
`GET /cogs/gaps`, `POST /cogs`. Estimator tags `provenance: 'category_estimate'`.
Readiness gate in `risk_radar.ts` demotes to `directional_only` when coverage < 80%.

UI hooks: `useCogsCoverage`, `useCogsGaps`, `useSaveCogs` — all in `queries.ts`.

### 3. ✅ C2 Billing lifecycle + payment — DONE (`646a2cd`)
- Trial lifecycle: `billing_trial_nudge` (day 14), `billing_trial_flip` (day 15),
  recurring charge, dunning retries (days 1/3/7 → `suspended`) in `poas_scheduler.ts`.
- Ops review queue: `GET /admin/billing/queue` + `POST /admin/billing/approve/:orgId`.
  Admin UI: `/admin/billing` screen + `useAdminBillingQueue` + `useApproveBilling`.
- `PaymentProcessor` interface + `RazorpayPaymentProcessor` with real Razorpay API;
  tokenised card in credential vault; webhook for `payment.captured`/`payment.failed`.
- Receipt generation: `receipts` table + `GET /billing/receipts`. UI hook: `useReceipts`.

### 4. ✅ Accounting adapters — DONE (`646a2cd`)
`zoho_books_adapter.ts`, `quickbooks_adapter.ts`, `xero_adapter.ts` — all implement
`CostSource` with OAuth via the A2 credential vault. Silent sweep on connect registered
in `onboarding_wizard.ts`.

### 5. ✅ GA hardening — DONE (`646a2cd`)
- SEV model: `SeverityLevel = 'SEV-0'|'SEV-1'|'SEV-2'|'SEV-3'` in `incident_response.ts`,
  wired to `MetricsTracker` alert rules.
- In-app support: `SupportWidget.tsx` + `Nav.tsx` button + `POST /api/v1/support/ticket`.
- Holdout panel (`lift_sync` job in `poas_scheduler.ts`): 🟡 UI lift panel on Dashboard
  is the one remaining optional piece for P2.3.

---

## A0 — External clocks (start now, run background, gate P4 only)

| Item | Blocks |
|------|--------|
| Google Ads Standard Access application | Live ad reads |
| Meta `ads_read`/`ads_management` App Review | Meta integration |
| Google OAuth consent screen verification | Google Ads OAuth |
| Shopify Partner app listing | Shopify OAuth in prod |
| Legal counsel: real ToS/Privacy/DPA copy | Public launch |

---

## Build order + critical path

```
Engine DONE @ 646a2cd ──────────────────────────────────────────────────────────────
                                                                                     │
TODAY:  Start A0 applications (weeks wait; gate P4 only) ────────────────────────► P4 unlocks
        Onboard 3 beta brands (real OAuth + POAS)                                    │
        Set NEXT_PUBLIC_API_URL → flip all screens live                              │
                                                                                     │
Week 1:  Fix `executed` events S-fix in engine                                       │
         P2 exit gate validation (real POAS lift measured)                           │
                                                                                     │
Week 2+: A0 approvals clear ──────────────────────────────────────────────────────► GA gate opens
```

**P2 exit gate (before GA):**
- [ ] ≥1 beta brand with real POAS + healing + measured lift
- [ ] All 5 recommendation event types in DB (shown/approved/executed/dismissed/reversed)
- [ ] Zero cross-tenant data leaks in logs + DB queries
- [ ] Spend caps tested: raise-above-limit → QUEUE not AUTO_EXECUTE
- [ ] Invite allowlist enforced: unknown email → 403

**GA definition of done:**
- [ ] Stranger signs up (ToS accepted) → connects Google Ads + Shopify → sees live POAS + healing
- [ ] Trial → suggest → human approve → Razorpay charge succeeds
- [ ] All A0 approvals received
- [ ] Real legal copy (counsel-reviewed) in ToS/Privacy/DPA
- [ ] Rollback rehearsed; SEV model live (`646a2cd`)
