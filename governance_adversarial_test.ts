/**
 * @fileoverview Adversarial unit tests for Governance Engine, Trust Ledger, Risk Radar, and OPA policy.
 */

import {RealtimeEventBus} from './event_bus';
import {
  CircuitBreaker,
  GovernanceEngine,
  TrustLedger,
} from './governance_engine';
import {Context, Role, Waiver, TenantPolicy, Tenant} from './governance_types';
import {OpaPolicyEngine} from './opa_policy';
import {RiskRadar} from './risk_radar';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {SupabaseClient} from './supabase_client';
import {
  DiagnosisInput,
  CampaignPoasReport,
  CampaignCostBreakdown,
  BaselineContext,
  CategoryBenchmarks,
} from './healing_types';

describe('Governance Adversarial Tests', () => {
  describe('TrustLedger Actual Logic', () => {
    let ledger: TrustLedger;

    beforeEach(() => {
      ledger = new TrustLedger();
    });

    it('should initialize with default tier 0', () => {
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(0);
    });

    it('should degrade tier on failure down to 0', () => {
      ledger.recordOutcome('tenant-1', 'update_budget', false, 100, 1000, 'Media Buyer', 2);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(1);

      ledger.recordOutcome('tenant-1', 'update_budget', false, 100, 1000, 'Media Buyer', 1);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(0);

      // Remains 0, does not go negative
      ledger.recordOutcome('tenant-1', 'update_budget', false, 100, 1000, 'Media Buyer', 0);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(0);
    });

    it('should immediately upgrade tier on CFO/CMO approval', () => {
      ledger.recordOutcome('tenant-1', 'update_budget', true, 100, 1000, 'cfo', 2);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(3);

      ledger.recordOutcome('tenant-1', 'update_budget', true, 100, 1000, 'cmo', 3);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(4);

      // Caps at 4
      ledger.recordOutcome('tenant-1', 'update_budget', true, 100, 1000, 'cfo', 4);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(4);
    });

    it('should enforce 1-minute oscillation cooldown after downgrade', () => {
      // Step 1: Downgrade
      ledger.recordOutcome('tenant-1', 'update_budget', false, 100, 1000, 'Media Buyer', 2);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(1);

      // Step 2: Attempt immediate upgrade via CFO approval
      ledger.recordOutcome('tenant-1', 'update_budget', true, 100, 1000, 'cfo', 1);
      // Upgrade blocked by cooldown
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(1);
    });

    it('should progress tier via time-decay and risk-weighted progression score >= 1.5', () => {
      // Progression score = Sum(decayWeight * riskWeight)
      // riskWeight = cost / maxDailyDollarsRisk = 500 / 1000 = 0.5
      // If we record 3 successes immediately (decayWeight = 1), progressionScore = 1.5
      ledger.recordOutcome('tenant-1', 'update_budget', true, 500, 1000, 'Media Buyer', 2);
      ledger.recordOutcome('tenant-1', 'update_budget', true, 500, 1000, 'Media Buyer', 2);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(2); // Score is 1.0, still 2

      ledger.recordOutcome('tenant-1', 'update_budget', true, 500, 1000, 'Media Buyer', 2);
      expect(ledger.getTier('tenant-1', 'update_budget')).toBe(3); // Score reached 1.5, upgraded to 3
    });
  });

  describe('OpaPolicyEngine Fallback Evaluate Edge Cases', () => {
    let opa: OpaPolicyEngine;
    let ctx: Context;

    beforeEach(() => {
      opa = new OpaPolicyEngine('http://mock-url', true);
      ctx = {
        tenant: {
          tenantId: 'tenant-1',
          policy: {
            maxDailyDollarsRisk: 2000,
            maxBudgetMovePct: 0.2,
            minConfidence: 0.8,
            escalationRole: 'cfo',
          },
        },
        role: {name: 'Media Buyer', permits: () => true} as unknown as Role,
        verifyWindowMs: 5000,
        activeWaivers: [],
      };
    });

    it('should deny all operations if tenant_anomaly is true', async () => {
      ctx.triggerAnomaly = true;
      const allowed = await opa.evaluate(
        {op: 'update_budget', entity: 'campaign', idempotencyKey: 'k', confidence: 1.0, targetId: 't-1', payload: {}},
        {valid: true, projectedCost: 50, warnings: [], request: {} as any},
        ctx,
        2,
      );
      expect(allowed).toBe(false);
    });

    it('should allow updates within limit under Media Buyer waiver when cost < 5000', async () => {
      ctx.activeWaivers = [
        {
          overrideRole: 'Media Buyer',
          expiresAtMs: Date.now() + 60000,
          allowedOps: ['scale_budget'],
          reason: 'test',
        },
      ];

      const allowedUnder = await opa.evaluate(
        {op: 'scale_budget', entity: 'campaign', idempotencyKey: 'k1', confidence: 1.0, targetId: 't-1', payload: {}},
        {valid: true, projectedCost: 4000, warnings: [], request: {} as any},
        ctx,
        2,
      );
      expect(allowedUnder).toBe(true);

      const deniedOver = await opa.evaluate(
        {op: 'scale_budget', entity: 'campaign', idempotencyKey: 'k2', confidence: 1.0, targetId: 't-2', payload: {}},
        {valid: true, projectedCost: 5500, warnings: [], request: {} as any},
        ctx,
        2,
      );
      expect(deniedOver).toBe(false);
    });

    it('should deny updates if the waiver has expired', async () => {
      ctx.activeWaivers = [
        {
          overrideRole: 'CFO',
          expiresAtMs: Date.now() - 1000, // Expired
          allowedOps: ['scale_budget'],
          reason: 'test',
        },
      ];

      const allowed = await opa.evaluate(
        {op: 'scale_budget', entity: 'campaign', idempotencyKey: 'k', confidence: 1.0, targetId: 't-1', payload: {}},
        {valid: true, projectedCost: 5000, warnings: [], request: {} as any},
        ctx,
        2,
      );
      expect(allowed).toBe(false);
    });

    it('should deny update_feed and create operations under Rule 1', async () => {
      const allowedUpdateFeed = await opa.evaluate(
        {op: 'update_feed', entity: 'campaign', idempotencyKey: 'k1', confidence: 1.0, targetId: 't-1', payload: {}},
        {valid: true, projectedCost: 50, warnings: [], request: {} as any},
        ctx,
        2,
      );
      expect(allowedUpdateFeed).toBe(false);

      const allowedCreate = await opa.evaluate(
        {op: 'create', entity: 'campaign', idempotencyKey: 'k2', confidence: 1.0, targetId: 't-2', payload: {}},
        {valid: true, projectedCost: 50, warnings: [], request: {} as any},
        ctx,
        2,
      );
      expect(allowedCreate).toBe(false);
    });

    it('should deny waiver approval if cost does not exceed earned_tier_cap', async () => {
      ctx.activeWaivers = [
        {
          overrideRole: 'CFO',
          expiresAtMs: Date.now() + 60000,
          allowedOps: ['update_feed'],
          reason: 'test',
        },
      ];

      const allowedWithinCap = await opa.evaluate(
        {op: 'update_feed', entity: 'campaign', idempotencyKey: 'k_within', confidence: 1.0, targetId: 't-1', payload: {}},
        {valid: true, projectedCost: 50, warnings: [], request: {} as any},
        ctx,
        2,
      );
      expect(allowedWithinCap).toBe(false);

      const allowedExceedingCap = await opa.evaluate(
        {op: 'update_feed', entity: 'campaign', idempotencyKey: 'k_exceeding', confidence: 1.0, targetId: 't-2', payload: {}},
        {valid: true, projectedCost: 600, warnings: [], request: {} as any},
        ctx,
        2,
      );
      expect(allowedExceedingCap).toBe(true);
    });
  });

  describe('RiskRadar.diagnoseRootCause Logic', () => {
    let report: CampaignPoasReport;
    let breakdown: CampaignCostBreakdown;
    let benchmarks: CategoryBenchmarks;
    let context: BaselineContext;

    beforeEach(() => {
      report = {
        campaignId: 'c-1',
        campaignName: 'Meta Generic Purchase',
        platform: 'meta',
        status: 'active',
        spend: 1000,
        roas: 2.0,
        poas: 0.8, // Unprofitable POAS
        contributionMargin: 550,
        clicks: 100,
        orders: 10,
      };
      breakdown = {
        grossRevenue: 2000,
        discountAmount: 100,
        cogs: 1000,
        fulfillment: 200,
        marketplaceFee: 100,
        refunds: 50,
        contributionMargin: 550, // grossRevenue - cogs - discount - fulfillment - fee - refunds = 2000-1000-100-200-100-50 = 550
        estimatedCogs: false,
      };
      benchmarks = {
        cogsRatio: 0.55,
        discountRatio: 0.10,
        fulfillmentRatio: 0.15,
        marketplaceRatio: 0.15,
        refundRatio: 0.05,
        spendRatio: 0.30,
        categoryMedianCvr: 0.02,
        categoryHighRoasThreshold: 4.0,
        lowVarianceThreshold: 0.05,
      };
      context = {
        organicRanks: {},
        competitorBiddingBrandTerms: false,
      };
    });

    it('should return INSUFFICIENT_DATA if gross revenue is zero or orders is zero', () => {
      const input: DiagnosisInput = {
        report,
        breakdown: {...breakdown, grossRevenue: 0, estimatedCogs: false},
        clicks: 100,
        orders: 0,
        context,
        benchmarks,
      };
      const diagnosis = RiskRadar.diagnoseRootCause(input);
      expect(diagnosis.rootCause).toBe('INSUFFICIENT_DATA');
      expect(diagnosis.side).toBe('UNKNOWN');
    });

    it('should diagnose LOW_CONVERSION when cvr is less than half of median cvr', () => {
      // cvr = orders / clicks = 1 / 200 = 0.005
      // 0.005 < 0.5 * categoryMedianCvr (0.01) -> LOW_CONVERSION
      // Pre-ad contribution rate = CM / Gross = 1100 / 2000 = 0.55 (Ad Side)
      const input: DiagnosisInput = {
        report,
        breakdown: {...breakdown, contributionMargin: 1100, estimatedCogs: false},
        clicks: 200,
        orders: 1,
        context,
        benchmarks,
      };
      const diagnosis = RiskRadar.diagnoseRootCause(input);
      expect(diagnosis.rootCause).toBe('LOW_CONVERSION');
      expect(diagnosis.side).toBe('ADVERTISING');
      expect(diagnosis.prescriptions[0].action).toContain('A/B creative');
    });

    it('should diagnose CPC_TOO_HIGH when cac > CM per order', () => {
      // CM = 1100, orders = 10, CM per order = 110
      // Spend = 1500, CAC = 1500 / 10 = 150
      // CAC (150) > CM per order (110) -> CPC_TOO_HIGH
      // cvr = 10 / 200 = 0.05 (healthy)
      const input: DiagnosisInput = {
        report: {...report, spend: 1500},
        breakdown: {...breakdown, contributionMargin: 1100, estimatedCogs: false},
        clicks: 200,
        orders: 10,
        context,
        benchmarks,
      };
      const diagnosis = RiskRadar.diagnoseRootCause(input);
      expect(diagnosis.rootCause).toBe('CPC_TOO_HIGH');
      expect(diagnosis.side).toBe('ADVERTISING');
    });

    it('should diagnose ECONOMICS side COGS_TOO_HIGH when cogsRatio is high', () => {
      // Pre-ad contribution rate = 500 / 2000 = 0.25 (Economics Side)
      // COGS ratio = 1400 / 2000 = 0.70 > 0.55 (benchmark)
      const input: DiagnosisInput = {
        report,
        breakdown: {
          grossRevenue: 2000,
          discountAmount: 0,
          cogs: 1400,
          fulfillment: 50,
          marketplaceFee: 50,
          refunds: 0,
          contributionMargin: 500,
          estimatedCogs: false,
        },
        clicks: 100,
        orders: 10,
        context,
        benchmarks,
      };
      const diagnosis = RiskRadar.diagnoseRootCause(input);
      expect(diagnosis.rootCause).toBe('COGS_TOO_HIGH');
      expect(diagnosis.side).toBe('ECONOMICS');
    });

    it('should demote prescription tier if organic rank is high (<= 3)', () => {
      // CPC_TOO_HIGH triggers a scale_budget down (tier 1 prescription)
      // organic rank is 2 (<= 3), so it should demote the prescription to tier 2 and add warning
      const input: DiagnosisInput = {
        report: {...report, spend: 1500},
        breakdown: {...breakdown, contributionMargin: 1100, estimatedCogs: false},
        clicks: 200,
        orders: 10,
        context: {
          organicRanks: {'meta generic purchase': 2},
        },
        benchmarks,
      };
      const diagnosis = RiskRadar.diagnoseRootCause(input);
      expect(diagnosis.rootCause).toBe('CPC_TOO_HIGH');
      expect(diagnosis.prescriptions[0].tier).toBe(2);
      expect(diagnosis.prescriptions[0].action).toContain('[DEMOTED]');
    });
  });

  describe('RiskRadar Sweep Methods', () => {
    let googleAds: GoogleAdsAdapter;
    let radar: RiskRadar;
    let db: SupabaseClient;

    beforeEach(async () => {
      SupabaseClient.useSharedMockDb = true;
      SupabaseClient.resetGlobalMockDb();
      db = new SupabaseClient();

      googleAds = new GoogleAdsAdapter(
        '888-888-8888',
        'dev_token',
        'mock_auth_token',
        'tenant-1',
      );
      const auditSink = { record: async () => {} };
      const trustLedger = { getTier: () => 3, recordOutcome: () => {} };
      const circuitBreaker = { isTripped: () => false };
      const engine = new GovernanceEngine(
        auditSink as any,
        trustLedger as any,
        circuitBreaker as any,
      );

      radar = new RiskRadar(engine, googleAds, db, 'tenant-1');
    });

    afterEach(() => {
      SupabaseClient.useSharedMockDb = false;
    });

    it('scanConversionTracking should flag campaigns with high spend but zero conversion events', async () => {
      await db.saveCampaign({
        campaign_id: 'c-test-1',
        tenant_id: 'tenant-1',
        name: 'Brand Search',
        platform: 'google',
        status: 'ENABLED',
        ingested_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(), // 5 days old
      } as any);

      // Spend is $600 (> $500 threshold)
      await db.saveSpendFact({
        campaign_id: 'c-test-1',
        platform: 'google',
        day: new Date().toISOString().split('T')[0],
        amount: 600,
        currency: 'USD',
        tenant_id: 'tenant-1',
        ingested_at: new Date().toISOString(),
      } as any);

      // No purchase touchpoints seeded

      const ctx: Context = {
        tenant: { tenantId: 'tenant-1', policy: { maxDailyDollarsRisk: 1000, maxBudgetMovePct: 0.2, minConfidence: 0.8, escalationRole: 'cmo' } },
        role: { permits: () => true },
        verifyWindowMs: 100,
      };

      const findings = await radar.scanConversionTracking(ctx);
      expect(findings.length).toBe(1);
      expect(findings[0].code).toBe('no_conv_tracking_c-test-1');
      expect(findings[0].severity).toBe('CRITICAL');
    });

    it('scanCheckoutEvents should detect purchase mismatch and begin_checkout misfires', async () => {
      // 10 storefront orders
      for (let i = 0; i < 10; i++) {
        await db.saveOrder({
          order_id: `order-${i}`,
          gross_revenue: 100,
          placed_at: new Date().toISOString(),
          tenant_id: 'tenant-1',
        } as any);
      }

      // Only 5 purchase events (50% coverage < 85%)
      for (let i = 0; i < 5; i++) {
        await db.saveTouchpoint({
          touchpoint_id: `tp-${i}`,
          type: 'purchase',
          occurred_at: new Date().toISOString(),
          tenant_id: 'tenant-1',
        } as any);
      }

      const ctx: Context = {
        tenant: { tenantId: 'tenant-1', policy: { maxDailyDollarsRisk: 1000, maxBudgetMovePct: 0.2, minConfidence: 0.8, escalationRole: 'cmo' } },
        role: { permits: () => true },
        verifyWindowMs: 100,
      };

      const findings = await radar.scanCheckoutEvents(ctx);
      expect(findings.some(f => f.code === 'checkout_events_mismatch')).toBe(true);
    });
  });
});
