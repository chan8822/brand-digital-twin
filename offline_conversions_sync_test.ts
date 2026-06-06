import {SupabaseClient} from './supabase_client';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {MetaAdsAdapter} from './meta_ads_adapter';
import {OfflineConversionsSync} from './offline_conversions_sync';

describe('Offline Profit Conversions Sync Tests', () => {
  let db: SupabaseClient;
  let googleAdapter: GoogleAdsAdapter;
  let metaAdapter: MetaAdsAdapter;
  let syncEngine: OfflineConversionsSync;

  beforeEach(() => {
    db = new SupabaseClient('mock-url', 'mock-key', true);
    db.setTenantContext('tenant-offline');
    googleAdapter = new GoogleAdsAdapter('cust-123', 'dev-tok', 'mock-token', 'tenant-offline');
    metaAdapter = new MetaAdsAdapter('act-123', 'mock_access_token', 'tenant-offline');
    syncEngine = new OfflineConversionsSync(db);
  });

  it('should calculate contribution margin and upload correct offline restatements to Google and Meta', async () => {
    // 1. Seed two variants:
    // Var A: Price = 50, Cost = 20
    // Var B: Price = 100, Cost = 40
    await Promise.all([
      db.saveVariant({
        variant_id: 'var-a',
        sku: 'SKU-A',
        price: 50,
        cost: 20,
        title: 'Variant A',
        tenant_id: 'tenant-offline',
        ingested_at: new Date().toISOString(),
      }),
      db.saveVariant({
        variant_id: 'var-b',
        sku: 'SKU-B',
        price: 100,
        cost: 40,
        title: 'Variant B',
        tenant_id: 'tenant-offline',
        ingested_at: new Date().toISOString(),
      }),
    ]);

    // 2. Seed Order 1 (Google Conversion)
    // Placed: gross = 100 (2 units of Var A), discount = 10. tax = 5, shipping charged = 12.
    // COGS = 2 * 20 = 40.
    // Fulfillment cost = shipping 15, marketplace 2. Total fulfillment = 17.
    // Positive Gross Revenue = 100 - 10 = 90.
    // Gross Margin = (50 - 5 - 20) * 2 = 50.
    // Allocated Fulfillment = 17.
    // Contribution Margin = 50 - 0 - 17 = 33.
    await db.saveOrder({
      order_id: 'ord-google',
      customer_id: 'cust-g',
      account_id: null,
      channel: 'web',
      surface: 'shopify',
      placed_at: '2026-06-01T10:00:00Z',
      currency: 'USD',
      gross_revenue: 100,
      total_discounts: 10,
      total_tax: 5,
      shipping_charged: 12,
      status: 'paid',
      tenant_id: 'tenant-offline',
      source_system: 'shopify',
      source_id: 'shopify-g',
      source_version: 'v1',
      ingested_at: '2026-06-01T10:05:00Z',
    });

    await db.saveOrderLine({
      order_line_id: 'ol-g1',
      order_id: 'ord-google',
      variant_id: 'var-a',
      sku: 'SKU-A',
      qty: 2,
      unit_price: 50,
      line_discount: 5,
      unit_cost: 20,
      tenant_id: 'tenant-offline',
      source_system: 'shopify',
      source_id: 'ol-g1',
      source_version: 'v1',
      ingested_at: new Date().toISOString(),
    });

    await db.saveFulfillmentCost({
      order_id: 'ord-google',
      shipping_cost: 15,
      marketplace_fee: 2,
      carrier: 'UPS',
      tenant_id: 'tenant-offline',
      source_system: 'shopify',
      source_id: 'fc-g',
      source_version: 'v1',
      ingested_at: '2026-06-01T11:00:00Z',
    });

    // 3. Seed Order 2 (Meta Conversion)
    // Placed: gross = 100 (1 unit of Var B), discount = 0.
    // COGS = 40. Fulfillment = shipping 8, marketplace 0. Total fulfillment = 8.
    // Gross Margin = 100 - 40 = 60.
    // Contribution Margin = 60 - 8 = 52.
    await db.saveOrder({
      order_id: 'ord-meta',
      customer_id: 'cust-m',
      account_id: null,
      channel: 'web',
      surface: 'shopify',
      placed_at: '2026-06-01T11:00:00Z',
      currency: 'USD',
      gross_revenue: 100,
      total_discounts: 0,
      total_tax: 5,
      shipping_charged: 5,
      status: 'paid',
      tenant_id: 'tenant-offline',
      source_system: 'shopify',
      source_id: 'shopify-m',
      source_version: 'v1',
      ingested_at: '2026-06-01T11:05:00Z',
    });

    await db.saveOrderLine({
      order_line_id: 'ol-m1',
      order_id: 'ord-meta',
      variant_id: 'var-b',
      sku: 'SKU-B',
      qty: 1,
      unit_price: 100,
      line_discount: 0,
      unit_cost: 40,
      tenant_id: 'tenant-offline',
      source_system: 'shopify',
      source_id: 'ol-m1',
      source_version: 'v1',
      ingested_at: new Date().toISOString(),
    });

    await db.saveFulfillmentCost({
      order_id: 'ord-meta',
      shipping_cost: 8,
      marketplace_fee: 0,
      carrier: 'FEDEX',
      tenant_id: 'tenant-offline',
      source_system: 'shopify',
      source_id: 'fc-m',
      source_version: 'v1',
      ingested_at: '2026-06-01T12:00:00Z',
    });

    // 4. Seed touchpoints
    await Promise.all([
      db.saveTouchpoint({
        touchpoint_id: 'tp-g',
        customer_id: 'cust-g',
        campaign_id: 'camp-gclid-GCLID123XYZ',
        order_id: 'ord-google',
        occurred_at: '2026-06-01T09:50:00Z',
        type: 'Purchase',
        tenant_id: 'tenant-offline',
        source_system: 'sgtm',
        ingested_at: '2026-06-01T10:05:00Z',
      }),
      db.saveTouchpoint({
        touchpoint_id: 'tp-m',
        customer_id: 'cust-m',
        campaign_id: 'camp-fbclid-FBCLID999ABC',
        order_id: 'ord-meta',
        occurred_at: '2026-06-01T10:45:00Z',
        type: 'Purchase',
        tenant_id: 'tenant-offline',
        source_system: 'sgtm',
        ingested_at: '2026-06-01T11:05:00Z',
      }),
    ]);

    // Spies to intercept uploads
    spyOn(googleAdapter, 'uploadConversionAdjustments').and.callThrough();
    spyOn(metaAdapter, 'uploadOfflineEvents').and.callThrough();

    // 5. Run Sync
    const syncRes = await syncEngine.syncConversions(
      'tenant-offline',
      googleAdapter,
      metaAdapter,
      'pixel-12345',
    );

    // Verify sync result summary counts
    expect(syncRes.googleSuccessCount).toBe(1);
    expect(syncRes.googleFailCount).toBe(0);
    expect(syncRes.metaSuccessCount).toBe(1);
    expect(syncRes.metaFailCount).toBe(0);

    // Verify Google Ads adapter payload structure and values
    expect(googleAdapter.uploadConversionAdjustments).toHaveBeenCalled();
    const googleCallArgs = (googleAdapter.uploadConversionAdjustments as jasmine.Spy).calls.mostRecent().args;
    const googleCustId = googleCallArgs[0];
    const googlePayload = googleCallArgs[1];

    expect(googleCustId).toBeDefined();
    expect(googlePayload.length).toBe(1);
    expect(googlePayload[0].gclidDateTimePair.gclid).toBe('GCLID123XYZ');
    expect(googlePayload[0].adjustmentType).toBe('RESTATEMENT');
    expect(googlePayload[0].restatementValue.adjustedValue).toBe(33); // 33 is Contribution Margin

    // Verify Meta Ads adapter payload structure and values
    expect(metaAdapter.uploadOfflineEvents).toHaveBeenCalled();
    const metaCallArgs = (metaAdapter.uploadOfflineEvents as jasmine.Spy).calls.mostRecent().args;
    const metaPixelId = metaCallArgs[0];
    const metaPayload = metaCallArgs[1];

    expect(metaPixelId).toBe('pixel-12345');
    expect(metaPayload.length).toBe(1);
    expect(metaPayload[0].event_name).toBe('Purchase');
    expect(metaPayload[0].user_data.fbc).toBe('fb.1.1.FBCLID999ABC');
    expect(metaPayload[0].custom_data.value).toBe(52); // 52 is Contribution Margin

    // 6. Verify that DB touchpoints were updated with synced timestamps
    const updatedTouchpoints = await db.getTouchpoints('tenant-offline');
    const tpG = updatedTouchpoints.find((t) => t.touchpoint_id === 'tp-g');
    const tpM = updatedTouchpoints.find((t) => t.touchpoint_id === 'tp-m');

    expect(tpG).toBeDefined();
    expect(tpG!.google_synced_at).toBeTruthy();
    expect(tpM).toBeDefined();
    expect(tpM!.meta_synced_at).toBeTruthy();

    // 7. Verify subsequent sync processes 0 new items
    const secondSyncRes = await syncEngine.syncConversions(
      'tenant-offline',
      googleAdapter,
      metaAdapter,
      'pixel-12345',
    );
    expect(secondSyncRes.googleSuccessCount).toBe(0);
    expect(secondSyncRes.metaSuccessCount).toBe(0);
  });
});
