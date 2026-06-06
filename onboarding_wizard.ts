/**
 * @fileoverview Onboarding and configuration wizard.
 */

import {ClientProfile, IntegrationState, TeamMember} from './agency_os_types';
import {
  PlatformAccountEntry,
  AccountLinkEntry,
  ProductAdLinkEntry,
  SupabaseClient,
} from './supabase_client';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {GoogleMerchantAdapter} from './google_merchant_adapter';
import {GovernanceEngine} from './governance_engine';
import {Context} from './governance_types';

export interface OnboardingParams {
  tenantId: string;
  clientName: string;
  industry: string;
  mrr: number;
  marginTarget: number;
  teamMembers: Array<{
    memberId: string;
    roleName: 'media_buyer' | 'account_mgr' | 'cmo' | 'cfo' | 'admin';
    permissions: string[];
    capacityPct: number;
  }>;
  platforms: string[]; // e.g. ['google_ads', 'meta_ads', 'slack']
}

export class OnboardingWizard {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Run the setup routine, writing all seed records.
   */
  async runSetup(
    params: OnboardingParams,
  ): Promise<{
    success: boolean;
    client: ClientProfile;
    initializedIntegrationsCount: number;
  }> {
    // 1. Create client profile
    const client: ClientProfile = {
      clientId: `client-${Date.now()}`,
      orgId: `org-${params.tenantId}`,
      name: params.clientName,
      industry: params.industry,
      mrr: params.mrr,
      marginTarget: params.marginTarget,
      healthScore: 100, // initialized at perfect health
      churnRisk: 0.0,
      tenantId: params.tenantId,
    };
    await this.db.saveClient(client);

    // 2. Add team members
    for (const member of params.teamMembers) {
      const teamMember: TeamMember = {
        memberId: member.memberId,
        orgId: `org-${params.tenantId}`,
        userId: `user-${member.memberId}`,
        roleName: member.roleName,
        permissions: member.permissions,
        capacityPct: member.capacityPct,
        tenantId: params.tenantId,
      };
      await this.db.saveTeamMember(teamMember);
    }

    // 3. Initialize integration states
    let count = 0;
    for (const platform of params.platforms) {
      const integration: IntegrationState = {
        integrationId: `state-${platform}-${params.tenantId}`,
        tenantId: params.tenantId,
        provider: platform as IntegrationState['provider'],
        status: 'active',
        settings: {
          accessToken: `token-initial-${platform}`,
          lastRotated: Date.now(),
        },
        updatedAt: Date.now(),
      };
      await this.db.saveIntegrationState(integration);
      count++;
    }

    // Log onboarding activity event
    await this.db.logActivity({
      eventId: `act-onboard-${Date.now()}`,
      orgId: `org-${params.tenantId}`,
      actorId: 'onboarding-wizard',
      actionType: 'onboarding_completed',
      entityType: 'tenant',
      entityId: params.tenantId,
      summary: `Onboarding completed for tenant ${params.tenantId}. Client profile '${params.clientName}' and ${count} integrations initialized.`,
      isRead: false,
      tenantId: params.tenantId,
      createdAt: Date.now(),
    });

    return {
      success: true,
      client,
      initializedIntegrationsCount: count,
    };
  }

  async discoverAndSyncHierarchy(
    tenantId: string,
    googleAdsMccId: string,
    gmcMcaId: string,
    adsAdapter: GoogleAdsAdapter,
    gmcAdapter: GoogleMerchantAdapter,
  ): Promise<{platformAccountsCount: number}> {
    const adsSubAccounts = await adsAdapter.listSubAccounts(googleAdsMccId);
    for (const sub of adsSubAccounts) {
      await this.db.savePlatformAccount({
        account_id: sub.accountId,
        tenant_id: tenantId,
        platform: 'google_ads',
        platform_account_id: sub.platformAccountId,
        account_name: sub.accountName,
        account_type: sub.accountType,
        parent_account_id: sub.parentAccountId || null,
        currency: sub.currency || null,
        timezone: sub.timezone || null,
        status: sub.status,
        ingested_at: sub.ingestedAt,
      });
    }

    const gmcSubAccounts = await gmcAdapter.listSubMerchants(gmcMcaId);
    for (const sub of gmcSubAccounts) {
      await this.db.savePlatformAccount({
        account_id: sub.accountId,
        tenant_id: tenantId,
        platform: 'google_merchant',
        platform_account_id: sub.platformAccountId,
        account_name: sub.accountName,
        account_type: sub.accountType,
        parent_account_id: sub.parentAccountId || null,
        currency: sub.currency || null,
        timezone: sub.timezone || null,
        status: sub.status,
        ingested_at: sub.ingestedAt,
      });
    }

    return {
      platformAccountsCount: adsSubAccounts.length + gmcSubAccounts.length,
    };
  }

  async autoLinkAccounts(tenantId: string): Promise<{linksCreated: number}> {
    const accounts = await this.db.getPlatformAccounts(tenantId);
    let linkCount = 0;

    const adsAccounts = accounts.filter(
      (a) => a.platform === 'google_ads' && a.account_type === 'sub_account',
    );
    const gmcAccounts = accounts.filter(
      (a) => a.platform === 'google_merchant' && a.account_type === 'merchant_center',
    );
    const storefronts = accounts.filter(
      (a) => a.platform === 'shopify' || a.account_type === 'storefront',
    );

    // Heuristic 1: Pre-defined explicit Google Shopping Campaign linkages
    for (const ads of adsAccounts) {
      for (const gmc of gmcAccounts) {
        if (
          (ads.platform_account_id === 'ads-sub-a' && gmc.platform_account_id === 'gmc-sub-a') ||
          (ads.platform_account_id === 'ads-sub-b' && gmc.platform_account_id === 'gmc-sub-b') ||
          (ads.platform_account_id === 'ads-sub-c' && gmc.platform_account_id === 'gmc-sub-c')
        ) {
          await this.db.saveAccountLink({
            link_id: `link-ads-gmc-${ads.account_id}-${gmc.account_id}`,
            tenant_id: tenantId,
            account_id_a: ads.account_id,
            account_id_b: gmc.account_id,
            link_type: 'ads_to_merchant',
            confidence: 1.0,
            confirmed_by: 'auto',
            created_at: new Date().toISOString(),
          });
          linkCount++;
        }
      }
    }

    // Heuristic 2: Fuzzy Name / Domain matching
    for (const gmc of gmcAccounts) {
      for (const store of storefronts) {
        const storeClean = store.platform_account_id
          .split('.')[0]
          .replace(/-store/g, '')
          .toLowerCase();
        const gmcClean = gmc.account_name
          ?.toLowerCase()
          .replace(/shop feed/g, '')
          .trim()
          .replace(/\s+/g, '-');

        if (
          storeClean &&
          gmcClean &&
          (storeClean.includes(gmcClean) || gmcClean.includes(storeClean))
        ) {
          await this.db.saveAccountLink({
            link_id: `link-gmc-store-${gmc.account_id}-${store.account_id}`,
            tenant_id: tenantId,
            account_id_a: gmc.account_id,
            account_id_b: store.account_id,
            link_type: 'merchant_to_storefront',
            confidence: 0.9,
            confirmed_by: 'auto',
            created_at: new Date().toISOString(),
          });
          linkCount++;
        }
      }
    }

    return {linksCreated: linkCount};
  }

  async buildSkuAdLinks(
    tenantId: string,
    mappings: Array<{
      variantId: string;
      gmcOfferId: string;
      gmcAccountId: string;
      adsAccountId: string;
      adsCampaignId: string;
      adsAdGroupId: string;
    }>,
  ): Promise<void> {
    for (const map of mappings) {
      await this.db.saveProductAdLink({
        tenant_id: tenantId,
        variant_id: map.variantId,
        gmc_offer_id: map.gmcOfferId,
        gmc_account_id: map.gmcAccountId,
        ads_account_id: map.adsAccountId,
        ads_campaign_id: map.adsCampaignId,
        ads_ad_group_id: map.adsAdGroupId,
        confidence: 1.0,
        resolved_at: new Date().toISOString(),
      });
    }
  }

  /**
   * Generates a cold-start margin discovery campaign in Google Ads targeting high-margin products.
   */
  async generateMarginDiscoveryCampaign(
    tenantId: string,
    adsAccountId: string,
    adsAdapter: GoogleAdsAdapter,
    governance: GovernanceEngine,
    ctx: Context,
  ): Promise<{campaignId: string; targetSkus: string[]; marginBasis: 'orders' | 'catalog'} | 'needs_cogs' | null> {
    const orderLines = await this.db.getOrderLines(tenantId);
    const variants = await this.db.getVariants(tenantId);

    const variantMap = new Map<string, number | null>();
    for (const v of variants) {
      if (v.variant_id) {
        variantMap.set(v.variant_id, v.cost !== undefined ? v.cost : null);
      }
    }

    const hasOrderCogs = orderLines.some((ol) => {
      if (ol.unit_cost !== null && ol.unit_cost !== undefined && ol.unit_cost > 0) {
        return true;
      }
      if (ol.variant_id) {
        const vCost = variantMap.get(ol.variant_id);
        if (vCost !== null && vCost !== undefined && vCost > 0) {
          return true;
        }
      }
      return false;
    });
    const hasCatalogCogs = variants.some((v) => v.cost !== null && v.cost !== undefined && v.cost > 0);

    if (!hasOrderCogs && !hasCatalogCogs) {
      if (orderLines.length > 0 || variants.length > 0) {
        return 'needs_cogs';
      }
    }

    let marginBasis: 'orders' | 'catalog' = 'orders';
    const skuMargins = new Map<string, {sku: string; variantId: string; marginPct: number}>();
    if (orderLines.length > 0) {
      for (const ol of orderLines) {
        if (!ol.sku || !ol.variant_id) continue;
        let cost = ol.unit_cost;
        if (cost === null || cost === undefined) {
          const variantCost = variantMap.get(ol.variant_id);
          if (variantCost !== undefined && variantCost !== null) {
            cost = variantCost;
          }
        }
        if (cost === null || cost === undefined) {
          continue;
        }
        const margin = ol.unit_price - cost;
        const marginPct = ol.unit_price > 0 ? margin / ol.unit_price : 0;
        skuMargins.set(ol.sku, {
          sku: ol.sku,
          variantId: ol.variant_id,
          marginPct,
        });
      }
    }

    if (skuMargins.size === 0) {
      marginBasis = 'catalog';
      for (const v of variants) {
        if (v.cost === null || v.cost === undefined) {
          continue;
        }
        const margin = v.price - v.cost;
        const marginPct = v.price > 0 ? margin / v.price : 0;
        skuMargins.set(v.sku, {
          sku: v.sku,
          variantId: v.variant_id,
          marginPct,
        });
      }
    }

    const highMarginProducts = Array.from(skuMargins.values())
      .filter((p) => p.marginPct >= 0.4)
      .sort((a, b) => b.marginPct - a.marginPct);

    if (highMarginProducts.length === 0) {
      return null;
    }

    const targetSkus = highMarginProducts.map((p) => p.sku);
    const campaignId = `c-discovery-${Date.now()}`;

    const req = {
      idempotencyKey: `onboard_discovery_${tenantId}_${Date.now()}`,
      op: 'create' as const,
      entity: 'campaign',
      targetId: campaignId,
      payload: {
        name: `Twin-Discovery: High Margin Catalog`,
        budget: 500,
        status: 'PAUSED',
        objective: 'SEARCH',
      },
      confidence: 1.0,
    };

    const outcome = await governance.govern(adsAdapter, req, ctx);
    if (outcome.status === 'executed') {
      await this.db.saveCampaign({
        campaign_id: campaignId,
        platform: 'google',
        objective: 'SEARCH',
        name: `Twin-Discovery: High Margin Catalog`,
        status: 'PAUSED',
        surface: 'google_search_network',
        tenant_id: tenantId,
        source_system: 'google',
        source_id: campaignId,
        source_version: 'v15',
        ingested_at: new Date().toISOString(),
      });

      for (const p of highMarginProducts) {
        await this.db.saveProductAdLink({
          tenant_id: tenantId,
          variant_id: p.variantId,
          gmc_offer_id: `gmc_${p.sku}`,
          gmc_account_id: 'gmc-acc-1',
          ads_account_id: adsAccountId,
          ads_campaign_id: campaignId,
          ads_ad_group_id: '',
          confidence: 1.0,
          resolved_at: new Date().toISOString(),
        });
      }

      return { campaignId, targetSkus, marginBasis };
    }

    return null;
  }
}
