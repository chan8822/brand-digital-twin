import {SupabaseClient, OrderEntry, OrderLineEntry, TouchpointEntry, RefundEntry, FulfillmentCostEntry, VariantEntry} from './supabase_client';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {MetaAdsAdapter} from './meta_ads_adapter';

export interface ConversionSyncResult {
  googleSuccessCount: number;
  googleFailCount: number;
  metaSuccessCount: number;
  metaFailCount: number;
}

export class OfflineConversionsSync {
  constructor(private readonly db: SupabaseClient) {}

  async syncConversions(
    tenantId: string,
    googleAdapter: GoogleAdsAdapter,
    metaAdapter: MetaAdsAdapter,
    metaPixelId: string,
  ): Promise<ConversionSyncResult> {
    const result: ConversionSyncResult = {
      googleSuccessCount: 0,
      googleFailCount: 0,
      metaSuccessCount: 0,
      metaFailCount: 0,
    };

    // 1. Fetch all data for calculations
    const touchpoints = await this.db.getTouchpoints(tenantId);
    const orders = await this.db.getOrders(tenantId);
    const orderLines = await this.db.getOrderLines(tenantId);
    const refunds = await this.db.getRefunds(tenantId);
    const fulfillmentCosts = await this.db.getFulfillmentCosts(tenantId);
    const variants = await this.db.getVariants(tenantId);

    // 2. Identify unsynced purchase touchpoints with click IDs
    const googleTps = touchpoints.filter(
      (t) =>
        t.type === 'Purchase' &&
        t.order_id &&
        t.campaign_id?.startsWith('camp-gclid-') &&
        !t.google_synced_at,
    );

    const metaTps = touchpoints.filter(
      (t) =>
        t.type === 'Purchase' &&
        t.order_id &&
        t.campaign_id?.startsWith('camp-fbclid-') &&
        !t.meta_synced_at,
    );

    if (googleTps.length === 0 && metaTps.length === 0) {
      return result;
    }

    // Pre-maps for fast lookup
    const orderMap = new Map<string, OrderEntry>();
    for (const o of orders) {
      orderMap.set(o.order_id, o);
    }

    const orderLinesMap = new Map<string, OrderLineEntry[]>();
    for (const ol of orderLines) {
      const cur = orderLinesMap.get(ol.order_id) ?? [];
      cur.push(ol);
      orderLinesMap.set(ol.order_id, cur);
    }

    const refundMap = new Map<string, number>(); // order_line_id -> total refund amount
    for (const r of refunds) {
      const cur = refundMap.get(r.order_line_id) ?? 0;
      refundMap.set(r.order_line_id, cur + r.amount);
    }

    const fulfillmentMap = new Map<string, {shipping: number; marketplace: number}>();
    for (const fc of fulfillmentCosts) {
      fulfillmentMap.set(fc.order_id, {
        shipping: fc.shipping_cost,
        marketplace: fc.marketplace_fee,
      });
    }

    const variantCostMap = new Map<string, number>(); // variant_id -> cost
    for (const v of variants) {
      variantCostMap.set(v.variant_id, v.cost ?? 0);
    }

    // Helper to calculate Contribution Margin of an order (exactly like PoasCalculator)
    const calculateOrderContributionMargin = (orderId: string): number => {
      const order = orderMap.get(orderId);
      if (!order) return 0;

      const lines = orderLinesMap.get(orderId) ?? [];
      const fc = fulfillmentMap.get(orderId) ?? {shipping: 0, marketplace: 0};
      const totalFulfillment = fc.shipping + fc.marketplace;

      const lineDetails = lines.map((ol) => {
        const discount = ol.line_discount ?? 0;
        const grossRevenue = ol.unit_price * ol.qty - discount;
        const variantId = ol.variant_id;
        const unitCost = ol.unit_cost ?? (variantId ? variantCostMap.get(variantId) : 0) ?? 0;
        const grossMargin = (ol.unit_price - discount - unitCost) * ol.qty;
        return {grossRevenue, grossMargin, lineId: ol.order_line_id};
      });

      const positiveLines = lineDetails.filter((l) => l.grossRevenue > 0);
      const sumPositiveGrossRevenue = positiveLines.reduce((sum, l) => sum + l.grossRevenue, 0);

      let orderContribution = 0;
      for (const line of lineDetails) {
        const refunded = refundMap.get(line.lineId) ?? 0;
        let allocatedFulfillment = 0;
        if (sumPositiveGrossRevenue > 0) {
          allocatedFulfillment =
            line.grossRevenue > 0
              ? (line.grossRevenue / sumPositiveGrossRevenue) * totalFulfillment
              : 0;
        } else if (lineDetails.length > 0) {
          allocatedFulfillment = totalFulfillment / lineDetails.length;
        }

        const lineContribution = line.grossMargin - refunded - allocatedFulfillment;
        orderContribution += lineContribution;
      }

      return orderContribution;
    };

    // Helper to format ISO date to Google Ads API expected YYYY-MM-DD HH:MM:SS+TZ format
    const formatGoogleDateTime = (isoStr: string): string => {
      const d = new Date(isoStr);
      const pad = (n: number) => String(n).padStart(2, '0');
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const min = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}+0000`; // assuming UTC for mock
    };

    // 3. Process Google Conversions Sync
    if (googleTps.length > 0) {
      const googleAdjustments: any[] = [];
      const validGoogleTps: TouchpointEntry[] = [];

      for (const tp of googleTps) {
        const orderId = tp.order_id!;
        const order = orderMap.get(orderId);
        if (!order) continue;

        const margin = calculateOrderContributionMargin(orderId);
        const gclid = tp.campaign_id!.replace('camp-gclid-', '');

        googleAdjustments.push({
          gclidDateTimePair: {
            gclid: gclid,
            conversionDateTime: formatGoogleDateTime(order.placed_at),
          },
          adjustmentType: 'RESTATEMENT',
          restatementValue: {
            adjustedValue: margin,
            currencyCode: order.currency || 'USD',
          },
        });
        validGoogleTps.push(tp);
      }

      if (googleAdjustments.length > 0) {
        try {
          const adsCreds = await this.db.getCredentials(tenantId);
          const googleCred = adsCreds.find((c) => c.platform === 'google_ads');
          const googleCustId = googleCred?.credential_key || 'mock-customer-id';

          const uploadRes = await googleAdapter.uploadConversionAdjustments(
            googleCustId,
            googleAdjustments,
          );

          result.googleSuccessCount = uploadRes.successCount;
          result.googleFailCount = uploadRes.failCount;

          if (uploadRes.successCount > 0) {
            // Update synced_at timestamp on touchpoints in DB
            const now = new Date().toISOString();
            for (let i = 0; i < uploadRes.successCount; i++) {
              const tp = validGoogleTps[i];
              tp.google_synced_at = now;
              await this.db.saveTouchpoint(tp);
            }
          }
        } catch (err) {
          result.googleFailCount = googleAdjustments.length;
        }
      }
    }

    // 4. Process Meta Conversions Sync
    if (metaTps.length > 0) {
      const metaEvents: any[] = [];
      const validMetaTps: TouchpointEntry[] = [];

      for (const tp of metaTps) {
        const orderId = tp.order_id!;
        const order = orderMap.get(orderId);
        if (!order) continue;

        const margin = calculateOrderContributionMargin(orderId);
        const fbclid = tp.campaign_id!.replace('camp-fbclid-', '');

        metaEvents.push({
          event_name: 'Purchase',
          event_time: Math.floor(new Date(order.placed_at).getTime() / 1000),
          event_source_url: 'https://storefront.example.com/checkout/thank-you',
          action_source: 'website',
          user_data: {
            fbc: `fb.1.1.${fbclid}`,
          },
          custom_data: {
            value: margin,
            currency: order.currency || 'USD',
          },
        });
        validMetaTps.push(tp);
      }

      if (metaEvents.length > 0) {
        try {
          const uploadRes = await metaAdapter.uploadOfflineEvents(metaPixelId, metaEvents);

          result.metaSuccessCount = uploadRes.successCount;
          result.metaFailCount = uploadRes.failCount;

          if (uploadRes.successCount > 0) {
            const now = new Date().toISOString();
            for (let i = 0; i < uploadRes.successCount; i++) {
              const tp = validMetaTps[i];
              tp.meta_synced_at = now;
              await this.db.saveTouchpoint(tp);
            }
          }
        } catch (err) {
          result.metaFailCount = metaEvents.length;
        }
      }
    }

    return result;
  }
}
