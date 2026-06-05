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

/** Server success envelope (server.ts:119). */
export interface ApiEnvelope<T> {
  status: "success";
  data: T;
  timestamp: string;
}
