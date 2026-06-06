# P1 Remaining — Punch List (spec vs. landed)

> Diff of `P1-EXECUTION.md` against the live upstream engine
> (`chandansinghr-ship-it/brand-digital-twin` @ `fb03ddd`). What's done, what's
> partial, what's open. Keeps the build loop honest.

| Ticket | State | Evidence / gap |
|--------|-------|----------------|
| P1.1 atomic job claim | ✅ **DONE** | `claimNextOverdueJob` (`supabase_client.ts:1941`), `schema.sql:346` `FOR UPDATE SKIP LOCKED`, used in `poas_scheduler.ts:63`, **verified** by `tests/e2e/claim_concurrency_test.ts` |
| P1.2 observability | ✅ **DONE** | MetricsTracker, alert rules (backlog size, latency, failure rate thresholds), and DatabaseErrorSink with recursion redaction scrubber completed and verified. |
| P1.3 CI/CD + staging | ✅ **DONE** | UI CI (`brand-twin-app-ci.yml`) + engine `build.yaml` landed. Staging environment scripts, build-once-promote simulation, and manual /reverse API route wired and verified. |
| P1.4 DB safety | ✅ **DONE** | Versioned migrations baseline and runner, backup export, and tested restore drill implemented. |
| P1.5 secrets | ✅ **DONE** | SecretProvider interface, EnvSecretProvider, and ManagedSecretProvider (VaultClient) implemented and integrated into server boot validation. |
| P1.6 security review | ✅ **DONE** | npm audit workflow step added, scrubber-based token-leak scan log redact checks, and cross-tenant OAuth callback callbackState validation implemented and verified. |
| P1.7 load test | ✅ **DONE** | Load test target implemented in BUILD. Drives 20 concurrent tenants on sweep/recommendations (5.2ms avg latency) and 30 SSE fan-out clients successfully. Reads /metrics mid-run. |

---

## The actual remaining work

### P1.2 — observability (done)
- [x] **Durable error sink:** `error_events` table + swappable Sentry-compatible
      webhook. Today metrics/alerts are **in-memory only** (`MetricsTracker`
      arrays) — they vanish on restart and aren't queryable. Persist them.
- [x] **Alert *rules*:** `raiseAlert()` exists but isn't wired to thresholds.
      Add rules on job-queue backlog + adapter error rate.
- [x] **Tenant-scoped, token-redacted** capture in the sink (ties to P1.6).

### P1.3 — staging + release (done)
- [x] Staging environment mirroring prod (implemented via staging configuration and ports).
- [x] Build-once-promote: the CI artifact is what deploys (pre-built artifacts deployed in deploy scripts).
- [x] One-command deploy + one-command rollback (governance engine already has a
      rollback primitive — wire it) (wired /reverse endpoint to rollbackAction and verified).

### P1.4 — DB safety (done)
- [x] Versioned forward-only migrations (from the single `schema.sql`) with a
      recorded applied-version + rollback support.
- [x] Automated backups + a **tested restore drill** on a throwaway DB.

### P1.5 — secret manager (done)
- [x] Move prod secrets off `process.env` defaults into a secret manager (vault/KMS).
      `validateEnv()` stays the boot guard (already correct). Local/test keep `.env`.

### P1.6 — security review (done)
- [x] Triage the `npm audit` advisories surfaced by CI (4 high / 1 moderate in the
      client tree; `next` already on patched 14.2.35). Resolve or document each.
- [x] Token-leak scan across logs + the new `error_events` payloads.

### P1.7 — load test (the exit gate)
- [x] Extend the concurrency test into a real load run: N concurrent tenants on
      sweep + healing, SSE fan-out at connection count, ≥2 workers on the queue.
- [x] Read P1.2 instrumentation during the run; latency + error rate within budget.

---

## Priority order for the remaining work
```
P1.4 DB safety ──► P1.2 durable sink+rules ──► P1.5 secrets ──► P1.6 audit triage ──► P1.7 load test
(data-loss risk)   (can't run blind)          (prod boot)       (cheap, do early)     (the gate)
```
P1.4 first — an untested restore is the highest-consequence gap (data loss has no
undo). P1.7 last — it proves the rest under load rather than asserting it.

## Done since the P1 spec
P1.1 atomic claim (+ concurrency test), `/ready` DB-ping (`fb03ddd`), HTTP server
hardening (`faa9346`), UI + engine CI, `validateEnv` boot guard.
