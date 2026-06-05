# Validation Plan — The 3-Brands Test

> The gate before Phase 2 funding. Specs make the build *correct*; this makes it
> *right*. The build can verify its own logic — it cannot tell us whether real
> brands act on the truth it surfaces. That is what this tests.
>
> Parent: `PROJECT_STATE.md` (the honest risk). Run when Phase 1 is buildable
> end-to-end (healing engine + sweep + cold-start + COGS easing + baseline scan).

---

## What we are actually testing

Not "does the code work" (tests cover that). Three behavioural hypotheses the
whole product rests on — each of which could be false even with flawless code:

| # | Hypothesis | If false, then... |
|---|-----------|-------------------|
| **H1** | Brands will *act* on the harsh truth, not just see it | The healing layer is anxiety, not value — the core bet fails |
| **H2** | The COGS-easing flow gets messy-data brands to trustworthy POAS | The POAS number is never trustworthy enough to advise on |
| **H3** | Attributed POAS is causally good enough to advise on | The advice is confidently wrong — worse than none (→ incrementality urgency) |

Everything else (UI polish, channel breadth) is secondary. If H1–H3 don't hold,
no amount of feature work saves it. If they do, Phase 2 is justified.

---

## Who — recruit criteria (exactly 3, deliberately varied)

Three is enough to find stall points; more is premature before we've fixed the
first ones. Pick for *contrast*, not representativeness:

| Brand | Profile | Tests |
|-------|---------|-------|
| **A — Paid-heavy DTC** | $20K–$80K/mo ad spend, Shopify, messy/partial COGS, India or global | Core POAS + healing loop on a brand that lives in ads |
| **B — Early / low-footprint** | Catalog live, < 50 orders, little ad history | Zero-order cold-start + COGS easing from near-zero |
| **C — Organic-led / multi-channel** | Real organic + email, modest paid | Cross-channel guards + the "ads can't fix" boundary |

Deliberately include **at least one India and one global** brand to stress the
dual-market connectors (Tally/RBI AA vs QuickBooks/Plaid, WhatsApp vs Slack).

Recruit through founder networks / DTC communities. Offer: free OS access +
a hands-on profit teardown. Screen *out* brands with already-clean data — the
point is to test the messy reality, not the happy path.

---

## What to instrument — the signals that answer H1–H3

### H1 — Do they act?
The single most important metric in the whole test.
- **Time-to-first-action** — from seeing a healing card to approving/executing a fix
- **Action rate** — % of CRITICAL findings acted on within 7 days
- **Action type split** — Tier-1 (OS executes) vs Tier-2 (approve) vs Tier-3 (business change they make offline)
- **Ignore reasons** — when a card is dismissed, capture *why* (don't believe it / can't act / disagree / too hard). This is the richest signal in the test.
- **Reversal rate** — how often an executed action is undone (signals false confidence)

### H2 — Does COGS-easing work?
- **Time-to-Profit-Readiness ≥ 80%** — from signup to trustworthy POAS on 80% of spend
- **Where COGS came from** — silent sweep / accounting sync / invoice parse / manual. (If everyone falls through to manual, the auto-fetch isn't working.)
- **Drop-off point** — exactly where in the readiness flow they stall or abandon
- **Estimated-vs-actual delta** — when a brand later enters real COGS, how wrong was the category-average estimate? (Validates the provisional-estimate tactic.)

### H3 — Is the advice causally sound?
- **Run one real holdout** on Brand A's best-attributed campaign — geo or time split, 2 weeks. Compare attributed POAS vs measured incremental lift.
- **Magnitude of the gap** — if incremental is dramatically below attributed, H3 is in trouble and incrementality stops being Phase-4.
- **Healing-card directional accuracy** — for the top 3 cards per brand, does the human operator agree the diagnosis is correct? (Cheap proxy for causal soundness.)

---

## How — protocol

1. **Baseline interview (30 min)** — current metrics they trust, how they decide
   budget today, what "profitable" means to them. Capture their *pre-OS* mental model.
2. **Guided onboarding, observed** — watch them connect, hit the baseline scan,
   reach Profit Readiness, see first POAS. Screen-record. Note every hesitation
   and every "wait, what?" — stall points live in the silences.
3. **One week unguided** — they use it as they would. Instrument everything above.
   Minimal hand-holding (only unblock hard errors).
4. **Holdout test on Brand A** — set up the geo/time split for H3.
5. **Exit interview (45 min)** — would they pay? what would they pay? what almost
   made them quit? what was the one moment it earned trust (or lost it)?

Total: ~2–3 weeks elapsed. Run all three in parallel.

---

## Success / failure thresholds (decide *before* the data)

Pre-committing thresholds prevents post-hoc rationalisation.

| Signal | Pass | Concern | Fail |
|--------|------|---------|------|
| Action rate on CRITICAL findings (H1) | ≥ 60% | 30–60% | < 30% |
| Reach Profit Readiness ≥ 80% (H2) | all 3 brands | 2 of 3 | ≤ 1 |
| Median time-to-readiness | < 30 min | 30–90 min | > 90 min |
| Holdout: incremental / attributed POAS (H3) | ≥ 0.7 | 0.4–0.7 | < 0.4 |
| Healing-card diagnosis agreement | ≥ 80% | 60–80% | < 60% |
| Would-pay at exit | ≥ 2 of 3 | 1 of 3 | 0 |

**Gate rule:** Phase 2 funds only if H1 passes AND no hypothesis is in *Fail*.
A *Concern* on H2/H3 is acceptable with a remediation plan; a Fail on H1 stops
everything — it means the core bet is wrong and needs rethinking, not more build.

---

## What each failure tells us (pre-mortem)

- **H1 fails** → the product isn't a measurement problem; it's a *trust/behaviour*
  problem. Pivot toward done-for-you execution or stronger proof, not more dashboards.
- **H2 fails** → COGS auto-fetch is the real product. Double down on accounting
  aggregator + invoice parse before anything else.
- **H3 fails** → incrementality moves from Phase 4 to Phase 1. Cap autonomy hard;
  reframe advice as directional until holdouts confirm.

---

## Non-goals for this test

- Not measuring retention/LTV (too early)
- Not testing pricing precisely (one exit question, not a pricing study)
- Not testing scale/agency multi-tenant (single-brand behaviour first)
- Not A/B-ing copy (behaviour, not conversion-rate optimisation)

---

## Deliverable

A one-page findings memo per brand + a single go/no-go on Phase 2, mapped to the
threshold table. If go: the prioritised list of stall-point fixes found. If
no-go: which hypothesis broke and the pivot it implies.
