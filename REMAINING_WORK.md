# Remaining Work — Precise Implementation Tracker

> Single source of truth for what's left to ship the public product. Verified
> against upstream `brand-digital-twin` @ `a6ab7db`. Every item is either DONE
> (in code), or a concrete buildable unit with its spec reference and a size.
>
> **Sizes:** S ≈ ≤0.5 day · M ≈ 1–2 days · L ≈ 3–5 days · XL ≈ 1–2 weeks.
> Sizes are per build-unit, assuming the in-house decision and existing primitives.

---

## Summary — what remains

| Area | Items left | Rough size |
|------|-----------|-----------|
| Phase 1 tail (engine) | 2 | S + L |
| Phase A — usable by a stranger | 16 | ~XL total |
| Phase B — lawful & trustworthy | 18 | ~XL total |
| Phase C — self-serve value + money | 15 | ~XL total |
| **Total remaining build units** | **51** | **~8–11 weeks, 1 focused dev** |

The engine (truth, healing, sweep, governance, jobs, MCP layer) is **done**.
Everything below is the product shell + the COGS/billing that make it self-serve.

---

## PHASE 1 TAIL (engine) — 2 items

| # | Item | Size | Spec | File(s) |
|---|------|------|------|---------|
| 1.1 | ✅ **DONE** (`0edfe80`) — atomic job claim via `claimNextOverdueJob(now, ownerId)` lock-owner loop | S | `PHASE_B §B5` | `supabase_client.ts`, `poas_scheduler.ts`, `schema.sql` |
| 1.2 | Real bank connections — RBI AA (India) live consent flow + Plaid (global) | L | gap doc | `rbi_aa_adapter.ts` (new `plaid_adapter.ts`) |

> **Progress: 1 of 51 units complete.** The engine is finished; the public shell
> (Phases A/B/C) has not started — only 1.1 (an engine-correctness item) landed
> since this tracker was written. 49 units (1.2 + all of A/B/C) remain.

---

## PHASE A — Usable by a stranger (16 items)  → `PHASE_A_BUILD_SPEC.md`

### A0 — External clocks (not code; start first) — 5 items
| # | Item | Size |
|---|------|------|
| A0.1 | Google Ads API Standard Access / OAuth verification application | S (weeks wait) |
| A0.2 | Meta App Review (`ads_read`, `ads_management`) | S (weeks wait) |
| A0.3 | Shopify Partner app + listing | S (weeks wait) |
| A0.4 | Google OAuth consent-screen verification | S (weeks wait) |
| A0.5 | Legal engagement for ToS/Privacy/DPA (feeds B2) | S (weeks wait) |

### A1 — In-house auth (5 items) — extend `auth.ts`
| # | Item | Size | File(s) |
|---|------|------|---------|
| A1.1 | `user_auth.ts`: scrypt hashing + signup/verify/login/refresh/reset | M | new `user_auth.ts` |
| A1.2 | Tables: `users`, `refresh_tokens`, `orgs`, `org_members`, `tenants.org_id` | S | `schema.sql` |
| A1.3 | Endpoints `/auth/*`, `/me`, `/orgs`, `/orgs/:id/brands` | M | `server.ts` |
| A1.4 | Rate-limit `/auth/login` + `/signup` | S | `rate_limiter.ts` |
| A1.5 | New orgs auto-start trust tier OBSERVE | S | governance wiring |

### A2 — OAuth connect (3 items) — reuse `credential_vault.ts`
| # | Item | Size | File(s) |
|---|------|------|---------|
| A2.1 | Signed `state` sign/verify helper | S | `auth.ts` |
| A2.2 | `/connect/:platform` + `/callback` for Google Ads, Meta, Shopify | L | `server.ts`, new `oauth_flows.ts` |
| A2.3 | Reconnect-on-refresh-failure path | S | `credential_vault.ts`, `integration_state` |

### A3 — Product UI (3 items) — the big one
| # | Item | Size | File(s) |
|---|------|------|---------|
| A3.1 | SPA scaffold (React/Next + LP design tokens), auth-gated routing | L | new `app/` |
| A3.2 | 9 screens wired to real endpoints + SSE `/stream` client | XL | `app/` |
| A3.3 | `GET /api/v1/profit-readiness` endpoint + gauge | M | `server.ts`, `poas_calculator.ts` |

> **Phase A note:** the MCP agent layer (`a6ab7db`) already exposes engine tools
> as JSON-RPC — A3.2 can call those instead of building all-new HTTP endpoints.

---

## PHASE B — Lawful & trustworthy (18 items)  → `PHASE_B_BUILD_SPEC.md`

### B1 — Data rights (6)
| # | Item | Size | File(s) |
|---|------|------|---------|
| B1.1 | `account_deletion` + `account_export` job types | M | `pending_jobs`, `poas_scheduler.ts` |
| B1.2 | Canonical tenant-table registry for cascade | S | `schema.sql` |
| B1.3 | 30-day soft-grace state | S | `users`/`orgs` |
| B1.4 | Credential-vault secret revocation on delete | S | `credential_vault.ts` |
| B1.5 | Audit-log PII anonymisation | S | `supabase_client.ts` |
| B1.6 | Endpoints `/account/delete`, `/account/export` | S | `server.ts` |

### B2 — Legal surfaces (4)
| # | Item | Size |
|---|------|------|
| B2.1 | ToS/Privacy/DPA/cookie pages (content from A0.5) | M |
| B2.2 | `legal_acceptances` table + capture on signup | S |
| B2.3 | Version-bump re-prompt | S |
| B2.4 | Cookie consent banner, essential-only default | S |

### B3 — Production ops (8)
| # | Item | Size | File(s) |
|---|------|------|---------|
| B3.1 | `error_events` sink + swappable webhook | M | `observability.ts` |
| B3.2 | Metrics/timings + alert rules (queue lag, adapter errors) | M | `observability.ts` |
| B3.3 | `/ready` readiness probe | S | `server.ts` |
| B3.4 | CI/CD pipeline + staging env | L | infra |
| B3.5 | Versioned migrations + automated backup + restore drill | M | infra, `schema.sql` |
| B3.6 | Prod secret manager (off `.env`) | M | infra, `config.ts` |
| B3.7 | `incident_response.ts` runbook + severity model | M | `incident_response.ts` |
| B3.8 | In-app support + help center | M | `app/` |

---

## PHASE C — Self-serve value + money (15 items)  → `PHASE_C_BUILD_SPEC.md`

### C1 — COGS aggregator (8)
| # | Item | Size | File(s) |
|---|------|------|---------|
| C1.1 | `CostSource` interface; conform `tally_adapter.ts` | S | `tally_adapter.ts` |
| C1.2 | `zoho_adapter.ts` (OAuth via A2) | M | new |
| C1.3 | `quickbooks_adapter.ts` | M | new |
| C1.4 | `xero_adapter.ts` | M | new |
| C1.5 | Silent COGS sweep on connect → auto-fill | M | `onboarding_wizard.ts` |
| C1.6 | Category-average estimator → `estimatedCogs` tag | M | `poas_calculator.ts` |
| C1.7 | Pareto COGS entry UI (top spend SKUs) | M | `app/` |
| C1.8 | Readiness gate: low coverage → directional only | M | `risk_radar.ts` |

### C2 — Billing + suggest-an-amount (7)
| # | Item | Size | File(s) |
|---|------|------|---------|
| C2.1 | `subscriptions` table + state machine | M | `schema.sql`, new `billing.ts` |
| C2.2 | Trial lifecycle jobs (day-14 nudge, day-15 flip, recurring, dunning) | M | `pending_jobs`, `billing.ts` |
| C2.3 | Day-14 nudge composed from stored findings | S | `billing.ts` |
| C2.4 | Day-15 suggest-an-amount screen | M | `app/` |
| C2.5 | Ops review queue → approve → first charge | M | `app/`, `billing.ts` |
| C2.6 | `PaymentProcessor` iface + Razorpay + card impls (tokenised) | L | new `payment_processor.ts` |
| C2.7 | In-house receipt/invoice generation | S | `billing.ts` |

---

## Critical path (what unblocks what)

```
A0 (external clocks) ─ start day 1, runs in background ──────────────►
A1 auth ──► A2 OAuth ──► C1 COGS connectors (reuse A2 OAuth)
   │            │
   └──► A3 UI ◄─┘ (calls MCP tools + new endpoints)
            │
B1–B3 (lawful/ops) ── parallel, gate going public
            │
C2 billing ◄── needs A1 (orgs) + A3 (screens)
            ▼
       PUBLIC LAUNCH
```

**Longest poles:** A0 approvals (external weeks) and A3.2 (the 9-screen UI, XL).
Start A0 immediately; start A1→A3 in parallel; B and C follow.

---

## The honest number

- **~51 build units**, roughly **8–11 weeks for one focused full-stack dev**
  (less with the UI parallelised to a second dev, since A3 is ~⅓ of the effort).
- **Biggest single chunk:** the product UI (A3) — it's the only XL and the only
  truly new surface; everything else extends existing files.
- **Smallest unlock with biggest leverage:** A0 (start the external clocks today)
  and B5/1.1 (the atomic-claim one-function fix).

Build order: **A0 now → A1 → (A2 ∥ A3) → B → C.** Each phase spec has the granular
checklists + tests + definition-of-done.
