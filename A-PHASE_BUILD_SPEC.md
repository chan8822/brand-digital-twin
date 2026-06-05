# [PRIORITY A] Phase A Build Spec — "Usable By A Stranger" (A0→A3)

> The first public-launch slice (`PUBLIC_LAUNCH_GAP.md` Gaps 1, 2, 4). Turns the
> headless engine into something a person can sign up for, connect, and use with
> no human in the loop. Grounded in the real repo at `8ccd11b`.
>
> Three workstreams, buildable in parallel after the auth seam lands:
> **A1 self-serve auth · A2 OAuth connect · A3 product UI.**
>
> Plus **A0 — non-code actions to start TODAY** (external lead times).

---

## A0 — Start immediately (external lead time, blocks launch not build)

These have multi-week approval clocks. Kick off before any code:

- [ ] **Google Ads API** — apply for Standard Access / public OAuth verification.
- [ ] **Meta** — App Review for `ads_read` / `ads_management` scopes.
- [ ] **Shopify** — create a Partner app; begin App Store listing if distributing there.
- [ ] **Google OAuth consent screen** — verification (sensitive scopes → security review).
- [ ] **Legal** — engage for ToS / Privacy / DPA (Gap 5, but the clock starts now).

Owner + date each. Nothing below ships publicly until these clear.

---

## A1 — Self-serve auth & account model

### Decision: build in-house (extend `auth.ts`)

Per this session's decision, auth is built in-house, not bought. `auth.ts` already
has a native HS256 JWT verify/sign primitive — extend it into the full lifecycle
rather than introducing WorkOS/Clerk. The credential vault's AES-256-GCM is reused
for password hashing-adjacent secret storage where needed.

**In-house auth surface (new in `auth.ts` + a new `user_auth.ts`):**
- **Password hashing:** `scrypt` (node:crypto, already a dependency) with a
  per-user random salt. Never bcrypt-via-npm — stay on native crypto.
- **Signup:** email + password → create user (status `pending_verification`) →
  issue a signed, TTL'd email-verification token (reuse the HMAC signer).
- **Email verification:** verify token → flip user to `active`.
- **Login:** verify password (constant-time compare) → issue the existing
  `DecodedJwt{userId,orgId,role,exp}` access token + a refresh token (stored
  hashed in DB, rotated on use).
- **Password reset:** signed TTL token emailed → set new password → invalidate
  all refresh tokens.
- **Session:** short-lived access JWT (15 min) + long-lived rotating refresh token.

> Security notes the build must honor: constant-time password compare; refresh
> tokens stored only as hashes; verification/reset tokens single-use and short TTL;
> rate-limit `/auth/login` and `/auth/signup` via the existing `rate_limiter.ts`.

### Account → Org → Brand hierarchy

DB isolation is per-tenant already. Add the layer above it:

```
User (from WorkOS)  ──belongs to──>  Org  ──owns──>  Brand(s) == tenant
```

```sql
CREATE TABLE IF NOT EXISTS brand_twin.users(
  user_id       TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  pw_hash       TEXT NOT NULL,        -- scrypt(salt:hash)
  status        TEXT NOT NULL DEFAULT 'pending_verification', -- pending|active|disabled
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS brand_twin.refresh_tokens(
  token_hash TEXT PRIMARY KEY,        -- store only the hash
  user_id    TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS brand_twin.orgs(
  org_id     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_user TEXT NOT NULL,          -- users.user_id
  plan       TEXT DEFAULT 'trial',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS brand_twin.org_members(
  org_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
-- tenants gain an owning org:
ALTER TABLE brand_twin.tenants ADD COLUMN org_id TEXT;
```

> Email-verification and password-reset tokens are signed HMAC values (stateless,
> single-use via a short TTL + a `used_tokens` set), so no extra table is required
> for them beyond a small replay-guard set.

### Endpoints (extend `server.ts` dispatch)

```
POST /api/v1/auth/signup      # email+password → create user, send verify token
POST /api/v1/auth/verify      # verify-email token → activate
POST /api/v1/auth/login       # password → access JWT + refresh token
POST /api/v1/auth/refresh     # rotate refresh → new access JWT
POST /api/v1/auth/reset       # request + confirm password reset
GET  /api/v1/me               # current user + orgs + brands
POST /api/v1/orgs             # create org (on first signup)
POST /api/v1/orgs/:id/brands  # create a brand(tenant) under org
```

The existing JWT (`DecodedJwt{userId,orgId,role,exp}`) is already the right shape
— issue it after a successful login. Every existing tenant-scoped endpoint keeps
its `orgId === tenant` guard (`server.ts:486`).

### Build checklist
- [ ] `user_auth.ts`: scrypt hashing, signup, verify, login, refresh, reset (extends `auth.ts` signer)
- [ ] `users`, `refresh_tokens` tables (+ verification/reset token storage)
- [ ] `orgs` / `org_members` tables + `tenants.org_id`
- [ ] `/auth/*`, `/me`, `/orgs`, `/orgs/:id/brands` endpoints
- [ ] Rate-limit `/auth/login` + `/auth/signup` via `rate_limiter.ts`
- [ ] New public org auto-starts trust tier at **OBSERVE** (abuse guard — wire to existing trust ledger)
- [ ] Tests: signup → verify → login → org created → brand created → tenant-scoped call authorized; wrong-password constant-time; refresh rotation; reset invalidates tokens

---

## A2 — OAuth connect flows

### What's already there
`CredentialVault` (AES-256-GCM, `storeSecret` with `refreshToken`, auto-refresh)
is built. Adapters accept a token. **The missing middle is the OAuth dance** that
produces that token from a user click.

### The pattern (one per platform, same shape)

```
GET  /api/v1/connect/:platform        → 302 to provider consent URL (state=signed)
GET  /api/v1/connect/:platform/callback?code&state
     → verify state → exchange code for {access,refresh} → vault.storeSecret(...)
     → mark integration_state connected → 302 back to /app/connect?ok=:platform
```

`state` must be a signed, short-TTL token binding `{tenantId, platform, nonce}` —
prevents CSRF and cross-tenant token injection. Reuse `auth.ts` HMAC for signing.

### Platforms for Phase A (the core loop)
| Platform | Flow | Notes |
|----------|------|-------|
| Google Ads | OAuth2 + developer token | needs A0 approval; MCC enumeration already built |
| Meta Ads | OAuth2 | needs App Review (A0) |
| Shopify | App-install OAuth (shop domain → grant) | per-shop; HMAC-verify the callback |
| GA4 / Merchant Center | Google OAuth (same consent, extra scopes) | piggybacks Google connect |

### Token lifecycle
- Store via `CredentialVault.storeSecret(tenantId, platform, 'access', token, refresh)`.
- On 401 from an adapter, the vault's auto-refresh kicks in; if refresh fails,
  flip `integration_state` to `needs_reconnect` and surface a reconnect card.
- Never log raw tokens. Never return them to the client.

### Build checklist
- [ ] Signed `state` helper (sign/verify) in `auth.ts`
- [ ] `/connect/:platform` + `/connect/:platform/callback` for Google, Meta, Shopify
- [ ] Wire callback → `CredentialVault.storeSecret` → `integration_state`
- [ ] Reconnect path on refresh failure
- [ ] Per-platform scope config in `config.ts` (read from env, no secrets in code)
- [ ] Tests: state forgery rejected · happy-path stores encrypted token · refresh-fail → needs_reconnect

---

## A3 — Product UI (the web app)

### Decision: a real SPA, reuse the LP's design language

`index.html` already defines the visual system (Space Grotesk / Plus Jakarta,
neutral-950, indigo accent, Tailwind). Build the app in React/Next with the same
tokens so marketing → app feels continuous. Replace `onboarding_simulator.ts`'s
**console** flow with screens calling the same engine via the API.

### Screens → existing API mapping

| Screen | Calls | Engine source |
|--------|-------|---------------|
| Signup / login | WorkOS hosted + `/auth/session` | A1 |
| Goal declaration | `POST /orgs/:id/brands` (+ goal) | onboarding telemetry stage `goal_declared` |
| Connect your stack | `/connect/:platform` buttons | A2 + `integration_state` |
| Live sweep | `GET /api/v1/risks` | `risk_radar` 5 sweep checks (`SweepFinding[]`) |
| POAS dashboard (hero) | `GET /api/v1/recommendations` | `poas_calculator` ROAS+POAS dual |
| Healing cards | `GET /api/v1/recommendations` | `diagnoseRootCause()` three-zone output |
| Autonomy dial | `GET/POST` trust tier | trust ledger (OBSERVE→C_SUITE) |
| Approvals queue | `GET /approvals`, `POST /actions` | governance engine |
| Profit Readiness | (new) `GET /api/v1/profit-readiness` | needs endpoint — see below |
| Live updates | `GET /api/v1/stream` (SSE) | `event_bus` phase updates |

### One new endpoint needed
`GET /api/v1/profit-readiness` → `{ coveragePct, missingCostSkus, basis }` so the
UI can render the readiness gauge and gate advice when coverage is low. The data
exists in `poas_calculator` / cold-start; expose it.

### The three signature components (from the LP, now real)
1. **Dual-metric hero** — same campaign, ROAS beside POAS, the gap highlighted.
   Data: `recommendations[].roas` / `.poas`.
2. **Live sweep** — findings stream in, sorted severity→dollarImpact, resolve as
   flag/clear. Data: `risks` (already sorted server-side).
3. **Three-zone healing card** — OS acts / user decides / ads can't fix, with the
   completeness caveat line. Data: `RootCauseDiagnosis.prescriptions` + `.completeness`.

### Build checklist
- [ ] App scaffold (React/Next + Tailwind, LP tokens), auth-gated routing
- [ ] The 9 screens above wired to real endpoints
- [ ] SSE client for `/stream` (live phase updates)
- [ ] `GET /api/v1/profit-readiness` endpoint + gauge
- [ ] Emit onboarding telemetry stages from the UI (reuse `onboarding_events`)
- [ ] Empty/cold-start states (zero-order → catalog-margin copy from `MarginDiscoveryResult`)
- [ ] Error + reconnect states for every integration

---

## Sequencing within Phase A

```
A0 (external clocks)  ── start day 1, runs in background ──────────────►
A1 (auth seam) ──► unblocks ──► A2 (OAuth)  ┐
                            └──► A3 (UI)     ┴─► integrated self-serve flow
```

A1 first (everything is org/tenant-scoped). Then A2 and A3 in parallel — A3 can
build against mocked endpoints until A2's real tokens land.

### Definition of done (gate to Phase B)
- [ ] A stranger signs up, creates a brand, connects Google Ads + Shopify via
      OAuth (no human), sees a live sweep, real POAS, and healing cards.
- [ ] New accounts start at OBSERVE; no autonomous spend action possible until earned.
- [ ] Full onboarding produces a 7-stage telemetry trace (already built).
- [ ] No raw tokens logged or returned; state-forgery tests green.

When a stranger can self-serve to first POAS, Phase A is done — then Phase B
(legal/compliance/ops) and Phase C (billing + COGS aggregator) make it lawful and
monetised. **Run the 3-brands validation before pouring in the UI build** — prove
they act on the truth first.
```
