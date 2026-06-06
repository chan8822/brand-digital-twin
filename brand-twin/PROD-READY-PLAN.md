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
| P1 — hardening | 🟡 | floor done; scheduler database migration & safety loops pending |
| Phase B — lawful | ✅ | B1.4 revocation, B2.3 ToS re-prompt, B2.4 cookie banner, SEV model, legal routes |
| C1 COGS engine | ✅ | `CostSource` + Tally/Zoho/QBO/Xero adapters + 3 endpoints + estimator + readiness gate |
| C2 billing engine | ✅ | subscriptions table + lifecycle jobs + Razorpay + receipts + ops queue + support ticket |
| Phase C UI | ✅ | Costs + Billing + Admin billing queue screens; all hooks wired; P2.1 dismiss UI |
| B3.8 support widget | ✅ | `SupportWidget.tsx` + `Nav.tsx` button + `useSupportTicket` hook |
| Marketing LP | ✅ | Live-GA LP at `/`: autonomy-ladder hook + agency channel + Risk Radar save; legal footer |
| Strategy + CUJs | ✅ | `STRATEGY.md` (Porter/SWOT/phase gates) + `CUJS.md` (7 journeys mapped to routes) |
| 3-brand demo presets | ✅ | Glow & Co / Nutra Boost / Cleansly brand switcher in connect page mock banner |
| recommendation_events live | ✅ | migration 0003+0006; live Supabase writes |
| shown / approved / dismissed / reversed events | ✅ | all tracked |
| executed events (osActs) | 🟡 | `POST /actions` handler needs one S-fix to emit `recommendation_events` row |
| P2 beta (3 brands) | 🟡 | not yet onboarded — real OAuth + POAS needed for exit gate |
| A0 platform approvals | ✅ | Google Ads · Meta · OAuth · Shopify all cleared |
| P4 GA | 🟡 | gated only on P2 beta validation + legal-copy confirm (no external waits left) |

---

## Immediate action required

**Onboard 3 beta brands** with real Google Ads + Shopify OAuth. Engine is complete
at `646a2cd`. All screens are mock-gated — setting `NEXT_PUBLIC_API_URL` flips them
live. The only remaining code work is two S-fixes and the database scheduler.

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

### 2. Hardening Safeguards & Database Scheduler
*   **P1.8: Database-backed jobs queue (M · engine)**: Migrate `poas_scheduler.ts` off in-process `setInterval`/`setTimeout` to a persisted `pending_jobs` queue in Supabase. Ensures daily POAS reconciliations and sweeps are not lost during server restarts.
*   **P1.9: Pre-flight cooldown safeguards (S · engine)**: Deploy a `CooldownManager` to enforce minimum cooldown constraints between automated bid adjustments (e.g. 24h limit) and rate-limit API calls via Token Bucket.
*   **P1.10: Closed-loop telemetry & circuit breaker (M · engine)**: Monitor event signal loss and mutation failure rates. If failure rates exceed 5%, automatically trip the system state back to read-only `OBSERVE` mode.
*   **P1.11: PII log scrubbing middleware (S · engine)**: Implement recursive sanitization in the error sinks to redact OAuth tokens and credit card details.

---

## A0 — External clocks (platform approvals CLEARED)

All four platform clocks are cleared, so GA is no longer gated on external waits.
Product-specific legal drafts are written and ready for counsel **review-and-approve**
(faster/cheaper than briefing from scratch). The remaining gate is the **P2 beta
validation** (3 brands, real POAS + measured lift) plus counsel sign-off on the drafts.

---

## Build order + critical path

```
Engine DONE @ 646a2cd · Platform approvals CLEARED ──────────────────────────────────
                                                                                     │
NOW:    Set NEXT_PUBLIC_API_URL → flip all screens live                              │
        Onboard 3 beta brands (real Google Ads + Shopify OAuth)                       │
        Deploy pending_jobs database queue & CooldownManager                         │
                                                                                     │
Week 1: P2 exit gate validation (real POAS + measured lift)                          │
        `executed` events S-fix in engine                                            │
        Confirm counsel-reviewed legal copy                                          ▼
                                                                              GA gate opens
```

**P2 exit gate (before GA):**
- [ ] ≥1 beta brand with real POAS + healing + measured lift
- [ ] All 5 recommendation event types in DB (shown/approved/executed/dismissed/reversed)
- [ ] Zero cross-tenant data leaks in logs + DB queries
- [ ] Spend caps tested: raise-above-limit → QUEUE not AUTO_EXECUTE
- [ ] Invite allowlist enforced: unknown email → 403

---

## Post-GA Roadmap: Multi-Vertical & AI Expansion

Following GA, the platform expands across paid search, lead generation, and awareness verticals:

1.  **AI-Ready Bidding (Offline Profit Ingest)**: Sync daily transaction gross profit values directly to Google Ads and Meta APIs using privacy-safe transaction identifiers. This allows ad networks to optimize dynamically against true margin (VBB).
2.  **SKU-to-Ad Group Budget Redistribution**: Automatically adjust variant budget allocation, routing spend to high-margin, in-stock items.
3.  **Lead Generation Vertical**: Integrate HubSpot and Salesforce CRM adapters to optimize pipeline progression values (PROAS) and feed qualified conversion events back via Google Ads Data Manager (GADM).
4.  **Brand Awareness Vertical**: Query lift studies and display metrics to optimize cost per lifted user (CPLU) and enforce frequency saturation caps.
