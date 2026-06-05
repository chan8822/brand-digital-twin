# Profit Data Model — Parameter Map

> Every input required to compute true POAS, with its source, derivation
> strategy, fallback, and effort tier. The OS fetches silently, derives
> intelligently, and asks rarely — and only once, in bulk, prioritised by spend.

---

## The Equation

```
Net Profit per Order =

  Gross Revenue
  − Discounts & promo codes
  − Returns & refunds
  − Tax (excluded from profit)
  ─────────────────────────
  = Net Revenue
  − COGS (unit cost × qty)
  − Payment processing fee
  − Shipping cost (brand's cost)
  − Pick / pack / fulfilment
  − Marketplace / platform fee
  ─────────────────────────
  = Contribution Margin

  ÷ Ad Spend (attributed, last-touch)
  ─────────────────────────
  = POAS (Profit on Ad Spend)
```

---

## Parameter Map

### 🟢 Auto — zero user effort

| Parameter | Source | Adapter |
|-----------|--------|---------|
| Gross revenue | Order API | `shopify_adapter`, `woocommerce_adapter`, `magento_adapter` |
| Discounts & promo codes | Order API (`total_discounts`) | Same |
| Tax collected | Order API (`total_tax`) | Same |
| Shipping charged to customer | Order API (`shipping_charged`) | Same |
| Refunds & returns | Refund API | Same |
| Ad spend | Platform APIs | `google_ads_adapter`, `meta_ads_adapter` |
| Payment processing fees | Payment processor API | `stripe_adapter` (global), `razorpay_adapter` (India) — *to build* |
| Marketplace commission | Settlement report API | `amazon_adapter`, `flipkart_adapter` — *Phase 3* |
| Currency / FX | Order API | Same |

### 🟡 Derive — computed from connected data, confirmed once

| Parameter | Derivation | Fallback |
|-----------|-----------|---------|
| **COGS — existing SKUs** | Pull from: Shopify "Cost per item" field · Magento `base_cost` · WooCommerce cost plugin · Tally purchase ledger ÷ qty · Zoho/QuickBooks inventory cost. OS sweeps all connected sources before asking anything. | Category-average margin from SKUs that do have cost — flagged as *estimated* |
| **Shipping cost (brand's cost)** | Shiprocket / Delhivery / Shippo / EasyPost API — exact per-shipment cost. | Weight × carrier rate table (published, stable). Else: user confirms one flat per-order rate, reviewed quarterly. |
| **Marketplace fee (if not via API)** | Category-based fee schedule (Amazon/Flipkart publish these — stable by category). | Apply published category rate as default. |

### 🔴 Irreducible — user must provide, but minimised

| Parameter | What to ask | How to minimise |
|-----------|-------------|-----------------|
| **Pick / pack / fulfilment (self-fulfilment)** | "What does it cost you to pack and dispatch one order?" | Single number, any currency. Asked once at onboarding. Applied to all orders. 3PL: pull from ShipBob/Shiprocket invoice API instead. |
| **COGS — missing SKUs** | Bulk entry for top-spend SKUs only | See Pareto strategy below. |

---

## The COGS Problem — Strategy

COGS is the single biggest gap. Most brands have it somewhere but haven't
consolidated it. Tactics in order of decreasing automation:

### 1. Silent sweep of connected sources
Before asking anything, the OS pulls from every connected system:
- Shopify: `inventoryItem.unitCost` via Admin API
- WooCommerce: `_wc_cog_cost` meta field
- Magento: `base_cost` product attribute
- Tally: purchase ledger ÷ qty received (via `tally_adapter`)
- Zoho / QuickBooks: inventory item cost (Phase 3 adapters)

### 2. Category-average provisional estimate
For SKUs still missing cost after the sweep, compute a provisional COGS
using the average margin % of all SKUs *in the same product category* that
do have cost. Flag these as *estimated* in the UI — POAS still runs,
clearly marked as partially estimated.

### 3. Pareto prioritisation
Never ask for 108 individual entries. Surface only the high-spend SKUs:

> "These 8 products account for 80% of your ad spend.
>  Fill their costs and POAS is trustworthy where it matters most."

### 4. Bulk entry options
- CSV upload (product ID, cost)
- Inline grid (SKU | current price | enter cost)
- "Set cost as % of price for this collection" — one action, many SKUs
- Supplier invoice parse — upload PDF, OS extracts item costs and maps to SKUs

### 5. Passive back-fill
Once Tally/QuickBooks/Zoho connects later, the OS back-fills COGS on all
historical orders automatically. No re-entry ever.

---

## Progressive Precision Model

POAS doesn't need 100% data to be more useful than ROAS. The OS operates
in levels — each level unlocks something new without requiring the next.

| Level | What's added | What the user sees | Effort |
|-------|-------------|-------------------|--------|
| 1 | Revenue + ad spend | ROAS (same as before) | Zero |
| 2 | Payment fees + refunds | First hidden costs revealed | Auto |
| 3 | Shipping + marketplace fees | Contribution diverges from ROAS | Auto if connected |
| 4 | COGS for top 8–12 SKUs | Full POAS for 80% of spend — the gut-punch | One bulk entry |
| 5 | COGS complete across catalogue | Full precision, all campaigns | Passive over time |

---

## Profit Readiness UI

Shown at onboarding and refreshed weekly. Not a gate — a live progress indicator.

```
Profit Readiness: 78%  ▓▓▓▓▓▓▓▓░░

🟢 Revenue, discounts, tax, refunds    — connected (Shopify)
🟢 Ad spend                            — connected (Google Ads, Meta)
🟢 Payment fees                        — connected (Razorpay)
🟡 Shipping cost                       — estimated at ₹62/order  [confirm →]
🔴 COGS                                — 46 of 108 SKUs missing

  Fix the 8 highest-spend SKUs to reach trustworthy POAS on 80% of spend.
  [ Fill top 8 SKUs → ]
```

Each item links to the specific fix. Estimated values show their basis.
The user sees what the OS has done for them — reducing the ask to a minimum.
