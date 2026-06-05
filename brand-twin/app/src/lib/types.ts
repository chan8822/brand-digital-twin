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

/** Server success envelope (server.ts:119). */
export interface ApiEnvelope<T> {
  status: "success";
  data: T;
  timestamp: string;
}
