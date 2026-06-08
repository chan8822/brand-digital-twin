import {ActionRequest} from './platform_adapter';

export interface CampaignCostBreakdown {
  grossRevenue: number;
  discountAmount: number;
  cogs: number;
  fulfillment: number;
  marketplaceFee: number;
  refunds: number;
  /** Payment-processor cut (Stripe / Razorpay / etc.) — % of grossRevenue */
  paymentProcessingFee?: number;
  /** Monthly hosting + CDN + cloud infra amortised per order */
  infraAllocation?: number;
  /** SaaS tool subscriptions (email, helpdesk, reviews, loyalty) amortised per order */
  platformSubscriptionAllocation?: number;
  spend?: number;
  contributionMargin: number;
  estimatedCogs: boolean;
}

/**
 * Per-tenant cost rates used to enrich the POAS calculation beyond COGS +
 * fulfillment.  All fields are optional; omitting a field leaves that cost
 * line at zero so existing callers remain backwards-compatible.
 */
export interface TenantCostConfig {
  /** Fraction of grossRevenue charged by the payment processor (e.g. 0.02 = 2%) */
  paymentProcessingRate?: number;
  /** Total monthly infra + hosting cost (£/$ absolute) */
  monthlyInfraCost?: number;
  /** Total monthly SaaS tool subscriptions cost (£/$ absolute) */
  monthlyPlatformSubscriptions?: number;
  /** Expected monthly order volume — used to amortise monthly flat costs per order */
  expectedMonthlyOrders?: number;
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

export type RootCause =
  | 'LOW_CONVERSION'
  | 'CPC_TOO_HIGH'
  | 'SPEND_INEFFICIENT'
  | 'COGS_TOO_HIGH'
  | 'DISCOUNT_OVERUSE'
  | 'SHIPPING_TOO_HIGH'
  | 'MARKETPLACE_FEES'
  | 'HIGH_REFUND_RATE'
  | 'PAYMENT_PROCESSING_FEE'  // processor cut (Stripe/Razorpay) eroding margin
  | 'INFRA_OVERHEAD'           // hosting / CDN / cloud disproportionate to order volume
  | 'INSUFFICIENT_DATA';

export type Side = 'ADVERTISING' | 'ECONOMICS' | 'UNKNOWN';

export interface Prescription {
  tier: 1 | 2 | 3;
  action: string;
  executableOp?: ActionRequest;
  estimatedRecovery: number;
}

export interface ContextCompleteness {
  visible: string[];
  missing: string[];
  caveat: string;
}

export interface RootCauseDiagnosis {
  campaignId: string;
  side: Side;
  rootCause: RootCause;
  secondaryCauses: RootCause[];
  evidence: {
    poas: number;
    roas: number;
    gap: number;
    drivingRatio: number;
    healthyBand: number;
    dollarDrag: number;
  };
  prescriptions: Prescription[];
  incrementalityFlag: boolean;
  confidence: 'high' | 'medium' | 'low';
  completeness: ContextCompleteness;
}

export interface BaselineContext {
  organicRanks?: Record<string, number>;
  competitorBiddingBrandTerms?: boolean;
  ratingTrend?: 'declining' | 'stable' | 'improving';
}

export interface CategoryBenchmarks {
  cogsRatio?: number;
  discountRatio?: number;
  fulfillmentRatio?: number;
  marketplaceRatio?: number;
  refundRatio?: number;
  spendRatio?: number;
  /** Healthy ceiling for payment-processor fees as % of revenue (typical: 0.025) */
  paymentProcessingRatio?: number;
  /** Healthy ceiling for infra + hosting as % of revenue (typical: 0.01) */
  infraRatio?: number;
  /** Healthy ceiling for SaaS subscriptions as % of revenue (typical: 0.015) */
  platformSubRatio?: number;
  categoryMedianCvr: number;
  categoryHighRoasThreshold?: number;
  lowVarianceThreshold?: number;
}

export interface DiagnosisInput {
  report: CampaignPoasReport;
  breakdown: CampaignCostBreakdown;
  clicks: number;
  orders: number;
  context: BaselineContext;
  benchmarks: CategoryBenchmarks;
  poasVariance?: number;
}

export interface RecommendationCard {
  campaignId: string;
  campaignName: string;
  poas: number;
  roas: number;
  dollarDrag: number;
  dominantCause: RootCause;
  side: Side;
  confidence: 'high' | 'medium' | 'low';
  caveat: string;
  osActs: Prescription[];
  userApproves: Prescription[];
  adsCantFix: Prescription[];
}

export type Severity = 'CRITICAL' | 'WARNING' | 'OPPORTUNITY';

export interface SweepFinding {
  code: string;             // e.g. 'no_conv_tracking_c1' — back-compat with current counts
  severity: Severity;
  check: string;            // 'conversion_tracking' | 'budget_capped_winner' | 'checkout_events' | 'inventory_level' | 'runway_alert' | 'unprofitable_spend'
  entityId: string | null;         // campaignId / null
  title: string;            // human-readable
  detail: string;           // evidence line for the card
  dollarImpact: number;     // ₹ at stake (wasted, or recoverable upside)
  suggestedAction?: ActionRequest; // present when 1-tap fixable
}
