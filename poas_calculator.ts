import {SupabaseClient} from './supabase_client';

export interface CampaignPoasReport {
  campaignId: string;
  campaignName: string;
  platform: string;
  status: string;
  spend: number;
  contributionMargin: number;
  poas: number | null;
}

export class PoasCalculator {
  constructor(private readonly db: SupabaseClient) {}

  async calculate(tenantId: string): Promise<CampaignPoasReport[]> {
    // 1. Load all data from DB for this tenant
    const orders = await this.db.getOrders(tenantId);
    const orderLines = await this.db.getOrderLines(tenantId);
    const campaigns = await this.db.getCampaigns(tenantId);
    const spendFacts = await this.db.getSpendFacts(tenantId);
    const refunds = await this.db.getRefunds(tenantId);
    const fulfillmentCosts = await this.db.getFulfillmentCosts(tenantId);
    const touchpoints = await this.db.getTouchpoints(tenantId);

    // 2. Compute refunds by order_line_id
    const refundMap = new Map<string, number>();
    for (const r of refunds) {
      const cur = refundMap.get(r.order_line_id) ?? 0;
      refundMap.set(r.order_line_id, cur + r.amount);
    }

    // 3. Compute fulfillment costs by order_id
    const fulfillmentMap = new Map<string, {shipping: number; marketplace: number}>();
    for (const fc of fulfillmentCosts) {
      fulfillmentMap.set(fc.order_id, {
        shipping: fc.shipping_cost,
        marketplace: fc.marketplace_fee,
      });
    }

    // 4. Group order lines by order_id and calculate line-level gross metrics
    const orderLinesByOrder = new Map<string, any[]>();
    for (const ol of orderLines) {
      const grossRevenue = (ol.unit_price - ol.line_discount) * ol.qty;
      const unitCost = ol.unit_cost ?? 0;
      const grossMargin = (ol.unit_price - ol.line_discount - unitCost) * ol.qty;

      const lines = orderLinesByOrder.get(ol.order_id) ?? [];
      lines.push({
        lineId: ol.order_line_id,
        grossRevenue,
        grossMargin,
      });
      orderLinesByOrder.set(ol.order_id, lines);
    }

    // 5. Calculate order-level contribution margin
    const orderContribMap = new Map<string, number>();
    for (const order of orders) {
      const lines = orderLinesByOrder.get(order.order_id) ?? [];
      const orderGrossRevenue = lines.reduce((sum, l) => sum + l.grossRevenue, 0);

      const fc = fulfillmentMap.get(order.order_id) ?? {shipping: 0, marketplace: 0};
      const totalFulfillment = fc.shipping + fc.marketplace;

      let orderContribution = 0;
      for (const line of lines) {
        const refunded = refundMap.get(line.lineId) ?? 0;
        const allocatedFulfillment =
          orderGrossRevenue > 0
            ? (line.grossRevenue / orderGrossRevenue) * totalFulfillment
            : 0;

        const lineContribution = line.grossMargin - refunded - allocatedFulfillment;
        orderContribution += lineContribution;
      }

      orderContribMap.set(order.order_id, orderContribution);
    }

    // 6. Attribution: Order -> Campaign (Last touch click/impression within 30 days)
    // Group touchpoints by customer_id
    const touchpointsByCustomer = new Map<string, any[]>();
    for (const tp of touchpoints) {
      if (!tp.customer_id) continue;
      const tps = touchpointsByCustomer.get(tp.customer_id) ?? [];
      tps.push(tp);
      touchpointsByCustomer.set(tp.customer_id, tps);
    }

    const orderAttribution = new Map<string, string>(); // orderId -> campaignId
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const order of orders) {
      if (!order.customer_id) {
        orderAttribution.set(order.order_id, 'ORGANIC');
        continue;
      }

      const tps = touchpointsByCustomer.get(order.customer_id) ?? [];
      const orderTime = new Date(order.placed_at).getTime();

      // Find valid touchpoints: occurred_at <= placed_at and occurred_at >= placed_at - 30 days
      const validTps = tps
        .filter((tp) => {
          const tpTime = new Date(tp.occurred_at).getTime();
          return tpTime <= orderTime && tpTime >= orderTime - thirtyDaysMs;
        })
        // Sort by occurred_at DESC
        .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

      if (validTps.length > 0 && validTps[0].campaign_id) {
        orderAttribution.set(order.order_id, validTps[0].campaign_id);
      } else {
        orderAttribution.set(order.order_id, 'ORGANIC');
      }
    }

    // 7. Aggregate margin by campaign
    const campaignMarginMap = new Map<string, number>();
    for (const [orderId, contribution] of orderContribMap.entries()) {
      const campaignId = orderAttribution.get(orderId) ?? 'ORGANIC';
      const cur = campaignMarginMap.get(campaignId) ?? 0;
      campaignMarginMap.set(campaignId, cur + contribution);
    }

    // 8. Aggregate spend by campaign
    const campaignSpendMap = new Map<string, number>();
    for (const sf of spendFacts) {
      const cur = campaignSpendMap.get(sf.campaign_id) ?? 0;
      campaignSpendMap.set(sf.campaign_id, cur + sf.amount);
    }

    // 9. Generate final reports
    const reports: CampaignPoasReport[] = [];
    for (const c of campaigns) {
      const spend = campaignSpendMap.get(c.campaign_id) ?? 0;
      const contributionMargin = campaignMarginMap.get(c.campaign_id) ?? 0;
      const poas = spend > 0 ? Math.round((contributionMargin / spend) * 100) / 100 : null;

      reports.push({
        campaignId: c.campaign_id,
        campaignName: c.name,
        platform: c.platform,
        status: c.status,
        spend,
        contributionMargin,
        poas,
      });
    }

    // Add ORGANIC pseudo-campaign report if it generated margin
    const organicMargin = campaignMarginMap.get('ORGANIC') ?? 0;
    if (organicMargin > 0) {
      reports.push({
        campaignId: 'ORGANIC',
        campaignName: 'Organic Traffic (Unattributed)',
        platform: 'organic',
        status: 'active',
        spend: 0,
        contributionMargin: organicMargin,
        poas: null,
      });
    }

    // Sort by POAS ascending, then spend descending
    return reports.sort((a, b) => {
      if (a.poas === null && b.poas === null) return 0;
      if (a.poas === null) return -1; // null poas (organic) sits at the top
      if (b.poas === null) return 1;
      if (a.poas !== b.poas) return a.poas - b.poas;
      return b.spend - a.spend;
    });
  }
}
