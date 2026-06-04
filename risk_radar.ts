import {GoogleAdsAdapter} from './google_ads_adapter';
import {Context, GovernanceEngine} from './governance_engine';
import {ActionRequest} from './platform_adapter';
import {SupabaseClient} from './supabase_client';

export interface VariantInventory {
  variantId: string;
  sku: string;
  qty: number;
  promotedCampaignIds: string[]; // Keep for legacy/fallback
  lowStockThreshold?: number;
  roi?: number;
  bundleId?: string;
}

export class RiskRadar {
  private inventories: VariantInventory[] = [];

  constructor(
    private governance: GovernanceEngine,
    private googleAdapter: GoogleAdsAdapter,
    private db?: SupabaseClient,
    private tenantId?: string,
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
    const links = this.db && this.tenantId ? await this.db.getProductAdLinks(this.tenantId) : [];

    for (const item of this.inventories) {
      const itemLinks = links.filter((l) => l.variant_id === item.variantId);
      const targets =
        itemLinks.length > 0
          ? itemLinks.map((l) => ({
              entity: (l.ads_ad_group_id ? 'ad_group' : 'campaign') as 'ad_group' | 'campaign',
              targetId: l.ads_ad_group_id || l.ads_campaign_id,
            }))
          : item.promotedCampaignIds.map((id) => ({
              entity: 'campaign' as const,
              targetId: id,
            }));

      if (item.qty <= 0) {
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
            for (const tgt of targets) {
              const req: ActionRequest = {
                idempotencyKey: `radar_reallocate_${item.variantId}_to_${sibling.variantId}_${tgt.targetId}`,
                op: 'update_feed',
                entity: tgt.entity,
                targetId: tgt.targetId,
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
                  ? `reallocated_${tgt.entity}_${tgt.targetId}_to_${sibling.sku}`
                  : `queued_reallocation_${tgt.entity}_${tgt.targetId}_to_${sibling.sku}`,
              );
            }
          }
        }

        if (!alternativeFound) {
          for (const tgt of targets) {
            const req: ActionRequest = {
              idempotencyKey: `radar_stockout_${item.variantId}_${tgt.targetId}`,
              op: 'pause',
              entity: tgt.entity,
              targetId: tgt.targetId,
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
                `paused_${tgt.entity}_${tgt.targetId}_for_${item.sku}`,
              );
            } else {
              actionsTaken.push(
                `queued_pause_${tgt.entity}_${tgt.targetId}_for_${item.sku}`,
              );
            }
          }
        }
      } else if (
        item.lowStockThreshold !== undefined &&
        item.qty <= item.lowStockThreshold
      ) {
        for (const tgt of targets) {
          if (tgt.entity !== 'campaign') {
            continue;
          }
          const req: ActionRequest = {
            idempotencyKey: `radar_lowstock_${item.variantId}_${tgt.targetId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: tgt.targetId,
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
              `scaled_down_campaign_${tgt.targetId}_for_${item.sku}`,
            );
          } else {
            actionsTaken.push(
              `queued_scale_down_campaign_${tgt.targetId}_for_${item.sku}`,
            );
          }
        }
      }
    }

    return actionsTaken;
  }

  async scanROIEfficiency(ctx: Context): Promise<string[]> {
    const actionsTaken: string[] = [];
    const links = this.db && this.tenantId ? await this.db.getProductAdLinks(this.tenantId) : [];

    for (const item of this.inventories) {
      if (item.roi === undefined) continue;

      const itemLinks = links.filter((l) => l.variant_id === item.variantId);
      const targets =
        itemLinks.length > 0
          ? itemLinks.map((l) => ({
              entity: (l.ads_ad_group_id ? 'ad_group' : 'campaign') as 'ad_group' | 'campaign',
              targetId: l.ads_ad_group_id || l.ads_campaign_id,
            }))
          : item.promotedCampaignIds.map((id) => ({
              entity: 'campaign' as const,
              targetId: id,
            }));

      if (item.roi >= 3.0) {
        for (const tgt of targets) {
          if (tgt.entity !== 'campaign') continue;
          const req: ActionRequest = {
            idempotencyKey: `radar_high_roi_${item.variantId}_${tgt.targetId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: tgt.targetId,
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
              `scaled_up_campaign_${tgt.targetId}_for_high_roi_${item.sku}`,
            );
          }
        }
      } else if (item.roi <= 1.5) {
        for (const tgt of targets) {
          if (tgt.entity !== 'campaign') continue;
          const req: ActionRequest = {
            idempotencyKey: `radar_low_roi_${item.variantId}_${tgt.targetId}`,
            op: 'scale_budget',
            entity: 'campaign',
            targetId: tgt.targetId,
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
              `scaled_down_campaign_${tgt.targetId}_for_low_roi_${item.sku}`,
            );
          }
        }
      }
    }

    return actionsTaken;
  }
}
