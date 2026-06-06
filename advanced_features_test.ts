import {SpendForecaster, StockoutPredictor} from './forecasting';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {Context, GovernanceEngine, Role, Tenant} from './governance_engine';
import {MetricsTracker} from './observability';
import {ActionBundle, Orchestrator} from './orchestrator';
import {
  ActionPlan,
  ActionRequest,
  ActionResult,
  PlatformAdapter,
  RollbackHandle,
} from './platform_adapter';
import {RateLimitingAdapterWrapper, TokenBucket} from './rate_limiter';
import {RiskRadar, VariantInventory} from './risk_radar';
import {ChaosAdapterWrapper, ForensicReplayer} from './simulation';
import {OpaPolicyEngine} from './opa_policy';
import {RbiAaAdapter} from './rbi_aa_adapter';
import {BankAdapter} from './bank_adapter';
import {PlaidAdapter} from './plaid_adapter';

class DummyAuditSink {
  records: any[] = [];
  async record(payload: any) {
    this.records.push(payload);
  }
}

class DummyTrustLedger {
  tiers: Record<string, number> = {};
  getTier(tenant: string, op: string): number {
    return this.tiers[`${tenant}:${op}`] ?? 2;
  }
  recordOutcome(tenant: string, op: string, success: boolean) {
    const key = `${tenant}:${op}`;
    const current = this.tiers[key] ?? 2;
    if (success) {
      this.tiers[key] = Math.min(3, current + 1);
    } else {
      this.tiers[key] = Math.max(1, current - 1);
    }
  }
}

class DummyCircuitBreaker {
  tripped: Record<string, boolean> = {};
  trip(platform: string) {
    this.tripped[platform] = true;
  }
  isTripped(platform: string): boolean {
    return !!this.tripped[platform];
  }
}

class DummyAdapter implements PlatformAdapter {
  platform = 'google_ads';
  schemaVersion = 'v1';
  capabilities = [
    {
      entity: 'campaign',
      ops: [
        'update_budget' as const,
        'scale_budget' as const,
        'update_feed' as const,
        'pause' as const,
      ],
      reversible: true,
    },
  ];
  rolledBackCount = 0;
  lastScaleFactor: number | undefined;
  execCount = 0;
  readCount = 0;
  triggerAnomalyOnReadIndex = -1;

  async read(since: Date) {
    this.readCount++;
    let cost = 400000000; // $400
    if (
      this.triggerAnomalyOnReadIndex !== -1 &&
      this.readCount >= this.triggerAnomalyOnReadIndex
    ) {
      cost = 800000000; // $800
    }
    return {
      campaigns: [
        {
          campaign_id: 'camp-123',
          name: 'Dummy Campaign',
          status: 'ENABLED',
          advertising_channel_type: 'SEARCH',
        },
      ],
      spend_facts: [
        {
          campaign_id: 'camp-123',
          day: since.toISOString().split('T')[0],
          amount: cost / 1000000, // $400 or $800
          currency: 'USD',
        },
      ],
    };
  }

  async plan(req: ActionRequest): Promise<ActionPlan> {
    return {
      request: req,
      valid: true,
      projectedCost: 50,
      warnings: [],
    };
  }

  async execute(plan: ActionPlan): Promise<ActionResult> {
    this.execCount++;
    return {
      ok: true,
      auditRef: 'abc-123',
      rollback: {
        rollbackId: 'rb-123',
        platform: this.platform,
        originalState: {},
      },
    };
  }

  async rollback(h: RollbackHandle): Promise<ActionResult> {
    this.rolledBackCount++;
    this.lastScaleFactor = h.scaleFactor;
    return {ok: true, auditRef: 'rb-executed'};
  }

  async healthCheck() {
    return {
      ok: true,
      latencyMs: 10,
      schemaDriftDetected: false,
      deprecationWarnings: [],
    };
  }
}

describe('Advanced Risk & Observability Features', () => {
  let auditSink: DummyAuditSink;
  let trustLedger: DummyTrustLedger;
  let circuitBreaker: DummyCircuitBreaker;
  let metricsTracker: MetricsTracker;
  let engine: GovernanceEngine;
  let adapter: DummyAdapter;
  let ctx: Context;

  beforeEach(() => {
    auditSink = new DummyAuditSink();
    trustLedger = new DummyTrustLedger();
    circuitBreaker = new DummyCircuitBreaker();
    metricsTracker = new MetricsTracker();
    engine = new GovernanceEngine(
      auditSink as any,
      trustLedger as any,
      circuitBreaker as any,
      metricsTracker,
    );
    adapter = new DummyAdapter();
    ctx = {
      tenant: {
        tenantId: 'tenant-1',
        policy: {
          maxDailyDollarsRisk: 1000,
          maxBudgetMovePct: 0.2,
          minConfidence: 0.8,
          escalationRole: 'cmo',
        },
      },
      role: {
        permits: () => true,
      },
      verifyWindowMs: 100,
    };
  });

  describe('Observability & Distributed Tracing', () => {
    it('should start and end spans during govern() execution', async () => {
      const req: ActionRequest = {
        idempotencyKey: 'key-1',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'camp-123',
        payload: {},
        confidence: 0.9,
      };

      const res = await engine.govern(adapter, req, ctx);
      expect(res.status).toBe('executed');

      const spans = metricsTracker.getSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].operationName).toBe('govern');
      expect(spans[0].platform).toBe('google_ads');
      expect(spans[0].durationMs).toBeDefined();
      expect(spans[0].status).toBe('success');
    });
  });

  describe('Statistical Anomaly & Gradual Rollbacks', () => {
    it('should trigger gradual rollback on >15% ROAS drop', async () => {
      adapter.triggerAnomalyOnReadIndex = 2;

      await engine.supabase.saveOrder({
        order_id: 'o1',
        customer_id: 'cust1',
        account_id: null,
        channel: 'online',
        surface: 'shopify',
        placed_at: new Date().toISOString(),
        currency: 'USD',
        gross_revenue: 10000,
        total_discounts: 0,
        total_tax: 0,
        shipping_charged: 0,
        status: 'PAID',
        tenant_id: 'tenant-1',
        source_system: 'shopify',
        source_id: 'shop_o1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });

      const req: ActionRequest = {
        idempotencyKey: 'key-anomaly',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'camp-123',
        payload: {},
        confidence: 0.9,
      };

      const res = await engine.govern(adapter, req, ctx);
      expect(res.status).toBe('executed');

      // Verify job was scheduled
      const jobs = await engine.supabase.getPendingJobs('tenant-1');
      expect(jobs.length).toBe(1);
      expect(jobs[0].type).toBe('settling_window');

      // Run verification manually
      await engine.verifyPendingAction(jobs[0], adapter);

      expect(adapter.rolledBackCount).toBe(2); // Step 1 (50%) & Step 2 (100%)
      expect(adapter.lastScaleFactor).toBe(1.0);

      // Verify circuit breaker tripped and alerts raised
      expect(circuitBreaker.tripped['google_ads']).toBe(true);
      const alerts = metricsTracker.getAlerts();
      expect(alerts.some((a) => a.includes('Circuit breaker tripped'))).toBe(
        true,
      );
    });
  });

  describe('Spend & Stockout Forecasting', () => {
    it('should forecast 24h spend accurately', () => {
      const forecaster = new SpendForecaster();
      const result = forecaster.forecast24hSpend(100, [5, 5, 5]);
      expect(result).toBe(220); // 100 + 5 * 24
    });

    it('should predict stockout time based on velocity', () => {
      const predictor = new StockoutPredictor();
      const status = {
        variantId: 'var-123',
        stockCount: 50,
        salesLast7Days: 35, // Velocity is 5 per day
      };
      const hours = predictor.hoursToStockout(status);
      expect(hours).toBe(240); // 50 / 5 = 10 days = 240 hours
    });
  });

  describe('Governance Exceptions & Whitelist Overrides', () => {
    it('should bypass standard limits if matching whitelist rule exists', async () => {
      // Confidence is 0.5 (below 0.8), but whitelist matches op/entity
      const req: ActionRequest = {
        idempotencyKey: 'key-whitelist-bypass',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'camp-whitelist-123',
        payload: {},
        confidence: 0.5,
      };

      engine.registerWhitelist('tenant-1', {
        op: 'update_budget',
        entity: 'campaign',
        maxCost: 100,
      });

      const res = await engine.govern(adapter, req, ctx);
      expect(res.status).toBe('executed');
    });

    it('should bypass approval level if valid active waiver exists', async () => {
      // CFO approval required (high risk), but waiver is active
      const req: ActionRequest = {
        idempotencyKey: 'key-waiver-bypass',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'camp-waiver-123',
        payload: {},
        confidence: 0.9,
      };

      // Set low role that doesn't permit CMO level normally, or low confidence
      ctx.role = {
        name: 'cmo',
        permits: () => false, // rejects everything normally
      };

      engine.registerWaiver('tenant-1', {
        overrideRole: 'cmo',
        reason: 'Critical seasonal promo adjustments waiver',
        expiresAtMs: Date.now() + 10000,
        allowedOps: ['update_budget'],
      });

      const res = await engine.govern(adapter, req, ctx);
      expect(res.status).toBe('executed');
    });
  });

  describe('Multi-Action Bundles & Conflict Locking', () => {
    it('should resolve dependencies topologically and execute actions atomicly', async () => {
      const orchestrator = new Orchestrator(engine);
      const googleAds = new GoogleAdsAdapter(
        '888-888-8888',
        'dev_token',
        'mock_auth_token',
        'tenant-1',
      );

      const bundle: ActionBundle = {
        bundleId: 'bundle-1',
        nodes: [
          {
            id: 'act-2',
            dependsOn: ['act-1'],
            request: {
              idempotencyKey: 'act-2-key',
              op: 'update_budget',
              entity: 'campaign',
              targetId: '888',
              payload: {budget: 520},
              confidence: 0.95,
            },
            adapter: googleAds,
          },
          {
            id: 'act-1',
            dependsOn: [],
            request: {
              idempotencyKey: 'act-1-key',
              op: 'update_budget',
              entity: 'campaign',
              targetId: 'c1',
              payload: {budget: 1010},
              confidence: 0.9,
            },
            adapter: googleAds,
          },
        ],
      };

      const result = await orchestrator.governBundle(bundle, ctx);
      expect(result.ok).toBe(true);
      expect(result.executedNodeIds.length).toBe(2);
      expect(result.executedNodeIds[0]).toBe('act-1'); // act-1 runs first because act-2 depends on it
      expect(result.executedNodeIds[1]).toBe('act-2');
    });

    it('should block concurrent executions targeting the same entity ID', async () => {
      const orchestrator = new Orchestrator(engine);
      const googleAds = new GoogleAdsAdapter(
        '888-888-8888',
        'dev_token',
        'mock_auth_token',
        'tenant-1',
      );

      // Lock campaign c1
      const lockAcquired = orchestrator
        .getConflictRegistry()
        .acquireLock('campaign', 'c1');
      expect(lockAcquired).toBe(true);

      const bundle: ActionBundle = {
        bundleId: 'bundle-conflict',
        nodes: [
          {
            id: 'act-3',
            dependsOn: [],
            request: {
              idempotencyKey: 'act-3-key',
              op: 'update_budget',
              entity: 'campaign',
              targetId: 'c1',
              payload: {budget: 1010},
              confidence: 0.95,
            },
            adapter: googleAds,
          },
        ],
      };

      const result = await orchestrator.governBundle(bundle, ctx);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Conflict lock acquisition failed');

      // Release lock and try again
      orchestrator.getConflictRegistry().releaseLock('campaign', 'c1');
      const retryResult = await orchestrator.governBundle(bundle, ctx);
      expect(retryResult.ok).toBe(true);
    });
  });

  describe('Inventory-Ad Alignment (Risk Radar)', () => {
    let googleAds: GoogleAdsAdapter;
    let radar: RiskRadar;

    beforeEach(() => {
      googleAds = new GoogleAdsAdapter(
        '888-888-8888',
        'dev_token',
        'mock_auth_token',
        'tenant-1',
      );
      radar = new RiskRadar(engine, googleAds);
      // Pre-seed trust ledger for risk radar executions
      trustLedger.tiers['tenant-1:scale_budget'] = 3;
      trustLedger.tiers['tenant-1:update_feed'] = 3;
      trustLedger.tiers['tenant-1:pause'] = 3;
      engine.registerWhitelist('tenant-1', {
        op: 'update_feed',
        entity: 'campaign',
        maxCost: 1000,
      });
    });

    it('should scale budget by 50% for low-stock warning threshold', async () => {
      radar.seedInventory({
        variantId: 'v1',
        sku: 'BLUE-SHIRT-M',
        qty: 8,
        lowStockThreshold: 10,
        promotedCampaignIds: ['c1'],
      });

      const actions = await radar.scanStockouts(ctx);
      expect(actions.map(f => f.code)).toContain('scaled_down_campaign_c1_for_BLUE-SHIRT-M');

      const campState = googleAds.getSimulatedCampaign('c1');
      expect(campState?.budget).toBe(500); // 1000 * 0.5
    });

    it('should switch feed variant if out of stock but sibling variant is available in bundle', async () => {
      // v1 is out of stock, but v2 (sibling in bundle) is in stock
      radar.seedInventory({
        variantId: 'v1',
        sku: 'BLUE-SHIRT-M',
        qty: 0,
        bundleId: 'bundle-shirt',
        promotedCampaignIds: ['c1'],
      });
      radar.seedInventory({
        variantId: 'v2',
        sku: 'BLUE-SHIRT-L',
        qty: 15,
        lowStockThreshold: 5,
        bundleId: 'bundle-shirt',
        promotedCampaignIds: [],
      });

      const actions = await radar.scanStockouts(ctx);
      expect(actions.map(f => f.code)).toContain('reallocated_campaign_c1_to_BLUE-SHIRT-L');

      const campState = googleAds.getSimulatedCampaign('c1');
      expect(campState?.activeVariantId).toBe('v2');
    });

    it('should pause campaign if out of stock with no alternative variants in bundle', async () => {
      radar.seedInventory({
        variantId: 'v1',
        sku: 'BLUE-SHIRT-M',
        qty: 0,
        promotedCampaignIds: ['c1'],
      });

      const actions = await radar.scanStockouts(ctx);
      expect(actions.map(f => f.code)).toContain('paused_campaign_c1_for_BLUE-SHIRT-M');

      const campState = googleAds.getSimulatedCampaign('c1');
      expect(campState?.status).toBe('PAUSED');
    });

    it('should adjust budget up/down based on ROI efficiency threshold', async () => {
      radar.seedInventory({
        variantId: 'v1',
        sku: 'HIGH-ROI-SKU',
        qty: 100,
        roi: 3.5, // High ROI (> 3.0) -> scale up by 20%
        promotedCampaignIds: ['c1'],
      });

      radar.seedInventory({
        variantId: 'v2',
        sku: 'LOW-ROI-SKU',
        qty: 100,
        roi: 1.2, // Low ROI (< 1.5) -> scale down by 30%
        promotedCampaignIds: ['888'],
      });

      const actions = await radar.scanROIEfficiency(ctx);
      expect(actions.map(f => f.code)).toContain(
        'scaled_up_campaign_c1_for_high_roi_HIGH-ROI-SKU',
      );
      expect(actions.map(f => f.code)).toContain(
        'scaled_down_campaign_888_for_low_roi_LOW-ROI-SKU',
      );

      expect(googleAds.getSimulatedCampaign('c1')?.budget).toBe(1200); // 1000 * 1.2
      expect(googleAds.getSimulatedCampaign('888')?.budget).toBe(350); // 500 * 0.7
    });
  });

  describe('Financial Runway Spend Throttling (Risk Radar)', () => {
    let googleAds: GoogleAdsAdapter;
    let bankAdapter: BankAdapter;
    let radar: RiskRadar;

    beforeEach(async () => {
      googleAds = new GoogleAdsAdapter(
        '888-888-8888',
        'dev_token',
        'mock_auth_token',
        'tenant-1',
      );
      radar = new RiskRadar(engine, googleAds, engine.supabase, 'tenant-1');
      bankAdapter = new RbiAaAdapter('mock_consent_token', 'tenant-1');

      // Clear campaigns before each test to ensure clean assertions
      await engine.supabase.clearCampaigns('tenant-1');

      // Seed two campaigns in the database for the tenant
      await engine.supabase.saveCampaign({
        campaign_id: 'c1',
        tenant_id: 'tenant-1',
        name: 'Google Search Leads',
        platform: 'google',
        objective: 'SEARCH',
        status: 'ENABLED',
        surface: 'google_search_network',
        source_id: 'c1',
        source_system: 'google',
        source_version: 'v15',
        ingested_at: new Date().toISOString()
      });
      await engine.supabase.saveCampaign({
        campaign_id: '888',
        tenant_id: 'tenant-1',
        name: 'Mock PMax Campaign',
        platform: 'google',
        objective: 'PMAX',
        status: 'ENABLED',
        surface: 'google_search_network',
        source_id: '888',
        source_system: 'google',
        source_version: 'v15',
        ingested_at: new Date().toISOString()
      });

      trustLedger.tiers['tenant-1:scale_budget'] = 3;
      trustLedger.tiers['tenant-1:pause'] = 3;
    });

    it('should do nothing if runway is healthy (e.g. > 4 months)', async () => {
      const actions = await radar.scanFinancialRunway(ctx, bankAdapter, 500000);
      expect(actions.length).toBe(0);

      expect(googleAds.getSimulatedCampaign('c1')?.budget).toBe(1000);
      expect(googleAds.getSimulatedCampaign('888')?.status).toBe('ENABLED');
    });

    it('should scale down budgets by 40% if runway is low (e.g. 2-4 months)', async () => {
      const actions = await radar.scanFinancialRunway(ctx, bankAdapter, 1200000);
      expect(actions.map(f => f.code)).toContain('scaled_campaign_c1_low_runway');
      expect(actions.map(f => f.code)).toContain('scaled_campaign_888_low_runway');

      expect(googleAds.getSimulatedCampaign('c1')?.budget).toBe(600); // 1000 * 0.6
      expect(googleAds.getSimulatedCampaign('888')?.budget).toBe(300); // 500 * 0.6
    });

    it('should pause all active campaigns if runway is critical (e.g. < 2 months)', async () => {
      const actions = await radar.scanFinancialRunway(ctx, bankAdapter, 2500000);
      expect(actions.map(f => f.code)).toContain('paused_campaign_c1_critical_runway');
      expect(actions.map(f => f.code)).toContain('paused_campaign_888_critical_runway');

      expect(googleAds.getSimulatedCampaign('c1')?.status).toBe('PAUSED');
      expect(googleAds.getSimulatedCampaign('888')?.status).toBe('PAUSED');
    });

    it('should scale down budgets if runway is low (e.g. 2-4 months) using PlaidAdapter', async () => {
      const plaid = new PlaidAdapter('mock_plaid_token', 'tenant-1');
      // SVB ($120k) + Chase ($52k) = $172,000 USD
      // Burn = $50,000 USD -> Runway = 3.44 months (low runway range)
      const actions = await radar.scanFinancialRunway(ctx, plaid, 50000);
      expect(actions.map(f => f.code)).toContain('scaled_campaign_c1_low_runway');
      expect(actions.map(f => f.code)).toContain('scaled_campaign_888_low_runway');

      expect(googleAds.getSimulatedCampaign('c1')?.budget).toBe(600);
      expect(googleAds.getSimulatedCampaign('888')?.budget).toBe(300);
    });
  });

  describe('Testing, Shadow Simulation & Chaos Injection', () => {
    it('should log simulated execution in shadow onboarding mode without performing actual execute', async () => {
      ctx.tenant.shadowMode = true; // force shadow onboarding mode
      const req: ActionRequest = {
        idempotencyKey: 'key-shadow-onboarding',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'camp-123',
        payload: {},
        confidence: 0.95,
      };

      const res = await engine.govern(adapter, req, ctx);
      expect(res.status).toBe('executed'); // returns success to caller
      expect(adapter.execCount).toBe(0); // actual adapter execution bypassed!

      // Verify audit trail logged shadow status
      const shadowRecord = auditSink.records.find(
        (r) => r.status === 'shadow_executed',
      );
      expect(shadowRecord).toBeDefined();
      expect(shadowRecord.reason).toContain('shadow onboarding mode');
    });

    it('should handle chaos failure injection and report rate limit warnings properly', async () => {
      const chaosAdapter = new ChaosAdapterWrapper(adapter);
      chaosAdapter.setChaos(true, 1.0, 0, 0); // 100% failure rate
      chaosAdapter.setRateLimitTrip(true);

      const health = await chaosAdapter.healthCheck();
      expect(health.ok).toBe(false);
      expect(health.deprecationWarnings).toContain('Rate limited');

      const req: ActionRequest = {
        idempotencyKey: 'key-chaos-run',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'camp-123',
        payload: {},
        confidence: 0.95,
      };

      await expectAsync(chaosAdapter.plan(req)).toBeRejectedWithError(
        /Rate Limit Exceeded/,
      );
    });

    it('should replay historical actions accurately using ForensicReplayer', async () => {
      const replayer = new ForensicReplayer(engine);
      const logs = [
        {
          action_id: 'rep-1',
          action_type: 'update_budget',
          target_entity: 'campaign',
          target_id: 'c1',
          confidence: 0.9,
        },
        {
          action_id: 'rep-2',
          action_type: 'update_budget',
          target_entity: 'campaign',
          target_id: 'c1',
          confidence: 0.4,
        }, // Low confidence (0.4) gets blocked
      ];

      const decisions = await replayer.replay(logs, ctx, adapter);
      expect(decisions).toContain('rep-1:AUTO_EXECUTE');
    });
  });

  describe('Governance Cost & Policy Validation', () => {
    it('should reject negative projected cost from adapter plan', async () => {
      const negativeCostAdapter = Object.create(adapter);
      negativeCostAdapter.plan = async (req: ActionRequest) => ({
        request: req,
        valid: true,
        projectedCost: -50, // Negative!
        warnings: [],
      });

      await expectAsync(
        engine.govern(
          negativeCostAdapter as any,
          {
            idempotencyKey: 'neg-1',
            op: 'update_budget',
            entity: 'campaign',
            targetId: 'c1',
            payload: {},
            confidence: 0.9,
          },
          ctx,
        ),
      ).toBeRejectedWithError(/Projected cost must be non-negative/);
    });

    it('should throw ValidationError if OPA returns invalid payload', async () => {
      // Set useFallback to false to force HTTP fetch
      const engineWithOpaFetch = new GovernanceEngine(
        auditSink as any,
        trustLedger as any,
        circuitBreaker as any,
        metricsTracker,
        new OpaPolicyEngine('http://mock-opa-url', false), // useFallback = false
      );

      // Spy on global fetch to return invalid OPA payload
      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve({
          ok: true,
          json: async () => ({invalid_key: 'not-boolean'}),
        } as any),
      );

      await expectAsync(
        engineWithOpaFetch.govern(
          adapter,
          {
            idempotencyKey: 'opa-val-1',
            op: 'update_budget',
            entity: 'campaign',
            targetId: 'c1',
            payload: {},
            confidence: 0.9,
          },
          ctx,
        ),
      ).toBeRejectedWithError(/Invalid OPA decision response payload/);
    });
  });

  describe('Rate Limiting & Backoff Retry', () => {
    it('should delay requests when token bucket capacity is exceeded', async () => {
      // 2 tokens capacity, refills 1 token per second
      const bucket = new TokenBucket(2, 1);
      const rateLimitingAdapter = new RateLimitingAdapterWrapper(
        adapter,
        bucket,
        3,
        10,
      );

      const req: ActionRequest = {
        idempotencyKey: 'rate-1',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'c1',
        payload: {budget: 1010},
        confidence: 0.95,
      };

      const plan = await rateLimitingAdapter.plan(req);

      // Fire 3 executions in quick succession
      const t0 = Date.now();
      await rateLimitingAdapter.execute(plan);
      await rateLimitingAdapter.execute(plan);

      // Third execution must exhaust tokens and trigger delay
      await rateLimitingAdapter.execute(plan);
      const elapsed = Date.now() - t0;

      expect(rateLimitingAdapter.totalCalls).toBe(4); // 1 plan + 3 executes
      expect(rateLimitingAdapter.delayedCalls).toBeGreaterThanOrEqual(1);
      // refilled at 1 token/sec, so waiting for 1 token takes ~1000ms
      expect(elapsed).toBeGreaterThanOrEqual(900);
    });

    it('should retry rate-limited calls with exponential backoff and succeed', async () => {
      let attempts = 0;
      const failingAdapter: PlatformAdapter = {
        platform: 'mock',
        schemaVersion: '1.0',
        capabilities: [],
        read: async () => {
          return {};
        },
        plan: async (req) => {
          return {request: req, valid: true, projectedCost: 0, warnings: []};
        },
        execute: async (plan) => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Rate Limit Exceeded (Status 429)');
          }
          return {ok: true, auditRef: 'success-after-retry'};
        },
        rollback: async () => {
          return {ok: true, auditRef: ''};
        },
        healthCheck: async () => {
          return {
            ok: true,
            latencyMs: 0,
            schemaDriftDetected: false,
            deprecationWarnings: [],
          };
        },
      };

      const bucket = new TokenBucket(10, 10);
      const rateLimitingAdapter = new RateLimitingAdapterWrapper(
        failingAdapter,
        bucket,
        3,
        20,
      );

      const plan = await rateLimitingAdapter.plan({
        idempotencyKey: 'retry-1',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'c1',
        payload: {},
        confidence: 0.95,
      });

      const res = await rateLimitingAdapter.execute(plan);
      expect(res.ok).toBe(true);
      expect(res.auditRef).toBe('success-after-retry');
      expect(attempts).toBe(3);
      expect(rateLimitingAdapter.retriedCalls).toBe(2);
    });
  });
});
