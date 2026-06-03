// Phase 3 — Risk Radar Engine.
// Scans storefront/inventory levels and alerts/pauses ad spend when stockouts occur.

import { GovernanceEngine, Context } from "./governance_engine";
import { GoogleAdsAdapter } from "./google_ads_adapter";
import { ActionRequest } from "./platform_adapter";

export interface VariantInventory {
  variantId: string;
  sku: string;
  qty: number;
  promotedCampaignIds: string[]; // Campaigns running ads for this variant
}

export class RiskRadar {
  private inventories: VariantInventory[] = [];

  constructor(
    private governance: GovernanceEngine,
    private googleAdapter: GoogleAdsAdapter,
  ) {}

  seedInventory(variant: VariantInventory) {
    this.inventories.push(variant);
  }

  /**
   * Scans inventory levels.
   * If a product variant has 0 stock (stockout), immediately submits a budget pause request to the governance engine.
   */
  async scanStockouts(ctx: Context): Promise<string[]> {
    const actionsTaken: string[] = [];

    for (const item of this.inventories) {
      if (item.qty <= 0) {
        // Product is out of stock! Pause all campaigns promoting it.
        for (const campaignId of item.promotedCampaignIds) {
          const req: ActionRequest = {
            idempotencyKey: `radar_stockout_${item.variantId}_${campaignId}`,
            op: "pause",
            entity: "campaign",
            targetId: campaignId,
            payload: { reason: `automated safety trigger: out of stock variant ${item.sku}` },
            confidence: 1.0, // Absolute confidence
          };

          const outcome = await this.governance.govern(this.googleAdapter, req, ctx);
          if (outcome.status === "executed") {
            actionsTaken.push(`paused_campaign_${campaignId}_for_${item.sku}`);
          } else {
            actionsTaken.push(`queued_pause_campaign_${campaignId}_for_${item.sku}`);
          }
        }
      }
    }

    return actionsTaken;
  }
}
