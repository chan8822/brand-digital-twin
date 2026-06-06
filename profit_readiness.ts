import {SupabaseClient} from './supabase_client';

export interface ProfitReadinessResponse {
  score: number; // 0 to 100
  factors: {
    cogsCoverage: number; // 0 to 100
    shopifyLinked: boolean;
    googleAdsLinked: boolean;
    metaAdsLinked: boolean;
    bankLinked: boolean;
    historicalOrdersLoaded: boolean;
  };
  status: 'ready' | 'directional_only' | 'incomplete';
}

/**
 * Calculates a Tenant's Profit Readiness score based on integration links,
 * COGS coverage, and historical transaction ingestion.
 */
export class ProfitReadinessCalculator {
  constructor(private readonly db: SupabaseClient) {}

  async calculate(tenantId: string): Promise<ProfitReadinessResponse> {
    // 1. Fetch credentials to see what platforms are linked
    const credentials = await this.db.getCredentials(tenantId);
    const shopifyLinked = credentials.some((c) => c.platform === 'shopify');
    const googleAdsLinked = credentials.some((c) => c.platform === 'google');
    const metaAdsLinked = credentials.some((c) => c.platform === 'meta');
    const bankLinked = credentials.some((c) => c.platform === 'plaid');

    // 2. Fetch variants to calculate COGS coverage
    const variants = await this.db.getVariants(tenantId);
    const totalVariants = variants.length;
    const variantsWithCogs = variants.filter(
      (v) => v.cost !== null && v.cost !== undefined && Number(v.cost) > 0,
    ).length;
    const cogsCoverage = totalVariants > 0 ? Math.round((variantsWithCogs / totalVariants) * 100) : 0;

    // 3. Fetch orders to verify transaction data load
    const orders = await this.db.getOrders(tenantId);
    const historicalOrdersLoaded = orders.length > 0;

    // 4. Calculate weighted score
    let score = 0;
    if (shopifyLinked) score += 15;
    if (googleAdsLinked) score += 15;
    if (metaAdsLinked) score += 15;
    if (bankLinked) score += 15;
    if (historicalOrdersLoaded) score += 20;
    // Add variants COGS coverage contribution (max 20)
    score += Math.round((cogsCoverage / 100) * 20);

    // 5. Determine status
    let status: 'ready' | 'directional_only' | 'incomplete';
    if (score >= 80 && cogsCoverage >= 70) {
      status = 'ready';
    } else if (score >= 40) {
      status = 'directional_only';
    } else {
      status = 'incomplete';
    }

    return {
      score,
      factors: {
        cogsCoverage,
        shopifyLinked,
        googleAdsLinked,
        metaAdsLinked,
        bankLinked,
        historicalOrdersLoaded,
      },
      status,
    };
  }
}
