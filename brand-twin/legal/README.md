# Legal Copy — Counsel Review Package

> **Status: DRAFT — NOT YET IN EFFECT.** These documents are non-lawyer drafts
> prepared for qualified legal counsel to review, complete, and approve before
> they are published or relied upon. They are **not legal advice**.

## Purpose

Internally we hand-hold beta brands; the public won't have that. Before public
launch we need real Terms of Service, Privacy Policy, and a Data Processing
Addendum in effect. Rather than brief counsel from a blank page, these drafts are
written to the product's actual data flows so counsel's time goes to risk-spotting
and jurisdiction fit, not discovery.

## Documents

| File | Serves | Wired to |
|------|--------|----------|
| `TERMS_OF_SERVICE.draft.md` | `GET /api/v1/legal/tos` → `/legal/tos` page | engine `content` field |
| `PRIVACY_POLICY.draft.md` | `GET /api/v1/legal/privacy` → `/legal/privacy` page | engine `content` field |
| `DPA.draft.md` | `GET /api/v1/legal/dpa` → `/legal/dpa` page | engine `content` field |

The UI legal pages (`brand-twin/app/src/app/legal/`) currently render placeholder
copy plus a few hard-coded sections. **Once counsel approves these drafts, they
become the single source of truth** — the engine `/legal/*` endpoints should serve
the approved text verbatim, and the ad-hoc hard-coded sections in the page JSX
should be removed so the page and the canonical document never drift.

## Blanks register

**Resolved:**

| Token | Value |
|-------|-------|
| `[LEGAL ENTITY NAME]` | Trending Media Service Pvt. Ltd. |
| Entity type | Private limited company incorporated under the laws of India |
| `[CIN]` | U22219RJ2017PTC058021 |
| GSTIN | 08AAGCT2590M2ZS |
| `[REGISTERED ADDRESS]` | Aashiana Palace, Karni Nagar, Samta Nagar, Lalgarh, Bikaner, Rajasthan, India |
| `[CITY]` (court venue) | Bikaner, Rajasthan |
| `[CONTACT EMAIL]` / `[PRIVACY EMAIL]` | admin@trendingmediagroup.in |
| `[PRIMARY MARKET]` | India — lead framework is the **DPDP Act, 2023** (GDPR secondary for EU/UK data subjects) |
| Governing law | The laws of India |

**Still open** — resolve before publish:

| Token | Meaning | Owner |
|-------|---------|-------|
| `[PIN]` | Postal PIN code to complete the registered-office address | Company |
| Grievance Officer name | Named individual for the DPDP Grievance Officer (contact email already set to admin@) | Company |
| `[RETENTION — ACTIVE]` | Retention while account active (e.g. "duration of the subscription") | Counsel |
| `[RETENTION — POST-TERMINATION]` | Retention after deletion (e.g. "30 days, then hard-deleted") | Counsel |
| `[SUBPROCESSOR LIST URL]` | Public URL listing subprocessors | Company |
| `[ARBITRATION SEAT]` | Arbitration seat under the Arbitration and Conciliation Act, 1996 (if used) | Counsel |
| `[EFFECTIVE DATE]` | Date the approved version takes effect | Counsel |
| `[VERSION]` | Semver string returned by the engine + shown on the page | Eng |

## Regulatory scope assumed in these drafts

**India-first** (Trending Media Service Pvt. Ltd. is India-incorporated; billing via
Razorpay/INR), with cross-border coverage since the product also serves global brands
(Xero/QuickBooks/USD). Counsel should confirm and trim:

- **India (lead)** — Digital Personal Data Protection Act, 2023 (DPDP); IT Act / SPDI
  Rules. Consent Notice, Grievance Officer, and consent-withdrawal handling are the
  key DPDP touchpoints reflected in the drafts.
- **EU/UK** — GDPR / UK GDPR for EU/UK data subjects (export + erasure rights are
  already built; SCCs for transfers).
- **California** — CCPA/CPRA only if US consumers are in scope.

## Version + re-acceptance

The UI already enforces re-acceptance on a version bump: a `403
POLICY_REACCEPTANCE_REQUIRED` from the API redirects to `/legal/tos?reaccept=true`,
and `acceptLegalDoc(version)` logs the new acceptance (B2.3). When counsel approves
a new version, bump `[VERSION]` in the engine and existing users are re-prompted
automatically.

## Subprocessors referenced (verify before publish)

Google Ads · Meta · Shopify · Razorpay (+ global card processor) · Tally · Zoho
Books · QuickBooks · Xero · Supabase/Postgres (hosting) · Redis (queue) ·
email/notification provider. Counsel should confirm the live list and publish it
at `[SUBPROCESSOR LIST URL]`.
