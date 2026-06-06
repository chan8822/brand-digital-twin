/**
 * Response types matching the real engine output, verified against
 * `brand-digital-twin` @ 44ca4ba:
 *   - healing_types.ts (RecommendationCard, Prescription, RootCause, Side)
 *   - poas_calculator.ts (CampaignPoasReport)
 *   - server.ts:119 (success envelope), server.ts:794 (/recommendations)
 *
 * GET /api/v1/recommendations → { status, data: { recommendations: RecommendationCard[] }, timestamp }
 */

export type RootCause =
  | "LOW_CONVERSION"
  | "CPC_TOO_HIGH"
  | "SPEND_INEFFICIENT"
  | "COGS_TOO_HIGH"
  | "DISCOUNT_OVERUSE"
  | "SHIPPING_TOO_HIGH"
  | "MARKETPLACE_FEES"
  | "HIGH_REFUND_RATE"
  | "INSUFFICIENT_DATA";

export type Side = "ADVERTISING" | "ECONOMICS" | "UNKNOWN";

export type Confidence = "high" | "medium" | "low";

export interface Prescription {
  tier: 1 | 2 | 3;
  action: string;
  estimatedRecovery: number;
}

/** The three-zone healing card returned by `analyzeProfitability()`. */
export interface RecommendationCard {
  campaignId: string;
  campaignName: string;
  poas: number;
  roas: number;
  dollarDrag: number;
  dominantCause: RootCause;
  side: Side;
  confidence: Confidence;
  caveat: string;
  osActs: Prescription[];
  userApproves: Prescription[];
  adsCantFix: Prescription[];
}

/** Raw per-campaign POAS report (poas_calculator.ts) — used by some surfaces. */
export interface CampaignCostBreakdown {
  grossRevenue: number;
  discountAmount: number;
  cogs: number;
  fulfillment: number;
  marketplaceFee: number;
  refunds: number;
  spend?: number;
  contributionMargin: number;
  estimatedCogs: boolean;
}

export interface CampaignPoasReport {
  campaignId: string;
  campaignName: string;
  platform: string;
  status: string;
  spend: number;
  contributionMargin: number;
  poas: number | null;
  roas: number | null;
  breakdown?: CampaignCostBreakdown;
  clicks: number;
  orders: number;
}

export type Severity = "CRITICAL" | "WARNING" | "OPPORTUNITY";

/**
 * Diagnostic sweep finding — the rich shape produced by the 5 scanners in
 * risk_radar.ts (scanStockouts / scanROIEfficiency / scanConversionTracking /
 * scanCheckoutEvents / scanBudgetCappedWinners), verified @ 44ca4ba.
 *
 * NOTE: this rich shape is produced internally but is NOT yet exposed by an
 * endpoint — `/api/v1/risks` currently returns `string[]` (detectRisks). A
 * `GET /api/v1/sweep → { sweep: SweepFinding[] }` endpoint is needed to wire
 * this screen to live data (tracked in 00-REMAINING_WORK.md).
 */
export interface SweepFinding {
  code: string;
  severity: Severity;
  check: string;
  entityId: string | null;
  title: string;
  detail: string;
  dollarImpact: number;
  /** present when 1-tap fixable (ActionRequest in the engine) */
  suggestedAction?: unknown;
}

/**
 * Approval request — what's waiting on a human (governance escalation).
 * Matches agency_os_types.ts `ApprovalRequest` @ 44ca4ba.
 * GET /api/v1/approvals → { approvals: ApprovalRequest[] }
 * POST /api/v1/approvals/:id/approve → resume execution
 */
export interface ApprovalRequest {
  approvalId: string;
  orgId: string;
  entityType: string; // 'campaign' | 'budget_shift' | 'whatsapp_broadcast'
  entityId: string;
  requestedBy: string;
  assignedTo: string;
  status: "pending" | "approved" | "rejected";
  reason?: string;
  tenantId: string;
  createdAt: number;
  completedAt?: number;
}

/**
 * Trust tiers (governance_types.ts). Ordered 0→4 with per-tier daily $ caps
 * (governance_engine.ts). No read/write endpoint exists yet — a
 * `GET/POST /api/v1/autonomy` is needed to wire the dial live (tracked).
 */
export type SemanticTrustTier =
  | "OBSERVE"
  | "REVIEW"
  | "ASSISTED"
  | "AUTONOMOUS"
  | "C_SUITE";

export const TRUST_TIERS: {
  tier: SemanticTrustTier;
  level: number;
  cap: number;
  blurb: string;
}[] = [
  { tier: "OBSERVE", level: 0, cap: 0, blurb: "Watches only — no actions taken." },
  { tier: "REVIEW", level: 1, cap: 100, blurb: "Proposes; every action needs approval." },
  { tier: "ASSISTED", level: 2, cap: 500, blurb: "Acts on small fixes; escalates the rest." },
  { tier: "AUTONOMOUS", level: 3, cap: 2000, blurb: "Acts within daily cap; escalates outliers." },
  { tier: "C_SUITE", level: 4, cap: 1_000_000, blurb: "Full autonomy within policy." },
];

/**
 * Profit readiness — is the POAS number trustworthy enough to act on?
 * Matches profit_readiness.ts `ProfitReadinessResponse` @ 8807aa8.
 * GET /api/v1/profit-readiness → { score, factors, status }
 */
export interface ProfitReadiness {
  score: number; // 0–100
  factors: {
    cogsCoverage: number; // 0–100
    shopifyLinked: boolean;
    googleAdsLinked: boolean;
    metaAdsLinked: boolean;
    bankLinked: boolean;
    historicalOrdersLoaded: boolean;
  };
  status: "ready" | "directional_only" | "incomplete";
}

/**
 * Integration connection state. Matches agency_os_types.ts `IntegrationState`
 * @ 8807aa8. The OAuth connect flow (A2, `a09e913`) writes these on callback.
 * NOTE: no `GET /api/v1/integrations` endpoint exists yet to read them over HTTP
 * (client method `getIntegrationStates` exists) — tracked as A2.4.
 */
export type IntegrationProvider =
  | "google_ads"
  | "meta_ads"
  | "meta_ads_api"
  | "shopify"
  | "quickbooks"
  | "gmail"
  | "slack"
  | "hubspot"
  | "asana"
  | "figma"
  | "brandwatch";

export interface IntegrationState {
  integrationId: string;
  tenantId: string;
  provider: IntegrationProvider;
  status: "active" | "suspended" | "expired";
  settings: Record<string, unknown>;
  updatedAt: number;
}

/* ── Phase C1: COGS aggregator ─────────────────────────────────────────────
 * Cost data is what makes POAS trustworthy. The engine auto-fills what it can
 * (silent sweep + accounting sync + category estimate) and asks the user only
 * for the top-spend SKUs still missing (Pareto). Coverage gates advice.
 * Intended engine shapes per C-PHASE_BUILD_SPEC.md / PROFIT_DATA_MODEL.md.
 */

/** Accounting sources that conform to the engine `CostSource` interface. All
 *  reuse the A2 OAuth + CredentialVault plumbing — no new auth surface. */
export type CostSourceProvider = "tally" | "zoho" | "quickbooks" | "xero";

/** How a SKU's unit cost was obtained (P2.2 provenance). `silent_sweep` /
 *  `accounting_sync` are automated; if everything is `manual` the auto-fetch
 *  isn't working — which is itself the H2 finding. */
export type CogsProvenance =
  | "silent_sweep"
  | "accounting_sync"
  | "invoice_parse"
  | "manual"
  | "category_estimate";

/** One SKU's cost line in the Pareto entry grid. `unitCost` is null when
 *  unknown; `estimatedCogs` mirrors the engine flag that demotes healing
 *  confidence to `medium` (risk_radar.ts:673). */
export interface CogsGap {
  sku: string;
  productName: string;
  /** ad spend attributed to this SKU — drives Pareto ordering (top spend first) */
  adSpend: number;
  sellingPrice: number;
  unitCost: number | null;
  provenance: CogsProvenance;
  estimatedCogs: boolean;
}

/** Coverage is the share of *ad spend* (not SKU count) backed by real or
 *  estimated cost — the basis the Profit Readiness gate uses. */
export interface CogsCoverage {
  coveragePct: number; // 0–100, by spend
  realPct: number; // backed by real (non-estimated) cost
  estimatedPct: number; // backed by category-average estimate
  missingCostSkus: number;
  basis: "ad_spend";
}

/* ── Phase C2: billing + suggest-an-amount ─────────────────────────────────
 * The subscription state machine and the bespoke "name your price" conversion.
 * The account stays live through `pending_review` — no cutoff during review.
 */

/** Subscription state machine (C-PHASE_BUILD_SPEC.md):
 *  trial → suggest_amount → pending_review → active → past_due → suspended. */
export type BillingStatus =
  | "trial"
  | "suggest_amount"
  | "pending_review"
  | "active"
  | "past_due"
  | "suspended";

export interface Subscription {
  orgId: string;
  status: BillingStatus;
  /** present once an amount is named (suggest_amount onward) */
  amount?: number;
  currency: string; // 'USD' | 'INR'
  period: "monthly" | "month";
  trialDay: number; // 0-based day into the trial
  trialLengthDays: number;
  nextChargeAt?: number;
  note?: string;
}

/** Soft anchors shown for reference only (Decision #10) — never preselected. */
export const PRICE_ANCHORS = [299, 799, 2500] as const;

/* ── P2.1: action / ignore telemetry ───────────────────────────────────────
 * Why a brand dismissed a recommendation — the richest H1 signal. Captured on
 * the dismiss control and persisted to `recommendation_events` (engine).
 */
export type DismissReason =
  | "dont_believe"
  | "cant_act"
  | "disagree"
  | "too_hard"
  | "other";

export const DISMISS_REASON_LABELS: Record<DismissReason, string> = {
  dont_believe: "I don't believe the number",
  cant_act: "I can't act on this",
  disagree: "I disagree with the fix",
  too_hard: "Too hard / too much effort",
  other: "Other",
};

/** Server success envelope (server.ts:119). */
export interface ApiEnvelope<T> {
  status: "success";
  data: T;
  timestamp: string;
}

/* ── Admin: billing ops queue ───────────────────────────────────────────────
 * Admin-only view of subscriptions in `pending_review`. Each row has enough
 * context to approve without opening a separate screen.
 */
export interface BillingQueueEntry {
  orgId: string;
  orgName: string;
  email: string;
  status: "pending_review";
  amount: number;
  currency: string;
  period: "monthly" | "month";
  suggestedAt: number;
  note?: string;
}

/* ── Billing receipts ───────────────────────────────────────────────────────
 * One row per successful charge. receiptUrl present when the processor
 * generated a hosted receipt page.
 */
export interface Receipt {
  receiptId: string;
  orgId: string;
  amount: number;
  currency: string;
  period: "monthly" | "month";
  chargedAt: number;
  receiptUrl?: string;
}

/* ── Tenant spend limits (B4 / governance) ──────────────────────────────────
 * Per-tenant caps enforced by governance_engine.ts.
 * GET/POST /api/v1/tenant-limits
 */
export interface TenantLimits {
  maxDailyLimit: number;
  maxPerActionLimit: number;
}
