import 'jasmine';
import {ShopifyAdapter} from './shopify_adapter';
import {WooCommerceAdapter} from './woocommerce_adapter';
import {MagentoAdapter} from './magento_adapter';
import {SupabaseClient} from './supabase_client';
import {UnifiedIntelligenceBrain} from './unified_brain';

describe('Omnichannel Storefront Adapters Integration Test', () => {
  let db: SupabaseClient;
  let brain: UnifiedIntelligenceBrain;
  const tenantId = 'tenant-omnichannel-123';

  beforeEach(() => {
    db = new SupabaseClient('https://mock-url', 'key', true);
    brain = new UnifiedIntelligenceBrain(db);
  });

  describe('Shopify Adapter Ingestion & Normalization', () => {
    it('normalizes Shopify raw graphql data into canonical tables', async () => {
      const adapter = new ShopifyAdapter(
        'test-shop.myshopify.com',
        'mock_token',
        tenantId,
      );

      const rawShopifyOrder = {
        id: 'gid://shopify/Order/shopify-o1',
        processedAt: '2026-06-03T12:00:00Z',
        currencyCode: 'USD',
        displayFinancialStatus: 'PAID',
        totalPriceSet: {shopMoney: {amount: '120.00'}},
        totalDiscountsSet: {shopMoney: {amount: '15.00'}},
        totalTaxSet: {shopMoney: {amount: '6.00'}},
        totalShippingPriceSet: {shopMoney: {amount: '10.00'}},
        customer: {
          id: 'gid://shopify/Customer/cust-shopify-1',
          email: 'shopify-customer@example.com',
          phone: '+15551234567',
        },
        lineItems: {
          nodes: [
            {
              id: 'gid://shopify/LineItem/li-shopify-1',
              quantity: 3,
              discountedUnitPriceSet: {shopMoney: {amount: '35.00'}},
              variant: {
                id: 'gid://shopify/ProductVariant/v-shopify-1',
                sku: 'SKU-SHOPIFY-A',
                inventoryItem: {
                  unitCost: {amount: '15.00'},
                },
              },
            },
          ],
        },
      };

      const result = (adapter as any).normalizeOrder(rawShopifyOrder);

      expect(result.order.order_id).toBe('gid://shopify/Order/shopify-o1');
      expect(result.order.gross_revenue).toBe(120.0);
      expect(result.order.total_discounts).toBe(15.0);
      expect(result.order.status).toBe('PAID');
      expect(result.order.source_system).toBe('shopify');

      expect(result.customer.customer_id).toBeDefined();
      expect(result.identity_links.length).toBe(2);
      expect(result.order_lines.length).toBe(1);
      expect(result.order_lines[0].sku).toBe('SKU-SHOPIFY-A');
      expect(result.order_lines[0].unit_cost).toBe(15.0);
    });
  });

  describe('WooCommerce Adapter Ingestion & Normalization', () => {
    it('normalizes WooCommerce REST order into canonical tables', () => {
      const adapter = new WooCommerceAdapter(
        'https://my-woocommerce.local',
        'mock_key',
        'mock_secret',
        tenantId,
      );

      const rawWcOrder = {
        id: 9988,
        date_created: '2026-06-03T14:30:00Z',
        currency: 'USD',
        status: 'processing',
        total: '85.50',
        discount_total: '5.00',
        total_tax: '4.50',
        shipping_total: '7.00',
        billing: {
          email: 'wc-customer@example.com',
          phone: '+15557654321',
        },
        customer_id: 42,
        line_items: [
          {
            id: 1122,
            product_id: 501,
            variation_id: 502,
            sku: 'SKU-WC-B',
            quantity: 2,
            price: '37.00',
            meta_data: [
              {
                id: 9,
                key: '_wc_cog_cost',
                value: '18.00',
              },
            ],
          },
        ],
      };

      const result = (adapter as any).normalizeOrder(rawWcOrder);

      expect(result.order.order_id).toBe('9988');
      expect(result.order.gross_revenue).toBe(85.5);
      expect(result.order.total_discounts).toBe(5.0);
      expect(result.order.status).toBe('PROCESSING');
      expect(result.order.source_system).toBe('woocommerce');

      expect(result.customer.customer_id).toBeDefined();
      expect(result.identity_links.length).toBe(2);
      expect(result.order_lines.length).toBe(1);
      expect(result.order_lines[0].sku).toBe('SKU-WC-B');
      expect(result.order_lines[0].unit_cost).toBe(18.0);
    });
  });

  describe('Magento Adapter Ingestion & Normalization', () => {
    it('normalizes Magento V1 order items into canonical tables', () => {
      const adapter = new MagentoAdapter(
        'https://magento-ee.internal',
        'mock_token',
        tenantId,
      );

      const rawMagentoOrder = {
        entity_id: 443322,
        created_at: '2026-06-03T16:00:00Z',
        order_currency_code: 'EUR',
        status: 'complete',
        grand_total: 250.0,
        discount_amount: -25.0, // Magento reports discount as negative
        tax_amount: 20.0,
        shipping_amount: 15.0,
        customer_email: 'magento-user@example.com',
        customer_id: 101,
        billing_address: {
          telephone: '+15559998888',
        },
        items: [
          {
            item_id: 987,
            product_id: 3001,
            sku: 'SKU-MAGENTO-C',
            qty_ordered: 2.0,
            price: 112.5,
            discount_amount: 12.5,
            base_cost: 60.0, // cost price
          },
        ],
      };

      const result = (adapter as any).normalizeOrder(rawMagentoOrder);

      expect(result.order.order_id).toBe('443322');
      expect(result.order.placed_at).toBe('2026-06-03T16:00:00Z');
      expect(result.order.currency).toBe('EUR');
      expect(result.order.gross_revenue).toBe(250.0);
      expect(result.order.total_discounts).toBe(25.0); // converted to absolute positive value
      expect(result.order.status).toBe('COMPLETE');
      expect(result.order.source_system).toBe('magento');

      expect(result.customer.customer_id).toBeDefined();
      expect(result.identity_links.length).toBe(2);
      expect(result.order_lines.length).toBe(1);
      expect(result.order_lines[0].sku).toBe('SKU-MAGENTO-C');
      expect(result.order_lines[0].qty).toBe(2);
      expect(result.order_lines[0].unit_cost).toBe(60.0);
    });
  });

  describe('Omnichannel E-commerce Ingestion Integration Flow', () => {
    it('stores ingested data from multiple platforms in Supabase and runs profitability analytics', async () => {
      // 1. Setup mock source orders
      const shopifyOrderNormalized = {
        order: {
          order_id: 'shopify-1',
          customer_id: 'cust-1',
          account_id: null,
          channel: 'b2c_web',
          surface: 'shopify',
          placed_at: '2026-06-03T12:00:00Z',
          currency: 'USD',
          gross_revenue: 100,
          total_discounts: 10,
          total_tax: 5,
          shipping_charged: 5,
          status: 'PAID',
          tenant_id: tenantId,
          source_system: 'shopify',
          source_id: 'shopify-1',
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
        },
        order_lines: [
          {
            order_line_id: 'shopify-li-1',
            order_id: 'shopify-1',
            variant_id: 'v1',
            sku: 'PRODUCT-A',
            qty: 1,
            unit_price: 90,
            line_discount: 0,
            unit_cost: 40, // COGS -> profit $50
            tenant_id: tenantId,
            source_system: 'shopify',
            source_id: 'shopify-li-1',
            source_version: '1.0',
            ingested_at: new Date().toISOString(),
          },
        ],
      };

      const wcOrderNormalized = {
        order: {
          order_id: 'wc-1',
          customer_id: 'cust-2',
          account_id: null,
          channel: 'b2c_web',
          surface: 'woocommerce',
          placed_at: '2026-06-03T13:00:00Z',
          currency: 'USD',
          gross_revenue: 200,
          total_discounts: 20,
          total_tax: 10,
          shipping_charged: 10,
          status: 'COMPLETED',
          tenant_id: tenantId,
          source_system: 'woocommerce',
          source_id: 'wc-1',
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
        },
        order_lines: [
          {
            order_line_id: 'wc-li-1',
            order_id: 'wc-1',
            variant_id: 'v2',
            sku: 'PRODUCT-B',
            qty: 2,
            unit_price: 90,
            line_discount: 0,
            unit_cost: 50, // COGS ($100 total) -> profit $80
            tenant_id: tenantId,
            source_system: 'woocommerce',
            source_id: 'wc-li-1',
            source_version: '1.0',
            ingested_at: new Date().toISOString(),
          },
        ],
      };

      // 2. Persist normalized records to the database (simulating the ingestion worker writing to Supabase)
      await db.saveOrder(shopifyOrderNormalized.order);
      for (const line of shopifyOrderNormalized.order_lines) {
        await db.saveOrderLine(line);
      }

      await db.saveOrder(wcOrderNormalized.order);
      for (const line of wcOrderNormalized.order_lines) {
        await db.saveOrderLine(line);
      }

      // Add campaigns and spend facts to test true POAS calculation
      // Campaign c1 spent $60 promoting PRODUCT-A on Shopify
      // Campaign c2 spent $50 promoting PRODUCT-B on WooCommerce
      await db.saveCampaign({
        campaign_id: 'c1',
        platform: 'google',
        name: 'Google Shop Ad',
        objective: 'sales',
        status: 'ENABLED',
        surface: 'google_search_network',
        tenant_id: tenantId,
        source_system: 'google',
        source_id: 'c1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });
      await db.saveSpendFact({
        campaign_id: 'c1',
        platform: 'google',
        day: new Date().toISOString().split('T')[0],
        amount: 60.0,
        currency: 'USD',
        tenant_id: tenantId,
        source_system: 'google',
        ingested_at: new Date().toISOString(),
      });

      await db.saveCampaign({
        campaign_id: 'c2',
        platform: 'meta',
        name: 'Meta Ads',
        objective: 'sales',
        status: 'ACTIVE',
        surface: 'facebook_feed',
        tenant_id: tenantId,
        source_system: 'meta',
        source_id: 'c2',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });
      await db.saveSpendFact({
        campaign_id: 'c2',
        platform: 'meta',
        day: new Date().toISOString().split('T')[0],
        amount: 50.0,
        currency: 'USD',
        tenant_id: tenantId,
        source_system: 'meta',
        ingested_at: new Date().toISOString(),
      });

      // Map ad campaigns to products/variants in our mock database
      // Add Brand Signals to trigger brain analysis
      await db.saveBrandSignal({
        signalId: 'sig-1',
        tenantId,
        source: 'ads',
        type: 'low_performance_roi',
        severity: 'high',
        message: 'Campaign ROI drop',
        payload: {campaignId: 'c1'},
        timestamp: Date.now(),
      });

      // 3. run UnifiedIntelligenceBrain analytics to compute POAS recommendations
      const recommendations = await brain.analyzeProfitability(tenantId);
      expect(recommendations).toBeDefined();
      expect(recommendations.length).toBeGreaterThan(0);
      
      // Shopify order profit is $50. c1 spent $60. POAS is negative.
      // WooCommerce order profit is $80. c2 spent $50. POAS is positive.
      // So campaign c1 should be flagged for optimization
      expect(recommendations[0].targetId).toBe('c1');
      expect(recommendations[0].type).toBe('pause_campaign');
      expect(recommendations[0].reason).toContain('POAS');
    });
  });
});
