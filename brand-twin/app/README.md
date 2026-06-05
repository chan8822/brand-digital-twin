# Brand Digital Twin OS — Product UI (A3)

The customer-facing SPA. This is **A3.1 (scaffold) + A3.2 first screen (POAS
dashboard hero)** from `A-PHASE_BUILD_SPEC.md` / `A3-SCAFFOLD_SPEC.md`.

It is a **standalone Next.js project** living under `brand-twin/app/` — kept
separate from the Tanmatra project at the repo root, and **not** part of the
Tanmatra pnpm workspace (the workspace globs `artifacts/*` and `lib/*`, not
`brand-twin/`). When the engine team is ready, copy this `app/` directory into
`chandansinghr-ship-it/brand-digital-twin` and point it at the live server.

## Run it

```bash
cd brand-twin/app
npm install
npm run dev        # http://localhost:3002
```

With no `NEXT_PUBLIC_API_URL` set it runs in **MOCK mode** — the dashboard
renders demo recommendations (see `src/lib/mock.ts`) so it's demoable with zero
backend. Set the env var to wire the live engine:

```bash
cp .env.example .env.local
# edit NEXT_PUBLIC_API_URL=http://localhost:3001
```

## What's wired

| Piece | File | Notes |
|-------|------|-------|
| Design tokens | `src/lib/tokens.ts` | mirrored from marketing `index.html` |
| API client | `src/lib/api.ts` | `x-tenant-id` + `Bearer` headers (server.ts:148); unwraps the success envelope (server.ts:119) |
| Engine types | `src/lib/types.ts` | exact `RecommendationCard` / `CampaignPoasReport` from `healing_types.ts` @ 44ca4ba |
| Query hooks | `src/lib/queries.ts` | TanStack Query; MOCK-aware |
| Dual-metric hero | `src/components/DualMetricCard.tsx` | ROAS vs POAS, dollar-drag callout, count-up, estimated-COGS chip |
| Dashboard | `src/app/dashboard/page.tsx` | sorts worst-first by `dollarDrag` |
| Three-zone healing card | `src/components/HealingCard.tsx` | OS acts / you decide / ads can't fix, with dollar-recovery + caveat |
| Healing screen | `src/app/healing/page.tsx` | actionable campaigns only, worst-first |
| Nav | `src/components/Nav.tsx` | shared top nav across screens |

## Data contract

`GET /api/v1/recommendations` returns the healing cards:

```ts
{ status: "success",
  data: { recommendations: RecommendationCard[] },
  timestamp: string }
```

`RecommendationCard` carries `poas`, `roas`, `dollarDrag`, the three-zone
prescriptions (`osActs` / `userApproves` / `adsCantFix`), `confidence`, and a
`caveat` — everything the dashboard and (next) the three-zone healing card need.

## Next screens (A3.2 remainder)

Per `A-PHASE_BUILD_SPEC.md §A3`, still to build on this scaffold:

- [x] Three-zone healing cards (`/healing` — `HealingCard.tsx`, OS acts / you decide / ads can't fix)
- [ ] Connect-your-stack (A2 OAuth buttons) — blocked on A2
- [ ] Live sweep (`GET /api/v1/risks`)
- [ ] Autonomy dial + approvals queue
- [ ] Profit Readiness gauge (`GET /api/v1/profit-readiness` — endpoint TBD)
- [ ] SSE client for `/api/v1/stream`
- [ ] Auth screens (signup/login/verify) once A1 UI is wired
