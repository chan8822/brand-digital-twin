# Public Launch — Gap Analysis

> What stands between the current build (`53d7bc7`, internal-testing-ready) and a
> real public, self-serve product. Grounded in an audit of the actual repo.
>
> **The headline:** the *engine* is largely built. The *product a stranger can
> sign up for and use without us* is not. Internal testing needs none of what
> follows — public launch needs most of it.

---

## The core distinction

| Internal testing (ready now) | Public launch (this doc) |
|---|---|
| We onboard each brand by hand | A stranger self-serves at 2am with no human |
| Credentials wired in env / by us | User clicks "Connect", does OAuth, we store tokens |
| Console `onboarding_simulator.ts` | A real web app with screens |
| Free, hand-held | Trial mechanics + "suggest an amount" billing |
| We trust the 3 brands | Anyone can sign up — abuse, isolation, data law |
| We watch logs | Monitoring, alerting, support, status page |

The build so far optimised correctly for internal testing. Public launch is a
different surface area — mostly **product, trust, and operations**, not engine.

---

## What's already real (don't rebuild)

- POAS truth engine, healing engine, all 5 sweep checks, cold-start
- Governance + trust ledger, 5 autonomy tiers, idempotency, durable settling window
- Durable job queue, env guard, onboarding telemetry
- Real adapters: Google Ads (write path), Meta, Shopify/Woo/Magento, GMC
- Multi-tenant DB isolation (RLS-enforced)
- A marketing landing page (`index.html` — Tailwind/Alpine, with a demo)
- JWT auth primitive (`auth.ts`), credential vault (`credential_vault.ts`), rate limiter

That's a serious backend. The gaps below are almost all in front of it.

---

## GAP 1 — There is no product UI *(the biggest one)*

**Today:** `onboarding_simulator.ts` is a Node **console** flow (`readline`
prompts). `index.html` is a *marketing* page, not the app. There is no dashboard,
no connect screen, no healing-card UI, no settings — nothing a user clicks.

**Needed for public:**
- A real web app (React/Next, matching the LP's visual language).
- Screens: signup/login · goal-declaration · connect-your-stack · live sweep ·
  POAS dashboard (the ROAS-vs-POAS hero) · healing cards (three-zone) · autonomy
  dial · Profit Readiness indicator · settings/billing.
- Wire it to the existing API endpoints (`/api/v1/recommendations`, `/risks`,
  `/approvals`, `/actions`, `/stream`).

**Effort:** large. This is the single biggest piece. Everything the LP promises
visually (the dual-metric card, the live scan, the autonomy slider) currently
exists only as a mockup in `index.html`, not as a working product surface.

---

## GAP 2 — No OAuth connect flows *(blocks self-serve onboarding)*

**Today:** adapters take a token in the constructor. Internally we supply it.
There is **no** `/auth/google/callback`, no Meta OAuth, no Shopify app-install
redirect. A public user cannot connect anything by themselves.

**Needed:**
- OAuth redirect + callback handlers per platform (Google Ads, Meta, GA4,
  Merchant Center, Shopify app install).
- Token exchange, encrypted storage (the credential vault exists — wire it),
  refresh-token rotation, scope/consent screens.
- Google Ads + Shopify both require **app review/verification** before public
  OAuth — weeks of external lead time. Start early.

**Effort:** large, and partly gated by Google/Meta/Shopify approval timelines.

---

## GAP 3 — No billing / trial / "suggest an amount" backend

**Today:** zero payment infrastructure. The LP promises a 15-day trial and
suggest-an-amount pricing; none of it exists server-side.

**Needed:**
- Billing provider (Stripe, or Lago per `INTEGRATIONS_3P`).
- Trial state machine (day 0–15, day-14 nudge, day-15 "what would you pay" screen).
- The suggest-an-amount conversion flow (capture amount + note, human approves,
  activate). This is bespoke — no provider does it off the shelf.
- Subscription lifecycle: upgrade/downgrade, dunning, receipts, tax.

**Effort:** medium. Provider does the heavy lifting; the suggest-an-amount flow
is custom and is a brand-defining moment — build it carefully.

---

## GAP 4 — Self-serve auth & account lifecycle

**Today:** `auth.ts` verifies a JWT. There's no way for a human to *get* one.

**Needed:**
- Signup, email verification, login, password reset, session management.
- Per the roadmap: WorkOS/Clerk (gives SSO + agency org hierarchy for free, and
  de-risks the security surface vs hand-rolling).
- Org model so one account holds multiple brands without cross-tenant bleed
  (multi-tenant isolation exists at the DB; the *account→org→brand* hierarchy on
  top of it does not).

**Effort:** medium (small if buying WorkOS/Clerk).

---

## GAP 5 — Trust, legal & data compliance *(non-negotiable for public)*

**Today:** none of this exists; fine for 3 known brands, illegal/negligent for the public.

**Needed:**
- Terms of Service, Privacy Policy, DPA, cookie consent.
- **Data deletion / export** (GDPR, India DPDP) — a user must be able to delete
  their account and data. We ingest financials and bank data; this is high-stakes.
- Google Ads API + Shopify both impose **data-use and security policies** as a
  condition of public API access — compliance is gated, not optional.
- PII handling review: where COGS, revenue, bank balances live and who can see them.
- Atomic job-claim fix (already flagged) before multi-instance — a correctness
  prerequisite once more than one worker runs.

**Effort:** medium, but with hard external dependencies (legal review, platform
policy approval). Cannot be compressed at the end.

---

## GAP 6 — Production operations

**Today:** `observability.ts` is minimal; one Dockerfile; no deploy pipeline.

**Needed:**
- Error tracking (Sentry), metrics/alerting, uptime monitoring, a status page.
- CI/CD, staging environment, DB migration/backup strategy, secret management
  (not env files in prod).
- On-call / incident runbook (`incident_response.ts` is a stub of the idea).
- Support channel + docs/help center (LP currently points to Discord).
- Abuse controls: signup verification, per-tenant quotas, spend-action caps for
  untrusted new accounts (the trust ledger helps here — wire new public accounts
  to start at OBSERVE).

**Effort:** medium, mostly standard SaaS plumbing.

---

## GAP 7 — Cold-start data quality at public scale

**Today:** COGS entry is manual/CSV; the silent sweep + category estimate are
specced but the **Codat/Rutter aggregator is not built**. For internal brands we
help them get COGS in. The public won't have that hand-holding — and POAS is
only trustworthy with cost data.

**Needed (or POAS degrades for most public signups):**
- Codat/Rutter aggregator (auto-pull COGS from QuickBooks/Xero/Tally/Zoho).
- Mindee/Nanonets invoice OCR for the long tail.
- The Profit Readiness flow must hard-gate advice when coverage is too low, or
  the public gets confident wrong numbers — an H3 failure at scale.

**Effort:** medium. This is what makes self-serve POAS trustworthy without us in the room.

---

## Recommended order (each gate de-risks the next)

```
Phase A — Make it usable by a stranger
  GAP 1 (product UI)  +  GAP 2 (OAuth)  +  GAP 4 (self-serve auth)
  → start Google/Meta/Shopify app review NOW (external lead time)

Phase B — Make it lawful & trustworthy
  GAP 5 (legal/compliance)  +  GAP 6 (production ops)
  → these gate the ability to be public at all

Phase C — Make the value self-serve
  GAP 7 (COGS aggregator)  +  GAP 3 (billing/suggest-an-amount)
  → POAS trustworthy without us; money flows

Then: public launch.
```

GAP 2's external approvals and GAP 5's legal review are the **long poles** —
they have lead times you can't compress, so kick them off first even though
they finish last.

---

## The honest framing

What's built is the hard, differentiated part — the truth engine and governance
that no competitor has. What remains is mostly the **standard SaaS shell** around
it (UI, OAuth, auth, billing, legal, ops) plus **one strategic piece** (the COGS
aggregator) that makes the value land without us in the room.

It is more total *surface area* than the engine was — but far less *novel risk*.

---

## Decisions taken (this session) — supersede the recommendations above

1. **Build now, don't gate on validation.** The 3-brands validation
   (`VALIDATION_PLAN.md`) is **consciously deferred** — it will run as a
   soft-launch cohort on the real public product rather than as a pre-build gate.
2. **Build in-house, not buy.** Gaps 1/4 (auth), 3 (billing), 7 (COGS aggregator)
   are built on existing primitives — `auth.ts`, `credential_vault.ts`,
   `tally_adapter.ts`, `rbi_aa_adapter.ts` — not WorkOS/Stripe/Codat.
3. **Delivered as a prioritized spec set** the upstream team builds against:
   - `A-PHASE_BUILD_SPEC.md` — usable by a stranger (in-house auth + OAuth + UI)
   - `B-PHASE_BUILD_SPEC.md` — lawful & trustworthy (data rights, legal, ops, abuse, atomic jobs)
   - `C-PHASE_BUILD_SPEC.md` — self-serve value + money (in-house COGS connectors + suggest-an-amount billing)

GAP 2's external approvals (Google/Meta/Shopify) and the legal review remain the
**long poles** — kick them off first (Phase A §A0) even though they finish last.
