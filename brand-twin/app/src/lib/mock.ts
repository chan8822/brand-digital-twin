/**
 * Mocked engine responses so the SPA is demoable with no backend.
 * Shapes match the real `RecommendationCard` (healing_types.ts). When the live
 * engine is wired (NEXT_PUBLIC_API_URL set), these are bypassed.
 *
 * The campaigns are deliberately chosen to show the core story: high ROAS that
 * hides a thin or negative POAS — the gap the product exists to expose.
 */
import type {
  ApprovalRequest,
  BillingQueueEntry,
  CogsCoverage,
  CogsGap,
  IntegrationState,
  ProfitReadiness,
  Receipt,
  RecommendationCard,
  SemanticTrustTier,
  Subscription,
  SweepFinding,
  TenantLimits,
} from "./types";

export const MOCK_RECOMMENDATIONS: RecommendationCard[] = [
  {
    campaignId: "g-ads-001",
    campaignName: "Search — Brand Defense",
    poas: 0.42,
    roas: 4.1,
    dollarDrag: 18420,
    dominantCause: "COGS_TOO_HIGH",
    side: "ECONOMICS",
    confidence: "high",
    caveat: "COGS from connected Shopify variant costs; refunds settled.",
    osActs: [],
    userApproves: [
      { tier: 2, action: "Renegotiate unit cost on top 3 SKUs (margin < 18%)", estimatedRecovery: 12000 },
    ],
    adsCantFix: [
      { tier: 3, action: "Product is sold below contribution-positive price — ads cannot fix a structural margin gap", estimatedRecovery: 6420 },
    ],
  },
  {
    campaignId: "meta-014",
    campaignName: "Advantage+ — Prospecting",
    poas: 0.88,
    roas: 2.6,
    dollarDrag: 9300,
    dominantCause: "SPEND_INEFFICIENT",
    side: "ADVERTISING",
    confidence: "high",
    caveat: "Spend efficiency below category median; attribution window 7d-click.",
    osActs: [
      { tier: 1, action: "Trim daily budget 22% on ad sets below break-even POAS", estimatedRecovery: 5100 },
    ],
    userApproves: [
      { tier: 2, action: "Pause 4 creatives with CPC > 2× account average", estimatedRecovery: 4200 },
    ],
    adsCantFix: [],
  },
  {
    campaignId: "g-ads-007",
    campaignName: "Shopping — Bestsellers",
    poas: 1.9,
    roas: 3.2,
    dollarDrag: 2100,
    dominantCause: "DISCOUNT_OVERUSE",
    side: "ECONOMICS",
    confidence: "medium",
    caveat: "Some SKU costs estimated from category average — verify to raise confidence.",
    osActs: [],
    userApproves: [
      { tier: 2, action: "Cap auto-applied discount at 10% on this collection", estimatedRecovery: 2100 },
    ],
    adsCantFix: [],
  },
  {
    campaignId: "meta-022",
    campaignName: "Retargeting — 30d Site Visitors",
    poas: 3.4,
    roas: 4.0,
    dollarDrag: 0,
    dominantCause: "INSUFFICIENT_DATA",
    side: "UNKNOWN",
    confidence: "high",
    caveat: "Healthy — POAS comfortably above break-even.",
    osActs: [],
    userApproves: [],
    adsCantFix: [],
  },
];

/** Mock diagnostic sweep — one finding per scanner, spanning all 3 severities. */
export const MOCK_SWEEP: SweepFinding[] = [
  {
    code: "no_conv_tracking_meta_014",
    severity: "CRITICAL",
    check: "conversion_tracking",
    entityId: "meta-014",
    title: "Conversion tracking missing on Advantage+ Prospecting",
    detail: "0 conversions recorded against 1,240 clicks in 7d — pixel likely not firing.",
    dollarImpact: 8400,
  },
  {
    code: "stockout_sku_4471",
    severity: "CRITICAL",
    check: "inventory_level",
    entityId: null,
    title: "Bestseller SKU-4471 predicted stockout in 31h",
    detail: "Active spend driving demand for an item about to go out of stock.",
    dollarImpact: 5200,
  },
  {
    code: "checkout_dropoff_shopify",
    severity: "WARNING",
    check: "checkout_events",
    entityId: null,
    title: "Checkout completion down 18% week-over-week",
    detail: "add_to_cart steady but purchase events fell — possible checkout friction.",
    dollarImpact: 3100,
  },
  {
    code: "roi_inefficient_g_ads_001",
    severity: "WARNING",
    check: "unprofitable_spend",
    entityId: "g-ads-001",
    title: "Brand Defense spending below break-even POAS",
    detail: "POAS 0.42× — every $1 of spend returns $0.42 of contribution margin.",
    dollarImpact: 2600,
  },
  {
    code: "budget_capped_meta_022",
    severity: "OPPORTUNITY",
    check: "budget_capped_winner",
    entityId: "meta-022",
    title: "Retargeting is budget-capped at POAS 3.4×",
    detail: "Profitable campaign hitting its daily cap — headroom to scale spend.",
    dollarImpact: 4700,
  },
];

/** Current trust tier (new public accounts start at OBSERVE). */
export const MOCK_TRUST_TIER: SemanticTrustTier = "ASSISTED";

/** Connected integrations — Google + Shopify active, Meta needs reconnect. */
export const MOCK_INTEGRATIONS: IntegrationState[] = [
  {
    integrationId: "int-g",
    tenantId: "org-demo",
    provider: "google_ads",
    status: "active",
    settings: { account: "123-456-7890" },
    updatedAt: Date.now() - 1000 * 60 * 60 * 26,
  },
  {
    integrationId: "int-s",
    tenantId: "org-demo",
    provider: "shopify",
    status: "active",
    settings: { shop: "demo-brand.myshopify.com" },
    updatedAt: Date.now() - 1000 * 60 * 60 * 26,
  },
  {
    integrationId: "int-m",
    tenantId: "org-demo",
    provider: "meta_ads",
    status: "suspended", // refresh failed → reconnect path (A2.3)
    settings: {},
    updatedAt: Date.now() - 1000 * 60 * 90,
  },
];

/** Profit readiness — partial coverage so advice is directional, not auto-exec. */
export const MOCK_READINESS: ProfitReadiness = {
  score: 68,
  factors: {
    cogsCoverage: 74,
    shopifyLinked: true,
    googleAdsLinked: true,
    metaAdsLinked: true,
    bankLinked: false,
    historicalOrdersLoaded: true,
  },
  status: "directional_only",
};

/** Mock approvals queue — what's escalated to a human right now. */
const now = Date.now();
export const MOCK_APPROVALS: ApprovalRequest[] = [
  {
    approvalId: "apr-1001",
    orgId: "org-demo",
    entityType: "budget_shift",
    entityId: "meta-022",
    requestedBy: "RiskRadarAgent",
    assignedTo: "cmo",
    status: "pending",
    reason: "Scale budget +$300/day on Retargeting (POAS 3.4×, budget-capped) — exceeds ASSISTED $500 cap.",
    tenantId: "org-demo",
    createdAt: now - 1000 * 60 * 22,
  },
  {
    approvalId: "apr-1002",
    orgId: "org-demo",
    entityType: "campaign",
    entityId: "g-ads-001",
    requestedBy: "GovernanceShadowAgent",
    assignedTo: "cmo",
    status: "pending",
    reason: "Pause Brand Defense (POAS 0.42×, structurally unprofitable) pending margin review.",
    tenantId: "org-demo",
    createdAt: now - 1000 * 60 * 60 * 3,
  },
];

/* ── Phase C1: COGS ───────────────────────────────────────────────────────── */

/** Coverage by ad spend: 58% real + 16% estimated = 74% covered; 6 SKUs open. */
export const MOCK_COGS_COVERAGE: CogsCoverage = {
  coveragePct: 74,
  realPct: 58,
  estimatedPct: 16,
  missingCostSkus: 6,
  basis: "ad_spend",
};

/**
 * Top spend SKUs the engine still can't cost confidently — the Pareto ask.
 * Ordered by ad spend (biggest blind spot first). Mix of fully-missing
 * (`manual`, unitCost null) and category-estimated (flagged) costs.
 */
export const MOCK_COGS_GAPS: CogsGap[] = [
  { sku: "SKU-4471", productName: "Hydra Glow Serum 30ml", adSpend: 9200, sellingPrice: 48, unitCost: null, provenance: "manual", estimatedCogs: false },
  { sku: "SKU-1180", productName: "Daily Mineral SPF 50", adSpend: 7400, sellingPrice: 32, unitCost: 11.5, provenance: "category_estimate", estimatedCogs: true },
  { sku: "SKU-2093", productName: "Overnight Repair Mask", adSpend: 5100, sellingPrice: 54, unitCost: null, provenance: "manual", estimatedCogs: false },
  { sku: "SKU-3310", productName: "Gentle Foaming Cleanser", adSpend: 3850, sellingPrice: 24, unitCost: 7.2, provenance: "category_estimate", estimatedCogs: true },
  { sku: "SKU-0788", productName: "Vitamin C Booster Drops", adSpend: 2600, sellingPrice: 39, unitCost: null, provenance: "manual", estimatedCogs: false },
  { sku: "SKU-5567", productName: "Ceramide Barrier Cream", adSpend: 1900, sellingPrice: 44, unitCost: null, provenance: "manual", estimatedCogs: false },
];

/* ── Phase C2: billing ────────────────────────────────────────────────────── */

/** A brand mid-trial at day 14 — the nudge day, one day before suggest-an-amount. */
export const MOCK_SUBSCRIPTION: Subscription = {
  orgId: "org-demo",
  status: "trial",
  currency: "USD",
  period: "monthly",
  trialDay: 14,
  trialLengthDays: 15,
};

/* ── Admin billing queue ──────────────────────────────────────────────────── */

const queueNow = Date.now();
export const MOCK_BILLING_QUEUE: BillingQueueEntry[] = [
  {
    orgId: "org-glowco",
    orgName: "Glow & Co",
    email: "ops@glowandco.com",
    status: "pending_review",
    amount: 799,
    currency: "USD",
    period: "monthly",
    suggestedAt: queueNow - 1000 * 60 * 90,
    note: "Seems reasonable for the lift we're seeing.",
  },
  {
    orgId: "org-nutra",
    orgName: "Nutra Boost",
    email: "cmo@nutraboost.in",
    status: "pending_review",
    amount: 2500,
    currency: "USD",
    period: "monthly",
    suggestedAt: queueNow - 1000 * 60 * 60 * 3,
  },
  {
    orgId: "org-cleansly",
    orgName: "Cleansly",
    email: "hello@cleansly.co",
    status: "pending_review",
    amount: 299,
    currency: "USD",
    period: "monthly",
    suggestedAt: queueNow - 1000 * 60 * 60 * 7,
    note: "We're a small team — happy to pay more if it keeps working.",
  },
];

/* ── Billing receipts ─────────────────────────────────────────────────────── */

export const MOCK_RECEIPTS: Receipt[] = [
  {
    receiptId: "rcpt-0002",
    orgId: "org-demo",
    amount: 299,
    currency: "USD",
    period: "monthly",
    chargedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    receiptUrl: "https://pay.example.com/receipt/rcpt-0002",
  },
  {
    receiptId: "rcpt-0001",
    orgId: "org-demo",
    amount: 299,
    currency: "USD",
    period: "monthly",
    chargedAt: Date.now() - 1000 * 60 * 60 * 24 * 33,
    receiptUrl: "https://pay.example.com/receipt/rcpt-0001",
  },
];

/* ── Tenant limits ────────────────────────────────────────────────────────── */

export const MOCK_TENANT_LIMITS: TenantLimits = {
  maxDailyLimit: 2000,
  maxPerActionLimit: 500,
};
