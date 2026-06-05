# [PRIORITY A · endpoints] UI-to-Engine Endpoint Gaps

> Four small, well-scoped backend items that flip the already-built A3 screens
> from MOCK to live. Each is grounded in the real upstream code (`brand-digital-twin`
> @ `8807aa8`). The UI is already written against these exact shapes — landing
> them is a wiring exercise, not new design.
>
> Items: **A2.4 integrations · A3.4 sweep · A3.5 autonomy · A2.5 auth-on-redirect.**

---

## A2.4 — `GET /api/v1/integrations`

### Why
The connect screen (`/connect`) shows which platforms are linked and surfaces
the reconnect path on a suspended integration. The data exists in the client but
no HTTP endpoint exposes it.

### What exists
`SupabaseClient.getIntegrationStates(tenant): Promise<IntegrationState[]>`
(`supabase_client.ts:1350`) — already RLS-asserted, returns the per-tenant list.
`IntegrationState` (`agency_os_types.ts:100`): `{ integrationId, tenantId,
provider, status: 'active'|'suspended'|'expired', settings, updatedAt }`.

### Build
Add an auth-gated handler in `server.ts` next to the other tenant-scoped GETs
(mirror `/api/v1/approvals` at `server.ts:809`):

```ts
if (path === '/api/v1/integrations' && req.method === 'GET') {
  const integrations = await db.getIntegrationStates(tenantId);
  sendSuccessResponse(res, { integrations });
  return;
}
```

### Contract (what the UI already expects)
`{ status:'success', data:{ integrations: IntegrationState[] }, timestamp }`
— see `app/src/lib/queries.ts` `useIntegrations`.

### Done when
- A connected tenant gets its real integration list; the connect tiles reflect
  active / suspended / disconnected without mock data.

---

## A3.4 — `GET /api/v1/sweep`

### Why
The sweep screen (`/sweep`) renders the rich `SweepFinding[]` from the 5
diagnostic scanners. Today `/api/v1/risks` returns only `string[]`
(`UnifiedBrain.detectRisks`, `unified_brain.ts:139`) — the rich findings are
produced internally but never exposed.

### What exists
`RiskRadar` already has all 5 scanners, each returning `SweepFinding[]`:
- `scanStockouts(ctx)` — `risk_radar.ts:52`
- `scanROIEfficiency(ctx)` — `:192`
- `scanCheckoutEvents(ctx)` — `:833`
- `scanConversionTracking(ctx)` — `:717`
- `scanBudgetCappedWinners(ctx, …)` — `:766`

They read `this.db` + `this.tenantId` and take a governance `Context`
(`governance_types.ts:49`). `SweepFinding` (`healing_types.ts`):
`{ code, severity: 'CRITICAL'|'WARNING'|'OPPORTUNITY', check, entityId, title,
detail, dollarImpact, suggestedAction? }`.

### Build
1. Add an aggregator on `RiskRadar`:

```ts
async runFullSweep(ctx: Context): Promise<SweepFinding[]> {
  const groups = await Promise.all([
    this.scanStockouts(ctx),
    this.scanROIEfficiency(ctx),
    this.scanCheckoutEvents(ctx),
    this.scanConversionTracking(ctx),
    this.scanBudgetCappedWinners(ctx),
  ]);
  const all = groups.flat();
  const rank = { CRITICAL: 0, WARNING: 1, OPPORTUNITY: 2 } as const;
  return all.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.dollarImpact - a.dollarImpact,
  );
}
```

2. Endpoint in `server.ts` (auth-gated, build `ctx` the same way the brain does
for the tenant):

```ts
if (path === '/api/v1/sweep' && req.method === 'GET') {
  const sweep = await brain.riskRadar.runFullSweep(ctxForTenant(tenantId));
  sendSuccessResponse(res, { sweep });
  return;
}
```

> Keep `/risks` as-is for back-compat; `/sweep` is the rich superset.

### Contract
`{ status:'success', data:{ sweep: SweepFinding[] }, timestamp }`
— see `app/src/lib/queries.ts` `useSweep`. UI sorts again client-side, so server
order is not load-bearing, but returning sorted keeps SSE-pushed updates clean.

### Done when
- `/sweep` returns findings from all 5 scanners; the screen drops mock and shows
  live severity → dollar ordering with the 1-tap-fix chip where `suggestedAction`
  is present.

---

## A3.5 — `GET` / `POST /api/v1/autonomy`

### Why
The autonomy dial (`/autonomy`) shows the current trust tier; there's no
read/write endpoint, so the dial is display-only on mock.

### What exists
`GovernanceEngine` holds tiers per `(tenantId, actionType)`:
- `getTier(tenantId, actionType): number` — `governance_engine.ts:55` (0..4, defaults 0)
- `setTier(tenantId, actionType, tier)` — `:62`
- `getTrustTier(tenantId, op): Promise<number>` (durable) — `:178`
- `SEMANTIC_TIERS[n]` → name (`governance_types.ts:7`): 0 OBSERVE … 4 C_SUITE

### Nuance to decide
Tiers are **per action type**, not one per tenant. For the dial, return a single
representative tenant tier. Recommended: the **minimum earned tier across the
tenant's action types** (the safest, most honest "where do we stand" number),
or accept an optional `?op=` to scope it. Document whichever is chosen.

### Build
```ts
// GET /api/v1/autonomy[?op=adjust_budget]
//   → { tier: SemanticTrustTier, level: number }
// POST /api/v1/autonomy  { tier: SemanticTrustTier, op?: string }
//   → set (guard: cannot exceed earned tier; lowering is always allowed)
```

- `GET`: resolve the numeric tier (min across ops, or the `op` param), map via
  `SEMANTIC_TIERS`, return both name and level.
- `POST`: allow the user to **lower** autonomy freely; **raising** must not
  exceed what's been earned (the trust ledger governs upward moves — a manual
  set above earned should 409, not silently grant).
- New public orgs must read **OBSERVE** here (ties to B4 / A1.5).

### Contract
`{ status:'success', data:{ tier, level }, timestamp }`
— see `app/src/lib/queries.ts` `useAutonomy`. The dial already renders all 5
tiers with caps; it just needs the current one.

### Done when
- The dial reflects the live tier; lowering autonomy persists; raising above
  earned is rejected.

---

## A2.5 — Auth on top-level navigations (OAuth redirect + SSE)

### Why
Two flows are **not** `fetch()` calls and therefore cannot carry the
`Authorization: Bearer` header the SPA uses everywhere else:
1. **OAuth initiation** — `GET /connect/:platform` (`server.ts:684`) is a
   top-level browser navigation (302 → consent).
2. **SSE stream** — `EventSource('/api/v1/stream')` (`server.ts:892`) is GET-only
   and cannot set headers.

Both endpoints are auth-gated. Today the UI appends `?t=<token>` as a stopgap
(`app/src/lib/api.ts` `connectUrl`) — fine for a demo, not for production
(tokens land in logs / referrers).

### Build (pick one, apply to both)
- **Preferred — short-lived signed ticket:** a `GET /api/v1/auth/ticket`
  (Bearer-authed `fetch`) returns a single-use, ~60s HMAC ticket bound to
  `{userId, orgId}` (reuse `auth.ts` signer). The SPA passes it as `?ticket=` on
  the connect URL and the EventSource URL; the server verifies + burns it. No
  long-lived token in a URL.
- **Alternative — httpOnly session cookie:** issue a `Secure; httpOnly; SameSite=Lax`
  session cookie at login; `/connect` and `/stream` accept it. Simpler, but adds
  CSRF surface to mutating routes (mitigate with SameSite + a CSRF token).

### UI changes (small, already isolated)
- `connectUrl(platform)` → fetch a ticket, append `?ticket=`.
- `useStream` → fetch a ticket, append `?ticket=` to the EventSource URL.

### Done when
- OAuth connect and the live SSE stream authenticate without a bearer token in
  the URL; the `?t=` stopgap is removed.

---

## Summary

| Item | Endpoint | Effort | UI status |
|------|----------|--------|-----------|
| A2.4 | `GET /integrations` | S | built against it |
| A3.4 | `GET /sweep` (+ `runFullSweep`) | S | built against it |
| A3.5 | `GET/POST /autonomy` | S | built against it |
| A2.5 | auth ticket for redirect + SSE | S–M | `?t=` stopgap in place |

All four are small. Landing A2.4 / A3.4 / A3.5 flips the last three screens from
mock to live; A2.5 makes connect + live updates production-safe. After these, the
Phase-A product is fully wired end-to-end.
