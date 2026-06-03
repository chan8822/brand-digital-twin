import {GoogleAdsAdapter} from './google_ads_adapter';
import {Context, GovernanceEngine} from './governance_engine';
import {ActionRequest} from './platform_adapter';

export interface VariantInventory {
  variantId: string;
  sku: string;
  qty: number;
  promotedCampaignIds: string[]; // Campaigns running ads for this variant
  lowStockThreshold?: number; // threshold to trigger warnings or scale down budget
  roi?: number; // ROI score to help budget allocation
  bundleId?: string; // to link variant bundles
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

  getInventories(): VariantInventory[] {
    return this.inventories;
  }

  /**
   * Scans inventory levels and applies low-stock warnings or stockout actions.
   */
  async scanStockouts(ctx: Context): Promise<string[]> {
    const actionsTaken: string[] = [];

    for (const item of this.inventories) {
      if (item.qty <= 0) {
        // 1. Stockout: Check if alternative variant in bundle can take over
        let alternativeFound = false;
        if (item.bundleId) {
          const siblings = this.inventories.filter(
            (v) =>
              v.bundleId === item.bundleId &&
              v.variantId !== item.variantId &&
              v.qty > (v.lowStockThreshold ?? 0),
          );
          if (siblings.length > 0) {
            alternativeFound = true;
            const sibling = siblings[0];
            for (const campaignId of item.promotedCampaignIds) {
              const req: ActionRequest = {
                idempotencyKey: `radar_reallocate_${item.variantId}_to_${sibling.variantId}_${campaignId}`,
                op: 'update_feed',
                entity: 'campaign',
                targetId: campaignId,
                payload: {
                  reason: `reallocate budget from out-of-stock SKU ${item.sku} to sibling ${sibling.sku}`,
                  activeVariantId: sibling.variantId,
                },
                confidence: 1.0,
              };
              const outcome = await this.governance.govern(
                this.googleAdapter,
                req,
                ctx,
              );
              actionsTaken.push(
                outcome.status === 'executed'
                  ? `reallocated_campaign_${campaignId}_to_${sibling.sku}`
                  : `queued_reallocation_campaign_${campaignId}_to_${sibling.sku}`,
              );
            }
          }
        }

        // If no sibling variant is in stock, we must pause the campaigns promoting it
        if (!alternativeFound) {
          for (const campaignId of item.promotedCampaignIds) {
            const req: ActionRequest = {
              idempotencyKey: `radar_stockout_${item.variantId}_${campaignId}`,
              op: 'pause',
              entity: 'campaign',
              targetId: campaignId,
              payload: {
                reason: `automated safety trigger: out of stock variant ${item.sku}`,
              },
              confidence: 1.0,
            };

            const outcome = await this.governance.govern(
              this.googleAdapter,
              req,
              ctx,
            );
            if (outcome.status === 'executed') {
              actionsTaken.push(
                `paused_campaign_${campaignId}_for_${item.sku}`,
              );
            } else {
              actionsTaken.push(
                `queued_pause_campaign_${campaignId}_for_${item.sku}`,
              );
            }
          }
        }
      } else if (
        item.lowStockThreshold !== undefined &&
        item.qty <= item.lowStockThreshold
      ) {
        // 2. Low-stock: scale down budget by 50%
        for (const campaignId of item.promotedCampaignIds) {
          const req: ActionRequest = {
            idempotencyKey: `radar_lowstock_${item.variantId}_${campaignId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: campaignId,
            payload: {
              scaleFactor: 0.5,
              reason: `low stock warning for variant ${item.sku} (qty=${item.qty})`,
            },
            confidence: 1.0,
          };
          const outcome = await this.governance.govern(
            this.googleAdapter,
            req,
            ctx,
          );
          if (outcome.status === 'executed') {
            actionsTaken.push(
              `scaled_down_campaign_${campaignId}_for_${item.sku}`,
            );
          } else {
            actionsTaken.push(
              `queued_scale_down_campaign_${campaignId}_for_${item.sku}`,
            );
          }
        }
      }
    }

    return actionsTaken;
  }

  /**
   * Scans variants to align ad spend with ROI performance.
   */
  async scanROIEfficiency(ctx: Context): Promise<string[]> {
    const actionsTaken: string[] = [];

    for (const item of this.inventories) {
      if (item.roi === undefined) continue;

      if (item.roi >= 3.0) {
        // High ROI: scale up budget by 20%
        for (const campaignId of item.promotedCampaignIds) {
          const req: ActionRequest = {
            idempotencyKey: `radar_high_roi_${item.variantId}_${campaignId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: campaignId,
            payload: {
              scaleFactor: 1.2,
              reason: `high performance ROI adjustment for variant ${item.sku} (roi=${item.roi})`,
            },
            confidence: 1.0,
          };
          const outcome = await this.governance.govern(
            this.googleAdapter,
            req,
            ctx,
          );
          if (outcome.status === 'executed') {
            actionsTaken.push(
              `scaled_up_campaign_${campaignId}_for_high_roi_${item.sku}`,
            );
          }
        }
      } else if (item.roi <= 1.5) {
        // Low ROI: scale down budget by 30%
        for (const campaignId of item.promotedCampaignIds) {
          const req: ActionRequest = {
            idempotencyKey: `radar_low_roi_${item.variantId}_${campaignId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: campaignId,
            payload: {
              scaleFactor: 0.7,
              reason: `low performance ROI scaling for variant ${item.sku} (roi=${item.roi})`,
            },
            confidence: 1.0,
          };
          const outcome = await this.governance.govern(
            this.googleAdapter,
            req,
            ctx,
          );
          if (outcome.status === 'executed') {
            actionsTaken.push(
              `scaled_down_campaign_${campaignId}_for_low_roi_${item.sku}`,
            );
          }
        }
      }
    }

    return actionsTaken;
  }
}
