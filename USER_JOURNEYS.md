# Brand Digital Twin OS — End-User Journeys

> Companion to `LANDING_PAGE_DRAFT.md`. This doc maps the actual journeys a user
> takes from first click to daily active use. Goal-first architecture: the user
> declares intent, the OS reshapes itself around it.

---

## The Spine: Five Stages

Every user, regardless of goal, moves through the same five stages. What changes
inside each stage is driven by the goal they pick.

```
0. SCAN         → Brand baseline on domain alone — nothing connected yet
1. DECLARE      → What's your goal? (primary + optional secondary)
2. CONNECT      → Goal-filtered integration stack
3. SWEEP        → Automated diagnostic across connected platforms
3.5 HEAL        → Findings become three-zone decision cards
4. FIRST VALUE  → One true number / prioritized issue list (< 5 min in)
5. INHABIT      → Daily dashboard, trust ledger, graduated autonomy
```

The emotional arc: *Seen → Curious → Committed → Surprised → Decided → Reliant.*

**Stage 0 (SCAN)** runs before anything is connected — on just a domain. It
establishes the brand's observable presence/perception/trust baseline, delivers
first value before any OAuth, and becomes the context layer every later
recommendation consults. See `BRAND_BASELINE_SCAN.md`.

**Stage 3.5 — HEAL** is now inserted between SWEEP and FIRST VALUE.
The sweep finds the problems. The healing layer turns each finding into a
three-zone decision card before the user ever sees a dashboard.

---

## STAGE 0 — SCAN (before anything is connected)

The user enters only a domain. In ~90 seconds the OS returns a baseline of the
brand's observable digital reality — presence, paid footprint, perception, trust,
social standing — assembled entirely from public data. No account, no OAuth.

It delivers three things at once:
1. **First value before friction** — "here's your entire digital presence, scored"
2. **Fixes the brand can act on today** — review responses, brand defense, site
   speed — improvements that need nothing connected
3. **A specific reason to connect** — "you rank #1 for these 8 terms; connect
   Search Console so we don't tell you to bid against your own free traffic"

The baseline persists as the **context layer** the healing engine consults before
every later prescription. See `BRAND_BASELINE_SCAN.md` for the full signal map,
the observable-vs-owned model, and the improvement layer.

---

## STAGE 1 — DECLARE

### Screen 1a: Primary goal

> **What are you here to do?**
> - ○ Drive Sales — purchases, revenue, ROAS/POAS
> - ○ Generate Leads — form fills, calls, demo requests
> - ○ Build Awareness — reach, impressions, brand recall
> - ○ Grow Organically — SEO, content, community (no paid ads)

### Screen 1b: Secondary goal (optional)

> **Anything else? (optional — skip if not)**
> Same four options, primary greyed out. One selectable.

**Rule:** Primary goal sets the **primary optimization metric** and the
**diagnostic sweep's CRITICAL criteria**. Secondary goal only **adds tools** to
the connect stack and **adds a secondary metric tile** to the dashboard — it
never overrides primary optimization logic.

Example: Primary **Sales** + Secondary **Lead Gen** = e-commerce brand that also
captures email subscribers. POAS stays the north star; CPL appears as a
secondary tile and email/CRM tools join the stack.

---

## STAGE 2 — CONNECT (goal-filtered stack)

Tools appear as connect-cards based on **primary ∪ secondary** goal. Connected =
green, skipped = grey. Nothing irrelevant is ever shown.

| Goal | Paid Ads | Commerce | Analytics | CRM / Email | Other |
|------|----------|----------|-----------|-------------|-------|
| **Sales** | Google Ads, Bing Ads, Meta Ads | Shopify, WooCommerce, Magento, GMC | GA4, Search Console | Klaviyo, HubSpot | Stripe, Razorpay |
| **Lead Gen** | Google Ads, Meta Ads, LinkedIn Ads | — | GA4, Search Console | HubSpot, Salesforce, Zoho | Calendly, Typeform |
| **Awareness** | Meta Ads, YouTube Ads, DV360 | — | GA4 | — | Hotjar, Clarity |
| **Organic** | — | Shopify, WooCommerce | GA4, Search Console | Mailchimp, Klaviyo | Ahrefs, Semrush |

**Connect order is opinionated** (fastest-win first):
1. The platform where money/intent lives (Ads or storefront)
2. Measurement (GA4 / Search Console)
3. CRM / supporting tools

Each OAuth that fetches a hierarchy (Google Ads MCC, GMC, Shopify multi-store)
auto-enumerates sub-accounts and lets the user pick which to manage.

---

## STAGE 3 — SWEEP (the automated master diagnostic)

Fires the instant the last integration connects. 2–5 min, live progress feed.
**Sweep criteria are goal-aware** — same engine, different severity rules.

| Goal | CRITICAL flags | WARNING flags | OPPORTUNITY flags |
|------|----------------|---------------|-------------------|
| **Sales** | Ads → out-of-stock SKUs; no conversion tracking; margin below viable ad threshold | Missing cost-of-goods; broken checkout events; GMC disapprovals | Budget-capped high-POAS campaigns; zero Shopping impression share |
| **Lead Gen** | Forms with no conversion tracking; lead events not firing to CRM | No lead-quality feedback loop; duplicate lead capture | High-intent keywords under-bid; untapped LinkedIn audiences |
| **Awareness** | No reach/frequency caps (overexposure burn) | Creative fatigue (declining CTR); no audience exclusions | Under-saturated high-affinity audiences |
| **Organic** | Indexing errors (Search Console); products with no cost-of-goods | Cannibalizing keywords; thin/duplicate content | High-margin SKU with near-zero organic traffic |

**Output:** a live, tiered, one-tap-actionable feed — not a PDF, not a dashboard tab.

```
🔴 CRITICAL    → 3 campaigns running to out-of-stock SKUs — $340 wasted this week
🟡 WARNING     → 12 products missing cost-of-goods — POAS blind on 38% of catalog
🟢 OPPORTUNITY → "Mens Jackets" budget-capped 14 days at 3.2x POAS

   Each row:  [ Fix it ]   [ Ignore ]   [ Remind me later ]
```

---

## STAGE 3.5 — HEAL (inserted between sweep and dashboard)

The sweep finds the problems. The healing layer turns the top findings into
**three-zone decision cards** — not a list of metrics, but a decision surface
the user acts on before ever opening the dashboard.

Each card for a problem campaign shows:

```
WHAT WE CAN DO NOW    → 1-tap ad-side actions the OS executes (reversible)
WHAT NEEDS YOUR CALL  → business-side levers (pricing, thresholds, channel)
WHAT ADS CANNOT FIX   → honest signal when product economics are broken
```

The third zone is what builds trust. A system that says "no bid optimisation
will make this product profitable at current margins" is more trustworthy than
one that keeps recommending adjustments on an unfixable problem.

**Incrementality hedge:** campaigns that attribute suspiciously well (brand
keywords, very consistent POAS) arrive with a Zone 1 prompt:
*"Before scaling, a 2-week geo holdout would confirm whether this is creating
demand or capturing it. Want us to set that up?"*

See `HEALING_RECOMMENDATIONS.md` for the full root cause map and prescription tiers.

---

## STAGE 4 — FIRST VALUE (< 5 minutes from signup)

The single most important moment of the trial. Goal determines the headline number.
Now paired with a healing card so the number arrives with a path, not just a verdict.

| Goal | The number | What follows it |
|------|-----------|-----------------|
| **Sales** | "Your real POAS is 0.8× — not the 4.2× ROAS your dashboard shows." | Top 3 campaigns as healing cards |
| **Lead Gen** | "Your true cost per qualified lead is $84, not the $31 you're reporting." | Form + CRM gap flagged; CPL healing card |
| **Awareness** | "62% of your impressions hit the same 8% of people 11+ times." | Frequency cap card; audience expansion |
| **Organic** | "Your highest-margin product gets 0.3% of your organic traffic." | Content gap card; indexing check |

This is the trial's hook. Everything before it is friction to minimise; this
moment is what converts. But the number alone is not enough — the decision
that follows it is what makes the user stay.

---

## STAGE 5 — INHABIT (daily active use)

Dashboard, reshaped by goal. Primary metric is the hero card; secondary goal (if
chosen) gets a secondary tile.

- **Hero metric** = primary goal's metric (POAS / CPL / reach-frequency / organic value)
- **Secondary tile** = secondary goal's metric, if selected
- **Trust ledger** widget — current tier, progress to next
- **Live issue feed** — sweep findings that persist + new ones as they arise
- **Cash runway gauge** — present for all goals (universal constraint)

Graduated autonomy begins at **Tier 0 (Observe)** and climbs as the OS proves
itself against the goal's own metric.

---

## Three Worked Journeys

### Journey A — Seasoned DTC advertiser (Primary: Sales)

1. Picks **Sales**, skips secondary.
2. Connects Google Ads MCC (12 sub-accounts → picks 3), GMC, Shopify, GA4.
3. Sweep runs 4 min → flags 3 out-of-stock campaigns + 1 untracked campaign.
4. First value: *"True POAS 0.8x vs. 4.2x ROAS."* — the gut-punch.
5. Taps **Fix it** on the out-of-stock campaigns → OS pauses them (Tier 0 → human-approved).
6. Lives in dashboard; trust ledger climbs; by week 2 small budget shifts auto-execute.

### Journey B — Brand-new business, low footprint (Primary: Sales, Secondary: Lead Gen)

1. Picks **Sales** + **Lead Gen**.
2. Has no ad accounts — connects only Shopify + a Typeform + GA4.
3. Sweep flags **setup gaps**, not waste: *"40 products have no cost-of-goods — POAS will be blind."*
4. First value: *"Your average product margin is 34% — here are the 3 SKUs worth promoting first."*
5. Sets a ₹15K/month budget via slider → seeds cash-runway model.
6. OS suggests first campaigns (Tier 0) instead of analyzing nonexistent ones.
   Lead-capture tile tracks email signups in parallel.

### Journey C — Organic-only creator/brand (Primary: Grow Organically)

1. Picks **Organic**, no paid-ads cards shown at all.
2. Connects Shopify + GA4 + Search Console.
3. Sweep flags indexing errors + a cannibalizing keyword pair.
4. First value: *"Your highest-margin SKU gets 0.3% of organic traffic — that's your content gap."*
5. OS becomes a margin-aware content prioritization tool. No ads, real value.
6. If they later add a Sales goal, the paid stack unlocks without re-onboarding.

---

## Design Principles (apply to every journey)

1. **Goal before tools.** Never show an integration the user's goal can't use.
2. **One true number within 60 seconds** of the first connection.
3. **Bring the problem to them** (sweep) — don't make them hunt a dashboard.
4. **Setup gaps are findings too.** New businesses get value from the sweep flagging what's missing.
5. **Secondary goal adds, never overrides.** Primary metric stays the north star.
6. **No dead ends.** Switching/adding a goal later expands the stack without a re-onboard.

---

## Open Questions (for product to resolve)

- Can a user run **two primary goals** at equal weight, or is the primary/secondary
  hierarchy always enforced? (Recommendation: enforce hierarchy — dual north stars
  break the optimization function.)
- Where does **multi-brand / agency** context sit relative to goal? (Likely: goal is
  per-brand, set once per connected entity, not account-wide.)
- Does the secondary goal get its **own diagnostic sweep pass**, or fold into the primary sweep?
