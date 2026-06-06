import {GoogleAdsAdapter} from './google_ads_adapter';
import {GoogleMerchantAdapter} from './google_merchant_adapter';
import {RiskRadar} from './risk_radar';
import {
  GovernanceEngine,
  AuditSink,
  TrustLedger,
  CircuitBreaker,
} from './governance_engine';
import {SupabaseClient} from './supabase_client';
import {Context} from './governance_types';
import {PinoLogger} from './observability';

describe('GEO & Merchant Feed Diagnostics Tests', () => {
  let db: SupabaseClient;
  let adsAdapter: GoogleAdsAdapter;
  let merchantAdapter: GoogleMerchantAdapter;
  let engine: GovernanceEngine;
  let radar: RiskRadar;
  let ctx: Context;

  beforeEach(() => {
    // Instantiate in mock mode
    db = new SupabaseClient('mock-url', 'mock-key', true);
    db.setTenantContext('tenant-a');
    
    const mockAuditSink: AuditSink = {
      record: async () => {},
    };
    const trustLedger = new TrustLedger();
    const circuitBreaker = new CircuitBreaker();

    engine = new GovernanceEngine(mockAuditSink, trustLedger, circuitBreaker, undefined, undefined, db);
    adsAdapter = new GoogleAdsAdapter('mock-cust-123', 'tenant-a', 'mock-token', 'mock-dev-token');
    merchantAdapter = new GoogleMerchantAdapter('mock-merchant-456', 'tenant-a', 'mock-token');
    
    radar = new RiskRadar(engine, adsAdapter, db, 'tenant-a');
    
    ctx = {
      tenant: {
        tenantId: 'tenant-a',
        policy: {
          maxDailyDollarsRisk: 1000,
          maxBudgetMovePct: 0.2,
          minConfidence: 0.8,
          escalationRole: 'cmo',
        },
      },
      role: {name: 'admin', permits: () => true},
      verifyWindowMs: 0,
    };
  });

  it('should detect landing page alt tag and JSON-LD schema issues during GEO scan', async () => {
    // Seed campaigns
    await Promise.all([
      db.saveCampaign({
        campaign_id: 'c1',
        name: 'NutraBoost Energy Search',
        status: 'ENABLED',
        objective: 'SEARCH',
        surface: 'google_search_network',
        source_id: 'c1',
        tenant_id: 'tenant-a',
        platform: 'google_ads',
        source_system: 'google_ads',
        source_version: 'v15',
        ingested_at: new Date().toISOString(),
      }),
      db.saveCampaign({
        campaign_id: 'c2',
        name: 'Hydration Powder Display',
        status: 'ENABLED',
        objective: 'DISPLAY',
        surface: 'google_display_network',
        source_id: 'c2',
        tenant_id: 'tenant-a',
        platform: 'google_ads',
        source_system: 'google_ads',
        source_version: 'v15',
        ingested_at: new Date().toISOString(),
      }),
    ]);

    const findings = await radar.scanLandingPageGEO(ctx);
    
    // c1 has zero issues. c2 has missing JSON-LD and missing alt tag, so only c2 should generate a finding.
    expect(findings.length).toBe(1);

    const c2Finding = findings[0];
    expect(c2Finding.entityId).toBe('c2');
    expect(c2Finding.severity).toBe('WARNING');
    expect(c2Finding.detail).toContain('Missing JSON-LD structured data script');
    expect(c2Finding.detail).toContain('missing descriptive alt attributes');
  });

  it('should detect missing GTINs, shipping tables, and currency mismatches in GMC feed', async () => {
    const findings = await radar.scanMerchantFeedHygiene(ctx, merchantAdapter, 'mock-merchant-456');

    // From mock feed products (prod-a, prod-b, prod-c, prod-d):
    // prod-a: fully clean (0 findings)
    // prod-b: missing GTIN (1 finding)
    // prod-c: missing shipping rules (1 finding)
    // prod-d: currency mismatch EUR vs USD (1 finding)
    expect(findings.length).toBe(3);

    const prodB = findings.find((f) => f.entityId === 'prod-b');
    const prodC = findings.find((f) => f.entityId === 'prod-c');
    const prodD = findings.find((f) => f.entityId === 'prod-d');

    expect(prodB).toBeDefined();
    expect(prodB!.severity).toBe('CRITICAL');
    expect(prodB!.detail).toContain('Missing GTIN');

    expect(prodC).toBeDefined();
    expect(prodC!.detail).toContain('Missing shipping rate table');

    expect(prodD).toBeDefined();
    expect(prodD!.detail).toContain("Currency mismatch: Feed contains 'EUR' but target market is 'USD'");
  });
});
