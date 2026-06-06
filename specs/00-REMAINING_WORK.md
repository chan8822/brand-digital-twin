# Remaining Work — Single Consolidated Plan

> **This is the one file to read.** It supersedes the scattered `P0-EXECUTION`,
> `P1-EXECUTION`, `P1-PUNCHLIST`, `P2/P3/P4-EXECUTION` docs — those remain as
> detailed references, but status lives **here**.
>
> Verified against upstream `chandansinghr-ship-it/brand-digital-twin` @ `b472992`
> (fetched 2026-06-06). Engine work lands in that repo; UI work lands in
> `brand-twin/app/` (this repo).
>
> **Legend:** ✅ done · 🟡 partial · ☐ to build
> **Sizes:** S ≤0.5d · M 1–2d · L 3–5d · XL 1–2wk

---

## Where we are

**P0, P1, and Phase B are fully done.** The engine, UI, hardening, observability, DB
safety, secrets, security review, load test, staging scripts, legal routes, credential
revocation, and cookie consent all landed by `b472992`. C2 billing endpoints are live.

| Phase | State | One-line |
|-------|-------|----------|
| **P0** — flip UI mock→live | ✅ **DONE** | all 4 endpoints + sort + autonomy-409 synced in `f10e351` |
| **P1** — hardening & ops | ✅ **DONE** | P1.3 staging scripts + P1.7 real load test landed in `eb9c272` / `70bc7e8` |
| **P2** — private beta (3 brands) | 🟡 **in progress** | onboarding data being gathered; P2.1 dismiss telemetry UI shipped |
| **P3B** — lawful | ✅ **DONE** | B1.4 + B2.3 + B2.4 landed in `b472992`/`3469815`; ported to brand-twin/app/ |
| **P3C** — self-serve paid | 🟡 C2 engine live · **C1 engine next** | C2.a/b billing endpoints live (`19f80cc`); COGS engine + C1 endpoints remain |
| **P4** — GA | ☐ blocked on A0 | external approval clocks — start now, gate launch only |

**The frontier is now the Phase C1 *engine*** (COGS adapters + readiness gate +
C1.a/b/c endpoints). C2 billing endpoints are live and the UI auto-flips to live
when `NEXT_PUBLIC_API_URL` is set. The P2.1 dismiss UI is built; the engine needs
`recommendation_events` table + dismiss endpoint.

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
- ✅ **P2.1 dismiss-with-reason UI** — `HealingCard.tsx` reason enum
  (`dont_believe | cant_act | disagree | too_hard | other`) → `useDismissRecommendation`.
  Engine: `POST /recommendations/:id/dismiss` + `recommendation_events` table
  (`C-ENDPOINT_GAPS_SPEC.md` P2.1).
- ☐ Engine emits `shown`/`approved`/`executed`/`reversed` events for the derived
  metrics (time-to-first-action, CRITICAL action-rate, reversal rate).
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

### Phase B — Lawful  ✅ *DONE (`b472992`)*

| # | Item | State | Evidence |
|---|------|-------|----------|
| B1 | Data rights: hard-delete cascade + signed export + PII anonymization | ✅ | `supabase_client.ts`, `poas_scheduler.ts` |
| B1.4 | Credential-vault secret revocation wired into delete cascade | ✅ | `credential_vault.ts` (`b472992`) |
| B2.1 | `/legal/tos` `/privacy` `/dpa` routes + pages | ✅ | engine `server.ts:467+`; UI pages in `brand-twin/app/src/app/legal/` |
| B2.2 | Acceptance log at signup + Consent Mode v2 redaction | ✅ | `user_auth.ts`, `server.ts:232` |
| B2.3 | Version-bump re-prompt on ToS change | ✅ | `providers.tsx` 403-handler + `auth.ts` `acceptLegalDoc` (`3469815`, ported) |
| B2.4 | Cookie consent banner, essential-only default | ✅ | `CookieConsentBanner.tsx` + `layout.tsx` (`3469815`, ported) |
| **B4** | **Abuse: per-tenant quotas + new-account spend caps** | ☐ M | `rate_limiter.ts`, `user_auth.ts` |
| B3.7 | `incident_response.ts` runbook + severity model | ☐ M | `incident_response.ts` |
| B3.8 | In-app support + help center | ☐ M | `brand-twin/app/` |

> B4, B3.7, B3.8 are non-blocking for beta. B4 is required before any public signup.

### Phase C — Self-serve value + money  🟡 *C2 engine live; C1 engine next*

UI built in `brand-twin/app/` (Costs `/costs`, Billing `/billing`), mock-gated and
wired to six specced endpoints (`C-ENDPOINT_GAPS_SPEC.md`). C2 billing endpoints
landed at `19f80cc` (`subscriptions` table + `GET /billing/subscription` + `POST
/billing/suggest`). C1 COGS endpoints remain greenfield.

**C1 — COGS aggregator:**
- ✅ Pareto COGS entry UI + coverage gate — `costs/page.tsx`, `CogsEntryRow.tsx`
- ☐ `CostSource` interface; conform `tally_adapter.ts` *(S)*
- ☐ `zoho_adapter.ts` · `quickbooks_adapter.ts` · `xero_adapter.ts` — OAuth via A2 *(M each)*
- ☐ Silent COGS sweep on connect → auto-fill (`onboarding_wizard.ts`) *(M)*
- ☐ Category-average estimator → `estimatedCogs` tag (`poas_calculator.ts`) *(M)*
- ☐ Readiness gate: low coverage → directional-only advice (`risk_radar.ts`) *(M)*
- ☐ Endpoints C1.a/b/c (`GET /cogs/coverage`, `GET /cogs/gaps`, `POST /cogs`)

**C2 — Billing + suggest-an-amount:**
- ✅ Suggest-an-amount screen + trial strip + state panels + value recap — `billing/page.tsx`
- ✅ `subscriptions` table + `GET /billing/subscription` + `POST /billing/suggest` (`19f80cc`)
- ☐ Trial lifecycle jobs: day-14 nudge, day-15 flip, recurring, dunning *(M)*
- ☐ Ops review queue → approve → first charge — `billing.ts` (+ admin UI) *(M)*
- ☐ `PaymentProcessor` iface + Razorpay + tokenised card — `payment_processor.ts` *(L)*
- ☐ In-house receipt/invoice generation — `billing.ts` *(S)*

---

## P4 — GA  ☐ *blocked on A0 external clocks*

**Start these today — they run in background and can't be compressed:**
- [ ] Google Ads Standard Access approved
- [ ] Meta `ads_read`/`ads_management` App Review approved
- [ ] Google OAuth consent screen verified (sensitive scopes)
- [ ] Shopify app listed / distributable
- [ ] Legal docs signed off by counsel (feeds B2.1)

**GA definition of done:**
- [ ] Stranger signs up → creates brand → connects Google Ads + Shopify via OAuth → sees live sweep, real POAS, healing cards
- [ ] New accounts at OBSERVE; no autonomous spend until earned
- [ ] No raw tokens logged/returned; state-forgery tests green
- [ ] Billing live; first self-serve paid conversion completed
- [ ] Rollback plan + incident runbook rehearsed

---

## Critical path

```
A0 external clocks ─────────────────────────────────────────────► gate P4 only (start NOW)

P2 beta ──► C1 COGS engine (adapters + 3 endpoints) ──► C2 lifecycle jobs + payment rail ──► P4 GA
(in progress)  (remaining greenfield)                    (C2.a/b live; jobs+Razorpay next)
```

**Next three moves:**
1. **Start A0 applications today** — external review queues, weeks of wait, gate P4 only.
2. **Phase C1 engine** — `CostSource` interface + C1.a/b/c endpoints flip the Costs
   screen live; behind them sit the COGS adapters, estimator, and readiness gate.
3. **P2.1 engine** — `recommendation_events` table + `POST /recommendations/:id/dismiss`
   so dismiss telemetry is measured, not lost (the UI is already wired).
