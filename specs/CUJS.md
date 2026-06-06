# Critical User Journeys — Brand Digital Twin OS

> The journeys that have to feel effortless for the product to win. Each maps to
> real routes in `brand-twin/app/` and the engine endpoints behind them. Strategy
> context lives in `STRATEGY.md`; build status lives in `PROD-READY-PLAN.md`.
>
> **Status legend:** ✅ live · 🟡 partial / mock-gated · 🧭 roadmap

---

## Personas

| ID | Persona | Goal | Primary surface |
|----|---------|------|-----------------|
| **P1** | **Brand operator** (DTC founder / growth lead) | Stop losing money on ads that look fine | Self-serve PLG flow |
| **P2** | **Agency performance lead** | Manage a portfolio of brands on profit, report real lift | Portfolio / multi-tenant |
| **P3** | **Ops / finance approver** | Govern spend, approve the first charge, keep the books clean | Admin + billing |

The acquisition loop is **PLG via the graduated-autonomy hook** (Option C): land free
in OBSERVE, prove value with an in-context save, convert by climbing the ladder. The
scale channel is **agencies** (Option B): one-to-many distribution over the same
tenant-isolated engine.

---

## CUJ-1 — Brand discovers its real POAS (the "land")

**Persona:** P1 · **Trigger:** "My ROAS looks fine but cash is tight." · **Status:** ✅ live (mock-gated until `NEXT_PUBLIC_API_URL` is set)

The first session. From cold visitor to seeing the profit gap, with zero risk taken.

| # | Step | Route / surface | Engine |
|---|------|-----------------|--------|
| 1 | Reads the pitch, clicks **Start free** | `/` (LP) | — |
| 2 | Creates account, accepts ToS | `/signup` | `POST /auth/signup` |
| 3 | Verifies email | `/verify` | `POST /auth/verify` |
| 4 | Connects Shopify + Google Ads + Meta via OAuth | `/connect` | `GET /connect/:platform` (ticket auth) |
| 5 | Lands on the POAS board — campaigns ranked worst-first by dollar drag | `/dashboard` | `GET /recommendations` |
| 6 | Reads the readiness gauge — knows whether the numbers are trustworthy yet | `/dashboard` | `GET /profit-readiness` |

**Success:** within one session the brand sees ≥1 campaign where POAS < break-even while
ROAS looks healthy — the gap that justifies everything. Account starts in **OBSERVE**:
the twin has read everything and touched nothing.

**Friction to kill:** OAuth drop-off, and a blank dashboard when COGS is missing (→ CUJ-4).

---

## CUJ-2 — The first operational save (the "aha" → ROI proof)

**Persona:** P1 · **Trigger:** Risk Radar flags live margin leakage · **Status:** ✅ live

The in-context value trigger that converts. The twin catches something the operator
would otherwise have found weeks later in the P&L.

| # | Step | Route / surface | Engine |
|---|------|-----------------|--------|
| 1 | Sweep flags a CRITICAL — e.g. bestseller stocking out while its campaign still spends | `/sweep` | `GET /sweep` (sorted CRITICAL→WARNING→OPPORTUNITY) |
| 2 | Opens the healing prescription for that finding | `/healing` | `GET /recommendations` |
| 3 | Sees the fix split into three zones: auto-fixable / needs approval / ads-can't-fix | `/healing` | — |
| 4 | Approves the targeted pause — only the affected ad group, healthy campaigns untouched | `/healing` → `/autonomy` | `POST /approvals/:id/approve` |
| 5 | Action is logged with estimated recovery; reversible | `/autonomy` | `recommendation_events` (executed) |

**Success:** a measurable dollar save inside the trial window, attributable to the twin.
This is the moment that earns the upgrade in CUJ-3.

**Friction to kill:** a fix that fires too broadly (must be ad-group-isolated, not campaign-wide).

---

## CUJ-3 — Climbing the autonomy ladder (the "convert")

**Persona:** P1 → P3 · **Trigger:** "I trust it on the small stuff — let it run." · **Status:** ✅ live

The monetisation loop. Trust earned in CUJ-2 cashes out as autonomy granted here.

| # | Step | Route / surface | Engine |
|---|------|-----------------|--------|
| 1 | Raises the dial OBSERVE → REVIEW → ASSISTED | `/autonomy` | `POST /autonomy` |
| 2 | Tries to skip ahead past the earned tier → blocked | `/autonomy` | `409` earned-tier guard |
| 3 | Sets per-action and daily spend caps | `/autonomy` | `POST /tenant-limits` |
| 4 | ASSISTED auto-executes small fixes; an over-cap action queues instead of firing | `/autonomy` (approvals queue) | `GET /approvals` |
| 5 | Drops the tier back down instantly when desired — always allowed | `/autonomy` | `POST /autonomy` (lower) |

**Success:** the brand runs at ASSISTED+ with caps, the approvals queue absorbs outliers,
and every autonomous action lands in `recommendation_events`. The kill switch (lower the
tier) is one click and never blocked.

**Guardrail:** raising above the earned tier returns `409`; lowering is always permitted.

---

## CUJ-4 — Tightening COGS so POAS is trustworthy

**Persona:** P1 / P3 · **Trigger:** readiness gate says "directional only" · **Status:** ✅ live

POAS is only as good as cost data. This journey takes a brand from directional to
decision-grade — and it's a Pareto ask, not a data-entry slog.

| # | Step | Route / surface | Engine |
|---|------|-----------------|--------|
| 1 | Dashboard readiness shows `directional_only`, coverage < 80% | `/dashboard` | `GET /profit-readiness` |
| 2 | Opens Costs; sees coverage by ad spend, real vs estimated split | `/costs` | `GET /cogs/coverage` |
| 3 | Fills the top missing-cost SKUs first (highest ad spend) | `/costs` | `GET /cogs/gaps` |
| 4 | Saves manual costs; or lets accounting adapters auto-fill on connect | `/costs` / `/connect` | `POST /cogs`; Zoho/QBO/Xero/Tally sweep |
| 5 | Coverage crosses the gate → readiness flips to `ready`, advice un-gates | `/dashboard` | readiness recompute |

**Success:** coverage ≥ threshold, status `ready`, and the twin is cleared to act on
contribution-positive logic instead of estimates.

---

## CUJ-5 — Trial → suggest-an-amount → first charge

**Persona:** P1 (suggests) + P3 (approves) · **Trigger:** day-15 trial flip · **Status:** ✅ live

The revenue moment. Suggest-an-amount, human-approved, charged on Razorpay — with a
deliberate safety rail so a first charge is never accidental.

| # | Step | Route / surface | Engine |
|---|------|-----------------|--------|
| 1 | Day-14 nudge, then day-15 value recap | `/billing` | `billing_trial_nudge` / `billing_trial_flip` jobs |
| 2 | Brand names a recurring monthly amount; account stays fully live during review | `/billing` | `POST /billing/suggest` → `pending_review` |
| 3 | Ops reviews the queue, two-click confirm to approve the first charge | `/admin/billing` | `GET /admin/billing/queue` |
| 4 | Approval triggers the charge via Razorpay; subscription goes `active` | `/admin/billing` | `POST /admin/billing/approve/:orgId` |
| 5 | Receipt generated and visible | `/billing` | `GET /billing/receipts` |
| 6 | Failed charge → dunning retries (days 1/3/7) → `suspended` if unpaid | — | dunning jobs |

**Success:** `trial → suggest_amount → pending_review → active`, a Razorpay charge
succeeds, and a receipt exists. **Safety rail:** the first charge requires an explicit
two-click human confirm in the ops queue.

---

## CUJ-6 — Agency onboards a portfolio

**Persona:** P2 · **Trigger:** agency wants to run N clients on profit · **Status:** 🟡 isolation live · 🧭 agency console roadmap

The scale channel. The tenant-isolation foundation is built; the dedicated agency
console (portfolio index + MCC traversal UI) is the next surface to add.

| # | Step | Route / surface | Status |
|---|------|-----------------|--------|
| 1 | Agency connects a client's Google Ads MCC + Shopify | `/connect` | ✅ per-tenant OAuth live |
| 2 | Twin self-indexes the client's stack and computes POAS | `/dashboard` | ✅ live per tenant |
| 3 | Each client is isolated at the DB layer — no cross-tenant reads | engine | ✅ request-scoped DB access |
| 4 | Agency sets per-client autonomy tiers + caps on the client's behalf | `/autonomy` | ✅ per tenant |
| 5 | **Single portfolio console** across all clients (the LP "Portfolio view") | — | 🧭 roadmap — new multi-tenant UI |
| 6 | **MCC traversal** to auto-enroll every sub-account at once | engine | 🧭 roadmap — auto-linking across MCC |
| 7 | White-label theming | app shell | 🧭 roadmap |

**Success (today):** an agency can run multiple isolated clients by switching context.
**Success (target):** one console lists every client's POAS + flagged leaks at a glance —
this is the artwork the LP `#agencies` section sells, and the next UI to build.

---

## CUJ-7 — Getting unblocked (support)

**Persona:** any · **Trigger:** something's confusing or broken · **Status:** ✅ live

| # | Step | Route / surface | Engine |
|---|------|-----------------|--------|
| 1 | Opens the support slide-over from the nav, anywhere in the app | nav → `SupportWidget` | — |
| 2 | Submits subject + body | any route | `POST /support/ticket` |
| 3 | Sees a success state; can send another | — | — |

**Success:** a ticket lands in the ops queue without the user leaving their workflow.

---

## How the journeys ladder together

```
CUJ-1 land (free, OBSERVE)
   └─► CUJ-2 first save (Risk Radar proves ROI)
          └─► CUJ-3 climb the ladder (trust → autonomy → monetisable)
                 └─► CUJ-5 suggest-an-amount → first charge (revenue)
   CUJ-4 COGS accuracy underpins 1–3 (trustworthy POAS)
   CUJ-7 support catches anyone stuck at any step

CUJ-6 agency = the same loop, run one-to-many over isolated tenants
```

**Mapping to the strategic phase gates (`STRATEGY.md`):**

- **Phase Gate 1 (Wave 0, founding cohort):** CUJ-1 + CUJ-4 — ingest, auto-link, compute POAS, catalog-cost fallback.
- **Phase Gate 2 (Wave 1, governance):** CUJ-2 + CUJ-3 steps 1–4 — stateful approval queue, role checks, dry-run pauses captured safely.
- **Phase Gate 3 (Wave 2, safety automation):** CUJ-2 at scale + CUJ-3 — continuous sweep, isolated pauses, adversarial-test + rate-limit validation.
