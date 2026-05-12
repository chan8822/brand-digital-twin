# Manual-Mode Bulkhead — Operator Runbook

Task #7. Companion to the code in `src/lib/dispatch.ts`,
`src/lib/opsAudit.ts`, `src/routes/manualOverride.ts`, and
`lib/db/src/index.ts`.

## SLO

`POST /api/delivery/dispatch/override` must respond in < **2000 ms**
at p95 even when:

- Background `/api/delivery/dispatch/run` is saturating the auto-
  dispatcher loop (10× normal load).
- Host CPU is at ~90% utilisation.
- The main DB pool is fully checked out.

## Architecture summary

| Layer        | Carve-out                                                         |
|--------------|-------------------------------------------------------------------|
| Routing      | `overrideRouter` mounted before `/api` aggregate router           |
| Body parsing | Global default only — no aggregate-router middleware              |
| Auth         | `authMiddleware` routes session lookup through `overrideDb`       |
| DB pool      | `overridePool` (max 4 conns, 1 s connect timeout)                 |
| Lock model   | `FOR UPDATE NOWAIT` + 500 ms retry budget (jitter 30/60/120 ms)   |
| Audit write  | `enqueueOpsAuditOutbox` in same tx; drained 500 ms later          |
| Failure mode | `code: "lock_busy"` → HTTP 503 (retryable); business → 409        |

Auto-dispatcher (`dispatchOrder`) uses `FOR UPDATE SKIP LOCKED`,
so a held override row is invisible to it for the current pass.

## Ordering contract

The drainer (`drainOpsAuditOutbox`) provides one of two guarantees
depending on how many drainers are running:

- **Single drainer (production default).** Exactly one drainer
  timer per process (`opsAuditOutboxTimer` in `index.ts`) with an
  `opsAuditDrainInFlight` re-entrancy guard. Phase A claims rows in
  `created_at asc`, Phase B processes them sequentially — so
  `ops_actions` rows commit in the same order the override events
  occurred. **Strict global order.**
- **Accidental multi-drainer (e.g. two pods misconfigured).** Atomic
  Phase-A claim and consumer-side `ON CONFLICT (dedupe_key)
  DO NOTHING` keep integrity (no duplicates, no loss), but commit
  order across drainers is **not** guaranteed.

If a future deployment topology requires strict order across many
consumers, partition the outbox by aggregate id (e.g. `order_id`)
and run one drainer per partition.

## Pool-sizing guidance

The two pools share the underlying Postgres `max_connections`
budget. Defaults sum to 20 per process, well under typical Postgres
limits.

| Env var                 | Default | Notes                                        |
|-------------------------|---------|----------------------------------------------|
| `PG_POOL_MAX`           | 16      | Main pool. Used by every route except override. |
| `PG_OVERRIDE_POOL_MAX`  | 4       | Override carve-out. Keep ≥ 2 for redundancy.    |

Rules of thumb when scaling:

1. Keep `PG_OVERRIDE_POOL_MAX ≥ 2 × concurrent_human_operators`. The
   carve-out is for bursty human-driven traffic, not background load.
2. If you raise `PG_POOL_MAX`, raise Postgres `max_connections` by
   at least `(PG_POOL_MAX + PG_OVERRIDE_POOL_MAX) × num_pods + 10`.
3. Never set the carve-out to 1 — that turns it into a serial queue
   on the override path.

## CI gates

Both gates run on PRs touching `artifacts/api-server/**`,
`lib/db/**`, or the lockfile (see
`.github/workflows/bulkhead-ci.yml`):

1. `ci:bulkhead` — DB-level test: lock semantics, outbox dedupe,
   multi-drainer concurrency, poison-row resilience, p95 SLO under
   simulated contention.
2. HTTP-level acceptance — boots the api-server, seeds an `online`
   rider + 5 in-progress orders via
   `scripts/seed-loadtest-fixtures.mjs`, then runs
   `loadtest:override` for 8 s while pegging `/dispatch/run`.
   Loadtest fails the build if:
   - <95 % of responses are on-contract (200/409/503),
   - <50 % exercise the lock/commit path (200 or 503), or
   - override p95 ≥ 2000 ms.

### Optional CPU-burn mode

The HTTP smoke is a contention proof, not a literal "90% CPU"
proof — those numbers are workload-dependent and vary by runner
class. To reproduce closer to production, set
`LOADTEST_CPU_BURN_WORKERS=N` before invoking
`loadtest:override`. The harness spawns N background workers that
busy-loop hashing 256 KiB blocks, so the host CPU can be driven
arbitrarily high. Recommended values:

| Target CPU | Workers (4-core CI runner) |
|------------|---------------------------|
| 60 %       | 2                         |
| 90 %       | 4                         |

This mode is opt-in: the default CI gate stays fast and
deterministic; the heavy soak is run out-of-band before each
production rollout.

## Alerting

The drainer emits a `logger.error` with `alert:true` every 25
cumulative `drainFailuresTotal` increments. The platform's log
router pages on-call on this signature. Throttling prevents a
single poison row from spamming.
