# P1 Remaining — Punch List (spec vs. landed)

> Diff of `P1-EXECUTION.md` against the live upstream engine
> (`chandansinghr-ship-it/brand-digital-twin` @ `fb03ddd`). What's done, what's
> partial, what's open. Keeps the build loop honest.

| Ticket | State | Evidence / gap |
|--------|-------|----------------|
| P1.1 atomic job claim | ✅ **DONE** | `claimNextOverdueJob` (`supabase_client.ts:1941`), `schema.sql:346` `FOR UPDATE SKIP LOCKED`, used in `poas_scheduler.ts:63`, **verified** by `tests/e2e/claim_concurrency_test.ts` |
| P1.2 observability | 🟡 **PARTIAL** | `MetricsTracker` exists (spans, latency, `recordMetric`, `raiseAlert`, `getAverageLatency`) + `/ready` DB-ping landed (`fb03ddd`). **Gaps below.** |
| P1.3 CI/CD + staging | 🟡 **PARTIAL** | UI CI (`brand-twin-app-ci.yml`) + engine `build.yaml` landed. **Staging env + one-command deploy/rollback not evidenced.** |
| P1.4 DB safety | 🟡 **PARTIAL** | Versioned migrations baseline and runner implemented; backups and restore drill open. |
| P1.5 secrets | 🟡 **PARTIAL** | `validateEnv()` boot guard **DONE** (`config.ts:64` — refuses mock creds outside `NODE_ENV=test`). **Secret-manager integration absent** — still `process.env` with mock defaults. |
| P1.6 security review | 🟡 **PARTIAL** | State-forgery (`oauth_flows_test`) + ticket replay/expiry (`server_test.ts:894–923`) tests green. **Dep-audit triage + token-leak log scan not tracked.** |
| P1.7 load test | 🟡 **PARTIAL** | Job-claim concurrency test done. **Broader load (N-tenant sweep/healing, SSE fan-out) not done.** |

---

## The actual remaining work

### P1.2 — observability (close the gaps)
- [ ] **Durable error sink:** `error_events` table + swappable Sentry-compatible
      webhook. Today metrics/alerts are **in-memory only** (`MetricsTracker`
      arrays) — they vanish on restart and aren't queryable. Persist them.
- [ ] **Alert *rules*:** `raiseAlert()` exists but isn't wired to thresholds.
      Add rules on job-queue backlog + adapter error rate.
- [ ] **Tenant-scoped, token-redacted** capture in the sink (ties to P1.6).

### P1.3 — staging + release
- [ ] Staging environment mirroring prod.
- [ ] Build-once-promote: the CI artifact is what deploys.
- [ ] One-command deploy + one-command rollback (governance engine already has a
      rollback primitive — wire it).

### P1.4 — DB safety (partial)
- [x] Versioned forward-only migrations (from the single `schema.sql`) with a
      recorded applied-version + rollback support.
- [ ] Automated backups + a **tested restore drill** on a throwaway DB.

### P1.5 — secret manager
- [ ] Move prod secrets off `process.env` defaults into a secret manager (vault/KMS).
      `validateEnv()` stays the boot guard (already correct). Local/test keep `.env`.

### P1.6 — security review (finish)
- [ ] Triage the `npm audit` advisories surfaced by CI (4 high / 1 moderate in the
      client tree; `next` already on patched 14.2.35). Resolve or document each.
- [ ] Token-leak scan across logs + the new `error_events` payloads.

### P1.7 — load test (the exit gate)
- [ ] Extend the concurrency test into a real load run: N concurrent tenants on
      sweep + healing, SSE fan-out at connection count, ≥2 workers on the queue.
- [ ] Read P1.2 instrumentation during the run; latency + error rate within budget.

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
