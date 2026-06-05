/**
 * Mocked engine responses so the SPA is demoable with no backend.
 * Shapes match the real `RecommendationCard` (healing_types.ts). When the live
 * engine is wired (NEXT_PUBLIC_API_URL set), these are bypassed.
 *
 * The campaigns are deliberately chosen to show the core story: high ROAS that
 * hides a thin or negative POAS — the gap the product exists to expose.
 */
import type { RecommendationCard } from "./types";

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
