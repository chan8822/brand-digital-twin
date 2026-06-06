import 'jasmine';
import {OnboardingWizard} from './onboarding_wizard';
import {SupabaseClient} from './supabase_client';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {GovernanceEngine, TrustLedger, CircuitBreaker, Context} from './governance_engine';

describe('OnboardingWizard - Margin Discovery Campaign Bug', () => {
  let db: SupabaseClient;
  let wizard: OnboardingWizard;
  const tenantId = 'bug-tenant-123';
  const adsAccountId = 'ads-acc-123';

  beforeEach(() => {
    db = new SupabaseClient('http://mock_url', 'mock_key');
    SupabaseClient.useSharedMockDb = false;
    wizard = new OnboardingWizard(db);
  });

  it('should reproduce the campaign discovery margin basis defect', async () => {
    // 1. Seed order lines that have NO unit_cost (null) but unit_price = 100
    await db.saveOrderLine({
      order_line_id: 'ol-1',
      order_id: 'order-1',
      variant_id: 'var-1',
      sku: 'SKU-A',
      qty: 1,
      unit_price: 100,
      line_discount: 0,
      unit_cost: null as unknown as number, // missing cost
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol-1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });

    // 2. Seed catalog variants that DO have COGS (cost = 80), price = 100.
    // Real margin = (100 - 80) / 100 = 20%.
    // This is below the 40% threshold required for margin discovery.
    await db.saveVariant({
      variant_id: 'var-1',
      sku: 'SKU-A',
      title: 'Variant A',
      price: 100,
      cost: 80, // catalog has COGS
      tenant_id: tenantId,
      ingested_at: new Date().toISOString(),
    });

    const mockAdsAdapter = new GoogleAdsAdapter(
      'mock-cust',
      'mock-dev',
      'mock-tok',
      tenantId,
    );

    const tl = new TrustLedger();
    const cb = new CircuitBreaker();
    const mockAuditSink = { record: async () => {} };
    const governance = new GovernanceEngine(mockAuditSink, tl, cb, undefined, undefined, db);

    // Mock governance to allow auto-execution
    spyOn(governance, 'govern').and.returnValue(
      Promise.resolve({
        status: 'executed',
        result: {
          ok: true,
          auditRef: 'mock-audit-ref',
        },
      })
    );


    const ctx: Context = {
      role: {
        name: 'admin',
        permits: () => true,
      },
      tenant: {
        tenantId,
        policy: {
          maxDailyDollarsRisk: 10000,
          maxBudgetMovePct: 1.0,
          minConfidence: 0.0,
          escalationRole: 'cmo',
        },
      },
      verifyWindowMs: 0,
    };

    // Run the margin discovery campaign generation
    const result = await wizard.generateMarginDiscoveryCampaign(
      tenantId,
      adsAccountId,
      mockAdsAdapter,
      governance,
      ctx
    );

    // If the defect is active:
    // It sees orderLines.length > 0, computes margin = 100 - 0 = 100 (100% margin).
    // It considers SKU-A a high-margin product (>= 40%) and creates the campaign.
    //
    // If the defect is fixed:
    // It should either return 'needs_cogs' because order lines lack COGS,
    // or fallback to variant catalog COGS (20% margin) and return null (since 20% < 40%).
    // It should NOT return a campaign.
    
    console.log('--- FIXED RESULT ---', result);
    
    // The margin calculation bug is fixed: result should be null because real margin is 20% (< 40% threshold).
    expect(result).toBeNull();
  });

  it('should skip items without COGS and not create campaign if remaining are below threshold', async () => {
    // order lines have NO cost, variant has NO cost
    await db.saveOrderLine({
      order_line_id: 'ol-1',
      order_id: 'order-1',
      variant_id: 'var-1',
      sku: 'SKU-A',
      qty: 1,
      unit_price: 100,
      line_discount: 0,
      unit_cost: null as unknown as number,
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol-1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });

    await db.saveVariant({
      variant_id: 'var-1',
      sku: 'SKU-A',
      title: 'Variant A',
      price: 100,
      cost: null as unknown as number, // no cost
      tenant_id: tenantId,
      ingested_at: new Date().toISOString(),
    });

    // Unrelated variant has cost, but margin is 20%
    await db.saveVariant({
      variant_id: 'var-2',
      sku: 'SKU-B',
      title: 'Variant B',
      price: 100,
      cost: 80,
      tenant_id: tenantId,
      ingested_at: new Date().toISOString(),
    });

    const mockAdsAdapter = new GoogleAdsAdapter('mock-cust', 'mock-dev', 'mock-tok', tenantId);
    const governance = new GovernanceEngine({ record: async () => {} }, new TrustLedger(), new CircuitBreaker(), undefined, undefined, db);
    spyOn(governance, 'govern').and.returnValue(Promise.resolve({ status: 'executed', result: { ok: true, auditRef: 'mock-audit-ref' } }));

    const ctx: Context = {
      role: { name: 'admin', permits: () => true },
      tenant: { tenantId, policy: { maxDailyDollarsRisk: 10000, maxBudgetMovePct: 1.0, minConfidence: 0.0, escalationRole: 'cmo' } },
      verifyWindowMs: 0,
    };

    const result = await wizard.generateMarginDiscoveryCampaign(tenantId, adsAccountId, mockAdsAdapter, governance, ctx);
    expect(result).toBeNull();
  });

  it('should fall back to catalog basis and create campaign if high-margin variants are found in catalog', async () => {
    // order lines have NO cost, variant has NO cost
    await db.saveOrderLine({
      order_line_id: 'ol-1',
      order_id: 'order-1',
      variant_id: 'var-1',
      sku: 'SKU-A',
      qty: 1,
      unit_price: 100,
      line_discount: 0,
      unit_cost: null as unknown as number,
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol-1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });

    await db.saveVariant({
      variant_id: 'var-1',
      sku: 'SKU-A',
      title: 'Variant A',
      price: 100,
      cost: null as unknown as number, // no cost
      tenant_id: tenantId,
      ingested_at: new Date().toISOString(),
    });

    // Unrelated variant has high margin (60%)
    await db.saveVariant({
      variant_id: 'var-2',
      sku: 'SKU-B',
      title: 'Variant B',
      price: 100,
      cost: 40,
      tenant_id: tenantId,
      ingested_at: new Date().toISOString(),
    });

    const mockAdsAdapter = new GoogleAdsAdapter('mock-cust', 'mock-dev', 'mock-tok', tenantId);
    const governance = new GovernanceEngine({ record: async () => {} }, new TrustLedger(), new CircuitBreaker(), undefined, undefined, db);
    spyOn(governance, 'govern').and.returnValue(Promise.resolve({ status: 'executed', result: { ok: true, auditRef: 'mock-audit-ref' } }));

    const ctx: Context = {
      role: { name: 'admin', permits: () => true },
      tenant: { tenantId, policy: { maxDailyDollarsRisk: 10000, maxBudgetMovePct: 1.0, minConfidence: 0.0, escalationRole: 'cmo' } },
      verifyWindowMs: 0,
    };

    const result = await wizard.generateMarginDiscoveryCampaign(tenantId, adsAccountId, mockAdsAdapter, governance, ctx);
    expect(result).not.toBeNull();
    expect(result).not.toBe('needs_cogs');
    if (result && typeof result === 'object') {
      expect(result.marginBasis).toBe('catalog');
      expect(result.targetSkus).toEqual(['SKU-B']);
    }
  });
});


