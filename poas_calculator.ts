import {SupabaseClient} from './supabase_client';
import {CampaignCostBreakdown, CampaignPoasReport, TenantCostConfig} from './healing_types';

export class PoasCalculator {
  constructor(private readonly db: SupabaseClient) {}

  async calculate(tenantId: string, costConfig?: TenantCostConfig): Promise<CampaignPoasReport[]> {
    // Derive per-order overhead allocations from the flat monthly costs.
    // Payment processing is a revenue-% applied line-by-line; infra and
    // platform subscriptions are amortised across expected monthly order volume.
    const paymentRate = costConfig?.paymentProcessingRate ?? 0;
    const perOrderInfra =
      costConfig?.monthlyInfraCost && costConfig?.expectedMonthlyOrders
        ? costConfig.monthlyInfraCost / costConfig.expectedMonthlyOrders
        : 0;
    const perOrderPlatformSub =
      costConfig?.monthlyPlatformSubscriptions && costConfig?.expectedMonthlyOrders
        ? costConfig.monthlyPlatformSubscriptions / costConfig.expectedMonthlyOrders
        : 0;

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
      const discount = ol.line_discount ?? 0;
      const grossRevenue = (ol.unit_price - discount) * ol.qty;
      const unitCost = ol.unit_cost ?? 0;
      const grossMargin = (ol.unit_price - discount - unitCost) * ol.qty;
      const discountAmount = discount * ol.qty;
      const cogs = unitCost * ol.qty;

      const lines = orderLinesByOrder.get(ol.order_id) ?? [];
      lines.push({
        lineId: ol.order_line_id,
        grossRevenue,
        grossMargin,
        discountAmount,
        cogs,
        estimatedCogs: ol.unit_cost === null || ol.unit_cost === undefined,
      });
      orderLinesByOrder.set(ol.order_id, lines);
    }

    // 5. Calculate order-level contribution margin, gross revenue, and cost breakdowns
    const orderBreakdownMap = new Map<string, CampaignCostBreakdown>();
    for (const order of orders) {
      const lines = orderLinesByOrder.get(order.order_id) ?? [];
      const orderGrossRevenue = lines.reduce((sum, l) => sum + l.grossRevenue, 0);

      const fc = fulfillmentMap.get(order.order_id) ?? {shipping: 0, marketplace: 0};
      const totalFulfillment = fc.shipping + fc.marketplace;

      let orderContribution = 0;
      let orderCogs = 0;
      let orderDiscount = 0;
      let orderRefund = 0;
      let estimatedCogs = false;

      const positiveLines = lines.filter((l) => l.grossRevenue > 0);
      const sumPositiveGrossRevenue = positiveLines.reduce((sum, l) => sum + l.grossRevenue, 0);

      for (const line of lines) {
        const refunded = refundMap.get(line.lineId) ?? 0;
        let allocatedFulfillment = 0;
        if (sumPositiveGrossRevenue > 0) {
          allocatedFulfillment =
            line.grossRevenue > 0
              ? (line.grossRevenue / sumPositiveGrossRevenue) * totalFulfillment
              : 0;
        } else if (lines.length > 0) {
          allocatedFulfillment = totalFulfillment / lines.length;
        }

        const lineContribution = line.grossMargin - refunded - allocatedFulfillment;
        orderContribution += lineContribution;
        orderCogs += line.cogs;
        orderDiscount += line.discountAmount;
        orderRefund += refunded;
        if (line.estimatedCogs) {
          estimatedCogs = true;
        }
      }

      const paymentProcessingFee = orderGrossRevenue * paymentRate;
      // Deduct payment processing + overhead from contribution margin
      const netContribution = orderContribution - paymentProcessingFee - perOrderInfra - perOrderPlatformSub;

      orderBreakdownMap.set(order.order_id, {
        grossRevenue: orderGrossRevenue,
        discountAmount: orderDiscount,
        cogs: orderCogs,
        fulfillment: fc.shipping,
        marketplaceFee: fc.marketplace,
        refunds: orderRefund,
        paymentProcessingFee,
        infraAllocation: perOrderInfra,
        platformSubscriptionAllocation: perOrderPlatformSub,
        contributionMargin: netContribution,
        estimatedCogs,
      });
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

    // 7. Aggregate breakdowns by campaign
    const campaignBreakdownMap = new Map<string, CampaignCostBreakdown>();
    for (const [orderId, orderBreakdown] of orderBreakdownMap.entries()) {
      const campaignId = orderAttribution.get(orderId) ?? 'ORGANIC';
      const cur = campaignBreakdownMap.get(campaignId) ?? {
        grossRevenue: 0,
        discountAmount: 0,
        cogs: 0,
        fulfillment: 0,
        marketplaceFee: 0,
        refunds: 0,
        paymentProcessingFee: 0,
        infraAllocation: 0,
        platformSubscriptionAllocation: 0,
        contributionMargin: 0,
        estimatedCogs: false,
      };

      campaignBreakdownMap.set(campaignId, {
        grossRevenue: cur.grossRevenue + orderBreakdown.grossRevenue,
        discountAmount: cur.discountAmount + orderBreakdown.discountAmount,
        cogs: cur.cogs + orderBreakdown.cogs,
        fulfillment: cur.fulfillment + orderBreakdown.fulfillment,
        marketplaceFee: cur.marketplaceFee + orderBreakdown.marketplaceFee,
        refunds: cur.refunds + orderBreakdown.refunds,
        paymentProcessingFee: (cur.paymentProcessingFee ?? 0) + (orderBreakdown.paymentProcessingFee ?? 0),
        infraAllocation: (cur.infraAllocation ?? 0) + (orderBreakdown.infraAllocation ?? 0),
        platformSubscriptionAllocation: (cur.platformSubscriptionAllocation ?? 0) + (orderBreakdown.platformSubscriptionAllocation ?? 0),
        contributionMargin: cur.contributionMargin + orderBreakdown.contributionMargin,
        estimatedCogs: cur.estimatedCogs || orderBreakdown.estimatedCogs,
      });
    }

    // 8. Aggregate spend, clicks, and orders by campaign
    const campaignSpendMap = new Map<string, number>();
    for (const sf of spendFacts) {
      const cur = campaignSpendMap.get(sf.campaign_id) ?? 0;
      campaignSpendMap.set(sf.campaign_id, cur + sf.amount);
    }

    const campaignClicksMap = new Map<string, number>();
    for (const tp of touchpoints) {
      if (tp.type === 'click') {
        const campaignId = tp.campaign_id ?? 'ORGANIC';
        const cur = campaignClicksMap.get(campaignId) ?? 0;
        campaignClicksMap.set(campaignId, cur + 1);
      }
    }

    const campaignOrdersCountMap = new Map<string, number>();
    for (const [orderId, campaignId] of orderAttribution.entries()) {
      const cur = campaignOrdersCountMap.get(campaignId) ?? 0;
      campaignOrdersCountMap.set(campaignId, cur + 1);
    }

    // 9. Generate final reports
    const reports: CampaignPoasReport[] = [];
    for (const c of campaigns) {
      const spend = campaignSpendMap.get(c.campaign_id) ?? 0;
      const bd = campaignBreakdownMap.get(c.campaign_id) ?? {
        grossRevenue: 0,
        discountAmount: 0,
        cogs: 0,
        fulfillment: 0,
        marketplaceFee: 0,
        refunds: 0,
        paymentProcessingFee: 0,
        infraAllocation: 0,
        platformSubscriptionAllocation: 0,
        contributionMargin: 0,
        estimatedCogs: false,
      };
      
      const poas = spend > 0 ? Math.round((bd.contributionMargin / spend) * 100) / 100 : null;
      const roas = spend > 0 ? Math.round((bd.grossRevenue / spend) * 100) / 100 : null;
      const clicks = campaignClicksMap.get(c.campaign_id) ?? 0;
      const ordersCount = campaignOrdersCountMap.get(c.campaign_id) ?? 0;

      reports.push({
        campaignId: c.campaign_id,
        campaignName: c.name,
        platform: c.platform,
        status: c.status,
        spend,
        contributionMargin: bd.contributionMargin,
        poas,
        roas,
        breakdown: {
          ...bd,
          spend,
        },
        clicks,
        orders: ordersCount,
      });
    }

    // Add ORGANIC pseudo-campaign report if it generated margin or revenue
    const organicBd = campaignBreakdownMap.get('ORGANIC');
    if (organicBd && (organicBd.contributionMargin > 0 || organicBd.grossRevenue > 0)) {
      reports.push({
        campaignId: 'ORGANIC',
        campaignName: 'Organic Traffic (Unattributed)',
        platform: 'organic',
        status: 'active',
        spend: 0,
        contributionMargin: organicBd.contributionMargin,
        poas: null,
        roas: null,
        breakdown: {
          ...organicBd,
          spend: 0,
        },
        clicks: campaignClicksMap.get('ORGANIC') ?? 0,
        orders: campaignOrdersCountMap.get('ORGANIC') ?? 0,
      });
    }

    // Sort by POAS ascending, then spend descending
    return reports.sort((a, b) => {
      if (a.poas === null && b.poas === null) {
        return b.spend - a.spend;
      }
      if (a.poas === null) return -1; // null poas (organic) sits at the top
      if (b.poas === null) return 1;
      if (a.poas !== b.poas) return a.poas - b.poas;
      return b.spend - a.spend;
    });
  }
}
