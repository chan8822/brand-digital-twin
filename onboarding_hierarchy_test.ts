import {GoogleAdsAdapter} from './google_ads_adapter';
import {GoogleMerchantAdapter} from './google_merchant_adapter';
import {OnboardingWizard} from './onboarding_wizard';
import {RiskRadar} from './risk_radar';
import {SupabaseClient} from './supabase_client';
import {
  GovernanceEngine,
  Context,
  AuditSink,
  CircuitBreaker,
  TrustLedger,
  Tenant,
  Role,
} from './governance_engine';

describe('Account Hierarchy Onboarding & Linking integration', () => {
  let db: SupabaseClient;
  let adsAdapter: GoogleAdsAdapter;
  let gmcAdapter: GoogleMerchantAdapter;
  let wizard: OnboardingWizard;
  let governance: GovernanceEngine;
  let radar: RiskRadar;
  let ctx: Context;

  const tenantId = 'tenant-brand-twin';

  beforeEach(async () => {
    db = new SupabaseClient('https://mock.supabase.co', 'mock-key', true);
    db.setTenantContext(tenantId);

    adsAdapter = new GoogleAdsAdapter('mcc-root', 'dev-token', 'mock-token', tenantId);
    gmcAdapter = new GoogleMerchantAdapter('gmc-mca-root', tenantId);

    wizard = new OnboardingWizard(db);

    const mockAuditSink: AuditSink = {
      record: async () => {},
    };
    const trustLedger = new TrustLedger();
    const circuitBreaker = new CircuitBreaker();
    governance = new GovernanceEngine(
      mockAuditSink,
      trustLedger,
      circuitBreaker,
      undefined,
      undefined,
      db,
    );

    // Seed governance trust score for Google Ads so it has permission to execute immediately
    await db.saveTrustTier(tenantId, 'pause', 4);
    await db.saveTrustTier(tenantId, 'update_feed', 4);

    radar = new RiskRadar(governance, adsAdapter, db, tenantId);

    const tenant: Tenant = {
      tenantId,
      policy: {
        maxDailyDollarsRisk: 10000,
        maxBudgetMovePct: 1.0,
        minConfidence: 0.0,
        escalationRole: 'cmo',
      },
    };
    const role: Role = {
      permits: () => true,
    };
    ctx = {
      tenant,
      role,
      verifyWindowMs: 100,
    };
  });

  it('should recursively discover and sync Google Ads MCC & GMC MCA sub-merchants', async () => {
    const syncRes = await wizard.discoverAndSyncHierarchy(
      tenantId,
      'mcc-root',
      'gmc-mca-root',
      adsAdapter,
      gmcAdapter
    );

    expect(syncRes.platformAccountsCount).toBe(11); // 7 ads accounts + 4 GMC accounts

    const dbAccounts = await db.getPlatformAccounts(tenantId);
    expect(dbAccounts.length).toBe(11);

    // Verify root manager
    const rootMcc = dbAccounts.find((a) => a.platform_account_id === 'mcc-root');
    expect(rootMcc).toBeDefined();
    expect(rootMcc?.account_type).toBe('manager');

    // Verify sub-MCC
    const subMcc = dbAccounts.find((a) => a.platform_account_id === 'sub-mcc-x');
    expect(subMcc).toBeDefined();
    expect(subMcc?.parent_account_id).toBe('acc-mcc-root');

    // Verify sub-account D (under sub-MCC)
    const subD = dbAccounts.find((a) => a.platform_account_id === 'ads-sub-d');
    expect(subD).toBeDefined();
    expect(subD?.parent_account_id).toBe('acc-sub-mcc-x');
    expect(subD?.account_name).toBe('Nike Reseller Sub');
  });

  it('should auto-link accounts based on name/domain heuristics and merchant links', async () => {
    // 1. Discover hierarchy
    await wizard.discoverAndSyncHierarchy(tenantId, 'mcc-root', 'gmc-mca-root', adsAdapter, gmcAdapter);

    // 2. Add Shopify storefront platform account manually to simulate seed state
    await db.savePlatformAccount({
      account_id: 'acc-store-nike',
      tenant_id: tenantId,
      platform: 'shopify',
      platform_account_id: 'nike-us.myshopify.com',
      account_name: 'Nike Storefront',
      account_type: 'storefront',
      status: 'active',
      ingested_at: new Date().toISOString(),
    });

    // 3. Execute auto-linking engine
    const linkRes = await wizard.autoLinkAccounts(tenantId);
    expect(linkRes.linksCreated).toBeGreaterThanOrEqual(4);

    const dbLinks = await db.getAccountLinks(tenantId);
    
    // Check Google Ads sub-a matches GMC sub-a
    const adsToGmcLink = dbLinks.find(
      (l) => l.account_id_a === 'acc-ads-sub-a' && l.account_id_b === 'acc-gmc-sub-a'
    );
    expect(adsToGmcLink).toBeDefined();
    expect(adsToGmcLink?.link_type).toBe('ads_to_merchant');
    expect(adsToGmcLink?.confidence).toBe(1.0);

    // Check GMC sub-a matches Shopify store (fuzzy name matching 'nike-us' to 'Nike Storefront')
    const gmcToStoreLink = dbLinks.find(
      (l) => l.account_id_a === 'acc-gmc-sub-a' && l.account_id_b === 'acc-store-nike'
    );
    expect(gmcToStoreLink).toBeDefined();
    expect(gmcToStoreLink?.link_type).toBe('merchant_to_storefront');
    expect(gmcToStoreLink?.confidence).toBe(0.9);
  });

  it('should build SKU mapping and execute targeted Ad Group pause on stockout', async () => {
    // 1. Seed SKU Product ad links mapping Nike variant to a specific Ad Group
    const variantId = 'var-nike-air-max';
    const gmcOfferId = 'offer-nike-air-max';
    const adsAdGroupId = 'ag-nike-shoes';
    const campaignId = 'c1';

    await wizard.buildSkuAdLinks(tenantId, [
      {
        variantId,
        gmcOfferId,
        gmcAccountId: 'gmc-sub-a',
        adsAccountId: 'ads-sub-a',
        adsCampaignId: campaignId,
        adsAdGroupId,
      },
    ]);

    // 2. Verify mapping exists in database
    const skuLinks = await db.getProductAdLinks(tenantId);
    expect(skuLinks.length).toBe(1);
    expect(skuLinks[0].variant_id).toBe(variantId);
    expect(skuLinks[0].ads_ad_group_id).toBe(adsAdGroupId);

    // 3. Seed VariantInventory in Risk Radar (out of stock)
    radar.seedInventory({
      variantId,
      sku: 'nike-air-max-sku',
      qty: 0, // Stockout!
      promotedCampaignIds: [], // Empty promotedCampaignIds to force DB link lookup
    });

    // 4. Run Risk Radar Scan
    const scanResults = await radar.scanStockouts(ctx);

    // Risk Radar should pause the targeted Ad Group via DB mapping lookup
    expect(scanResults).toContain(`paused_ad_group_${adsAdGroupId}_for_nike-air-max-sku`);

    // Verify ad group simulation status in Google Ads Adapter
    const adgState = adsAdapter.getSimulatedAdGroup(adsAdGroupId);
    expect(adgState).toBeDefined();
    expect(adgState?.status).toBe('PAUSED');
  });
});
