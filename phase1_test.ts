import 'jasmine';
import {createHash} from 'node:crypto';
import {IngestionEngine} from './ingestion_engine';
import {PoasCalculator} from './poas_calculator';
import {SupabaseClient} from './supabase_client';
import {PlatformAdapter} from './platform_adapter';

const sha256 = (s: string) =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

describe('Phase 1a Ingestion and POAS calculation', () => {
  let db: SupabaseClient;
  let engine: IngestionEngine;
  let calculator: PoasCalculator;

  const tenantId = 'tenant_pilot_123';

  beforeEach(() => {
    db = new SupabaseClient(undefined, undefined, true);
    db.setTenantContext(tenantId);
    engine = new IngestionEngine(db);
    calculator = new PoasCalculator(db);
  });

  it('runs Shopify & Google Ads ingestion, aggregates to calculate POAS', async () => {
    // 1. Setup mock Shopify Adapter read generator
    const mockShopifyOrderBatch = [
      {
        order: {
          order_id: 'gid://shopify/Order/111',
          customer_id: sha256('gid://shopify/Customer/999'),
          account_id: null,
          channel: 'b2c_web',
          surface: 'pilot-shop.myshopify.com',
          placed_at: '2026-06-01T12:00:00Z',
          currency: 'USD',
          gross_revenue: 100.0,
          total_discounts: 10.0,
          total_tax: 5.0,
          shipping_charged: 8.0,
          status: 'PAID',
          source_system: 'shopify',
          source_id: 'gid://shopify/Order/111',
          source_version: 'shopify@2025-10',
          ingested_at: new Date().toISOString(),
          tenant_id: tenantId,
        },
        order_lines: [
          {
            order_line_id: 'gid://shopify/LineItem/line-111',
            order_id: 'gid://shopify/Order/111',
            variant_id: 'gid://shopify/ProductVariant/v1',
            sku: 'SKU-1',
            qty: 2,
            unit_price: 45.0,
            line_discount: 5.0, // 5.0 discount per unit -> 10.0 total discount
            unit_cost: 20.0, // COGS = 20.0 * 2 = 40.0
            source_system: 'shopify',
            source_id: 'gid://shopify/LineItem/line-111',
            source_version: 'shopify@2025-10',
            ingested_at: new Date().toISOString(),
            tenant_id: tenantId,
          },
        ],
        customer: {
          customer_id: sha256('gid://shopify/Customer/999'),
          type: 'b2c',
          first_seen: '2026-06-01T12:00:00Z',
          consent_status: 'GRANTED',
          source_system: 'shopify',
          source_id: sha256('gid://shopify/Customer/999'),
          source_version: 'shopify@2025-10',
          ingested_at: new Date().toISOString(),
          tenant_id: tenantId,
        },
        identity_links: [
          {
            customer_id: sha256('gid://shopify/Customer/999'),
            identifier_type: 'email',
            identifier_hash: sha256('buyer@example.com'),
            confidence: 1.0,
            source_system: 'shopify',
            ingested_at: new Date().toISOString(),
            tenant_id: tenantId,
          },
        ],
      },
      {
        order: {
          order_id: 'gid://shopify/Order/222',
          customer_id: sha256('gid://shopify/Customer/999'),
          account_id: null,
          channel: 'b2c_web',
          surface: 'pilot-shop.myshopify.com',
          placed_at: '2026-06-03T15:00:00Z',
          currency: 'USD',
          gross_revenue: 200.0,
          total_discounts: 0,
          total_tax: 10.0,
          shipping_charged: 12.0,
          status: 'PAID',
          source_system: 'shopify',
          source_id: 'gid://shopify/Order/222',
          source_version: 'shopify@2025-10',
          ingested_at: new Date().toISOString(),
          tenant_id: tenantId,
        },
        order_lines: [
          {
            order_line_id: 'gid://shopify/LineItem/line-222',
            order_id: 'gid://shopify/Order/222',
            variant_id: 'gid://shopify/ProductVariant/v2',
            sku: 'SKU-2',
            qty: 1,
            unit_price: 200.0,
            line_discount: 0,
            unit_cost: 150.0, // COGS = 150.0
            source_system: 'shopify',
            source_id: 'gid://shopify/LineItem/line-222',
            source_version: 'shopify@2025-10',
            ingested_at: new Date().toISOString(),
            tenant_id: tenantId,
          },
        ],
        customer: {
          customer_id: sha256('gid://shopify/Customer/999'),
          type: 'b2c',
          first_seen: '2026-06-01T12:00:00Z',
          consent_status: 'GRANTED',
          source_system: 'shopify',
          source_id: sha256('gid://shopify/Customer/999'),
          source_version: 'shopify@2025-10',
          ingested_at: new Date().toISOString(),
          tenant_id: tenantId,
        },
        identity_links: [],
      },
    ];

    const mockShopifyAdapter: PlatformAdapter = {
      platform: 'shopify',
      schemaVersion: 'shopify@2025-10',
      capabilities: [],
      read: async function* () {
        yield mockShopifyOrderBatch;
      },
      plan: async () => {
        throw new Error('Not implemented');
      },
      execute: async () => {
        throw new Error('Not implemented');
      },
      rollback: async () => {
        throw new Error('Not implemented');
      },
      healthCheck: async () => ({
        ok: true,
        latencyMs: 1,
        schemaDriftDetected: false,
        deprecationWarnings: [],
      }),
    };

    // 2. Setup mock Google Ads and Meta Ads data
    const mockAdData = {
      campaigns: [
        {
          campaign_id: 'camp-google-1',
          platform: 'google_ads',
          name: 'Google Search Spring',
          objective: 'sales',
          status: 'active',
          surface: 'google',
          tenant_id: tenantId,
          source_system: 'google_ads',
          source_id: 'camp-google-1',
          source_version: 'v15',
          ingested_at: new Date().toISOString(),
        },
        {
          campaign_id: 'camp-meta-1',
          platform: 'meta_ads',
          name: 'Meta Retargeting',
          objective: 'sales',
          status: 'active',
          surface: 'facebook',
          tenant_id: tenantId,
          source_system: 'meta_ads',
          source_id: 'camp-meta-1',
          source_version: 'v18',
          ingested_at: new Date().toISOString(),
        },
      ],
      spend_facts: [
        {
          campaign_id: 'camp-google-1',
          platform: 'google_ads',
          day: '2026-06-01',
          amount: 10.0,
          currency: 'USD',
          tenant_id: tenantId,
          source_system: 'google_ads',
          ingested_at: new Date().toISOString(),
        },
        {
          campaign_id: 'camp-meta-1',
          platform: 'meta_ads',
          day: '2026-06-03',
          amount: 25.0,
          currency: 'USD',
          tenant_id: tenantId,
          source_system: 'meta_ads',
          ingested_at: new Date().toISOString(),
        },
      ],
    };

    const mockAdsAdapter: PlatformAdapter = {
      platform: 'google_ads',
      schemaVersion: 'v15',
      capabilities: [],
      read: async () => mockAdData,
      plan: async () => {
        throw new Error('Not implemented');
      },
      execute: async () => {
        throw new Error('Not implemented');
      },
      rollback: async () => {
        throw new Error('Not implemented');
      },
      healthCheck: async () => ({
        ok: true,
        latencyMs: 1,
        schemaDriftDetected: false,
        deprecationWarnings: [],
      }),
    };

    // 3. Sync all data using the Ingestion Engine
    await engine.sync(mockShopifyAdapter, new Date('2026-06-01T00:00:00Z'));
    await engine.sync(mockAdsAdapter, new Date('2026-06-01T00:00:00Z'));

    // 4. Manually seed refunds, fulfillment costs, and touchpoints into the DB
    await db.saveRefund({
      refund_id: 'ref-1',
      order_line_id: 'gid://shopify/LineItem/line-111',
      amount: 20.0,
      refunded_at: '2026-06-02T10:00:00Z',
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ref-1',
      source_version: 'shopify@2025-10',
      ingested_at: new Date().toISOString(),
    });

    await db.saveFulfillmentCost({
      order_id: 'gid://shopify/Order/111',
      shipping_cost: 10.0,
      marketplace_fee: 2.0,
      carrier: 'UPS',
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'fc-111',
      source_version: 'shopify@2025-10',
      ingested_at: new Date().toISOString(),
    });

    await db.saveTouchpoint({
      touchpoint_id: 'tp-1',
      customer_id: sha256('gid://shopify/Customer/999'),
      campaign_id: 'camp-google-1',
      order_id: null,
      occurred_at: '2026-06-01T10:00:00Z', // 2h before Order 1
      type: 'click',
      tenant_id: tenantId,
      source_system: 'google_ads',
      ingested_at: new Date().toISOString(),
    });

    await db.saveTouchpoint({
      touchpoint_id: 'tp-2',
      customer_id: sha256('gid://shopify/Customer/999'),
      campaign_id: 'camp-meta-1',
      order_id: null,
      occurred_at: '2026-06-03T10:00:00Z', // 5h before Order 2
      type: 'click',
      tenant_id: tenantId,
      source_system: 'meta_ads',
      ingested_at: new Date().toISOString(),
    });

    // 5. Calculate POAS
    const reports = await calculator.calculate(tenantId);

    // 6. Assertions
    expect(reports.length).toBe(2);

    // Google Campaign check
    const googleRep = reports.find((r) => r.campaignId === 'camp-google-1')!;
    expect(googleRep).toBeDefined();
    expect(googleRep.spend).toBe(10.0);
    // Net Margin calculations:
    // Gross Rev: (45 - 5) * 2 = 80
    // COGS: 20 * 2 = 40
    // Gross Margin: 80 - 40 = 40
    // Refund: 20
    // Fulfillment: 10 (shipping) + 2 (fee) = 12
    // Net Margin: 40 - 20 - 12 = 8
    // POAS: 8 / 10 = 0.8
    expect(googleRep.contributionMargin).toBe(8.0);
    expect(googleRep.poas).toBe(0.8);

    // Meta Campaign check
    const metaRep = reports.find((r) => r.campaignId === 'camp-meta-1')!;
    expect(metaRep).toBeDefined();
    expect(metaRep.spend).toBe(25.0);
    // Net Margin calculations:
    // Gross Rev: 200
    // COGS: 150
    // Gross Margin: 200 - 150 = 50
    // Net Margin: 50
    // POAS: 50 / 25 = 2.0
    expect(metaRep.contributionMargin).toBe(50.0);
    expect(metaRep.poas).toBe(2.0);

    // Sorting order check: POAS ASC -> camp-google-1 (0.8) then camp-meta-1 (2.0)
    expect(reports[0].campaignId).toBe('camp-google-1');
    expect(reports[1].campaignId).toBe('camp-meta-1');
  });
});
