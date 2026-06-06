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
    SupabaseClient.useSharedMockDb = false;
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
    governance.registerWhitelist(tenantId, {
      op: 'create',
      entity: 'campaign',
      maxCost: 100000,
    });

    // Seed governance trust score for Google Ads so it has permission to execute immediately
    await db.saveTrustTier(tenantId, 'pause', 4);
    await db.saveTrustTier(tenantId, 'update_feed', 4);
    await db.saveTrustTier(tenantId, 'create', 4);

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
    expect(scanResults.map(f => f.code)).toContain(`paused_ad_group_${adsAdGroupId}_for_nike-air-max-sku`);

    // Verify ad group simulation status in Google Ads Adapter
    const adgState = adsAdapter.getSimulatedAdGroup(adsAdGroupId);
    expect(adgState).toBeDefined();
    expect(adgState?.status).toBe('PAUSED');
  });

  it('should generate a paused cold-start margin discovery campaign targeting high-margin catalog items', async () => {
    // 1. Seed catalog items with varying profit margins in the database
    // Product 1 (High margin: 50% margin) -> Price $100, Cost $50 -> Profit $50
    // Product 2 (Low margin: 20% margin) -> Price $200, Cost $160 -> Profit $40
    await db.saveOrderLine({
      order_line_id: 'ol-p1',
      order_id: 'o-dummy-1',
      variant_id: 'v-p1',
      sku: 'HIGH-MARGIN-SKU',
      qty: 1,
      unit_price: 100,
      line_discount: 0,
      unit_cost: 50,
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol-p1',
      source_version: '1.0',
      ingested_at: new Date().toISOString()
    });
    await db.saveOrderLine({
      order_line_id: 'ol-p2',
      order_id: 'o-dummy-1',
      variant_id: 'v-p2',
      sku: 'LOW-MARGIN-SKU',
      qty: 1,
      unit_price: 200,
      line_discount: 0,
      unit_cost: 160,
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol-p2',
      source_version: '1.0',
      ingested_at: new Date().toISOString()
    });

    // 2. Run onboarding margin discovery campaign generator
    const result = await wizard.generateMarginDiscoveryCampaign(
      tenantId,
      'ads-sub-a',
      adsAdapter,
      governance,
      ctx
    );

    expect(result).toBeDefined();
    expect(result).not.toBe('needs_cogs');
    expect(result).not.toBeNull();

    const campResult = result as {campaignId: string; targetSkus: string[]; marginBasis: string};
    expect(campResult.marginBasis).toBe('orders');
    expect(campResult.targetSkus).toContain('HIGH-MARGIN-SKU');
    expect(campResult.targetSkus).not.toContain('LOW-MARGIN-SKU');

    // 3. Verify campaign was created in PAUSED status in simulated google ads adapter
    const simCamp = adsAdapter.getSimulatedCampaign(campResult.campaignId);
    expect(simCamp).toBeDefined();
    expect(simCamp?.name).toBe('Twin-Discovery: High Margin Catalog');
    expect(simCamp?.status).toBe('PAUSED');
    expect(simCamp?.budget).toBe(500);

    // 4. Verify product ad link was created linking variant to discovery campaign
    const links = await db.getProductAdLinks(tenantId);
    const linkForHigh = links.find((l) => l.variant_id === 'v-p1');
    expect(linkForHigh).toBeDefined();
    expect(linkForHigh?.ads_campaign_id).toBe(campResult.campaignId);

    const linkForLow = links.find((l) => l.variant_id === 'v-p2');
    expect(linkForLow).toBeUndefined(); // Should not link low margin product
  });

  it('should generate a paused discovery campaign using catalog variants when no order history exists', async () => {
    // Seed catalog variants in the database
    // Variant 1 (High margin: 60% margin) -> Price $150, Cost $60
    // Variant 2 (Low margin: 25% margin) -> Price $80, Cost $60
    await db.saveVariant({
      variant_id: 'v-cat-1',
      tenant_id: tenantId,
      sku: 'CAT-HIGH-MARGIN',
      price: 150,
      cost: 60,
      title: 'High Margin Shoe',
      ingested_at: new Date().toISOString()
    });
    await db.saveVariant({
      variant_id: 'v-cat-2',
      tenant_id: tenantId,
      sku: 'CAT-LOW-MARGIN',
      price: 80,
      cost: 60,
      title: 'Low Margin Shoe',
      ingested_at: new Date().toISOString()
    });

    // Run onboarding margin discovery campaign generator
    const result = await wizard.generateMarginDiscoveryCampaign(
      tenantId,
      'ads-sub-a',
      adsAdapter,
      governance,
      ctx
    );

    expect(result).toBeDefined();
    expect(result).not.toBe('needs_cogs');
    expect(result).not.toBeNull();

    const campResult = result as {campaignId: string; targetSkus: string[]; marginBasis: string};
    expect(campResult.marginBasis).toBe('catalog');
    expect(campResult.targetSkus).toContain('CAT-HIGH-MARGIN');
    expect(campResult.targetSkus).not.toContain('CAT-LOW-MARGIN');

    // Verify campaign was created in PAUSED status in simulated google ads adapter
    const simCamp = adsAdapter.getSimulatedCampaign(campResult.campaignId);
    expect(simCamp).toBeDefined();
    expect(simCamp?.name).toBe('Twin-Discovery: High Margin Catalog');
    expect(simCamp?.status).toBe('PAUSED');
    expect(simCamp?.budget).toBe(500);

    // Verify product ad link was created linking variant to discovery campaign
    const links = await db.getProductAdLinks(tenantId);
    const linkForHigh = links.find((l) => l.variant_id === 'v-cat-1');
    expect(linkForHigh).toBeDefined();
    expect(linkForHigh?.ads_campaign_id).toBe(campResult.campaignId);

    const linkForLow = links.find((l) => l.variant_id === 'v-cat-2');
    expect(linkForLow).toBeUndefined();
  });

  it('should return needs_cogs when catalog variants have no cost data', async () => {
    // Seed catalog variant with zero/null cost in the database
    await db.saveVariant({
      variant_id: 'v-cat-no-cost',
      tenant_id: tenantId,
      sku: 'CAT-NO-COST',
      price: 150,
      cost: 0, // No cost info
      title: 'No Cost Shoe',
      ingested_at: new Date().toISOString()
    });

    const result = await wizard.generateMarginDiscoveryCampaign(
      tenantId,
      'ads-sub-a',
      adsAdapter,
      governance,
      ctx
    );

    expect(result).toBe('needs_cogs');
  });
});
