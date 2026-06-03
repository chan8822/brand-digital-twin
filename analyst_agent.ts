// Phase 1 — Analyst Agent.
// Analyzes the digital twin data to find optimization opportunities:
// 1. Unprofitable spend (POAS < 1.0)
// 2. Stockout risks (high ad spend on low stock variants)
// 3. Margin drift (cost increase eroding contribution margin)

export interface Recommendation {
  recommendationId: string;
  type: "unprofitable_spend" | "stockout_risk" | "margin_drift";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  suggestedAction: string;
  projectedSavings: number;
}

export class AnalystAgent {
  constructor(private tenantId: string) {}

  /**
   * Scans campaigns for unprofitable spend (POAS < 1.0).
   * In production, this runs against BigQuery POAS query results.
   */
  analyzeUnprofitableSpend(campaigns: any[], spendFacts: any[], orders: any[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const c of campaigns) {
      if (c.tenant_id !== this.tenantId) continue;

      // Calculate campaign spend
      const totalSpend = spendFacts
        .filter(sf => sf.campaign_id === c.campaign_id)
        .reduce((sum, sf) => sum + sf.amount, 0);

      if (totalSpend === 0) continue;

      // Calculate attributed margin (mocking simple attribution match)
      // Filter orders placed in matching tenant
      const matchingOrders = orders.filter(o => o.tenant_id === this.tenantId);
      
      // Let's attribute 10% of revenue to this campaign for the sake of analysis simulation
      const attributedRevenue = matchingOrders.reduce((sum, o) => sum + o.gross_revenue, 0) * 0.1;

      const poas = totalSpend > 0 ? attributedRevenue / totalSpend : 0;

      if (poas < 1.0) {
        recommendations.push({
          recommendationId: `rec_spend_${c.campaign_id}`,
          type: "unprofitable_spend",
          severity: "high",
          title: `Unprofitable Spend in Campaign: ${c.name}`,
          description: `Campaign is generating a POAS of ${poas.toFixed(2)} (Spend: $${totalSpend.toFixed(2)}, Attributed Margin: $${attributedRevenue.toFixed(2)}).`,
          suggestedAction: `Reduce daily budget of campaign '${c.name}' by 30% or pause creative assets with low click-through rates.`,
          projectedSavings: totalSpend * 0.3,
        });
      }
    }

    return recommendations;
  }

  /**
   * Scans inventory levels vs campaign spend to detect stockout risks.
   * If a product has < 10 items in stock but high spend, raise alert.
   */
  analyzeStockoutRisks(
    variants: any[],
    campaigns: any[],
    spendFacts: any[],
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Find variants with low stock (e.g., stock < 10)
    const lowStockVariants = variants.filter(v => v.stock !== undefined && v.stock < 10);

    for (const v of lowStockVariants) {
      // Find campaigns advertising this variant/SKU (using simple name matching for simulation)
      const relatedCampaigns = campaigns.filter(c => 
        c.name.toLowerCase().includes(v.sku?.toLowerCase() || "")
      );

      for (const rc of relatedCampaigns) {
        const campaignSpend = spendFacts
          .filter(sf => sf.campaign_id === rc.campaign_id)
          .reduce((sum, sf) => sum + sf.amount, 0);

        if (campaignSpend > 100) { // Significant spend
          recommendations.push({
            recommendationId: `rec_stock_${v.variant_id}_${rc.campaign_id}`,
            type: "stockout_risk",
            severity: "high",
            title: `High Ad Spend on Low Stock Product: ${v.sku}`,
            description: `Variant ${v.sku} has only ${v.stock} units left in stock, but Campaign '${rc.name}' spent $${campaignSpend.toFixed(2)} in the last 24 hours.`,
            suggestedAction: `Pause campaign '${rc.name}' or adjust product targeting to avoid driving traffic to out-of-stock items.`,
            projectedSavings: campaignSpend,
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Detects margin erosion when COGS/unit cost increases over time.
   */
  analyzeMarginDrift(variants: any[], orderLines: any[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    for (const v of variants) {
      // Find order lines for this variant
      const lines = orderLines.filter(ol => ol.variant_id === v.variant_id);
      if (lines.length === 0) continue;

      // Find average unit cost in order lines (historical COGS)
      const avgHistCost = lines.reduce((sum, ol) => sum + ol.unit_cost, 0) / lines.length;
      
      // Compare to current COGS
      const currentCost = v.cost_cogs;
      const erosion = currentCost - avgHistCost;

      if (erosion > 0 && (erosion / avgHistCost) > 0.05) { // Cost increased by > 5%
        const affectedQty = lines.reduce((sum, ol) => sum + ol.qty, 0);
        recommendations.push({
          recommendationId: `rec_margin_${v.variant_id}`,
          type: "margin_drift",
          severity: "medium",
          title: `Margin Erosion on Product: ${v.sku}`,
          description: `Unit COGS has increased from $${avgHistCost.toFixed(2)} (historical) to $${currentCost.toFixed(2)} (current). This is eroding profit margins by ${( (erosion / avgHistCost) * 100).toFixed(1)}%.`,
          suggestedAction: `Renegotiate wholesale cost for SKU '${v.sku}' or adjust retail price upwards by $${erosion.toFixed(2)}.`,
          projectedSavings: erosion * affectedQty,
        });
      }
    }

    return recommendations;
  }
}
