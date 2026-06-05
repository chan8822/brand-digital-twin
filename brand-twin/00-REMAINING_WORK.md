# [PRIORITY 00 · INDEX] Remaining Work — Precise Implementation Tracker

> Single source of truth for what's left to ship the public product. Verified
> against upstream `brand-digital-twin` @ `44ca4ba`. Every item is either DONE
> (in code), or a concrete buildable unit with its spec reference and a size.
>
> **Sizes:** S ≈ ≤0.5 day · M ≈ 1–2 days · L ≈ 3–5 days · XL ≈ 1–2 weeks.
> Sizes are per build-unit, assuming the in-house decision and existing primitives.
>
> **Legend:** ✅ done · ◐ partial · ☐ to build.

---

## Summary — what remains (@ `44ca4ba`)

| Area | Done | Left | Note |
|------|------|------|------|
| Phase 1 tail (engine) | 2 | 0 | ✅ complete |
| Phase A — usable by a stranger | 6 | ~10 | A1 done (minus reset); **A2 + A3 untouched** |
| Phase B — lawful & trustworthy | 9 | ~9 | B1 done, B2/B3 partial; B4 abuse open |
| Phase C — self-serve value + money | 0 | 15 | not started |
| **Totals** | **~17** | **~34** | of 51 |

The engine + the identity/data-rights/legal spine are **done**. What's left is the
two self-serve pieces (**A2 OAuth + A3 UI**), the rest of ops/abuse, and all of
COGS + billing. **A stranger still can't connect a platform or click anything.**

---

## PHASE 1 TAIL (engine) — 2 items

| # | Item | Size | Spec | File(s) |
|---|------|------|------|---------|
| 1.1 | ✅ **DONE** (`0edfe80`) — atomic job claim via `claimNextOverdueJob(now, ownerId)` lock-owner loop | S | `PHASE_B §B5` | `supabase_client.ts`, `poas_scheduler.ts`, `schema.sql` |
| 1.2 | ✅ **DONE** (`409e558`) — bank connections decoupled via `BankAdapter` + `plaid_adapter.ts` (global); `rbi_aa_adapter.ts` (India) | L | gap doc | `bank_adapter.ts`, `plaid_adapter.ts`, `rbi_aa_adapter.ts` |

> **Progress (verified @ `44ca4ba`):** Phase 1 tail complete. The backend
> identity + data-rights + legal spine of Phases A1/B1/B2 has landed. The public
> shell's two self-serve pieces — **A2 (OAuth connect)** and **A3 (UI)** — plus
> C1/C2 remain at zero. A stranger still cannot connect a platform or click anything.

---

## PHASE A — Usable by a stranger (16 items)  → `A-PHASE_BUILD_SPEC.md`

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
| A1.1 | ✅ **DONE** (`6d9cf1c`/`44ca4ba`/`81b8161`) — `user_auth.ts`: scrypt hashing + signup/verify/login/refresh-rotation + **password reset** (`requestPasswordReset`/`confirmPasswordReset`, `81b8161`) | M | `user_auth.ts` |
| A1.2 | ✅ **DONE** — Tables: `users`, `refresh_tokens`, `orgs`, `org_members` | S | `schema.sql` |
| A1.3 | ✅ **DONE** — Endpoints `/auth/signup /verify /login /refresh`, `/me`, `/orgs`, `/orgs/:id/brands` | M | `server.ts` |
| A1.4 | ☐ Rate-limit `/auth/login` + `/signup` (per-IP limiter exists; confirm wired to auth routes) | S | `rate_limiter.ts` |
| A1.5 | ☐ New orgs auto-start trust tier OBSERVE (governance defaults to OBSERVE fallback; explicit new-org wiring not found) | S | governance wiring |

### A2 — OAuth connect ✅ **DONE** (`a09e913`) — reuse `credential_vault.ts`
| # | Item | Size | File(s) |
|---|------|------|---------|
| A2.1 | ✅ Signed `state` (`signOauthState`/`verifyOauthState`) | S | `auth.ts` |
| A2.2 | ✅ `/connect/:platform` (302→consent) + `/connect/callback/:platform` for Google/Meta/Shopify | L | `server.ts`, `oauth_flows.ts` |
| A2.3 | ✅ Reconnect-on-refresh-failure (`integration.status='suspended'`) | S | `credential_vault.ts` |
| A2.4 | ☐ `GET /api/v1/integrations` — expose `getIntegrationStates()` so the connect UI can show what's linked (client method exists; no endpoint). UI built against it | S | `server.ts` |
| A2.5 | ☐ Auth-on-redirect for OAuth initiation — connect is a top-level navigation that can't carry the `Bearer` header; needs cookie/session or a short-lived signed token on `GET /connect/:platform` | S | `server.ts`, `app/lib/api.ts` |

### A3 — Product UI (3 items) — the big one
| # | Item | Size | File(s) |
|---|------|------|---------|
| A3.1 | ✅ **DONE** — Next.js `app/` scaffold + auth-gated root routing (root routes by auth state, logout in nav) | L | `app/` |
| A3.2 | ◐ **NEARLY DONE** — built: **auth (login/signup/verify/reset)** + connect-your-stack + POAS dashboard + readiness gauge + live sweep + three-zone healing + autonomy/approvals + `Nav`. **Full loop signup→connect→insight walkable.** Only SSE live-updates + per-route auth guard remain | XL | `app/` |
| A3.3 | ✅ **DONE** — endpoint (`dd9045a`) + `ReadinessGauge` UI on dashboard, wired to live `/profit-readiness` | M | `server.ts`, `profit_readiness.ts`, `app/` |
| A3.4 | ☐ `GET /api/v1/sweep` endpoint — expose rich `SweepFinding[]` (today `/risks` returns only `string[]`); UI already built against it | S | `server.ts`, `risk_radar.ts` |
| A3.5 | ☐ `GET/POST /api/v1/autonomy` — read/set current trust tier; UI dial already built against it (approvals already wired to live `/approvals`) | S | `server.ts`, `governance_engine.ts` |

> **Phase A note:** the MCP agent layer (`a6ab7db`) already exposes engine tools
> as JSON-RPC — A3.2 can call those instead of building all-new HTTP endpoints.

---

## PHASE B — Lawful & trustworthy (18 items)  → `B-PHASE_BUILD_SPEC.md`

### B1 — Data rights (6)
| # | Item | Size | File(s) |
|---|------|------|---------|
| B1.1 | ✅ **DONE** (`5ffc440`) — `hard_delete_account` + `account_export` jobs executed in scheduler | M | `poas_scheduler.ts` |
| B1.2 | ✅ **DONE** — `hardDeleteTenantData()` cascades all tenant tables | S | `supabase_client.ts:2213` |
| B1.3 | ✅ **DONE** — 30-day soft-grace on `DELETE /account` | S | `server.ts:646` |
| B1.4 | ☐ Credential-vault secret revocation on delete (confirm wired into cascade) | S | `credential_vault.ts` |
| B1.5 | ✅ **DONE** — `anonymizeLogs()` PII anonymisation | S | `supabase_client.ts:2265` |
| B1.6 | ✅ **DONE** — `DELETE /account`, `POST /account/export` (+ signed download) | S | `server.ts` |

### B2 — Legal surfaces (4)
| # | Item | Size |
|---|------|------|
| B2.1 | ◐ **PARTIAL** (`5ffc440`) — `/legal/tos` + `/legal/privacy` routes serve placeholder content; DPA/cookie pages + real legal copy still needed (A0.5) | M |
| B2.2 | ✅ **DONE** — `legal_acceptances` captured on signup (`user_auth.ts:94`) + consent-mode v2 redaction | S |
| B2.3 | ☐ Version-bump re-prompt | S |
| B2.4 | ☐ Cookie consent banner, essential-only default | S |

### B3 — Production ops (8)
| # | Item | Size | File(s) |
|---|------|------|---------|
| B3.1 | `error_events` sink + swappable webhook | M | `observability.ts` |
| B3.2 | Metrics/timings + alert rules (queue lag, adapter errors) | M | `observability.ts` |
| B3.3 | ✅ **DONE** — `/ready` + `/readyz` readiness probe | S | `server.ts:442` |
| B3.4 | ◐ **PARTIAL** — `build.yaml` CI/CD spec exists; staging env still needed | L | infra |
| B3.5 | Versioned migrations + automated backup + restore drill | M | infra, `schema.sql` |
| B3.6 | Prod secret manager (off `.env`) | M | infra, `config.ts` |
| B3.7 | `incident_response.ts` runbook + severity model | M | `incident_response.ts` |
| B3.8 | In-app support + help center | M | `app/` |

---

## PHASE C — Self-serve value + money (15 items)  → `C-PHASE_BUILD_SPEC.md`

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

## The honest number (@ `44ca4ba`)

- **~17 of 51 units done.** Phase 1 complete; A1 + B1 substantially in; B2/B3 partial.
- **~34 units left**, roughly **6–8 weeks for one focused full-stack dev**.
- **Biggest single chunk:** the product UI (A3) — still the only XL and the only
  truly new surface; everything else extends existing files.
- **The two launch-blockers untouched:** A2 (OAuth connect) and A3 (UI). Until
  both land, no stranger can self-serve regardless of how strong the backend is.
- **Quick gaps inside "done" work:** password reset (A1), explicit new-org→OBSERVE
  wiring (A1.5/B4), credential-vault revocation on delete (B1.4).

Build order from here: **A0 clocks (in flight) → finish A1 gaps → (A2 ∥ A3) → B3/B4 → C.**
Each phase spec has the granular checklists + tests + definition-of-done.
