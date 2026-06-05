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
**durable job queue** (`pending_jobs` table · `poas_daily` + `settling_window` job
types · 5-min polling worker · `validateEnv()` startup guard · `.env.example`) ·
**onboarding telemetry** (`onboarding_events` table · 7-stage instrumentation
`goal_declared → first_action_taken`) — landed `53d7bc7`.

**One conformance gap (non-blocking):** `getOverdueJobs` + `updateJobStatus` are two
separate calls — not an atomic `UPDATE … RETURNING`. In mock mode this is fine;
against real Postgres under concurrent workers a race can double-run a job. Needs
a single RPC / CTE before running multiple worker processes. Single-process Phase 1
is safe; flag before scaling to multi-instance.

**Open (Phase 1 tail):** real bank connections (RBI AA / Plaid).

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

---

## The honest risk (the gate that still stands)

Specs make the build *correct*, not *right*. **Before funding Phase 2, put
Phase 1 in front of 3 real brands with messy data and watch where they stall** —
they'll stall somewhere no doc predicts. The biggest unknowns:
- Will users actually *act* on the harsh truth (behaviour, not measurement)?
- Is attributed POAS causally trustworthy enough to advise on? (incrementality)
- Does the COGS-easing flow actually get messy-data brands to readiness?

---

## What's next (priority order, non-blocking on build)

1. **Validation harness** — define the 3-brands test now: recruit criteria,
   what to instrument, success/failure thresholds. So there's zero idle time
   when the build lands. *(Highest leverage — it's the gate.)*
2. **Baseline Scan feasibility** — investigate which observable signals are
   legally/technically fetchable (SERP, ad libraries, review APIs). De-risks the
   one Phase-1 piece whose inputs are uncertain.
3. **Profit data contract** — finalise the `CampaignCostBreakdown` seam (L1↔L2).
4. **Watch upstream + sync** — the team builds against these specs in near-real-time.
