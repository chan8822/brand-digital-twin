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

// ── 3 beta brand presets for demo mode ────────────────────────────────────────
// Index 0 = Glow & Co · Index 1 = Nutra Boost · Index 2 = Cleansly

export const MOCK_BRAND_NAMES = ["Glow & Co", "Nutra Boost", "Cleansly"];

export const MOCK_BRAND_RECOMMENDATIONS: RecommendationCard[][] = [
  // Brand 0 — Glow & Co (beauty/skincare): high ROAS masking thin margins
  [
    {
      campaignId: "gc-meta-001",
      campaignName: "Serum Set — Meta Prospecting",
      poas: 0.62,
      roas: 3.8,
      dollarDrag: 14200,
      dominantCause: "COGS_TOO_HIGH",
      side: "ECONOMICS",
      confidence: "high",
      caveat: "COGS from Shopify variant costs; 4 SKU costs still manual entry.",
      osActs: [],
      userApproves: [
        { tier: 2, action: "Pause lowest-margin SKU variants from this campaign audience", estimatedRecovery: 8400 },
      ],
      adsCantFix: [
        { tier: 3, action: "Serum unit cost (₹1,240) leaves < 12% contribution margin at current price", estimatedRecovery: 5800 },
      ],
    },
    {
      campaignId: "gc-meta-002",
      campaignName: "Moisturizer — Retargeting 14d",
      poas: 2.4,
      roas: 2.9,
      dollarDrag: 0,
      dominantCause: "INSUFFICIENT_DATA",
      side: "UNKNOWN",
      confidence: "high",
      caveat: "Healthy — POAS well above break-even. Scale candidate.",
      osActs: [],
      userApproves: [],
      adsCantFix: [],
    },
    {
      campaignId: "gc-meta-003",
      campaignName: "Vitamin C — Meta Advantage+",
      poas: 1.08,
      roas: 2.2,
      dollarDrag: 3100,
      dominantCause: "SPEND_INEFFICIENT",
      side: "ADVERTISING",
      confidence: "medium",
      caveat: "Attribution window: 7d click, 1d view.",
      osActs: [
        { tier: 1, action: "Narrow audience to lookalike 1–3% to improve signal quality", estimatedRecovery: 3100 },
      ],
      userApproves: [],
      adsCantFix: [],
    },
  ],
  // Brand 1 — Nutra Boost (supplements): most campaigns losing money
  [
    {
      campaignId: "nb-g-001",
      campaignName: "Protein Bundle — Google Shopping",
      poas: 0.29,
      roas: 2.4,
      dollarDrag: 22100,
      dominantCause: "COGS_TOO_HIGH",
      side: "ECONOMICS",
      confidence: "high",
      caveat: "COGS verified from QuickBooks: COGS/revenue ratio 72% on bundle.",
      osActs: [],
      userApproves: [
        { tier: 2, action: "Pause and restructure bundle pricing — current margin is contribution-negative", estimatedRecovery: 14000 },
      ],
      adsCantFix: [
        { tier: 3, action: "Bundle cost structure requires a price increase or cost reduction before ads can be profitable", estimatedRecovery: 8100 },
      ],
    },
    {
      campaignId: "nb-meta-002",
      campaignName: "Vitamins — Meta Broad",
      poas: 1.82,
      roas: 3.1,
      dollarDrag: 0,
      dominantCause: "INSUFFICIENT_DATA",
      side: "UNKNOWN",
      confidence: "high",
      caveat: "Only profitable campaign. POAS strong — budget-capped.",
      osActs: [],
      userApproves: [],
      adsCantFix: [],
    },
    {
      campaignId: "nb-g-003",
      campaignName: "Pre-workout — Google Performance Max",
      poas: 0.71,
      roas: 2.6,
      dollarDrag: 8900,
      dominantCause: "SPEND_INEFFICIENT",
      side: "ADVERTISING",
      confidence: "high",
      caveat: "PMax asset group exclusions not set — serving on irrelevant terms.",
      osActs: [
        { tier: 1, action: "Add 47 negative keywords identified from search-term report", estimatedRecovery: 5200 },
      ],
      userApproves: [
        { tier: 2, action: "Split PMax into brand + non-brand asset groups for cleaner signal", estimatedRecovery: 3700 },
      ],
      adsCantFix: [],
    },
  ],
  // Brand 2 — Cleansly (home wellness): healthy overall but winner starved of budget
  [
    {
      campaignId: "cl-g-001",
      campaignName: "Starter Kit — Google Shopping",
      poas: 3.18,
      roas: 3.5,
      dollarDrag: 0,
      dominantCause: "INSUFFICIENT_DATA",
      side: "UNKNOWN",
      confidence: "high",
      caveat: "Budget-capped. Scaling this campaign is the single highest-ROI action available.",
      osActs: [],
      userApproves: [
        { tier: 2, action: "Raise daily budget from ₹4,500 to ₹9,000 — POAS 3.2× well above break-even", estimatedRecovery: 11200 },
      ],
      adsCantFix: [],
    },
    {
      campaignId: "cl-meta-002",
      campaignName: "Refills — Meta Retargeting",
      poas: 1.78,
      roas: 2.8,
      dollarDrag: 1400,
      dominantCause: "DISCOUNT_OVERUSE",
      side: "ECONOMICS",
      confidence: "medium",
      caveat: "Refill discount (15%) eroding margin; POAS would be 2.4× without it.",
      osActs: [],
      userApproves: [
        { tier: 2, action: "Reduce auto-applied refill discount from 15% to 8%", estimatedRecovery: 1400 },
      ],
      adsCantFix: [],
    },
    {
      campaignId: "cl-g-003",
      campaignName: "Bundle — Google Search",
      poas: 0.91,
      roas: 1.8,
      dollarDrag: 4600,
      dominantCause: "SPEND_INEFFICIENT",
      side: "ADVERTISING",
      confidence: "high",
      caveat: "High impression share on generic terms; low purchase intent.",
      osActs: [
        { tier: 1, action: "Shift budget from generic 'home cleaning' terms to branded and category-specific terms", estimatedRecovery: 4600 },
      ],
      userApproves: [],
      adsCantFix: [],
    },
  ],
];

export const MOCK_BRAND_SWEEP: SweepFinding[][] = [
  // Brand 0 — Glow & Co
  [
    {
      code: "cogs_missing_gc_001",
      severity: "CRITICAL",
      check: "unprofitable_spend",
      entityId: "gc-meta-001",
      title: "Serum Set losing ₹0.38 for every ₹1 of ad spend",
      detail: "POAS 0.62× — COGS too high relative to selling price at current traffic cost.",
      dollarImpact: 14200,
    },
    {
      code: "checkout_dropoff_gc",
      severity: "WARNING",
      check: "checkout_events",
      entityId: null,
      title: "Mobile checkout completion down 24% vs last month",
      detail: "Add-to-cart steady; payment step has 38% drop-off on iOS — likely Razorpay render issue.",
      dollarImpact: 5800,
    },
    {
      code: "budget_capped_gc_002",
      severity: "OPPORTUNITY",
      check: "budget_capped_winner",
      entityId: "gc-meta-002",
      title: "Moisturizer Retargeting is POAS 2.4× and budget-capped",
      detail: "Your best performer is capped at ₹3,200/day — immediate opportunity to scale.",
      dollarImpact: 8100,
    },
  ],
  // Brand 1 — Nutra Boost
  [
    {
      code: "negative_poas_nb_001",
      severity: "CRITICAL",
      check: "unprofitable_spend",
      entityId: "nb-g-001",
      title: "Protein Bundle is contribution-negative — spending makes it worse",
      detail: "POAS 0.29×. Every ₹100 of ad spend returns ₹29 of margin. QuickBooks confirms 72% COGS ratio.",
      dollarImpact: 22100,
    },
    {
      code: "pmax_negatives_nb",
      severity: "WARNING",
      check: "conversion_tracking",
      entityId: "nb-g-003",
      title: "Performance Max serving on 47 irrelevant search terms",
      detail: "No asset group exclusions set. Wasted spend on terms with < 0.1% purchase conversion.",
      dollarImpact: 5200,
    },
    {
      code: "budget_capped_nb_002",
      severity: "OPPORTUNITY",
      check: "budget_capped_winner",
      entityId: "nb-meta-002",
      title: "Vitamins (POAS 1.8×) is your only profitable campaign and it's capped",
      detail: "While the bundle destroys value, this campaign is generating real profit — under-funded by 3×.",
      dollarImpact: 9400,
    },
  ],
  // Brand 2 — Cleansly
  [
    {
      code: "winner_starved_cl_001",
      severity: "CRITICAL",
      check: "budget_capped_winner",
      entityId: "cl-g-001",
      title: "Best campaign (POAS 3.2×) starved of budget",
      detail: "Starter Kit Shopping is capped at ₹4,500/day. Doubling budget here is the highest-value action.",
      dollarImpact: 11200,
    },
    {
      code: "discount_erosion_cl",
      severity: "WARNING",
      check: "unprofitable_spend",
      entityId: "cl-meta-002",
      title: "Auto-applied refill discount cutting POAS from 2.4× to 1.8×",
      detail: "Discount is firing on all retargeting conversions — not just at-risk customers.",
      dollarImpact: 1400,
    },
    {
      code: "generic_terms_cl_003",
      severity: "WARNING",
      check: "unprofitable_spend",
      entityId: "cl-g-003",
      title: "Bundle campaign spending heavily on low-intent generic terms",
      detail: "42% of impressions on 'home cleaning' broad match — converting at 0.4% vs 3.2% for branded.",
      dollarImpact: 4600,
    },
  ],
];

export const MOCK_BRAND_READINESS: ProfitReadiness[] = [
  // Brand 0 — Glow & Co: 2 platforms, some COGS missing
  {
    score: 62,
    factors: {
      cogsCoverage: 58,
      shopifyLinked: true,
      googleAdsLinked: false,
      metaAdsLinked: true,
      bankLinked: false,
      historicalOrdersLoaded: true,
    },
    status: "directional_only",
  },
  // Brand 1 — Nutra Boost: all platforms, good COGS via QuickBooks
  {
    score: 91,
    factors: {
      cogsCoverage: 89,
      shopifyLinked: true,
      googleAdsLinked: true,
      metaAdsLinked: true,
      bankLinked: false,
      historicalOrdersLoaded: true,
    },
    status: "ready",
  },
  // Brand 2 — Cleansly: all platforms, Xero-synced COGS
  {
    score: 94,
    factors: {
      cogsCoverage: 93,
      shopifyLinked: true,
      googleAdsLinked: true,
      metaAdsLinked: true,
      bankLinked: true,
      historicalOrdersLoaded: true,
    },
    status: "ready",
  },
];

export const MOCK_BRAND_INTEGRATIONS: IntegrationState[][] = [
  // Brand 0 — Glow & Co: Shopify + Meta connected; Google Ads not yet connected (absent = unconnected)
  [
    { integrationId: "int-gc-s", tenantId: "org-glowco", provider: "shopify", status: "active", settings: { shop: "glow-and-co.myshopify.com" }, updatedAt: Date.now() - 1000 * 60 * 60 * 12 },
    { integrationId: "int-gc-m", tenantId: "org-glowco", provider: "meta_ads", status: "active", settings: { accountId: "act_884421" }, updatedAt: Date.now() - 1000 * 60 * 60 * 12 },
  ],
  // Brand 1 — Nutra Boost: all 3 connected
  [
    { integrationId: "int-nb-s", tenantId: "org-nutra", provider: "shopify", status: "active", settings: { shop: "nutraboost.myshopify.com" }, updatedAt: Date.now() - 1000 * 60 * 60 * 48 },
    { integrationId: "int-nb-g", tenantId: "org-nutra", provider: "google_ads", status: "active", settings: { account: "987-654-3210" }, updatedAt: Date.now() - 1000 * 60 * 60 * 48 },
    { integrationId: "int-nb-m", tenantId: "org-nutra", provider: "meta_ads", status: "active", settings: { accountId: "act_221983" }, updatedAt: Date.now() - 1000 * 60 * 60 * 48 },
  ],
  // Brand 2 — Cleansly: all 3 connected
  [
    { integrationId: "int-cl-s", tenantId: "org-cleansly", provider: "shopify", status: "active", settings: { shop: "cleansly.myshopify.com" }, updatedAt: Date.now() - 1000 * 60 * 60 * 72 },
    { integrationId: "int-cl-g", tenantId: "org-cleansly", provider: "google_ads", status: "active", settings: { account: "456-789-0123" }, updatedAt: Date.now() - 1000 * 60 * 60 * 72 },
    { integrationId: "int-cl-m", tenantId: "org-cleansly", provider: "meta_ads", status: "active", settings: { accountId: "act_556712" }, updatedAt: Date.now() - 1000 * 60 * 60 * 72 },
  ],
];

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
