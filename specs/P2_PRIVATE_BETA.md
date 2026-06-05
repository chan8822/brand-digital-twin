# P2 Execution — Private Beta (3 brands, no public doors)

> The trust gate: prove the OS acts on *truth* before anyone self-serves or pays.
> The **what/why** is fully specified in `VALIDATION_PLAN.md` (hypotheses H1–H3,
> recruit criteria, thresholds, protocol). This doc adds the **execution layer**:
> the instrumentation the system must emit to *measure* H1–H3, the onboarding
> runbook, and the enforcement that keeps public doors shut.
>
> Grounded in `brand-digital-twin` @ `fb03ddd`.

---

## What already exists (don't rebuild)
- **Onboarding stage telemetry** — `OnboardingSimulator.recordStage()` emits the
  7 stages (`goal_declared` → `connected` → `sweep_started` → `first_poas_computed`
  → `sweep_complete` → `first_healing_card_shown` → `first_action_taken`).
- **Profit Readiness scoring** — `profit_readiness.ts` (`cogsCoverage`, `score`,
  `status`) already answers H2's "≥80% readiness" question numerically.
- **Healing card shape** — `userApproves: Prescription[]` (`healing_types.ts:113`)
  drives the approve path.

## The instrumentation gap (build this — it's how H1–H3 get measured)
The product can *show* truth but can't yet *measure whether brands act on it*.
Without these, P2 produces anecdotes, not a defensible go/no-go.

### P2.1 — Action + ignore telemetry (answers H1, the core bet)
- [ ] **`recommendation_events` table:** one row per card lifecycle event —
      `{ event_id, tenant_id, card_id, finding_code, severity, event:'shown'|'approved'|'executed'|'dismissed'|'reversed', dollar_impact, created_at }`.
- [ ] **Dismiss reason capture (richest signal):** the dismiss action requires a
      reason enum — `dont_believe | cant_act | disagree | too_hard | other` + free
      text. Wire into the UI dismiss control + persist on the event.
- [ ] **Derived metrics** (query, not new storage): time-to-first-action
      (shown→approved), action rate on CRITICAL within 7d, Tier-1/2/3 split,
      reversal rate (executed→reversed).

### P2.2 — COGS provenance + readiness timing (answers H2)
- [ ] **COGS source tag** on each variant's cost: `silent_sweep | accounting_sync |
      invoice_parse | manual | category_estimate`. (If everyone falls through to
      `manual`, the auto-fetch isn't working — the whole H2 finding.)
- [ ] **Readiness timeline:** timestamp when a tenant crosses readiness ≥80%, so
      "median time-to-readiness < 30 min" is measurable, not eyeballed.
- [ ] **Estimate-vs-actual delta:** when a brand later enters real COGS over a
      `category_estimate`, record the delta (validates the provisional estimate).

### P2.3 — Holdout support (answers H3)
- [ ] A way to mark a campaign as a **holdout** (geo/time split) and record both
      attributed POAS and measured incremental lift for the 2-week window, so the
      incremental/attributed ratio (threshold ≥0.7) is computed, not guessed.

---

## P2.4 — Doors-stay-closed enforcement (the safety invariant)
Private beta means **no public self-serve** while the gate runs.
- [ ] Public signup behind an **invite/allowlist** flag (off by default); only the
      3 recruited brands' orgs exist.
- [ ] New orgs start at **OBSERVE** (already the A1/B4 invariant) — confirm no
      autonomous spend is reachable for beta orgs; Tier-1 executes only on explicit
      approval during the test.
- [ ] Per-account dollar ceiling on any approved action (B4) stays on.

---

## Onboarding runbook (per brand, mirrors VALIDATION_PLAN protocol)
1. **Baseline interview (30m)** — capture pre-OS mental model + metrics they trust.
2. **Guided onboarding, screen-recorded** — connect → baseline scan → readiness →
   first POAS. Log every hesitation; stall points live in the silences.
3. **One week unguided** — P2.1–P2.3 telemetry runs; unblock only hard errors.
4. **Holdout on Brand A** — set the geo/time split (P2.3).
5. **Exit interview (45m)** — would-you-pay + the one trust-making/breaking moment.

Run all three in parallel; ~2–3 weeks elapsed.

---

## Exit gate P2 (from PROD_READINESS_PLAN.md + VALIDATION_PLAN thresholds)
Gate rule: **Phase 2/public funds only if H1 passes AND no hypothesis is in Fail.**
- [ ] Action rate on CRITICAL findings ≥ 60% (H1) — *measured via P2.1*
- [ ] All 3 brands reach Profit Readiness ≥ 80% (H2) — *via P2.2 + existing scoring*
- [ ] Holdout incremental/attributed POAS ≥ 0.7 (H3) — *via P2.3*
- [ ] ≥1 healing recommendation per brand acted on with measured POAS lift
- [ ] Zero cross-tenant data leaks (logs + DB audit)
- [ ] No false "ads can't fix" calls that were actually ad-fixable (manual audit)

## Deliverable
One-page findings memo per brand + a single go/no-go mapped to the threshold
table. If go: prioritised stall-point fix list. If no-go: which hypothesis broke
and the pivot it implies (pre-mortem in `VALIDATION_PLAN.md`).

---

## Sequencing
P2.1–P2.3 instrumentation lands **before** brand onboarding (you can't backfill the
signals). P2.4 enforcement before any external user touches it. P2 runs only after
the P1 exit gate is green — you don't beta on an unobservable, unrestorable system.
