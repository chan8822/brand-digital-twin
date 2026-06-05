import 'jasmine';
import {ProfitReadinessCalculator} from './profit_readiness';
import {SupabaseClient} from './supabase_client';

describe('ProfitReadinessCalculator', () => {
  let db: SupabaseClient;
  let calculator: ProfitReadinessCalculator;
  const tenantId = 'tenant_readiness_test';

  beforeEach(() => {
    db = new SupabaseClient('http://mock-url', 'mock-key', true);
    SupabaseClient.resetGlobalMockDb();
    SupabaseClient.useSharedMockDb = true;
    calculator = new ProfitReadinessCalculator(db);
  });

  it('should return incomplete status with score 0 for empty tenant', async () => {
    const res = await calculator.calculate(tenantId);
    expect(res.score).toBe(0);
    expect(res.status).toBe('incomplete');
    expect(res.factors.shopifyLinked).toBeFalse();
    expect(res.factors.cogsCoverage).toBe(0);
    expect(res.factors.historicalOrdersLoaded).toBeFalse();
  });

  it('should return directional_only status for partially connected tenant with moderate COGS coverage', async () => {
    // 1. Link Shopify and Google Ads
    await db.saveCredential({
      tenant_id: tenantId,
      platform: 'shopify',
      credential_key: 'oauth_token',
      encrypted_value: 'val',
      refresh_token: null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    });
    await db.saveCredential({
      tenant_id: tenantId,
      platform: 'google',
      credential_key: 'oauth_token',
      encrypted_value: 'val',
      refresh_token: null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    });

    // 2. Add variants: 2 variants, 1 has cogs (50% coverage)
    await db.saveVariant({
      variant_id: 'v1',
      sku: 'sku1',
      title: 'V1',
      price: 10,
      cost: 5,
      tenant_id: tenantId,
      ingested_at: new Date().toISOString(),
    });
    await db.saveVariant({
      variant_id: 'v2',
      sku: 'sku2',
      title: 'V2',
      price: 10,
      cost: null, // missing cogs
      tenant_id: tenantId,
      ingested_at: new Date().toISOString(),
    });

    const res = await calculator.calculate(tenantId);
    // Score breakdown: shopify(15) + google(15) + cogs_coverage(50% of 20 = 10) = 40
    expect(res.score).toBe(40);
    expect(res.factors.cogsCoverage).toBe(50);
    expect(res.status).toBe('directional_only');
  });

  it('should return ready status for fully connected tenant with high COGS coverage and loaded orders', async () => {
    // 1. Link all platforms
    const platforms = ['shopify', 'google', 'meta', 'plaid'];
    for (const p of platforms) {
      await db.saveCredential({
        tenant_id: tenantId,
        platform: p,
        credential_key: 'oauth_token',
        encrypted_value: 'val',
        refresh_token: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      });
    }

    // 2. Add variants: 5 variants, 4 have cogs (80% coverage)
    for (let i = 1; i <= 5; i++) {
      await db.saveVariant({
        variant_id: `v${i}`,
        sku: `sku${i}`,
        title: `V${i}`,
        price: 10,
        cost: i === 5 ? null : 4, // 5th variant has missing cogs
        tenant_id: tenantId,
        ingested_at: new Date().toISOString(),
      });
    }

    // 3. Add at least one order
    await db.saveOrder({
      order_id: 'o-123',
      customer_id: null,
      account_id: null,
      channel: 'web',
      surface: 'shopify',
      placed_at: new Date().toISOString(),
      currency: 'USD',
      gross_revenue: 100,
      total_discounts: 0,
      total_tax: 0,
      shipping_charged: 0,
      status: 'paid',
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'o-123',
      source_version: '1',
      ingested_at: new Date().toISOString(),
    });

    const res = await calculator.calculate(tenantId);
    // Score breakdown: shopify(15) + google(15) + meta(15) + bank(15) + orders(20) + cogs_coverage(80% of 20 = 16) = 96
    expect(res.score).toBe(96);
    expect(res.factors.cogsCoverage).toBe(80);
    expect(res.factors.historicalOrdersLoaded).toBeTrue();
    expect(res.status).toBe('ready');
  });
});
