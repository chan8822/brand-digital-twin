import * as readline from 'readline';
import {SupabaseClient} from './supabase_client';
import {PoasCalculator} from './poas_calculator';
import {RiskRadar} from './risk_radar';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {GovernanceEngine} from './governance_engine';

export interface OnboardingState {
  storefrontUrl: string;
  connectedSurfaces: string[];
  dailyRiskCap: number;
  maxBudgetDrift: number;
  confidenceThreshold: number;
  autonomyTier: number;
}

export class OnboardingSimulator {
  private rl: readline.Interface;
  private state: OnboardingState = {
    storefrontUrl: '',
    connectedSurfaces: [],
    dailyRiskCap: 300,
    maxBudgetDrift: 30,
    confidenceThreshold: 85,
    autonomyTier: 0,
  };

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async seedMockData(db: SupabaseClient) {
    const tenantId = 'tenant_onboard_123';
    await db.clearCampaigns(tenantId);

  await db.saveCampaign({
    campaign_id: 'c-meta-1',
    tenant_id: tenantId,
    name: 'Meta Lookalike Purchase [BLUE-SHIRT-M]',
    platform: 'meta',
    objective: 'CONVERSIONS',
    status: 'active',
    surface: 'meta_ads',
    source_id: 'c-meta-1',
    source_system: 'meta',
    source_version: 'v18',
    ingested_at: new Date().toISOString(),
  });
  await db.saveCampaign({
    campaign_id: 'c-meta-2',
    tenant_id: tenantId,
    name: 'Meta Retargeting Catalog',
    platform: 'meta',
    objective: 'CATALOG_SALES',
    status: 'active',
    surface: 'meta_ads',
    source_id: 'c-meta-2',
    source_system: 'meta',
    source_version: 'v18',
    ingested_at: new Date().toISOString(),
  });

  await db.saveSpendFact({
    campaign_id: 'c-meta-1',
    platform: 'meta',
    day: new Date().toISOString().split('T')[0],
    amount: 1500,
    currency: 'USD',
    tenant_id: tenantId,
    source_system: 'meta',
    ingested_at: new Date().toISOString(),
  });
  await db.saveSpendFact({
    campaign_id: 'c-meta-2',
    platform: 'meta',
    day: new Date().toISOString().split('T')[0],
    amount: 900,
    currency: 'USD',
    tenant_id: tenantId,
    source_system: 'meta',
    ingested_at: new Date().toISOString(),
  });

  await db.saveOrder({
    order_id: 'o1',
    customer_id: 'cust1',
    account_id: null,
    channel: 'online',
    surface: 'shopify',
    placed_at: new Date().toISOString(),
    currency: 'USD',
    gross_revenue: 800,
    total_discounts: 0,
    total_tax: 0,
    shipping_charged: 0,
    status: 'PAID',
    tenant_id: tenantId,
    source_system: 'shopify',
    source_id: 'o1',
    source_version: '1.0',
    ingested_at: new Date().toISOString(),
  });

  await db.saveOrderLine({
    order_line_id: 'ol1',
    order_id: 'o1',
    variant_id: 'v1',
    sku: 'BLUE-SHIRT-M',
    qty: 1,
    unit_price: 800,
    line_discount: 0,
    unit_cost: 500,
    tenant_id: tenantId,
    source_system: 'shopify',
    source_id: 'ol1',
    source_version: '1.0',
    ingested_at: new Date().toISOString(),
  });

  await db.saveOrder({
    order_id: 'o2',
    customer_id: 'cust2',
    account_id: null,
    channel: 'online',
    surface: 'shopify',
    placed_at: new Date().toISOString(),
    currency: 'USD',
    gross_revenue: 1000,
    total_discounts: 0,
    total_tax: 0,
    shipping_charged: 0,
    status: 'PAID',
    tenant_id: tenantId,
    source_system: 'shopify',
    source_id: 'o2',
    source_version: '1.0',
    ingested_at: new Date().toISOString(),
  });

  await db.saveOrderLine({
    order_line_id: 'ol2',
    order_id: 'o2',
    variant_id: 'v2',
    sku: 'RED-SHIRT-L',
    qty: 1,
    unit_price: 1000,
    line_discount: 0,
    unit_cost: 850,
    tenant_id: tenantId,
    source_system: 'shopify',
    source_id: 'ol2',
    source_version: '1.0',
    ingested_at: new Date().toISOString(),
  });

  await db.saveRefund({
    refund_id: 'ref1',
    order_line_id: 'ol2',
    amount: 300,
    refunded_at: new Date().toISOString(),
    tenant_id: tenantId,
    source_system: 'shopify',
    source_id: 'ref1',
    source_version: '1.0',
    ingested_at: new Date().toISOString(),
  });

  await db.saveTouchpoint({
    touchpoint_id: 'tp1',
    customer_id: 'cust1',
    campaign_id: 'c-meta-1',
    order_id: 'o1',
    occurred_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    type: 'click',
    tenant_id: tenantId,
    source_system: 'meta',
    ingested_at: new Date().toISOString(),
  });

  await db.saveTouchpoint({
    touchpoint_id: 'tp2',
    customer_id: 'cust2',
    campaign_id: 'c-meta-2',
    order_id: 'o2',
    occurred_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    type: 'click',
    tenant_id: tenantId,
    source_system: 'meta',
    ingested_at: new Date().toISOString(),
  });

  await db.saveProductAdLink({
    tenant_id: tenantId,
    variant_id: 'v1',
    gmc_offer_id: 'gmc_v1',
    gmc_account_id: 'gmc_acc',
    ads_account_id: 'ads_acc',
    ads_campaign_id: 'c-meta-1',
    ads_ad_group_id: '',
    confidence: 1.0,
    resolved_at: new Date().toISOString(),
  });

  await db.saveProductAdLink({
    tenant_id: tenantId,
    variant_id: 'v2',
    gmc_offer_id: 'gmc_v2',
    gmc_account_id: 'gmc_acc',
    ads_account_id: 'ads_acc',
    ads_campaign_id: 'c-meta-2',
    ads_ad_group_id: '',
    confidence: 1.0,
    resolved_at: new Date().toISOString(),
  });
}

  start() {
    console.clear();
    console.log('=================================================');
    console.log('      GaaS Brand Digital Twin Onboarding        ');
    console.log('=================================================');
    this.screen1Scan();
  }

  private screen1Scan() {
    console.log('\n[ SCREEN 1 of 4: Scan & Audit ]');
    console.log("Build your brand's digital twin in seconds.");
    this.rl.question('Enter your storefront URL (e.g. ableys.in): ', (url) => {
      this.state.storefrontUrl = url;
      console.log('\nScanning storefront...');
      setTimeout(() => {
        console.log('[x] Shopify Storefront Detected');
        console.log('[x] Active Meta Pixel found');
        console.log('[x] Google Analytics v4 (GA4) found');
        console.log('\nFootprint Maturity Score: 68/100');
        console.log('- 1st-party server tracking missing');
        console.log('- COGS margins not reconciled');

        this.rl.question(
          '\nPress [Enter] to continue to Integration...',
          () => {
            this.screen2Credentials();
          },
        );
      }, 1000);
    });
  }

  private screen2Credentials() {
    console.clear();
    console.log('\n[ SCREEN 2 of 4: Connect Surfaces ]');
    console.log("Connect your surfaces to seed the twin's data spine:\n");
    console.log('1. Shopify Admin API      [ CONNECTED (read-only) ]');
    console.log('2. Google Ads             [ Pending OAuth ]');
    console.log('3. Meta Ads               [ Pending OAuth ]');
    console.log('4. RBI Account Aggregator [ Pending Auth ]');

    this.rl.question(
      "\nType 'connect' to authorize mock integrations: ",
      (ans) => {
        if (ans.toLowerCase() === 'connect') {
          this.state.connectedSurfaces = [
            'shopify',
            'google_ads',
            'meta_ads',
            'rbi_aa',
          ];
          console.log('\n[x] Google Ads Connected (Read/Write)');
          console.log('[x] Meta Ads Connected (Read-Only)');
          console.log('[x] RBI Account Aggregator Authorized');
        } else {
          this.state.connectedSurfaces = ['shopify'];
          console.log('\nOnly Shopify (Read-Only) connected.');
        }
        this.rl.question(
          '\nPress [Enter] to set Governance Guardrails...',
          () => {
            this.screen3Guardrails();
          },
        );
      },
    );
  }

  private screen3Guardrails() {
    console.clear();
    console.log('\n[ SCREEN 3 of 4: Governance Guardrails ]');
    console.log('Configure your autonomous blast-radius limits:');

    this.rl.question(
      '\nEnter Daily Dollars-at-Risk Limit (default $300): $',
      (val) => {
        const cap = parseInt(val);
        if (!isNaN(cap)) {
          this.state.dailyRiskCap = cap;
        }

        this.rl.question(
          'Enter Max Budget Drift percentage per 24h (default 30%): ',
          (driftVal) => {
            const drift = parseInt(driftVal);
            if (!isNaN(drift)) {
              this.state.maxBudgetDrift = drift;
            }

            console.log('\nAutonomy Level Options:');
            console.log('  0: Suggestions only (Highly Recommended)');
            console.log('  1: Auto-pilot minor updates');
            this.rl.question('Select Autonomy Tier (0 or 1): ', (tierVal) => {
              const tier = parseInt(tierVal);
              if (tier === 0 || tier === 1) {
                this.state.autonomyTier = tier;
              }
              this.screen4Insights();
            });
          },
        );
      },
    );
  }

  private async screen4Insights() {
    console.clear();
    console.log('\n[ SCREEN 4 of 4: Brand Digital Twin Ready ]');
    console.log('Your shadow twin has reconciled your last 30 days of data!\n');

    const tenantId = 'tenant_onboard_123';
    const db = new SupabaseClient();
    await this.seedMockData(db);

    // 1. POAS vs ROAS Audit Sweep
    const poasCalc = new PoasCalculator(db);
    const reports = await poasCalc.calculate(tenantId);

    let unprofitableSpend = 0;
    let unprofitableCampaignCount = 0;

    for (const r of reports) {
      if (r.poas !== null && r.poas < 1.0) {
        unprofitableCampaignCount++;
        unprofitableSpend += r.spend;
      }
    }

    if (unprofitableCampaignCount > 0) {
      console.log(
        `[!] Found $${unprofitableSpend.toLocaleString()} of unprofitable ad spend on ${unprofitableCampaignCount} campaigns`
      );
      console.log(
        '    that reported positive ROAS but are net-negative after COGS & refunds'
      );
    } else {
      console.log('[x] All campaigns are profitable based on true POAS!');
    }

    // 2. Inventory Sweep
    const googleAds = new GoogleAdsAdapter(
      '888-888-8888',
      'dev_token',
      'mock_auth_token',
      tenantId,
    );
    const auditSink = { record: async () => {} };
    const trustLedger = { getTier: () => 2, recordOutcome: () => {} };
    const circuitBreaker = { isTripped: () => false };

    const engine = new GovernanceEngine(
      auditSink as any,
      trustLedger as any,
      circuitBreaker as any,
    );

    const radar = new RiskRadar(engine, googleAds, db, tenantId);
    radar.seedInventory({
      variantId: 'v1',
      sku: 'BLUE-SHIRT-M',
      qty: 0, // Out of stock
      promotedCampaignIds: ['c-meta-1'],
    });

    const ctx = {
      tenant: { tenantId, policy: { maxDailyDollarsRisk: 1000, maxBudgetMovePct: 0.2, minConfidence: 0.8, escalationRole: 'cmo' } },
      role: { permits: () => true },
      verifyWindowMs: 100,
    };

    const radarActions = await radar.scanStockouts(ctx);
    let outOfStockAdsPausedCount = 0;
    for (const action of radarActions) {
      if (action.startsWith('paused_') || action.startsWith('queued_pause_')) {
        outOfStockAdsPausedCount++;
      }
    }

    if (outOfStockAdsPausedCount > 0) {
      console.log(
        `[!] ${outOfStockAdsPausedCount} variant(s) are out of stock with active ads running`
      );
      console.log('    (Safe-governance trigger is queued to pause these campaigns)\n');
    }

    console.log('Current Configuration Summary:');
    console.log(JSON.stringify(this.state, null, 2));

    this.rl.question(
      "\nType 'activate' to begin Shadow Run (Read-Only): ",
      (ans) => {
        if (ans.toLowerCase() === 'activate') {
          console.log('\n=================================================');
          console.log('   SHADOW RUN ACTIVATED SUCCESSFULLY!            ');
          console.log('=================================================');
        } else {
          console.log('\nOnboarding paused. Config saved as draft.');
        }
        this.rl.close();
      },
    );
  }
}
