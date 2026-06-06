# Brand Digital Twin OS

The Brand Digital Twin OS is an autonomous, context-aware advertising optimization and business intelligence engine. Built to align platform spend with real-world business economics, it optimizes ad delivery across networks (Google Ads, Meta) based on true **Profit on Ad Spend (POAS)** instead of vanity revenue metrics (ROAS).

By integrating ad metrics directly with live commerce (Shopify, WooCommerce), cost of goods (COGS), cash runway (bank/accounting connectors), and governance guardrails, the OS ensures ad spend is profitable, runway-safe, and inventory-aware.

---

## Core Tenets

1.  **Profit (POAS) over ROAS**: ROAS is a proxy metric that ignores COGS, shipping, chargebacks, and overlapping attribution. The OS computes real line-level margin to run on actual profitability.
2.  **Earned, Graduated Autonomy**: The system begins in **Observe** mode and earns delegation tiers (Review → Assisted → Autonomous → C-Suite) as it proves its alignment with business truth, governed by strict spend caps and circuit breakers.
3.  **Inventory-Aware Spend**: The Context Fabric watches inventory levels in real-time, automatically pausing ad groups for critical or out-of-stock SKUs to prevent waste.
4.  **Cash Runway Protection**: The OS models burn rate and cash runway from bank/ledger feeds. If runway falls below critical thresholds, it dynamically throttles ad spend to preserve capital.
5.  **Agency Multi-Tenancy**: Built on request-scoped database checks that enforce strict tenant isolation, allowing agencies to manage portfolios of brands without risk of data leakage.

---

## Repository Structure

```
├── app/                  # Next.js Frontend Product UI (React, Tailwind, TypeScript)
├── specs/                # Product specifications, execution plans, and runbooks (P0 -> P4)
├── legal/                # Counsel-ready DPDP/GDPR drafts (ToS, Privacy Policy, DPA)
├── server.ts             # REST API server & HTTP Router
├── supabase_client.ts    # Database Client wrapper with transaction & mock support
├── incident_response.ts  # Incident manager & severity (SEV-0 -> SEV-3) handler
├── poas_scheduler.ts     # Scheduler for daily POAS syncs, trial nudges, and billing retries
├── payment_processor.ts  # Razorpay integration & credential vault hook
├── cogs_manager.ts       # Ad-spend-weighted COGS coverage gate
├── *__adapter.ts         # Connected platforms integrations (Google, Meta, Zoho, QBO, Xero)
└── BUILD                 # Google3 Blaze build rules
```

---

## Getting Started

### Backend Engine
The backend is a Node/TypeScript REST server. To run the server locally:
```bash
# Setup environment configurations
cp .env.example .env

# Run the TypeScript server
npx ts-node server.ts
```

### Frontend UI
The UI is a Next.js single-page application.
To run the web console:
```bash
cd app
npm install
npm run dev
```
Flip the `NEXT_PUBLIC_API_URL` environment variable inside `app/.env` from empty (mock demo mode) to your backend origin to wire the UI live.

---

## Verification & Tests

The project is backed by a hermetic, mock-verified unit and integration test suite.

Run the test suite:
```bash
# Backend router and server integration tests
blaze test //experimental/brand_twin:server_test

# Database security, locking, and migration tests
blaze test //experimental/brand_twin:supabase_client_test

# Consensus engine & incident response tests
blaze test //experimental/brand_twin:advanced_operations_test

# Scheduler, dunning, and lift sync tests
blaze test //experimental/brand_twin:poas_scheduler_test

# Accounting integrations (Zoho, QBO, Xero) tests
blaze test //experimental/brand_twin:accounting_adapters_test
```

---

## Production Readiness Status
The engine and UI are fully built through Phase C (self-serve billing + C1 COGS). External platform approvals (Google MCC, Meta App Review, Google OAuth Consent, Shopify listing) are **cleared**.

The project is currently gating on **P2 Private Beta validation** (3 brands, real POAS, and measured lift) and counsel confirmation of the legal drafts in `/legal`.
