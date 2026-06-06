# Project: Brand Digital Twin Phase B (Lawful & Trustworthy)

## Architecture
- Brand Digital Twin self-serve platform.
- Backend: TypeScript / Node (Express/server.ts).
- Database: Supabase / Postgres.
- Scheduler: POAS scheduler (`poas_scheduler.ts`).

## Code Layout
- `server.ts`: Main API server and Express routes.
- `schema.sql`: Postgres schema definitions and initial setup.
- `poas_scheduler.ts`: Scheduler job processing and polling.
- `rate_limiter.ts`: API rate limiting middleware.
- `user_auth.ts`: Authentication and user tier handling.
- `credential_vault.ts`: Cryptographic vault for tenant credentials.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1| Data Rights & Legal | R1 (GDPR delete cascade, export signed JSON) & R2 (legal surfaces, acceptances DB, re-prompts) | None | Not Started |
| M2| Ops & Observability | R3 (error tracking, metrics/alerting for lag, /ready health check, staging config) | None | Not Started |
| M3| Public Abuse Controls | R4 (verified emails, API rate limits, default OBSERVE tier, OAuth throttling) | M1 | Not Started |
| M4| Atomic Job Claiming | R5 (row-locking FOR UPDATE SKIP LOCKED in scheduler database transaction) | None | Not Started |
| M5| End-to-End Verification| Pass 100% of the E2E test suite across all Phase B requirements, followed by adversarial testing | M1, M2, M3, M4 | Not Started |

## Interface Contracts
### Legal & Consent
- `POST /api/legal/accept`: Logs user acceptance of ToS/DPA/Privacy.
- `GET /ready`: Health check endpoint returning status of DB and message queue connections.

### Rate Limiting & Abuse
- Express middleware enforcing tenant daily rate limits.
- Trust tier mapping on sign up: `OBSERVE` default.
