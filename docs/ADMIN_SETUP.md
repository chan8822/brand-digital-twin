# Admin & Agent Setup

This is the single source of truth for the env vars and one-time
operations needed to get the admin console + AI agents serving on a
fresh deployment. After everything below is set, hit `/admin` and the
**Deployment status** panel at the top of the page should show all
green pills.

---

## 1. Required env vars (Cloud Run · `wellness-foods` service)

Set these via `gcloud run services update wellness-foods --set-env-vars=...`
or in the Cloud Run console. Mark every required one before the first
deploy; the missing ones will be listed at `/admin/_status`.

| Name | Required | What it does |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string. Use `sslmode=require` (or `verify-full` with `sslrootcert=`). Avoid `sslmode=no-verify` in prod. |
| `REDIS_URL` | ✅ | BullMQ + rate-limit storage. Production refuses to boot without it. |
| `GOOGLE_API_KEY` | ✅ | Gemini key. Without it every AI agent route errors. |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated CORS allowlist. Production should be `https://tanmatra.food`. |
| `ADMIN_USERNAME` | ✅ | Username for `/admin/login`. |
| `ADMIN_PASSWORD_HASH` | ✅ | bcrypt hash of the admin password. Generation flow below. |
| `ADMIN_SESSION_SECRET` | ✅ | HMAC secret for the admin cookie. 32+ random bytes. |
| `RD_ADMIN_TOKEN` | ⚪ | Static admin token via `x-admin-token` header. Useful for CI / curl bootstrap. Treat like a master password. |
| `OPS_USER_IDS` | ⚪ | Comma-separated user UUIDs allowed at `/admin/ops`. |
| `CATALOG_USER_IDS` | ⚪ | Comma-separated user UUIDs allowed in CMS / catalog edits. |
| `SESSION_SAMESITE` | ⚪ | Customer session cookie SameSite. Set to `none` for cross-origin Firebase → Cloud Run. |
| `PRIVATE_OBJECT_DIR` | ⚪ | GCS object-storage prefix for menu-asset uploads. Format `/<bucket>/<prefix>`. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SID` | ⚪ | Phone OTP. Without them OTPs go to logs only (mock mode). |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | ⚪ | Payment provider. Without them payments fall back to mark-as-paid (dev mode). |
| `VITE_ENABLE_COD` (frontend build only) | ⚪ | Bake into the Firebase build to surface the Cash-on-Delivery option in checkout. Pair with backend COD work. |

The full list with current state is at **`/admin`** (Deployment status
panel) once the admin login is up.

---

## 2. Generating `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET`

### Session secret

```bash
node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
```

Copy the output to `ADMIN_SESSION_SECRET` on Cloud Run.

### Password hash

After `ADMIN_SESSION_SECRET` is set, use the running container's
`/admin/_hash` endpoint (it requires knowing the session secret so
random callers can't enumerate it):

```bash
curl -X POST https://wellness-foods-XXXX.run.app/api/admin/_hash \
  -H "x-admin-secret: <your ADMIN_SESSION_SECRET>" \
  -H "content-type: application/json" \
  -d '{"password":"<your-strong-password>"}'
```

Response is `{ "hash": "$2b$10$..." }`. Copy the hash to
`ADMIN_PASSWORD_HASH` on Cloud Run. Redeploy. Sign in at
`https://tanmatra.food/admin/login`.

---

## 3. Granting ops/catalog scope to additional users

`OPS_USER_IDS` and `CATALOG_USER_IDS` are comma-separated lists of
`users.id` (UUID) values. To find a user's id:

```sql
select id, phone_e164, created_at
from users
where phone_e164 = '+91XXXXXXXXXX';
```

Append the UUID to the relevant env var on Cloud Run. The user can
then access `/admin/ops`, `/admin/cms-agent`, etc. without a separate
admin login.

---

## 4. Verifying the agents are serving

Each AI agent route is auth-gated. Health-check by signing in as the
appropriate role and POSTing a one-message chat:

| Agent | Endpoint | Required role |
|---|---|---|
| Coach | `POST /api/coach-agent/chat` | logged-in customer |
| Support | `POST /api/support-agent/chat` | logged-in customer |
| Ops | `POST /api/ops-agent/chat` | ops (admin session, OPS_USER_IDS, or RD_ADMIN_TOKEN) |
| CMS | `POST /api/cms-agent/chat` | catalog (admin session, CATALOG_USER_IDS, or RD_ADMIN_TOKEN) |
| Forecasting | `POST /api/forecasting/agent/chat` | ops |
| RD Copilot | `POST /api/rd/copilot/...` | RD account bound to the slug being queried |

Body for the chat agents:
```json
{"message": "ping", "history": []}
```

The response should stream NDJSON `text-delta` events. If you get
`401`, the auth scope is wrong. If `429`, you've hit the per-user
rate limit (each agent has its own — coach 30/5min, etc.).

The `/admin/_status` endpoint shows the **last 24h** agent rollup
(total runs, failure rate, last success timestamp). A healthy agent
with no traffic shows `no runs`; that's expected on a fresh deploy.

---

## 5. Common bring-up gotchas

- **Admin login returns 500** — `ADMIN_SESSION_SECRET` not set, or set
  to a value shorter than 16 bytes.
- **All agents return 500** — `GOOGLE_API_KEY` missing or invalid.
- **`/admin/ops` works but `/admin/cms-agent` doesn't** — `CATALOG_USER_IDS`
  doesn't include your user UUID. The two scopes are separate.
- **Customer login OTPs never arrive** — Twilio env vars unset; the
  OTP is in the Cloud Run logs instead.
- **Frontend at `tanmatra.food` shows old UI** — Firebase Hosting cache.
  Hard-refresh (Cmd-Shift-R / Ctrl-F5) or wait ~5 min for CDN
  invalidation.
- **CORS errors in browser** — `ALLOWED_ORIGINS` doesn't include the
  exact origin (scheme + host + port). `https://tanmatra.food` ≠
  `https://www.tanmatra.food`.

---

## 6. Day-one bring-up sequence

```
1. gcloud run deploy wellness-foods --source . (first push)
2. gcloud run services update wellness-foods --set-env-vars="DATABASE_URL=...,REDIS_URL=...,GOOGLE_API_KEY=...,ALLOWED_ORIGINS=https://tanmatra.food"
3. Generate ADMIN_SESSION_SECRET, set it, redeploy.
4. POST /admin/_hash with the secret, get a password hash.
5. Set ADMIN_USERNAME + ADMIN_PASSWORD_HASH, redeploy.
6. Sign in at /admin/login.
7. Read the Deployment status panel at /admin — fix anything red.
8. Add OPS_USER_IDS + CATALOG_USER_IDS for the rest of the team.
```
