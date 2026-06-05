# Relevant Repos — Elevating the OS (UX/UI-first)

> Curated open-source repos to accelerate the public-launch build, weighted to the
> biggest remaining chunk (the A3 product UI). Bias: **own-the-code / copy-in**
> libraries that fit the in-house decision — not hosted SaaS that adds a vendor.
> Each entry says *where it plugs into our screens*, not just what it is.

---

## Tier 1 — Build the product UI on these (A3)

| Repo | What | Why it fits us |
|------|------|----------------|
| `shadcn/ui` | Radix + Tailwind components you copy into your repo (you own the code) | Exactly our model: in-house, Tailwind, no runtime dep. Foundation for every A3 screen. Already matches `index.html`'s Tailwind/dark aesthetic. |
| `tremorlabs/tremor` | React dashboard/KPI/chart components built for analytics | Purpose-built for metric dashboards — the **dual-metric POAS/ROAS hero**, the **Profit Readiness gauge**, KPI deltas. Tailwind-native, composes with shadcn. |
| `radix-ui/primitives` | Accessible headless primitives (Slider, Dialog, Tabs…) | The **autonomy dial** = Radix Slider. The **combo/dialog** patterns. Accessibility for free. |
| `pacocoursey/cmdk` | Command palette (⌘K) | Power-user nav across brands/campaigns/actions — matches the "command palette" pattern already in the design system. |
| `TanStack/table` | Headless data tables | Campaign lists, sweep-findings table, approvals queue — sortable by severity→dollarImpact (our exact sort). |
| `TanStack/query` | Server-state/cache/SSE-friendly | Wiring the 9 screens to the API + `/stream`; optimistic updates on approve/act. |

---

## Tier 2 — Make the signature moments feel alive

| Repo | What | Where we'd use it |
|------|------|-------------------|
| `framer/motion` (`motion`) | Animation library | The **live sweep** (findings resolving as flag/clear), card transitions, the gap "reveal" on the hero. |
| `magicuidesign/magicui` | Animated Tailwind components (copy-in) | Number tickers for POAS counting up, the scan-line effect, "shimmer while loading findings." |
| `xyflow/xyflow` (React Flow) | Node/edge graph canvas | **Attribution & funnel visualisation** — last-touch paths, the add-to-cart→checkout→purchase funnel break the sweep detects. |
| `airbnb/visx` *or* `recharts` | Low-level / batteries-included charts | POAS-over-time, margin waterfall, cohort views. visx if we want full control; recharts to move fast. |
| `nivo` (`plouc/nivo`) | Rich chart set | Heatmaps/treemaps for the 16-domain coverage map and spend-by-channel. |

---

## Tier 3 — Speed up whole-surface scaffolding (optional)

| Repo | What | Trade-off |
|------|------|-----------|
| `refinedev/refine` | React framework for internal/admin tools (auth, CRUD, RBAC) | Could fast-track the **agency/admin & ops review queue** (C2.5). Adopt selectively — don't let it own the customer surface. |
| `tremorlabs/tremor-raw` *or* shadcn blocks | Pre-composed dashboard blocks | Starting layouts for the dashboard screen; trim to our IA. |
| `steven-tey/novel` / `nextjs/app` examples | Next.js app-router references | Reference patterns for the SPA scaffold (A3.1). |

---

## Tier 4 — Non-UI repos that elevate Phase B/C (self-hostable, fits in-house)

| Repo | Replaces / accelerates | Phase |
|------|------------------------|-------|
| `getsentry/sentry` (self-hosted) or `openobserve/openobserve` | Error tracking + observability (B3.1/B3.2) — keep the swappable webhook interface | B |
| `OpenAPITools/openapi-generator` | Typed client SDK from the API → the SPA calls typed endpoints | A3/B |
| `casbin/casbin` | Battle-tested RBAC if our hand-rolled org/role model needs more than OBSERVE→C_SUITE tiers | A1/B4 |
| `react-hook-form` + `colinhacks/zod` | Form state + schema validation — signup, Pareto COGS grid, suggest-an-amount | A/C |
| `pmndrs/zustand` | Light client state (autonomy tier, connection status) without Redux weight | A3 |

> Note: for jobs/billing/auth we **build in-house** per decision — so repos like
> Trigger.dev, Stripe Billing, or WorkOS are deliberately *not* recommended.
> Listed alternatives above are libraries we vendor into our own code, not services.

---

## How to choose (the rule)

1. **Copy-in beats install beats hosted.** shadcn/Radix/magicui give us code we own —
   matches the in-house mandate and avoids runtime lock-in.
2. **Tremor for anything that shows a number.** It's the fastest path to the
   metric-heavy screens (hero, gauge, KPI deltas) without hand-building charts.
3. **Don't adopt a framework that wants the whole app** (Refine) for the *customer*
   surface — use it only behind the admin/ops wall if at all.
4. **Match the existing aesthetic.** `index.html` already sets Tailwind + Space
   Grotesk/Plus Jakarta + neutral-950/indigo — every Tier-1 pick honors that.

---

## Suggested starting stack for A3 (concrete)

```
Next.js (app router)  +  Tailwind  +  shadcn/ui
  → tremor            (POAS hero, readiness gauge, KPI cards)
  → Radix Slider      (autonomy dial)
  → TanStack Table    (sweep findings, campaigns, approvals)
  → TanStack Query    (API + SSE wiring)
  → Framer Motion     (live sweep, reveals)
  → React Flow        (attribution/funnel)
  → react-hook-form + zod (forms)
```

This stack builds all 9 A3 screens with copy-in components we own, on the design
language the marketing page already established — no new runtime vendors.
