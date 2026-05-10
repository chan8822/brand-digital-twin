# Tanmatra

Therapeutic / clinical-grade meal-delivery & wellness platform — web app, mobile app, an RD-facing console, and an Express + Postgres backend, all in one pnpm monorepo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/tanmatra run dev` — run the customer web app
- `pnpm --filter @workspace/tanmatra-mobile run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Web: React 19 + Vite + Tailwind v4 + shadcn/ui (new-york), framer-motion, cmdk
- Mobile: Expo + React Native
- Build: esbuild (CJS bundle for server)

## Where things live

- `artifacts/tanmatra` — customer web app (anchor screens: Home, Menu, Dish, Cart/Checkout, Account/Tracker)
- `artifacts/tanmatra-mobile` — Expo React Native app
- `artifacts/api-server` — Express + Drizzle API
- `artifacts/mockup-sandbox` — Vite preview server for canvas/mockup work
- `lib/api-spec` — OpenAPI source of truth (`openapi.yaml`) + Orval codegen
- `lib/api-client-react` — generated React Query hooks + Zod schemas
- `lib/menu-catalog` — shared dish/menu data types
- `lib/db` — Drizzle schema + migrations

### Tanmatra web design system

- `artifacts/tanmatra/src/index.css` — single source of truth for color, type scale, radii, shadows, motion durations & easings (CSS custom properties under `@theme`).
- `artifacts/tanmatra/src/lib/motion.ts` — JS mirror of motion tokens (`DURATION`, `EASE`, `SPRING`, `FADE_IN_UP`) for framer-motion.
- `artifacts/tanmatra/src/components/CommandPalette.tsx` — global ⌘K palette (mounted from `Header`); searches dishes + every customer route.
- `artifacts/tanmatra/src/pages/Styleguide.tsx` — live `/__styleguide` route documenting tokens, type scale, icons, motion, primitives. Keep in sync when tokens change.
- `artifacts/tanmatra/src/components/layout/{Header,BottomNav,Footer}.tsx` — global chrome, IA grouping is **Eat / Plan / Track / Community / Account**.

## Architecture decisions

- **Contract-first APIs.** OpenAPI spec in `lib/api-spec` drives generated React Query hooks + Zod schemas. Server validates inputs/outputs with the same schemas.
- **Single design-token source.** `@theme` in `index.css` is the only place to introduce a color/radius/duration; mirror motion tokens in `lib/motion.ts` so Framer Motion stays in lockstep.
- **Phosphor (primary) + Lucide (legacy).** New customer surfaces use `@phosphor-icons/react`; admin/RD console screens may keep `lucide-react`.
- **Variable fonts via @fontsource.** Inter Variable + JetBrains Mono Variable + Instrument Serif are bundled — no Google Fonts CDN.
- **Path-based routing through the shared proxy.** Each artifact reads `BASE_PATH`; never hard-code URLs across artifacts.

## Product

Customer-facing capabilities (web + mobile):

- Browse a curated clinical menu (single dishes + Curated Selection combos with constituent dish drill-down)
- Build a cart / checkout / track live order
- Subscribe to weekly meal plans, generate a personalized 7-day plan
- Book a registered dietitian, follow therapeutic protocols (Wellness, Performance, Clinical)
- Join cohort challenges, browse RD-curated marketplace + recipes
- Personal preferences/health profile, rewards, vouchers, premium

Operator / RD surfaces (admin-gated routes under `/admin/*` and `/rd-console`).

## User preferences

- Clinical Dark palette is locked (`#D4AF37` clinical-gold, `#6BA3C8` blue, `#7D9E7E` sage). Do not introduce new base colors without explicit approval.
- Tabular numerals everywhere clinical data is shown (`.text-clinical-data` or `font-variant-numeric: tabular-nums`).
- Combo cards on Menu must be a single clickable image/title that opens a Dialog listing constituent dishes (each linking to `/dish/:slug`) plus an "Add Combo" CTA.
- Dish page: macro overlay must be compact and not collide with the RD card.

## Gotchas

- Do **not** run `pnpm dev` at the workspace root — use the configured workflows (or `pnpm --filter @workspace/<name> run dev`) so `PORT` / `BASE_PATH` are wired up.
- Any new color/radius/duration token must be added to `index.css @theme` AND the `/__styleguide` page.
- When extending the customer IA, update both `Header.tsx` (desktop) and `BottomNav.tsx` (mobile) — they share the Eat/Plan/Track/Community/Account grouping.
- Add new routes to `CommandPalette.tsx` so ⌘K can find them.
- `useMenuCatalog()` returns `{ dishes, isLoading, isError }` and falls back to `STATIC_DISHES` so UI never blanks.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
- See `.local/skills/artifacts` for the artifact lifecycle (creating new artifacts, registering them).
