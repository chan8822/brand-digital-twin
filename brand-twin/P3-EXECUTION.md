# P3 Execution — Lawful & Paid (compliance + COGS + billing)

> Make it legal to operate and possible to charge. The feature detail lives in
> `B-PHASE_BUILD_SPEC.md` (B1/B2/B4) and `C-PHASE_BUILD_SPEC.md` (C1/C2); this doc
> is the **status diff + ordering + exit gate**, grounded in upstream
> `brand-digital-twin` @ `fb03ddd`.

---

## Status diff (spec vs landed)

| Item | State | Evidence / gap |
|------|-------|----------------|
| B1 data rights (delete + export) | ✅ **DONE** | `server.ts:875` `/account/export`, `:492` `/export/download`; `gdpr_legal_test.ts` + `tests/e2e/specs/data_rights_e2e_test.ts` |
| B2 legal surfaces | ✅ **DONE** | `server.ts:464/473/482` `/legal/tos|privacy|dpa`; consent capture at signup (`:229–327`); `legal_consent_e2e_test.ts` |
| B4 abuse controls | 🔴 **OPEN** | No per-tenant quota, new-account spend ceiling, connect throttle, or invite allowlist found (`rate_limiter.ts` is per-route only; OBSERVE tier exists) |
| C1 COGS aggregator | 🔴 **OPEN** | Only type references — no QuickBooks/Xero/Zoho adapter, no COGS sweep/estimate pipeline |
| C2 billing | 🔴 **OPEN** | No subscription state, trial lifecycle, suggest-an-amount flow, or payment rail anywhere |

So P3's real remaining build is **B4 + C1 + C2**. B1/B2 are done.

---

## Ordering & why
```
B4 abuse controls ──► C1 COGS aggregator ──► C2 billing
(gate public doors)   (makes POAS trustworthy)  (can't charge for an untrusted number)
```
B4 first — it's the cheap safety layer that lets the doors open at all (and it
overlaps P2.4's enforcement). C1 before C2 — you cannot ethically charge for advice
built on a POAS number you can't trust, so COGS coverage must be real first.

---

## B4 — Abuse controls (finish; spec: `B-PHASE_BUILD_SPEC.md` B4)
- [ ] Per-tenant quota layer in `rate_limiter.ts` (daily caps on AI calls, sweeps,
      write-actions) → `429` on trip.
- [ ] New-account dollar ceiling in governance `decide()` for orgs < N days old;
      OBSERVE-by-default already holds (confirm wired).
- [ ] OAuth connect-attempt throttle (blunt token-probing).
- [ ] Invite/allowlist flag on public signup (off by default — also gates P2).
- [ ] Tests: new account cannot execute spend; quota trips → 429; tier must be earned.

## C1 — COGS aggregator (spec: `C-PHASE_BUILD_SPEC.md` C1)
In-house connectors (extend the `tally_adapter.ts` pattern to QuickBooks/Xero/Zoho)
+ the four-tactic COGS easing + the Profit-Readiness **hard gate** on advice.
- [ ] Accounting connector adapters (QuickBooks/Xero/Zoho) over the existing pattern.
- [ ] Silent COGS sweep → category-average estimate → Pareto manual-entry UI.
- [ ] Profit Readiness gates/degrades advice when coverage is below threshold
      (`profit_readiness.ts` scoring already exists — wire it as a gate).
- [ ] COGS source tag per variant (shared with **P2.2** — build once).
- [ ] Tests: messy-data brand reaches trustworthy POAS on ≥80% of spend.

## C2 — Billing (spec: `C-PHASE_BUILD_SPEC.md` C2)
In-house orchestration over a payment-processor primitive — no Stripe-as-platform
lock; **card tokenisation stays with the processor; never store PAN.**
- [ ] Subscription state machine + 15-day trial lifecycle (day-14 nudge, day-15
      "what would you pay" screen).
- [ ] Suggest-an-amount flow: capture amount + note → human approve → activate.
- [ ] Receipts/invoices; payment rail Razorpay (India) / direct card processor (thin).
- [ ] Tests: trial → paid transition end-to-end with a test-mode charge; no PAN stored.

---

## Exit gate P3 (from PROD_READINESS_PLAN.md)
- [ ] A user can delete their account and get a complete export. *(B1 — done; re-verify cascade)*
- [ ] Legal pages live; acceptance logged at signup. *(B2 — done)*
- [ ] Trial → paid transition works end-to-end with a real (test-mode) charge. *(C2)*
- [ ] Profit Readiness blocks advice below the coverage threshold. *(C1)*
- [ ] New accounts cannot execute spend; quotas trip to 429. *(B4)*

---

## Sequencing
P3 runs after the P2 trust gate is green — you don't monetise advice that hasn't
proven it's acted on. Within P3: B4 → C1 → C2. C1's COGS-source tag is the same
field P2.2 needs, so build it once and share.
