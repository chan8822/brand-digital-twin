# Project State — Brand Digital Twin OS (single source of truth)

> Compaction of the full design + build conversation. Read this first to resume.
> Last synced against upstream `brand-digital-twin` @ commit `67af268`.

---

## What this is

An autonomous, profit-truth-based ad-ops OS. Optimises **POAS** (profit on ad
spend), not ROAS. Treats advertising as a *subsystem of the business* —
inventory-, cash-, and margin-aware. Graduated, earned, reversible autonomy via
a trust ledger. Serves solo founder → scale agency on one engine.

**One-line:** the system that connects advertising to the truth of the business
it serves — and tells the brand not just what's wrong, but what to do about it,
and what it cannot fix with ads alone.

---

## The thesis (why it exists)

Five root structural causes → five architecture layers:

| Root cause | Layer that answers it |
|------------|----------------------|
| The Measurement Lie (ROAS hides cost) | L1 Truth Engine — real POAS |
| Complexity Explosion (too many tools) | L0 Context Fabric — unified ingestion |
| Expertise Scarcity (no one holds it all) | L2 Intelligence Brain |
| The Autonomy Gap (binary trust) | L3 Governance + Trust Ledger |
| Cash-Reality Disconnect (ads in a bubble) | L0 — inventory, cash, refunds |

Positive-sum thesis: when optimisation targets business truth, brand + agency +
platform + customer all win. ROAS won because it was *easy*; POAS's adoption
barrier is effort + the psychological ask of admitting the old number flattered.

---

## Document set (all on PR #23, branch `claude/jolly-mendel-zh6TR`)

| Doc | Role |
|-----|------|
| ARCHITECTURE_VISION | Root causes → layers, stakeholder returns, 16-domain map |
| BRAND_BASELINE_SCAN | Stage-0 observable scan + improvement layer |
| PROFIT_DATA_MODEL | Profit parameters, COGS easing, progressive precision |
| HEALING_RECOMMENDATIONS | Root-cause → three-zone prescriptions |
| HEALING_ENGINE_SPEC | **Granular** `diagnoseRootCause()` spec |
| SWEEP_COLDSTART_SPEC | **Granular** 3 sweep checks + zero-order cold-start |
| USER_JOURNEYS | Goal-first, 6-stage spine, worked journeys |
| INTEGRATIONS_3P | Adoption plumbing (buy) vs brain (build) |
| PHASED_ROADMAP | 4 phases, ~37% → 360%, LP gates |
| IMPLEMENTATION_PLAN | Sequenced checklist + dependency graph |
| LANDING_PAGE_DRAFT | BAU-toned LP, held until Phase 2 |

---

## Build state (verified against real code)

**Real & working:** POAS truth engine · multi-tenant isolation (DB-enforced) ·
governance + trust ledger · Shopify/Woo/Magento orders · Google Ads + Meta spend ·
real Google Ads write path · runway→spend throttle · MCC+GMC enumeration ·
ROAS+POAS dual report · 5 semantic autonomy tiers + per-tier caps · idempotency store ·
healing engine `diagnoseRootCause()` + recommendation cards (side split,
dollar-weighted ranking, incrementality flag, `CampaignCostBreakdown`, §7 cross-channel
guards, §8 confidence gates) · all 5 sweep checks (sorted severity→dollarImpact) ·
zero-order cold-start (`getVariants()` fallback, `MarginDiscoveryResult` union) ·
durable job queue (`pending_jobs` · `poas_daily` + `settling_window` · 5-min poller) ·
`validateEnv()` startup guard · `.env.example` · onboarding telemetry (7-stage trace) ·
**MCP agent layer** (`agents/` — `IntelligentAnalystAgent`, `RiskRadarAgent`,
`GovernanceShadowAgent` on `OneMcpServer` + `IsolationContext`; engine capabilities
exposed as JSON-RPC tools for agentic orchestration — landed `a6ab7db`) ·
**shared static mock store** (`GlobalMockDb` in `SupabaseClient` — fixes
multi-instance DB isolation across concurrent tests — landed `a6ab7db`).

**One conformance gap (non-blocking for single-process):** `getOverdueJobs` +
`updateJobStatus` are two separate calls — race risk under concurrent workers.
Needs `FOR UPDATE SKIP LOCKED` RPC before horizontal scale. Spec: `B-PHASE_BUILD_SPEC.md §B5`.

**Open (Phase 1 tail):** real bank connections (RBI AA / Plaid).

**Public launch build in progress:** `A/B/C-PHASE_BUILD_SPEC.md`.

---

## Key decisions (don't relitigate)

1. **Earn the claim before making it** — LP publishes at end of Phase 2.
2. **Truth before action** — POAS trustworthy before healing prescribes.
3. **Observable before owned** — baseline scan gives value pre-OAuth + cross-channel context.
4. **Decisions before dashboards** — healing cards + WhatsApp/Slack > more charts.
5. **360° ingestion is a mandate; 360° feature-surface is a trap** — channels as context, not surfaces.
6. **Buy plumbing, build brain** — auth/aggregator/notifications/OCR/billing are 3P.
7. **Dollar-weighted root-cause ranking** — fix the biggest leak, not the first threshold.
8. **Granularity tracks build-proximity** — spec the moat + active build; not Phase 3/4.
9. **Incrementality is a safety gate, not Phase-4 polish** — flag now, cap autonomy on suspect campaigns.
10. **Pricing:** "suggest an amount" with soft anchors (~$299 / $799 / $2,500). Flagged for A/B.
11. **Build the public shell now** — validation gate deferred to a soft-launch cohort (overrides the "validate first" stance below).
12. **Build in-house for the public shell** — auth/billing/COGS-aggregator extend existing primitives (`auth.ts`, `credential_vault.ts`, `tally_adapter.ts`); not WorkOS/Stripe/Codat. (Narrows Decision #6 to notifications/OCR only.)
13. **Public-launch spec set** — `A/B/C-PHASE_BUILD_SPEC.md`, prioritized A→B→C.

---

## The honest risk (consciously accepted, not closed)

Specs make the build *correct*, not *right*. The 3-brands test would have proven
brands *act* on the harsh truth before we built the shell. Per Decision #11 it is
**deferred, not dropped** — it runs as a soft-launch cohort on the real public
product. The accepted risk: we build the public wrapper before behavioural proof.
The open unknowns remain the same — will users act? is attributed POAS causally
sound? does COGS-easing reach readiness? — now answered *during* soft launch.

---

## What's next (public-launch track, in priority order)

1. **PUB-A0 long poles** — start Google/Meta/Shopify app review + legal engagement
   *today* (external clocks you can't compress). *(Highest leverage.)*
2. **PUB-A** — in-house auth + OAuth connect + React SPA (`A-PHASE_BUILD_SPEC.md`).
3. **PUB-B** — data rights, legal, ops, abuse controls, atomic job claim (`B-PHASE_BUILD_SPEC.md`).
4. **PUB-C** — in-house COGS connectors + suggest-an-amount billing (`C-PHASE_BUILD_SPEC.md`).
5. **Watch upstream + sync** — the team builds against these specs in near-real-time.
