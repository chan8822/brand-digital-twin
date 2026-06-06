import {GoogleAdsAdapter} from './google_ads_adapter';
import {RiskRadar} from './risk_radar';
import {GovernanceEngine, AuditSink, TrustLedger, CircuitBreaker} from './governance_engine';
import {SupabaseClient} from './supabase_client';
import {Context} from './governance_types';

describe('SKU-to-Ad Group Budget Redistribution Tests', () => {
  let db: SupabaseClient;
  let adsAdapter: GoogleAdsAdapter;
  let engine: GovernanceEngine;
  let radar: RiskRadar;
  let ctx: Context;

  beforeEach(() => {
    db = new SupabaseClient('mock-url', 'mock-key', true);
    db.setTenantContext('tenant-redist');

    const mockAuditSink: AuditSink = {
      record: async () => {},
    };
    const trustLedger = new TrustLedger();
    const circuitBreaker = new CircuitBreaker();

    // Use full/permissive mock settings
    engine = new GovernanceEngine(mockAuditSink, trustLedger, circuitBreaker, undefined, undefined, db);
    adsAdapter = new GoogleAdsAdapter('mock-cust-redist', 'tenant-redist', 'mock-token', 'mock-dev-token');
    radar = new RiskRadar(engine, adsAdapter, db, 'tenant-redist');

    ctx = {
      tenant: {
        tenantId: 'tenant-redist',
        policy: {
          maxDailyDollarsRisk: 10000, // high limits for testing
          maxBudgetMovePct: 0.5,
          minConfidence: 0.8,
          escalationRole: 'cmo',
        },
      },
      role: {name: 'admin', permits: () => true},
      verifyWindowMs: 0,
    };
  });

  it('should scale down low-margin SKU with high spend and low ROI, and scale up high-margin winner with low spend', async () => {
    // 1. Seed variant 1: Low-margin SKU
    // Price = 20, COGS = 16 (Margin = 4 / 20 = 20% < 30%)
    // Spend = 200, ROI = 1.2 < 2.0
    radar.seedInventory({
      variantId: 'var-low-margin',
      sku: 'SKU-LOW-MARG',
      qty: 50,
      promotedCampaignIds: ['c-low-marg'],
      lowStockThreshold: 5,
      price: 20,
      cogs: 16,
      currentSpend: 200,
      roi: 1.2,
    });

    // 2. Seed variant 2: High-margin SKU
    // Price = 100, COGS = 40 (Margin = 60 / 100 = 60% >= 50%)
    // Spend = 30, ROI = 4.0 >= 3.0
    // Qty = 25 > threshold 5
    radar.seedInventory({
      variantId: 'var-high-margin',
      sku: 'SKU-HIGH-MARG',
      qty: 25,
      promotedCampaignIds: ['c-high-marg'],
      lowStockThreshold: 5,
      price: 100,
      cogs: 40,
      currentSpend: 30,
      roi: 4.0,
    });

    // Seed mock product links
    await Promise.all([
      db.saveProductAdLink({
        tenant_id: 'tenant-redist',
        variant_id: 'var-low-margin',
        gmc_offer_id: 'gmc-low',
        gmc_account_id: 'gmc-acc',
        ads_account_id: 'ads-acc',
        ads_campaign_id: 'c-low-marg',
        ads_ad_group_id: 'adg-low',
        confidence: 1.0,
        resolved_at: new Date().toISOString(),
      }),
      db.saveProductAdLink({
        tenant_id: 'tenant-redist',
        variant_id: 'var-high-margin',
        gmc_offer_id: 'gmc-high',
        gmc_account_id: 'gmc-acc',
        ads_account_id: 'ads-acc',
        ads_campaign_id: 'c-high-marg',
        ads_ad_group_id: 'adg-high',
        confidence: 1.0,
        resolved_at: new Date().toISOString(),
      }),
    ]);

    const findings = await radar.scanSKUBudgetRedistribution(ctx);

    expect(findings.length).toBe(2);

    const lowMargFinding = findings.find((f) => f.code.includes('scale_down_low_margin'));
    const highMargFinding = findings.find((f) => f.code.includes('scale_up_high_margin'));

    expect(lowMargFinding).toBeDefined();
    expect(lowMargFinding!.severity).toBe('WARNING');
    expect(lowMargFinding!.suggestedAction).toBeDefined();
    expect(lowMargFinding!.suggestedAction!.op).toBe('scale_budget');
    expect((lowMargFinding!.suggestedAction!.payload as any).scaleFactor).toBe(0.7);

    expect(highMargFinding).toBeDefined();
    expect(highMargFinding!.severity).toBe('OPPORTUNITY');
    expect(highMargFinding!.suggestedAction).toBeDefined();
    expect(highMargFinding!.suggestedAction!.op).toBe('scale_budget');
    expect((highMargFinding!.suggestedAction!.payload as any).scaleFactor).toBe(1.25);
  });
});
