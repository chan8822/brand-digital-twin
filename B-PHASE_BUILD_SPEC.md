# [PRIORITY B] Phase B Build Spec — "Lawful & Trustworthy" (B1→B5)

> The second public-launch slice (`PUBLIC_LAUNCH_GAP.md` Gaps 5, 6 + the atomic
> job-claim correctness fix). Makes the product legal to operate publicly and safe
> to leave running. In-house per this session's decision. Grounded @ `8ccd11b`.
>
> Five workstreams: **B1 data rights · B2 legal surfaces · B3 production ops ·
> B4 abuse controls · B5 atomic job claim.**

---

## B1 — Data rights (in-house: deletion + export)

We ingest financials, revenue, COGS, and (via RBI AA/Plaid) bank balances. GDPR
(EU) and India DPDP both require the user be able to **export** and **delete**
their data. No third-party privacy tool — build it on the existing tenant model.

### Deletion — hard-delete cascade

```
POST /api/v1/account/delete   (auth required, re-confirm password)
  → enqueue a `account_deletion` job (reuse pending_jobs queue)
  → job hard-deletes every row WHERE tenant_id = X across all tenant tables,
    revokes credential-vault secrets, drops refresh tokens, anonymises audit log
    (keep the action record for legal, strip PII), then deletes org + user.
```

- Reuse the durable `pending_jobs` queue (so a large delete survives a restart).
- A canonical list of tenant-scoped tables lives in one place (`schema.sql`
  comment block) so the cascade can't silently miss a table as new ones are added.
- 30-day soft-grace (status `pending_deletion`, login disabled) before the hard
  job fires — protects against rage-quit / account takeover.

### Export — signed data export

```
POST /api/v1/account/export
  → enqueue `account_export` job → assemble JSON bundle of all tenant data
  → write to object storage, return a signed, short-TTL download URL by email.
```

### Build checklist
- [ ] `account_deletion` + `account_export` job types (extend `pending_jobs`)
- [ ] Canonical tenant-table registry for the cascade
- [ ] 30-day soft-grace state on `users`/`orgs`
- [ ] Credential-vault secret revocation on delete
- [ ] Audit-log PII anonymisation (retain action, strip identity)
- [ ] Tests: delete cascades every tenant table; export bundle complete; grace-period reversal

---

## B2 — Legal surfaces

In-house static pages + an acceptance log (no third-party consent SaaS).

- ToS, Privacy Policy, DPA, cookie consent — served as routes / static pages in
  the SPA, matching `index.html` design.
- **Acceptance log:** on signup, record `{userId, docVersion, acceptedAt, ip}` in
  a `legal_acceptances` table. Re-prompt on material version bumps.
- Cookie consent banner gates any non-essential analytics; essential-only by default.

### Build checklist
- [ ] ToS / Privacy / DPA / cookie pages (content from legal, A0 clock)
- [ ] `legal_acceptances` table + capture on signup
- [ ] Version-bump re-prompt flow
- [ ] Cookie consent banner + essential-only default

---

## B3 — Production operations

`observability.ts` is minimal; one Dockerfile; no pipeline. Build standard SaaS ops.

- **Error tracking:** structured error capture (in-house sink writing to a
  `error_events` table + optional Sentry-compatible webhook — keep the interface
  swappable, no hard vendor lock).
- **Metrics + alerting:** extend `observability.ts` to emit counters/timings
  (request latency, job lag, adapter failures, POAS-calc duration). Alert rules on
  job-queue backlog and adapter error rate.
- **Health/readiness:** `/api/v1/health` exists — add `/ready` (DB + queue reachable).
- **CI/CD + staging:** build/test/deploy pipeline; a staging env mirroring prod.
- **DB:** migration runner (ordered SQL in `schema.sql` today → versioned
  migrations), automated backups, restore drill.
- **Secrets:** move off `.env` files in prod to a secret manager; `validateEnv()`
  stays as the boot guard.
- **Incident response:** flesh out `incident_response.ts` stub into a real runbook
  (severity levels, on-call, rollback via governance engine's existing rollback).
- **Support:** in-app contact + help docs (LP currently points to Discord).

### Build checklist
- [ ] `error_events` sink + swappable webhook
- [ ] `observability.ts` counters/timings + alert rules (queue lag, adapter errors)
- [ ] `/ready` readiness probe
- [ ] CI/CD pipeline + staging environment
- [ ] Versioned migrations + automated backup + restore drill
- [ ] Prod secret manager; `.env` only for local/test
- [ ] `incident_response.ts` runbook + severity model
- [ ] In-app support + help center

---

## B4 — Abuse controls (public signups are hostile by default)

- **Signup verification:** email verify (B1/A1) required before any connect/spend.
- **Per-tenant quotas:** extend `rate_limiter.ts` (already per-route) with
  per-tenant daily caps on AI calls, sweeps, and write-actions.
- **New-account spend cap:** wire new public orgs to start at trust tier
  **OBSERVE** (A1) — no autonomous spend action possible until tier is earned.
  Hard dollar ceiling on any approved action for accounts < N days old.
- **Connect throttle:** cap OAuth-connect attempts per account to blunt token-probing.
- **Bot defense:** CAPTCHA / proof-of-work on signup if abuse observed (feature-flag, off by default).

### Build checklist
- [ ] Per-tenant quota layer in `rate_limiter.ts`
- [ ] OBSERVE-by-default + new-account dollar ceiling in governance `decide()`
- [ ] Connect-attempt throttle
- [ ] Feature-flagged signup challenge
- [ ] Tests: new account cannot execute spend; quota trips return 429; tier must be earned

---

## B5 — Atomic job claim (correctness prerequisite for multi-instance)

`PROJECT_STATE.md` flags it: `getOverdueJobs()` then `updateJobStatus()` are two
calls — under concurrent workers a job double-runs. Single-process is safe; this
gates running >1 instance (which B3's prod deploy implies).

### Fix
Replace the two-step claim with one atomic statement:

```sql
-- claim_due_jobs(now, limit): single round-trip, row-locked
UPDATE brand_twin.pending_jobs
SET status = 'processing', updated_at = now()
WHERE job_id IN (
  SELECT job_id FROM brand_twin.pending_jobs
  WHERE status = 'pending' AND run_at <= :now
  ORDER BY run_at
  LIMIT :limit
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

Expose as `SupabaseClient.claimDueJobs(now, limit)` (Postgres RPC). Keep the mock
path's filter for tests, but make the mock also flip status in the same call so
behaviour matches. `pollAndExecute()` switches from `getOverdueJobs`+`updateJobStatus`
to the single `claimDueJobs`.

### Build checklist
- [ ] `claim_due_jobs` RPC (FOR UPDATE SKIP LOCKED)
- [ ] `claimDueJobs` client method; mock flips status atomically
- [ ] `pollAndExecute` uses it
- [ ] Test: two concurrent workers never claim the same job

---

## Definition of done (gate to Phase C)
- [ ] A user can export and permanently delete all their data (verified cascade).
- [ ] Legal pages live; acceptance logged on signup.
- [ ] Errors tracked, metrics + alerts on queue lag and adapter failures, `/ready` green.
- [ ] New public accounts start at OBSERVE with a spend ceiling; quotas enforced.
- [ ] Two concurrent job workers never double-run a job.

When the product is lawful to operate and safe to leave running unattended,
Phase B is done — Phase C makes the value self-serve and turns on the money.
