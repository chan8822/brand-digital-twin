# Remaining Work — Single Consolidated Plan

> **This is the one file to read.** It supersedes the scattered `P0-EXECUTION`,
> `P1-EXECUTION`, `P1-PUNCHLIST`, `P2/P3/P4-EXECUTION` docs — those remain as
> detailed references, but status lives **here**.
>
> Verified against upstream `chandansinghr-ship-it/brand-digital-twin` @ `646a2cd`
> on `main` (fetched 2026-06-06). Engine main is now **fully ahead** — all Phase B,
> C1 COGS, C2 billing lifecycle, Razorpay, receipts, SEV model, and support ticket
> endpoints landed in one large merge. UI work lands in `brand-twin/app/` (this repo).
>
> **Legend:** ✅ done · 🟡 partial · ☐ to build
> **Sizes:** S ≤0.5d · M 1–2d · L 3–5d · XL 1–2wk

---

## Where we are

**Engine is complete** at `646a2cd`. All P0→P3C engine work has landed on `main`.
UI is now the only remaining surface — admin billing queue screen, support widget,
and new React Query hooks all built and passing type-check + build as of 2026-06-06.

| Phase | State | One-line |
|-------|-------|----------|
| **P0** — flip UI mock→live | ✅ **DONE** | all 4 endpoints + sort + autonomy-409 (`f10e351`) |
| **P1** — hardening & ops | ✅ **DONE** | full suite landed by `cec5437` |
| **P2** — private beta (3 brands) | 🟡 **in progress** | onboard 3 real brands; P2.1 UI built; executed event still needs engine S-fix |
| **P3B** — lawful | ✅ **DONE** | B1.4/B2.3/B2.4 + invite allowlist ON + spend caps + secret providers + SEV model |
| **P3C** — self-serve paid | ✅ **Engine DONE** · 🟡 **UI complete** | all C1/C2 endpoints + Razorpay live in engine; admin billing queue + receipts UI built |
| **P4** — GA | ☐ blocked on A0 | external approval clocks — start now |

**The frontier:** (1) onboard 3 beta brands, (2) A0 external clock applications,
(3) wire real `NEXT_PUBLIC_API_URL` to flip all screens from mock to live.
Full plan with build order in `PROD-READY-PLAN.md`.

---

## P0 ✅ All seams closed (`cec5437`)

| Endpoint | Status |
|----------|--------|
| `GET /api/v1/integrations` | ✅ |
| `GET /api/v1/sweep` (sorted CRITICAL→WARNING→OPPORTUNITY, dollarImpact desc) | ✅ |
| `GET/POST /api/v1/autonomy` (POST rejects raise-above-earned with 409) | ✅ |
| `GET /api/v1/auth/ticket` (single-use HMAC, burned on use) | ✅ |
| UI ticket-auth for OAuth redirect + SSE (`brand-twin/app/`) | ✅ |

**To activate:** set `NEXT_PUBLIC_API_URL` → the engine origin in
`brand-twin/app/.env.local`. `USE_MOCK` flips false automatically.

---

## P1 ✅ Hardening complete (`cec5437`)

| # | Item | Evidence |
|---|------|----------|
| P1.1 | Atomic job claim | `claimNextOverdueJob` + `FOR UPDATE SKIP LOCKED` + concurrency test |
| P1.2 | Observability | `MetricsTracker` alert rules + `DatabaseErrorSink` redaction (`observability.ts`, `migrations/0002`) |
| P1.3 | Staging + rollback | `scripts/deploy.sh`, `scripts/rollback.sh`, `scripts/rollback_recent_actions.js`; governance engine rollback wired (`eb9c272`) |
| P1.4 | DB safety | Versioned migrations (`0001_init`, `0002`) + backup export + tested restore drill |
| P1.5 | Secrets | `SecretProvider`/`EnvSecretProvider`/`ManagedSecretProvider` (VaultClient), boot-validated |
| P1.6 | Security review | npm-audit CI gate + token-leak scrubber + OAuth callback-state validation + adversarial tests |
| P1.7 | Load test (exit gate) | `tests/e2e/specs/real_load_test.ts` (252 lines) + `/metrics` endpoint (`70bc7e8`) |

---

## P2 — Private Beta (3 real brands)  🟡 *in progress — the trust gate*

No public signup. Onboard 3 in-bag brands by hand (real Google Ads + Shopify OAuth).
*Spec: `VALIDATION_PLAN.md` · key files: `onboarding_simulator.ts`, `poas_scheduler.ts`*

**Instrumentation (so H1–H3 are measured, not eyeballed):**
- ✅ **P2.1 dismiss-with-reason UI** — `HealingCard.tsx` + `useDismissRecommendation`.
  Engine: dismiss endpoint live + `recommendation_events` table with live Supabase writes
  (migrations 0003 + 0006). (`C-ENDPOINT_GAPS_SPEC.md` P2.1).
- ✅ `shown` events emitted on `/recommendations`; `approved` on approval execution;
  `dismissed` + `reversed` tracked. 🟡 **`executed` for autonomous osActs still missing** —
  one S fix in `server.ts` `POST /actions` handler.
- ☐ P2.2 COGS provenance tag (shipped in `CogsGap.provenance`) persisted per variant.
- ☐ P2.3 holdout support (geo/time split → incremental vs attributed POAS).
- ☐ P2.4 doors-closed: public signup behind invite/allowlist (off by default).

**Exit gate — must pass before any public exposure:**
- [ ] Each brand produces real POAS + live sweep + healing cards
- [ ] ≥1 healing recommendation per brand acted on with **measured POAS lift**
- [ ] Zero cross-tenant data leaks (verified in logs + DB queries)
- [ ] Full 7-stage onboarding telemetry trace per brand
- [ ] No false "ads can't fix" calls that were actually ad-fixable (manual audit)

---

## P3 — Lawful & Paid

### Phase B — Lawful  ✅ *DONE (`3126858` on `sync-google3-c2-ui`)*

| # | Item | State | Evidence |
|---|------|-------|----------|
| B1 | Data rights: hard-delete cascade + signed export + PII anonymization | ✅ | `supabase_client.ts`, `poas_scheduler.ts` |
| B1.4 | Credential-vault secret revocation wired into delete cascade | ✅ | `credential_vault.ts` (`b472992`) |
| B2.1 | `/legal/tos` `/privacy` `/dpa` routes + pages | ✅ | engine `server.ts`; UI pages `brand-twin/app/src/app/legal/` |
| B2.2 | Acceptance log at signup + Consent Mode v2 redaction | ✅ | `user_auth.ts`, `server.ts` |
| B2.3 | Version-bump re-prompt on ToS change | ✅ | `providers.tsx` 403-handler + `auth.ts` `acceptLegalDoc` |
| B2.4 | Cookie consent banner, essential-only default | ✅ | `CookieConsentBanner.tsx` + `layout.tsx` |
| **B4** | **Abuse: per-tenant quotas + spend caps** | ✅ | `governance_engine.ts` enforces `max_per_action_limit` + `max_daily_limit`; migration 0007 |
| B3.7 | `incident_response.ts` runbook + severity model | ✅ | `SeverityLevel = 'SEV-0'|'SEV-1'|'SEV-2'|'SEV-3'`; wired to `MetricsTracker` alert rules (`646a2cd`) |
| B3.8 | In-app support + help center | ✅ | `SupportWidget.tsx` + `Nav.tsx` button + `useSupportTicket` hook → `POST /api/v1/support/ticket` |

### Phase C — Self-serve value + money  ✅ *Engine DONE · UI complete*

All screens built in `brand-twin/app/`, mock-gated, wired to live endpoints.
Engine `646a2cd` has all C1/C2 endpoints + Razorpay + receipts + support ticket live.

**C1 — COGS aggregator:**
- ✅ Pareto COGS entry UI + coverage gate — `costs/page.tsx`, `CogsEntryRow.tsx`
- ✅ `CostSource` interface; `tally_adapter.ts`, `zoho_books_adapter.ts`, `quickbooks_adapter.ts`, `xero_adapter.ts` (`646a2cd`)
- ✅ Silent COGS sweep on connect → auto-fill (`onboarding_wizard.ts`)
- ✅ Category-average estimator → `estimatedCogs` tag (`poas_calculator.ts`)
- ✅ Readiness gate: low coverage → directional-only advice (`risk_radar.ts`)
- ✅ Endpoints `GET /cogs/coverage`, `GET /cogs/gaps`, `POST /cogs` — hooks `useCogsCoverage`, `useCogsGaps`, `useSaveCogs`

**C2 — Billing + suggest-an-amount:**
- ✅ Suggest-an-amount screen + trial strip + state panels + value recap — `billing/page.tsx`
- ✅ `subscriptions` table + `GET /billing/subscription` + `POST /billing/suggest`
- ✅ `GET/POST /api/v1/tenant-limits` — hooks `useTenantLimits`, `useSetTenantLimits`
- ✅ Trial lifecycle jobs: day-14 nudge, day-15 flip, recurring, dunning (`poas_scheduler.ts`, `646a2cd`)
- ✅ Ops review queue + admin UI — `/admin/billing` screen + `useAdminBillingQueue` + `useApproveBilling`
- ✅ `PaymentProcessor` iface + `RazorpayPaymentProcessor` + tokenised card (never stores PAN, `646a2cd`)
- ✅ Receipt generation + `GET /billing/receipts` — hook `useReceipts`

---

## P4 — GA  ☐ *blocked on A0 external clocks*

**Start these today — they run in background and can't be compressed:**
- [ ] Google Ads Standard Access approved
- [ ] Meta `ads_read`/`ads_management` App Review approved
- [ ] Google OAuth consent screen verified (sensitive scopes)
- [ ] Shopify app listed / distributable
- [ ] Legal docs signed off by counsel (real ToS/Privacy/DPA copy)

**GA definition of done:**
- [ ] Stranger signs up → creates brand → connects Google Ads + Shopify via OAuth → sees live sweep, real POAS, healing cards
- [ ] New accounts at OBSERVE; no autonomous spend until earned
- [ ] No raw tokens logged/returned; state-forgery tests green
- [ ] Billing live; first self-serve paid conversion completed (trial → suggest → approve → charge)
- [ ] Rollback plan + incident runbook rehearsed

---

## Critical path

```
A0 external clocks ─────────────────────────────────────────────────────────► gate P4 only (start NOW)

P2 beta (3 brands, real POAS) ──► wire NEXT_PUBLIC_API_URL → flip mock→live ──► P4 GA
(in progress)                     (all endpoints live in engine @ 646a2cd)
```

**Next three moves:**
1. **Onboard 3 beta brands** with real Google Ads + Shopify OAuth — runs in parallel with A0.
2. **Set `NEXT_PUBLIC_API_URL`** in production env to flip every UI screen from mock to live data.
3. **A0 external clocks** — submit Google Ads Standard Access + Meta App Review + Shopify listing applications today; these take weeks and gate P4 only.
