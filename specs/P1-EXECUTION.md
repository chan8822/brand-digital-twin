# P1 Execution — Hardening & Operations ("safe to leave running")

> Turns `B-PHASE_BUILD_SPEC.md` B3/B5 (+ the cross-cutting security review and load
> test from `PROD_READINESS_PLAN.md`) into ordered, ticketed work. Goal: the system
> is **correct under concurrency** and **observable in failure** — the precondition
> for running more than one instance and for any external exposure.
>
> Engine work lands in `chandansinghr-ship-it/brand-digital-twin` (read-only here);
> CI/infra config lands in this repo where it can.

---

## Ordering & why

```
P1.1 B5 atomic claim ──► correctness floor (blocks multi-instance; everything else assumes it)
P1.2 observability  ──► you can SEE failure before you scale into it
P1.3 CI/CD + staging ──► every change verified + a prod-mirror to test against
P1.4 DB safety      ──► versioned migrations + backup + tested RESTORE
P1.5 secrets        ──► out of .env in prod (vault/KMS); validateEnv stays the boot guard
P1.6 security review ──► token-leak grep, CSRF on OAuth callbacks, dep audit
P1.7 load test      ──► prove P1.1–P1.2 hold under N tenants + ≥2 workers (the gate)
```

P1.1 is the floor — a double-run job corrupts state, so it lands first. P1.2 before
P1.3/P1.7 so the load test has instrumentation to read. P1.7 is the exit gate: it
*proves* the rest rather than asserting it.

---

## Tickets

### P1.1 — Atomic job claim (engine) — *already landed upstream; VERIFY*
- Upstream replaced the `getOverdueJobs`+`updateJobStatus` race with
  `claimNextOverdueJob(now, ownerId)` (lock-owner loop). Spec: `B-…` B5 —
  single `UPDATE … FOR UPDATE SKIP LOCKED … RETURNING`.
- **Action here is verification, not build:** confirm the mock path flips status
  in the same call (test parity) and that `pollAndExecute` uses the atomic method.
- **Test (the one that matters):** two concurrent workers, N due jobs → each job
  claimed exactly once, zero double-execution. This is folded into P1.7.

### P1.2 — Observability (engine)
- **Error sink:** `error_events` table + swappable Sentry-compatible webhook
  (interface, no vendor lock). Capture is **tenant-scoped and token-redacted**.
- **Metrics/timings:** extend `observability.ts` — request latency, job lag,
  adapter failure rate, POAS-calc duration, SSE connection count.
- **Alert rules:** job-queue backlog over threshold; adapter error rate spike.
- **`/ready` probe:** DB + queue reachable (distinct from `/health` liveness).
- **Done:** a forced error appears in the sink with a tenant-scoped trace and
  **no token in the payload**; `/ready` flips red when the DB is down.

### P1.3 — CI/CD + staging
- **UI CI gate: DONE** — `.github/workflows/brand-twin-app-ci.yml`
  (`npm ci → typecheck → lint → build`, path-scoped to `brand-twin/app/`).
  First run caught a missing ESLint config; fixed; now green.
- **Engine CI (upstream):** test + typecheck + build on every PR.
- **Staging:** an environment mirroring prod; the **same artifact** that passes CI
  is what deploys (build once, promote — not rebuild per env).
- **Done:** one-command deploy to staging; one-command rollback.

### P1.4 — DB safety
- **Versioned migrations:** move from a single ordered `schema.sql` to numbered,
  forward-only migrations with a recorded applied-version; runner supports rollback.
- **Automated backups** + a **tested restore drill** on a throwaway DB (a backup
  you have never restored is not a backup).
- **Done:** restore verified end-to-end; migration apply + rollback both exercised.

### P1.5 — Secret management
- Move prod secrets off `.env` files to a secret manager (vault/KMS). Local + test
  keep `.env`. `validateEnv()` stays the boot guard and must still **refuse to boot
  on mock creds outside `NODE_ENV=test`**.
- Never log raw tokens; secrets stay in the AES-256-GCM vault.
- **Done:** prod boots with zero secrets in env files; `validateEnv` rejects mocks.

### P1.6 — Security review
- **Dependency audit:** no known-vuln versions (the `npm ci` run already surfaces
  advisories — triage the 4 high / 1 moderate flagged; `next` is on the patched
  14.2.35). Resolve or document each.
- **Token-leak grep:** scan logs + error payloads for any bearer/refresh token.
- **CSRF / state-forgery:** every OAuth callback verifies the signed `state`
  (`{tenantId, platform, nonce}`, short TTL); A2.5 tickets are single-use + burned.
- **Done:** state-forgery tests green; no token in any log; dep advisories triaged.

### P1.7 — Load test (the exit gate)
- Sweep + healing under N concurrent tenants; SSE fan-out at connection count;
  job-claim contention with **≥2 workers** (proves P1.1).
- Read the P1.2 instrumentation while it runs — latency, job lag, error rate.
- **Done:** no double-claims; latency + error rate within budget at target load.

---

## Exit gate P1 (from PROD_READINESS_PLAN.md)
- [ ] Two app instances process the job queue with zero double-claims. *(P1.1 + P1.7)*
- [ ] A forced error surfaces in the tracker with a tenant-scoped trace, no token in payload. *(P1.2 + P1.6)*
- [ ] Staging deploy is one command; rollback is one command. *(P1.3)*
- [ ] Backup restore verified on a throwaway DB. *(P1.4)*

---

## Status
- **P1.3 UI CI gate: DONE** (this repo) — workflow live, green on PR #23.
- **P1.1 atomic claim: landed upstream** — needs the two-worker verification test (P1.7).
- **P1.2 / P1.4 / P1.5 / P1.6 / P1.7:** specced for the upstream build team here +
  in `B-PHASE_BUILD_SPEC.md`.
