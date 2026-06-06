/**
 * @fileoverview COGS (Cost of Goods Sold) Manager.
 * Computes spend-weighted coverage, identifies gaps, and estimates missing costs.
 */

import {CogsCoverage, CogsGap} from './cogs_types';
import {SupabaseClient, VariantEntry} from './supabase_client';

export class CogsManager {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Computes ad-spend weighted COGS coverage metrics.
   */
  async calculateCoverage(tenantId: string): Promise<CogsCoverage> {
    const variants = await this.db.getVariants(tenantId);
    const variantSpendMap = await this.getVariantSpendMap(tenantId);

    let totalAllocatedSpend = 0;
    for (const spend of variantSpendMap.values()) {
      totalAllocatedSpend += spend;
    }

    if (totalAllocatedSpend === 0) {
      // Fallback: weight by variant count
      const totalVariants = variants.length;
      if (totalVariants === 0) {
        return {
          coveragePct: 0,
          realPct: 0,
          estimatedPct: 0,
          missingCostSkus: [],
          basis: 'ad_spend',
        };
      }

      let realCount = 0;
      let estimatedCount = 0;
      const missingCostSkus: string[] = [];

      for (const v of variants) {
        const hasCost = v.cost !== null && v.cost !== undefined && v.cost > 0;
        if (hasCost) {
          if (v.provenance === 'estimated') {
            estimatedCount++;
          } else {
            realCount++;
          }
        } else {
          missingCostSkus.push(v.sku);
        }
      }

      const realPct = Math.round((realCount / totalVariants) * 100);
      const estimatedPct = Math.round((estimatedCount / totalVariants) * 100);

      return {
        coveragePct: realPct + estimatedPct,
        realPct,
        estimatedPct,
        missingCostSkus,
        basis: 'ad_spend',
      };
    }

    let realSpend = 0;
    let estimatedSpend = 0;
    const missingSpendMap = new Map<string, number>();

    for (const v of variants) {
      const spend = variantSpendMap.get(v.variant_id) ?? 0;
      const hasCost = v.cost !== null && v.cost !== undefined && v.cost > 0;

      if (hasCost) {
        if (v.provenance === 'estimated') {
          estimatedSpend += spend;
        } else {
          realSpend += spend;
        }
      } else {
        if (spend > 0) {
          missingSpendMap.set(v.variant_id, spend);
        }
      }
    }

    const realPct = Math.round((realSpend / totalAllocatedSpend) * 100);
    const estimatedPct = Math.round((estimatedSpend / totalAllocatedSpend) * 100);

    // Build missing cost SKUs, sorted by spend descending
    const missingVariants = variants.filter(v => missingSpendMap.has(v.variant_id));
    missingVariants.sort((a, b) => {
      const spendA = missingSpendMap.get(a.variant_id) ?? 0;
      const spendB = missingSpendMap.get(b.variant_id) ?? 0;
      return spendB - spendA;
    });

    const missingCostSkus = missingVariants.map(v => v.sku);

    return {
      coveragePct: realPct + estimatedPct,
      realPct,
      estimatedPct,
      missingCostSkus,
      basis: 'ad_spend',
    };
  }

  /**
   * Identifies all variants that are missing COGS, sorted by adSpend descending.
   */
  async getGaps(tenantId: string): Promise<CogsGap[]> {
    const variants = await this.db.getVariants(tenantId);
    const variantSpendMap = await this.getVariantSpendMap(tenantId);

    const gaps: CogsGap[] = [];

    for (const v of variants) {
      const hasConfidentCost = v.cost !== null && v.cost !== undefined && v.cost > 0 && v.provenance !== 'estimated';
      if (!hasConfidentCost) {
        const spend = variantSpendMap.get(v.variant_id) ?? 0;
        gaps.push({
          sku: v.sku,
          variantId: v.variant_id,
          adSpend: spend,
          price: v.price,
          title: v.title,
          estimated: v.provenance === 'estimated',
        });
      }
    }

    return gaps.sort((a, b) => b.adSpend - a.adSpend);
  }

  /**
   * Bulk updates unit costs for variants by SKU.
   */
  async updateCogs(tenantId: string, cogsUpdates: Array<{sku: string; cost: number}>): Promise<number> {
    const variants = await this.db.getVariants(tenantId);
    let count = 0;

    for (const update of cogsUpdates) {
      const variant = variants.find(v => v.sku === update.sku);
      if (variant) {
        variant.cost = update.cost;
        variant.provenance = 'manual';
        await this.db.saveVariant(variant);
        count++;
      }
    }

    return count;
  }

  /**
   * Run category-average margin estimation to populate missing variant costs.
   */
  async estimateMissingCogs(tenantId: string): Promise<number> {
    const variants = await this.db.getVariants(tenantId);
    if (variants.length === 0) return 0;

    const categoryGroups = new Map<string, { withCost: VariantEntry[]; withoutCost: VariantEntry[] }>();

    for (const v of variants) {
      const category = this.getCategory(v.title);
      const group = categoryGroups.get(category) ?? { withCost: [], withoutCost: [] };
      
      const hasCost = v.cost !== null && v.cost !== undefined && v.cost > 0 && v.provenance !== 'estimated';
      if (hasCost) {
        group.withCost.push(v);
      } else {
        group.withoutCost.push(v);
      }
      categoryGroups.set(category, group);
    }

    const categoryMargins = new Map<string, number>();
    for (const [category, group] of categoryGroups.entries()) {
      if (group.withCost.length > 0) {
        let totalMarginPct = 0;
        let validCount = 0;
        for (const v of group.withCost) {
          if (v.price > 0) {
            const margin = v.price - (v.cost ?? 0);
            totalMarginPct += margin / v.price;
            validCount++;
          }
        }
        const avgMargin = validCount > 0 ? totalMarginPct / validCount : 0.40;
        categoryMargins.set(category, avgMargin);
      } else {
        categoryMargins.set(category, 0.40);
      }
    }

    let estimatedCount = 0;
    for (const [category, group] of categoryGroups.entries()) {
      const margin = categoryMargins.get(category) ?? 0.40;
      for (const v of group.withoutCost) {
        const estimatedCost = v.price * (1 - margin);
        v.cost = Math.round(estimatedCost * 100) / 100;
        v.provenance = 'estimated';
        await this.db.saveVariant(v);
        estimatedCount++;
      }
    }

    return estimatedCount;
  }

  private async getVariantSpendMap(tenantId: string): Promise<Map<string, number>> {
    const adLinks = await this.db.getProductAdLinks(tenantId);
    const spendFacts = await this.db.getSpendFacts(tenantId);

    const campaignSpend = new Map<string, number>();
    for (const sf of spendFacts) {
      const cur = campaignSpend.get(sf.campaign_id) ?? 0;
      campaignSpend.set(sf.campaign_id, cur + sf.amount);
    }

    const campaignToVariants = new Map<string, Set<string>>();
    for (const link of adLinks) {
      const set = campaignToVariants.get(link.ads_campaign_id) ?? new Set<string>();
      set.add(link.variant_id);
      campaignToVariants.set(link.ads_campaign_id, set);
    }

    const variantSpend = new Map<string, number>();
    for (const [campaignId, spend] of campaignSpend.entries()) {
      const linkedVariants = campaignToVariants.get(campaignId);
      if (linkedVariants && linkedVariants.size > 0) {
        const allocatedSpend = spend / linkedVariants.size;
        for (const vId of linkedVariants) {
          const cur = variantSpend.get(vId) ?? 0;
          variantSpend.set(vId, cur + allocatedSpend);
        }
      }
    }

    return variantSpend;
  }

  private getCategory(title: string): string {
    const t = title.toLowerCase();
    if (t.includes('shirt') || t.includes('t-shirt') || t.includes('top')) return 'apparel';
    if (t.includes('shoe') || t.includes('boot') || t.includes('sneaker')) return 'footwear';
    if (t.includes('pant') || t.includes('jeans') || t.includes('trouser')) return 'apparel';
    return 'default';
  }
}
