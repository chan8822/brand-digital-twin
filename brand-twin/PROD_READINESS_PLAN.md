# Production-Readiness Plan — Brand Digital Twin OS

> How the headless engine becomes a self-serve product a stranger can sign up
> for, trust with spend authority, and pay for — sequenced into gated phases.
>
> This is the **execution plan** over the feature specs. The *what* lives in
> `PHASE_A_BUILD_SPEC.md` / `PHASE_B_BUILD_SPEC.md` / `PHASE_C_BUILD_SPEC.md`.
> This file is the *order, gates, and exit criteria* — the path to prod.
>
> Grounded in upstream `chandansinghr-ship-it/brand-digital-twin` (engine is
> ~95% built: POAS, healing, sweep, cold-start, governance/trust ledger, durable
> jobs, native auth A1, A2 OAuth, profit-readiness, GDPR/legal, MCP agents).

---

## Operating principle

The engine is correct before it is public. Every phase below has a **hard exit
gate** — no phase opens its doors until the prior gate is green. Two rules never
relax, at any phase:

1. **New public accounts start at OBSERVE.** No autonomous spend until earned.
2. **No raw tokens logged or returned; no PAN stored.** Tokenisation stays with
   the processor; secrets stay in the AES-256-GCM vault.

---

## Phase map (critical path)

```
P0 Close the seams ──► P1 Hardening & ops ──► P2 Private beta ──► P3 Lawful & paid ──► P4 GA
   (4 endpoints)        (correctness+obs)      (3 real brands)     (legal+billing)     (public)
   ~1 week              ~2 weeks               ~3 weeks            ~2 weeks            gated by A0
```

External approval clocks (A0 — Google Ads Standard Access, Meta App Review,
Shopify listing, OAuth consent verification, legal docs) run in the **background
from day 1**. They gate P4, not the build. Start them now.

---

## P0 — Close the four seams (flip UI from mock to live)

**Goal:** every screen in `app/` runs against real endpoints, not mocks.
**Spec:** `A-ENDPOINT_GAPS_SPEC.md`. **Repo:** upstream engine.

| Item | Endpoint | Size |
|------|----------|------|
| A2.4 | `GET /api/v1/integrations` (wrap `getIntegrationStates`) | ~10 lines |
| A3.4 | `GET /api/v1/sweep` (`runFullSweep()` aggregator → `SweepFinding[]`) | ~40 lines |
| A3.5 | `GET/POST /api/v1/autonomy` (read trust tier; write w/ earned-tier guard) | ~30 lines |
| A2.5 | `GET /auth/ticket` — single-use HMAC ticket for OAuth redirect + SSE | ~25 lines |

**Exit gate P0:**
- [ ] All 11 UI routes render live data with `USE_MOCK=false`.
- [ ] SSE stream authenticates via ticket; live `risk_alert`/`recommendation` events invalidate queries.
- [ ] Autonomy write rejects raise-above-earned with `409`.

---

## P1 — Hardening & operations (make it safe to leave running)

**Goal:** the system is correct under concurrency and observable in failure.
**Spec:** `PHASE_B_BUILD_SPEC.md` B3 + B5.

- **B5 — Atomic job claim** (correctness prerequisite for multi-instance).
  Replace `getOverdueJobs`+`updateJobStatus` race with single
  `UPDATE … RETURNING` / `claimNextOverdueJob(now, ownerId)`. *Already landed
  upstream — confirm under multi-instance load test.*
- **B3 — Production ops:**
  - [ ] Error tracking + metrics + alerting wired into `observability.ts`.
  - [ ] CI/CD pipeline; staging environment mirroring prod.
  - [x] **CI typecheck/lint/build gate for `brand-twin/app`** (standalone, not in
        the pnpm workspace — needs its own job). Started:
        `.github/workflows/brand-twin-app-ci.yml` runs `npm ci` → typecheck →
        lint → `next build` on any change under `brand-twin/app/`. This is the
        durable, prod-mirroring answer to "does the UI compile" — not a one-off
        install in an ephemeral container. The passing build feeds staging deploy.
  - [ ] DB backup + tested restore; migration runner with rollback.
  - [ ] Secret management out of env files (vault/KMS) in prod.
  - [ ] `incident_response.ts` fleshed out; on-call + support channel.
  - [ ] `/ready` + `/health` probes wired to the orchestrator.
- **Security review:** dependency audit (no known-vuln versions), token-leak
  grep across logs, state-forgery + CSRF tests on every OAuth callback.
- **Load test:** sweep + healing under N concurrent tenants; SSE fan-out;
  job-claim contention with ≥2 workers.

**Exit gate P1:**
- [ ] Two app instances process the job queue with zero double-claims.
- [ ] A forced error surfaces in the tracker with a tenant-scoped trace, no token in payload.
- [ ] Staging deploy is one command; rollback is one command.
- [ ] Backup restore verified on a throwaway DB.

---

## P2 — Private beta (3 real brands, no public doors)

**Goal:** prove the OS acts on *truth* before anyone pays or self-serves.
**Spec:** `VALIDATION_PLAN.md`.

- [ ] Onboard the 3 in-bag brands by hand (real Google Ads + Shopify OAuth).
- [ ] Each produces real POAS (not ROAS), a live sweep, and healing cards.
- [ ] All 3 run at OBSERVE → REVIEW; no autonomous spend yet.
- [ ] Full 7-stage onboarding telemetry trace per brand.
- [ ] Track: did a recommendation, when acted on, recover the predicted dollar drag?

**Exit gate P2 (the trust gate):**
- [ ] ≥1 healing recommendation per brand acted on with measured POAS lift.
- [ ] Zero cross-tenant data leaks (verified in logs + DB queries).
- [ ] No false "ads can't fix" calls that were actually ad-fixable (manual audit).

> This is the consciously-deferred validation gate from the plan — we built the
> shell first, but we do **not** open public doors until this is green.

---

## P3 — Lawful & paid (compliance + billing)

**Goal:** make it legal to operate and possible to charge.
**Spec:** `PHASE_B_BUILD_SPEC.md` B1/B2/B4 + `PHASE_C_BUILD_SPEC.md`.

- **B1 — Data rights:** account deletion (hard-delete cascade) + signed data
  export. GDPR / India DPDP. *Landed upstream — confirm cascade completeness.*
- **B2 — Legal surfaces:** ToS / Privacy / DPA / cookie consent + acceptance log.
- **B4 — Abuse controls:** signup email verification, per-tenant quotas (extend
  `rate_limiter.ts`), new-account spend caps via trust ledger.
- **C1 — COGS aggregator:** in-house connectors (extend `tally_adapter.ts` to
  QuickBooks/Xero/Zoho) + Pareto manual-entry UI + category-average estimate.
  Profit Readiness **hard-gates advice** when coverage is too low.
- **C2 — Billing:** subscription state machine, 15-day trial lifecycle,
  suggest-an-amount conversion flow (amount+note → human approve → activate),
  receipts. Rail: Razorpay (India) / direct card processor — thin orchestration.

**Exit gate P3:**
- [ ] A user can delete their account and get a complete export.
- [ ] Legal pages live; acceptance logged at signup.
- [ ] Trial → paid transition works end-to-end with a real (test-mode) charge.
- [ ] Profit Readiness blocks advice below the coverage threshold.

---

## P4 — General availability (open the doors)

**Goal:** a stranger self-serves to first POAS with no human in the loop.

**Blocked on A0 external clocks** — do not open until all clear:
- [ ] Google Ads Standard Access approved.
- [ ] Meta `ads_read`/`ads_management` App Review approved.
- [ ] Google OAuth consent screen verified (sensitive scopes).
- [ ] Shopify app listed / distributable.
- [ ] Legal docs signed off by counsel.

**GA exit gate (definition of done):**
- [ ] A stranger signs up → creates a brand → connects Google Ads + Shopify via
      OAuth (no human) → sees a live sweep, real POAS, and healing cards.
- [ ] New accounts at OBSERVE; no autonomous spend possible until earned.
- [ ] No raw tokens logged or returned; state-forgery tests green.
- [ ] Billing live; first self-serve paid conversion completed.
- [ ] Rollback plan + incident runbook rehearsed.

---

## Dependency summary

```
A0 external clocks ────────────────────────────────────────────► gates P4 only
P0 seams ──► P1 hardening ──► P2 beta (trust gate) ──► P3 lawful+paid ──► P4 GA
            B5 atomic claim          must pass before        legal blocks
            is a P1 blocker          any public exposure      operation
```

**Single longest pole:** the A0 approval clocks (multi-week). Everything else is
build work that fits inside their window if started in parallel today.
