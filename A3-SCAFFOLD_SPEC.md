# [PRIORITY A3] Scaffold Spec — Product UI Foundation + First Screen

> Concrete starting point for the product UI (`A-PHASE_BUILD_SPEC.md` A3). Defines
> the app skeleton, the shared layer (design tokens, API client, auth), and builds
> the **first real screen — the POAS hero** — wired to the existing
> `/api/v1/recommendations` endpoint. Grounded @ `a6ab7db`.
>
> Stack (from `RELEVANT_REPOS.md`): Next.js (app router) · Tailwind · shadcn/ui ·
> tremor · TanStack Query · Framer Motion.

---

## Folder structure

```
app/                          # new top-level UI package (sibling to the TS engine)
  app/                        # Next.js app-router
    (marketing)/              # public pages (reuse index.html content)
    (auth)/login, /signup     # A1 screens (later)
    (dash)/
      layout.tsx              # auth-gated shell: header, brand switcher, ⌘K
      page.tsx                # dashboard → POAS hero (THIS SPEC)
      connect/page.tsx        # A2 (later)
      sweep/page.tsx          # (later)
      healing/page.tsx        # (later)
  components/
    ui/                       # shadcn copy-in primitives (button, card, dialog, slider)
    metrics/DualMetricCard.tsx   # the POAS/ROAS hero card (THIS SPEC)
  lib/
    api.ts                    # typed fetch client (tenant header + auth)
    queries.ts                # TanStack Query hooks
    tokens.ts                 # design tokens mirrored from index.html
    types.ts                  # response types matching the engine
  tailwind.config.ts
  package.json
```

> Keep the UI in its own `app/` package so the engine stays a clean backend. The
> SPA talks to the engine only over HTTP (and SSE) — no shared runtime.

---

## Shared layer

### `lib/tokens.ts` — mirror the existing design language
From `index.html`: fonts Space Grotesk (display) + Plus Jakarta Sans (body);
base `neutral-950`; accent `indigo-500`. Encode once; feed Tailwind theme.

```ts
export const tokens = {
  font: { display: 'Space Grotesk', body: 'Plus Jakarta Sans' },
  color: { bg: '#0a0a0a', accent: '#6366f1', /* indigo-500 */
           good: '#34d399', warn: '#fbbf24', bad: '#f87171' },
} as const;
```
Semantic mapping for our domain: `good` = healthy POAS, `bad` = bleeding,
`warn` = at-threshold. Reuse for sweep severities (CRITICAL=bad, OPPORTUNITY=good).

### `lib/api.ts` — typed client matching the real engine
Auth + tenant exactly as the server expects (`server.ts:148`): `x-tenant-id`
header + `Authorization: Bearer`. CORS already allows these (`server.ts:116`).

```ts
const BASE = process.env.NEXT_PUBLIC_API_BASE!;   // engine origin
export async function apiGet<T>(path: string, tenantId: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-tenant-id': tenantId, 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}
```

### `lib/types.ts` — match the engine's actual output
From `poas_calculator.ts` (the `reports.push({...})` shape, verified):

```ts
export interface CampaignReport {
  campaignId: string;
  campaignName: string;
  platform: string;
  status: string;                  // 'ENABLED' | 'active' | ...
  spend: number;
  contributionMargin: number;
  poas: number | null;             // null when spend == 0
  roas: number | null;
  breakdown: {
    grossRevenue: number; discountAmount: number; cogs: number;
    fulfillment: number; marketplaceFee: number; refunds: number;
    spend: number; contributionMargin: number; estimatedCogs?: boolean;
  };
  clicks: number;
  orders: number;
}
// GET /api/v1/recommendations → { recommendations: CampaignReport[] }
```

### `lib/queries.ts` — TanStack Query hook
```ts
export function useRecommendations(tenantId: string, token: string) {
  return useQuery({
    queryKey: ['recommendations', tenantId],
    queryFn: () => apiGet<{recommendations: CampaignReport[]}>(
      '/api/v1/recommendations', tenantId, token),
    select: (d) => d.recommendations,
  });
}
```

---

## The first screen — POAS hero (the "two numbers / the gap")

This is the product's signature moment. One card per campaign: ROAS beside POAS,
the gap made visceral.

### `components/metrics/DualMetricCard.tsx`
Built on tremor `Card` + shadcn, animated with Framer Motion.

```tsx
// props: report: CampaignReport
// derive:
const gap = (report.roas ?? 0) - (report.poas ?? 0);
const bleeding = (report.poas ?? 0) < 1;          // losing money per order
const gapDollars = report.spend * gap;            // rough ₹ the ROAS lens hides
```

**Layout (per card):**
```
┌────────────────────────────────────────────┐
│ Summer Jackets            [platform] [status]│
│                                              │
│   ROAS 4.1×          POAS 0.8×               │  ← tremor Metric, big
│   what platforms see  what you keep          │
│                                              │
│   ▸ The gap: ₹18,400/mo the ROAS view hides  │  ← accent if bleeding
│   [████████░░] contribution 0.8× of spend    │  ← tremor ProgressBar
└────────────────────────────────────────────┘
```

- POAS value coloured by `tokens.color`: bad (<1), warn (1–1.5), good (≥1.5).
- Framer Motion: POAS number **counts up** on mount; the gap line **fades/slides
  in** a beat after — the reveal, not a static print.
- `estimatedCogs` true → small "estimated" chip + tooltip ("complete your costs
  to confirm") — honest about confidence, ties to the C1 readiness gate.

### `app/(dash)/page.tsx` — the dashboard
```tsx
const { data: reports, isLoading } = useRecommendations(tenantId, token);
// sort worst-first: bleeding campaigns up top (largest gap × spend)
const ranked = [...(reports ?? [])].sort(
  (a,b) => (b.spend*((b.roas??0)-(b.poas??0))) - (a.spend*((a.roas??0)-(a.poas??0))));
return (
  <Grid>
    <SummaryStrip reports={ranked} />        {/* portfolio POAS, total gap */}
    {ranked.map(r => <DualMetricCard key={r.campaignId} report={r} />)}
  </Grid>
);
```
Loading → tremor skeletons (not a spinner). Empty (no campaigns) → cold-start
copy from `MarginDiscoveryResult` ("connect your storefront…").

---

## Build checklist (A3.1)
- [ ] `app/` Next.js package + Tailwind wired to `lib/tokens.ts`
- [ ] shadcn/ui init; copy in `card`, `button`, `badge`, `tooltip`, `skeleton`
- [ ] tremor installed; `lib/api.ts` + `lib/queries.ts` + `lib/types.ts`
- [ ] Auth-gated `(dash)/layout.tsx` (reads tenantId + token; redirect if absent)
- [ ] `DualMetricCard` with count-up + gap reveal + estimated chip
- [ ] `(dash)/page.tsx` dashboard: ranked worst-first, summary strip, skeleton + empty states
- [ ] Point `NEXT_PUBLIC_API_BASE` at the running engine; verify against a seeded tenant

## Tests / verification
- [ ] Component test: bleeding campaign renders bad colour + gap line; healthy renders good, no gap callout
- [ ] `estimatedCogs:true` shows the estimated chip
- [ ] Run engine locally (`onboarding_simulator` seeds a tenant) → dashboard renders real POAS/ROAS from `/recommendations`
- [ ] Empty tenant → cold-start copy, no crash

## Definition of done (A3.1)
A developer runs the engine + the `app/`, logs in against a seeded tenant, and
sees real campaigns ranked worst-first as dual-metric cards with the gap animated
in. This is the skeleton every other A3 screen (connect, sweep, healing, autonomy)
slots into — they reuse `lib/` and the `(dash)` shell unchanged.

---

## Why this screen first
It's the **highest-signal, lowest-dependency** screen: it needs only the existing
`/recommendations` endpoint (no new backend), and it *is* the product's core
claim ("two numbers, one gap"). Shipping it proves the whole UI stack end-to-end —
tokens, API client, query layer, animated component — so every later screen is
assembly, not foundation.
