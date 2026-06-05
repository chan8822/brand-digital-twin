# Hardening Specs — Steps 1–3 of the Rollout Plan

> Granular, implementable specs for the three pre-internal-testing steps in
> `ROLLOUT_PLAN.md`. Grounded in the real structure of `poas_scheduler.ts`,
> `governance_engine.ts`, `supabase_client.ts`, `config.ts`, and
> `onboarding_simulator.ts` as of `d7bb573`.
>
> No new features. No new infra. All three reuse the existing `SupabaseClient`.

---

## STEP 1 — Durable job queue (replaces in-process timers)

### The problem, precisely

Two in-process timers lose state on restart:
- `poas_scheduler.ts:14` — `setInterval` re-fires every 24h *from process start*.
  A restart resets the clock; a tenant can be skipped or double-run.
- `governance_engine.ts:509` — `setTimeout(resolve, ctx.verifyWindowMs)` holds
  the verification in memory. A restart during a 24–72h window drops it entirely:
  the action executed, nothing verifies, the trust ledger never updates.

### The fix — a `pending_jobs` table + polling worker

One table, two job types, one worker. No Redis, no BullMQ for Phase 1.

#### 1a. Schema (add to Supabase)

```sql
CREATE TABLE pending_jobs (
  job_id      TEXT PRIMARY KEY,          -- uuid
  tenant_id   TEXT NOT NULL,
  job_type    TEXT NOT NULL,             -- 'poas_daily' | 'settling_window'
  run_at      TIMESTAMPTZ NOT NULL,      -- when it becomes due
  status      TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'running'|'done'|'failed'
  payload     JSONB,                     -- job-type-specific (e.g. {actionId, req, preMetrics})
  attempts    INT NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pending_jobs_due ON pending_jobs (run_at) WHERE status = 'pending';
```

#### 1b. SupabaseClient methods (new)

```typescript
// in supabase_client.ts, alongside the existing get/save pairs
async enqueueJob(job: PendingJob): Promise<void>          // INSERT
async claimDueJobs(now: string, limit = 20): Promise<PendingJob[]>
  // UPDATE status='running' WHERE status='pending' AND run_at <= now
  // RETURNING * — atomic claim so two workers don't double-run
async completeJob(jobId: string): Promise<void>           // status='done'
async failJob(jobId: string, error: string): Promise<void>
  // attempts++, last_error=error; status='pending' if attempts<3 else 'failed'
```

```typescript
interface PendingJob {
  jobId: string;
  tenantId: string;
  jobType: 'poas_daily' | 'settling_window';
  runAt: string;        // ISO
  status: 'pending' | 'running' | 'done' | 'failed';
  payload?: Record<string, unknown>;
  attempts: number;
}
```

> **Atomic claim is the critical detail.** `claimDueJobs` must flip
> `pending→running` in the same statement it selects (Postgres
> `UPDATE ... RETURNING`), or two worker ticks overlapping will run the same job
> twice. With Supabase, use an RPC or a `.update().eq('status','pending')` filter.

#### 1c. The worker (new file `job_worker.ts`)

```typescript
export class JobWorker {
  private intervalId: NodeJS.Timeout | null = null;
  constructor(
    private readonly db: SupabaseClient,
    private readonly handlers: Record<string, (job: PendingJob) => Promise<void>>,
    private readonly tickMs = 5 * 60 * 1000,   // poll every 5 min
  ) {}

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), this.tickMs);
  }
  stop() { if (this.intervalId) clearInterval(this.intervalId); this.intervalId = null; }

  async tick() {
    const due = await this.db.claimDueJobs(new Date().toISOString());
    for (const job of due) {
      try {
        const handler = this.handlers[job.jobType];
        if (!handler) throw new Error(`No handler for ${job.jobType}`);
        await handler(job);
        await this.db.completeJob(job.jobId);
      } catch (err) {
        await this.db.failJob(job.jobId, String(err));
      }
    }
  }
}
```

> The worker *still* uses `setInterval` — but only as a heartbeat poll. The
> durable state is in the table. A restart loses at most one 5-min tick of
> latency, never a job. That's the whole point.

#### 1d. Rewire `poas_scheduler.ts`

`PoasScheduler.runJobs()` body is correct — keep it. Change *how it's triggered*:
on startup, ensure each tenant has a `poas_daily` job; the handler runs the
existing per-tenant logic and re-enqueues itself for `now + 24h`.

```typescript
// handler registered with JobWorker:
'poas_daily': async (job) => {
  await scheduler.runJobsForTenant(job.tenantId);   // extract from existing runJobs loop body
  await db.enqueueJob({
    jobId: uuid(), tenantId: job.tenantId, jobType: 'poas_daily',
    runAt: new Date(Date.now() + 24*60*60*1000).toISOString(),
    status: 'pending', attempts: 0,
  });
}
```
Refactor: split the `for (tenant)` loop body in `runJobs()` into
`runJobsForTenant(tenantId)`. Keep `runJobs()` as a manual "run all now" for tests.

#### 1e. Rewire the settling window in `governance_engine.ts`

This is the higher-stakes change. Today (`~497–516`) it:
`execute → audit → setTimeout(verifyWindowMs) → readMetrics → verify → maybe rollback`.

Split it at the timer. The verify+rollback half becomes a job:

```typescript
// after execute + audit, instead of sleeping inline:
if (!isShadow && ctx.verifyWindowMs && ctx.verifyWindowMs > 0) {
  await this.db.enqueueJob({
    jobId: uuid(), tenantId: ctx.tenant.tenantId, jobType: 'settling_window',
    runAt: new Date(Date.now() + ctx.verifyWindowMs).toISOString(),
    status: 'pending', attempts: 0,
    payload: { actionId: req.idempotencyKey, req, preMetrics, targetId: req.targetId },
  });
  return { status: 'EXECUTED_PENDING_VERIFICATION', ... };  // new terminal state
}
```

The `settling_window` handler does the deferred half: read post-metrics,
`verify()`, rollback if anomalous, emit the `VERIFY` phase update, write the
final audit row. **This is the change that makes a 72h window real** — it no
longer dies with the process.

> Keep the inline `setTimeout` path for `verifyWindowMs < 60_000` (tests use tiny
> windows). Anything ≥1 min goes through the queue. Branch on the threshold.

#### 1f. Tests
- `claimDueJobs` is atomic: two concurrent claims never return the same job.
- `failJob` retries to 3 then marks `failed`.
- Settling window: enqueue → worker tick after `runAt` → verify+rollback fires.
- Restart simulation: enqueue, drop the worker, new worker picks it up.

---

## STEP 2 — Real credential guard (no silent mock fallback)

### The problem

`config.ts:17–39` defaults every secret to a `mock-*` literal. A live server
with missing env vars silently reads mock data — the worst failure mode for a
first real brand session (looks like it works, the numbers are fiction).

### The fix

#### 2a. `.env.example` at repo root

```bash
# --- Required for any real run ---
SUPABASE_URL=                 # project URL from Supabase dashboard
SUPABASE_KEY=                 # service-role key (server-side only)

# --- Google Ads (required to connect a real ad account) ---
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=

# --- Meta Ads (required for Meta spend ingestion) ---
META_ADS_APP_ID=
META_ADS_APP_SECRET=

# --- Runtime ---
NODE_ENV=production           # 'test' keeps mock fallbacks for the suite
```

#### 2b. `validateEnv()` in `config.ts`

```typescript
export function validateEnv(): void {
  if (process.env['NODE_ENV'] === 'test') return;   // suite keeps its mocks

  const required = [
    'SUPABASE_URL', 'SUPABASE_KEY',
    'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN',
    'META_ADS_APP_ID', 'META_ADS_APP_SECRET',
  ];
  const missing = required.filter(
    (k) => !process.env[k] || String(process.env[k]).startsWith('mock'),
  );
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: missing/mock env vars in non-test mode: ${missing.join(', ')}. ` +
      `See .env.example. Set NODE_ENV=test to run on mocks.`,
    );
  }
}
```

Call `validateEnv()` at the top of `server.ts` startup, before any adapter is
constructed. The existing `config.ts:55–58` warning logic gets promoted from a
warning to this hard guard.

> The point isn't to break dev convenience — `NODE_ENV=test` preserves every
> existing mock. The point is that a *production* boot is honest: it runs on real
> data or it doesn't run.

#### 2c. Tests
- `validateEnv()` throws when a required var is missing (NODE_ENV unset).
- `validateEnv()` throws when a var is present but `mock-*`.
- `validateEnv()` returns silently when NODE_ENV=test.

---

## STEP 3 — Onboarding event log (observability)

### The problem

`onboarding_simulator.ts` is a console flow. When a brand stalls, there's no
structured record of *where*. This is also the exact instrumentation
`VALIDATION_PLAN.md` H2 needs (time-to-readiness, drop-off point).

### The fix

#### 3a. Schema

```sql
CREATE TABLE onboarding_events (
  event_id    TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  stage       TEXT NOT NULL,
  event       TEXT NOT NULL,            -- 'enter' | 'complete' | 'abandon' | 'error'
  duration_ms INT,                      -- time since previous stage event
  data        JSONB,                    -- stage-specific (e.g. {connectedSurfaces})
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_onboarding_tenant ON onboarding_events (tenant_id, created_at);
```

#### 3b. The 7 stages (canonical, matches ROLLOUT_PLAN)

```
goal_declared → connected → sweep_started → sweep_complete →
first_poas_computed → first_healing_card_shown → first_action_taken
```

#### 3c. SupabaseClient methods

```typescript
async recordOnboardingEvent(e: OnboardingEvent): Promise<void>   // INSERT
async getOnboardingTrace(tenantId: string): Promise<OnboardingEvent[]>
  // SELECT ... ORDER BY created_at — the replay query
```

#### 3d. Instrument `onboarding_simulator.ts`

A thin helper that stamps duration since the last event and persists:

```typescript
private lastEventAt = Date.now();
private async emit(stage: string, event: string, data?: object) {
  const now = Date.now();
  await this.db.recordOnboardingEvent({
    eventId: uuid(), tenantId: this.tenantId, stage, event,
    durationMs: now - this.lastEventAt, data,
    createdAt: new Date(now).toISOString(),
  });
  this.lastEventAt = now;
}
```

Call sites (map to existing flow points):
- After goal selection → `emit('goal_declared','complete', {goal})`
- After `connect` (line ~362) → `emit('connected','complete', {connectedSurfaces})`
- Before sweep (line ~482) → `emit('sweep_started','enter')`
- After findings sorted (line ~521) → `emit('sweep_complete','complete', {findingCount, criticalCount})`
- After POAS reports computed → `emit('first_poas_computed','complete', {campaignCount})`
- When first healing card rendered → `emit('first_healing_card_shown','complete', {rootCause})`
- On first approved/executed action → `emit('first_action_taken','complete', {actionType})`

Wrap the connect step in try/catch → `emit(stage,'error',{message})` so stalls
caused by errors are captured, not just clean transitions.

#### 3e. Tests
- A full happy-path run emits all 7 events in order with sane durations.
- An abandoned run (no connect) emits up to `goal_declared` then stops.
- `getOnboardingTrace` returns events in chronological order.

---

## Sequencing & effort

| Step | Effort | Blocks | Can parallelize? |
|------|--------|--------|------------------|
| 1 — durable jobs | 1–2 days | production reliability | independent |
| 2 — env guard | 0.5 day | first real connection | independent |
| 3 — onboarding log | 0.5 day | diagnosing stalls + H2 instrumentation | independent |

All three are independent — assign in parallel. Step 2 is the fastest path to a
real connection; Step 3 is what makes the first session *learnable*; Step 1 is
what makes it *safe to leave running*. Do all three before Step 4 (first brand).

---

## Definition of done (the gate to Step 4)

- [ ] `pending_jobs` table live; `JobWorker` running; POAS schedule and settling
      window both survive a process restart (verified by the restart test).
- [ ] `validateEnv()` guards startup; server refuses to boot on mock creds in
      non-test mode; `.env.example` committed.
- [ ] `onboarding_events` table live; a full onboarding run produces a complete
      7-stage trace queryable via `getOnboardingTrace`.
- [ ] All new tests green; full suite still green.

When this checklist is clear, connect the first brand.
