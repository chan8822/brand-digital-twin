# Original User Request

## Initial Request — 2026-06-05T17:27:04Z

Implement Phase B ("Lawful & Trustworthy") of the Brand Digital Twin self-serve platform. This makes the system compliant with data regulations, safe against public abuse, observable in production, and safe to execute concurrently on multiple instances.

Working directory: `/google/src/cloud/chandansinghr/Omni/google3/experimental/brand_twin`

## Requirements

### R1. Data Rights (Deletion & Export)
Implement hard-delete cascade for account deletion (with 30-day soft-grace state) and signed JSON data export for GDPR/DPDP compliance. All tenant-related tables must be completely scrubbed of PII while preserving anonymized logs.

### R2. Legal Surfaces & Consent
Serve static ToS, Privacy, and DPA pages. Log user consent acceptance (doc version, IP, timestamp) in a `legal_acceptances` table. Re-prompt on major policy version updates.

### R3. Production Operations & Observability
Integrate structured error event tracking, metrics/alerting for job lag and adapter errors, a `/ready` health check endpoint verifying DB/queue status, and staging configuration support.

### R4. Public Abuse Controls
Enforce verified emails before connect/spend, configure daily per-tenant API rate limits (quota checks returning 429), map new public accounts to the `OBSERVE` trust tier with spend dollar ceilings, and throttle OAuth connect attempts.

### R5. Atomic Job Claiming (Correctness)
Refactor the scheduler job processing to use a single database transaction/query with row-locking (`FOR UPDATE SKIP LOCKED`) to ensure multiple concurrent server instances never claim or run the same job twice.

## Acceptance Criteria

### Data Rights & Legal
- [ ] Deleting an account cascades to delete all corresponding rows in tenant tables and revokes vault credentials.
- [ ] Exporting an account returns a downloadable signed URL containing a full JSON packet of the tenant's data.
- [ ] Signing up requires policy acceptance, and changing the policy version triggers re-acceptance prompts.

### Observability & Abuse
- [ ] `/ready` endpoint returns 200 when DB and queue are reachable, and 503 if either is degraded.
- [ ] Rate-limit quotas successfully trigger a 429 status code on excessive requests.
- [ ] New signups default to the `OBSERVE` trust tier, blocking autonomous spend actions.

### Concurrency & Job Claiming
- [ ] Concurrent execution of job polling does not double-claim or double-execute any pending jobs.
- [ ] The SQL schema and migration runs successfully against the database.

## Follow-up — 2026-06-05T21:24:03Z

Implement Phase 1 Hardening (P1.5 Secret Management, P1.6 Security Review, P1.7 Load Testing) and Phase 2 Private Beta Telemetry & Verification (P2.1 - P2.4) of the Brand Digital Twin platform. This secures bootstrap secrets, protects logs from credential leaks, executes load scenarios, measures user engagement with healing recommendations, and gates signups to a strict invite allowlist.

Working directory: `/google/src/cloud/chandansinghr/Omni/google3/experimental/brand_twin`

## Requirements

### R1. Bootstrap Secret Management (P1.5)
Introduce a swappable `SecretProvider` interface with an `EnvSecretProvider` (for local development/testing) and a `ManagedSecretProvider` (for production systems, leveraging a vault or KMS with TTL caching). Refactor the bootstrap configuration to resolve sensitive secrets (`jwtSecret`, `masterKey` AES key, `supabaseKey`, developer token, and OAuth client credentials) via this provider. Enforce that mock credentials are never allowed outside of `NODE_ENV=test`, and that the `validateEnv()` guard is evaluated post-secret resolution.

### R2. Log Redaction & Security Audits (P1.6)
Triage dependency vulnerabilities and integrate `npm audit --audit-level=high` checks into the CI pipeline. Wire the centralized case-insensitive recursion scrubber (redacting keys containing secret, key, password, token, or credit card PANs) into all logging and error reporting systems. Implement automated tests confirming that no raw token patterns are ever printed to console logs or error sink payloads, and add cross-tenant OAuth state-injection security verification.

### R3. Load & Concurrency Testing (P1.7)
Build a real-time load test suite driving concurrent workers, parallel sweep/healing computations, and Server-Sent Event (SSE) connection streams. Programmatically assert that average latencies, failure rates, and job queue lag stay within configured budgets under high contention.

### R4. Private Beta Telemetry & COGS Provenance (P2.1 - P2.3)
Establish `recommendation_events` table tracking user clicks (`shown`, `approved`, `executed`, `dismissed`, `reversed`) and dismiss reason details. Tag cost variant rows with origin provenance (`silent_sweep`, `accounting_sync`, `invoice_parse`, `manual`, `category_estimate`), and capture metrics for time-to-readiness and estimate-vs-actual cost variance.

### R5. Private Beta Invite Allowlist (P2.4)
Enforce that signups and logins are restricted to a predefined verified allowlist of email addresses. Require all new registered brands to default to the `OBSERVE` trust tier with a strict spend cap constraint, blocking any autonomous changes without explicit approval.

## Acceptance Criteria

### Secrets & Security
- [ ] Production mode fails to boot when bootstrap secrets resolve to mock defaults.
- [ ] No raw tokens or credit cards are printed to log output or error sinks, verified by a token-leak scanner test.
- [ ] OAuth flow rejects state tokens originating from different tenants (cross-tenant state-injection prevention).
- [ ] Dependency vulnerabilities are resolved, and CI pipeline enforces high-severity audit gates.

### Load & Concurrency
- [ ] Load test runs successfully under concurrent execution (M overdue jobs, N tenants), and asserts that average execution latencies remain below safety limits.
- [ ] Queue processors show zero double-claim errors under parallel load.

### Beta Telemetry & Allowlist
- [ ] Dismissing a healing recommendation requires selecting a reason and records a telemetry event.
- [ ] Cost tracking records source provenance metadata, and median time-to-readiness is recorded upon crossing 80% coverage.
- [ ] Signup endpoint returns `403 Forbidden` for email addresses not present in the invite allowlist.
- [ ] New accounts initialize at the `OBSERVE` tier with spend caps.

