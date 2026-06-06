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

  describe('Direct Unit Tests', () => {
    let db: SupabaseClient;
    let calculator: PoasCalculator;
    const tenantId = 'tenant_unit_1';

    beforeEach(() => {
      db = new SupabaseClient(undefined, undefined, true);
      db.setTenantContext(tenantId);
      calculator = new PoasCalculator(db);
    });

    it('verifies margin, COGS, discounts, refunds, and correct fulfillment allocation with returns', async () => {
      // Seed order: Line 1: unit_price=100, line_discount=10, qty=1, unit_cost=40 (grossMargin=50)
      // Line 2 (return): unit_price=50, line_discount=0, qty=-1, unit_cost=20 (grossMargin=-30)
      // Total order gross revenue = 90 - 50 = 40.
      // Total fulfillment cost = 20 (shipping=15, marketplace=5).
      // Line 1 should be allocated all 20 of fulfillment because Line 2 is return (<= 0).
      // Line 1 contribution: 50 (grossMargin) - 20 (allocated) = 30.
      // Line 2 contribution: -30 (grossMargin).
      // Overall contribution: 30 - 30 = 0.
      
      await db.saveOrder({
        order_id: 'ord-1',
        customer_id: 'cust-1',
        placed_at: '2026-06-01T12:00:00Z',
        gross_revenue: 40.0,
        total_discounts: 10.0,
        tenant_id: tenantId,
      } as any);

      await db.saveOrderLine({
        order_line_id: 'line-1',
        order_id: 'ord-1',
        variant_id: 'v1',
        sku: 'SKU-1',
        qty: 1,
        unit_price: 100.0,
        line_discount: 10.0,
        unit_cost: 40.0,
        tenant_id: tenantId,
      } as any);

      await db.saveOrderLine({
        order_line_id: 'line-2',
        order_id: 'ord-1',
        variant_id: 'v2',
        sku: 'SKU-2',
        qty: -1,
        unit_price: 50.0,
        line_discount: 0,
        unit_cost: 20.0,
        tenant_id: tenantId,
      } as any);

      await db.saveFulfillmentCost({
        order_id: 'ord-1',
        shipping_cost: 15.0,
        marketplace_fee: 5.0,
        tenant_id: tenantId,
      } as any);

      await db.saveCampaign({
        campaign_id: 'camp-1',
        name: 'Camp 1',
        platform: 'google',
        status: 'active',
        tenant_id: tenantId,
      } as any);

      await db.saveSpendFact({
        campaign_id: 'camp-1',
        platform: 'google',
        day: '2026-06-01',
        amount: 10.0,
        tenant_id: tenantId,
      } as any);

      await db.saveTouchpoint({
        touchpoint_id: 'tp-1',
        customer_id: 'cust-1',
        campaign_id: 'camp-1',
        occurred_at: '2026-06-01T11:00:00Z',
        type: 'click',
        tenant_id: tenantId,
      } as any);

      const reports = await calculator.calculate(tenantId);
      const rep = reports.find(r => r.campaignId === 'camp-1')!;
      expect(rep).toBeDefined();
      // Total margin = Line 1 margin (100 - 10 - 40 - 20 = 30) + Line 2 margin (-50 - (-20) = -30) = 0.
      expect(rep.contributionMargin).toBe(0.0);
      expect(rep.poas).toBe(0.0);
    });

    it('verifies 30-day attribution window boundaries', async () => {
      // Touchpoint exactly 30 days ago (should attribute)
      // Order at 2026-06-30T12:00:00Z
      // TP 1: camp-in-window, occurred at 2026-05-31T12:00:00Z (exactly 30 days ago)
      // TP 2: camp-out-window, occurred at 2026-05-31T11:59:59Z (30 days and 1 second ago)
      
      await db.saveOrder({
        order_id: 'ord-in',
        customer_id: 'cust-in',
        placed_at: '2026-06-30T12:00:00Z',
        gross_revenue: 100.0,
        tenant_id: tenantId,
      } as any);

      await db.saveOrderLine({
        order_line_id: 'line-in',
        order_id: 'ord-in',
        qty: 1,
        unit_price: 100.0,
        unit_cost: 50.0,
        tenant_id: tenantId,
      } as any);

      await db.saveTouchpoint({
        touchpoint_id: 'tp-in',
        customer_id: 'cust-in',
        campaign_id: 'camp-in',
        occurred_at: '2026-05-31T12:00:00Z', // 30 days ago
        type: 'click',
        tenant_id: tenantId,
      } as any);

      // Order out of window
      await db.saveOrder({
        order_id: 'ord-out',
        customer_id: 'cust-out',
        placed_at: '2026-06-30T12:00:00Z',
        gross_revenue: 100.0,
        tenant_id: tenantId,
      } as any);

      await db.saveOrderLine({
        order_line_id: 'line-out',
        order_id: 'ord-out',
        qty: 1,
        unit_price: 100.0,
        unit_cost: 50.0,
        tenant_id: tenantId,
      } as any);

      await db.saveTouchpoint({
        touchpoint_id: 'tp-out',
        customer_id: 'cust-out',
        campaign_id: 'camp-out',
        occurred_at: '2026-05-31T11:59:59Z', // 30 days + 1 second ago
        type: 'click',
        tenant_id: tenantId,
      } as any);

      await db.saveCampaign({ campaign_id: 'camp-in', name: 'In', platform: 'google', status: 'active', tenant_id: tenantId } as any);
      await db.saveCampaign({ campaign_id: 'camp-out', name: 'Out', platform: 'google', status: 'active', tenant_id: tenantId } as any);

      const reports = await calculator.calculate(tenantId);
      
      const repIn = reports.find(r => r.campaignId === 'camp-in')!;
      expect(repIn.orders).toBe(1);

      const repOut = reports.find(r => r.campaignId === 'camp-out')!;
      expect(repOut.orders).toBe(0);

      // The out of window order should fallback to ORGANIC
      const organic = reports.find(r => r.campaignId === 'ORGANIC')!;
      expect(organic).toBeDefined();
      expect(organic.orders).toBe(1);
    });

    it('verifies last-touch attribution logic sorting order', async () => {
      // Order placed 2026-06-10T12:00:00Z
      // TP 1: camp-old, occurred 2026-06-05T12:00:00Z
      // TP 2: camp-new, occurred 2026-06-09T12:00:00Z
      // Should attribute to camp-new
      
      await db.saveOrder({
        order_id: 'ord-last-touch',
        customer_id: 'cust-last',
        placed_at: '2026-06-10T12:00:00Z',
        gross_revenue: 100.0,
        tenant_id: tenantId,
      } as any);

      await db.saveOrderLine({
        order_line_id: 'line-last',
        order_id: 'ord-last-touch',
        qty: 1,
        unit_price: 100.0,
        unit_cost: 50.0,
        tenant_id: tenantId,
      } as any);

      await db.saveTouchpoint({
        touchpoint_id: 'tp-old',
        customer_id: 'cust-last',
        campaign_id: 'camp-old',
        occurred_at: '2026-06-05T12:00:00Z',
        type: 'click',
        tenant_id: tenantId,
      } as any);

      await db.saveTouchpoint({
        touchpoint_id: 'tp-new',
        customer_id: 'cust-last',
        campaign_id: 'camp-new',
        occurred_at: '2026-06-09T12:00:00Z', // closer to order
        type: 'click',
        tenant_id: tenantId,
      } as any);

      await db.saveCampaign({ campaign_id: 'camp-old', name: 'Old', platform: 'google', status: 'active', tenant_id: tenantId } as any);
      await db.saveCampaign({ campaign_id: 'camp-new', name: 'New', platform: 'google', status: 'active', tenant_id: tenantId } as any);

      const reports = await calculator.calculate(tenantId);
      const repNew = reports.find(r => r.campaignId === 'camp-new')!;
      expect(repNew.orders).toBe(1);

      const repOld = reports.find(r => r.campaignId === 'camp-old')!;
      expect(repOld.orders).toBe(0);
    });

    it('verifies organic pseudo-campaign exclusion when margin and revenue are 0', async () => {
      // Order fully attributed, no organic orders, no organic touchpoints
      await db.saveOrder({
        order_id: 'ord-org-excl',
        customer_id: 'cust-org',
        placed_at: '2026-06-10T12:00:00Z',
        gross_revenue: 100.0,
        tenant_id: tenantId,
      } as any);

      await db.saveOrderLine({
        order_line_id: 'line-org',
        order_id: 'ord-org-excl',
        qty: 1,
        unit_price: 100.0,
        unit_cost: 50.0,
        tenant_id: tenantId,
      } as any);

      await db.saveTouchpoint({
        touchpoint_id: 'tp-org',
        customer_id: 'cust-org',
        campaign_id: 'camp-only',
        occurred_at: '2026-06-09T12:00:00Z',
        type: 'click',
        tenant_id: tenantId,
      } as any);

      await db.saveCampaign({ campaign_id: 'camp-only', name: 'Only', platform: 'google', status: 'active', tenant_id: tenantId } as any);

      const reports = await calculator.calculate(tenantId);
      const organic = reports.find(r => r.campaignId === 'ORGANIC');
      expect(organic).toBeUndefined(); // Should be excluded since margin & revenue are 0
    });

    it('verifies report sorting hierarchy with null POAS', async () => {
      await db.saveCampaign({ campaign_id: 'camp-null-1', name: 'Null 1', platform: 'google', status: 'active', tenant_id: tenantId } as any);
      await db.saveCampaign({ campaign_id: 'camp-null-2', name: 'Null 2', platform: 'google', status: 'active', tenant_id: tenantId } as any);

      await db.saveSpendFact({ campaign_id: 'camp-null-1', platform: 'google', day: '2026-06-01', amount: 100.0, tenant_id: tenantId } as any);
      await db.saveSpendFact({ campaign_id: 'camp-null-2', platform: 'google', day: '2026-06-01', amount: 200.0, tenant_id: tenantId } as any);

      const reports = await calculator.calculate(tenantId);
      
      const idx1 = reports.findIndex(r => r.campaignId === 'camp-null-1');
      const idx2 = reports.findIndex(r => r.campaignId === 'camp-null-2');
      expect(idx2).toBeLessThan(idx1);
    });
  });
});
