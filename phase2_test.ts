import 'jasmine';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {
  AuditSink,
  CircuitBreaker,
  Context,
  GovernanceEngine,
  Role,
  Tenant,
  TrustLedger,
} from './governance_engine';
import {MetaAdsAdapter} from './meta_ads_adapter';
import {ActionRequest} from './platform_adapter';

describe('Phase 2 Governance & Execution Suite', () => {
  const tenantId = 'tenant_test_123';
  let auditLogs: any[] = [];
  const mockAuditSink: AuditSink = {
    record: async (row: Record<string, unknown>) => {
      auditLogs.push(row);
    },
  };

  const mockPolicy = {
    maxDailyDollarsRisk: 500,
    maxBudgetMovePct: 0.2,
    minConfidence: 0.85,
    escalationRole: 'cmo',
  };

  const tenant: Tenant = {
    tenantId,
    policy: mockPolicy,
  };

  const permittedRole: Role = {
    permits: (op, entity) => true,
  };

  const restrictedRole: Role = {
    permits: (op, entity) => op === 'read', // no write permissions
  };

  let trustLedger: TrustLedger;
  let circuitBreaker: CircuitBreaker;
  let engine: GovernanceEngine;

  beforeEach(() => {
    auditLogs = [];
    trustLedger = new TrustLedger();
    circuitBreaker = new CircuitBreaker();
    engine = new GovernanceEngine(mockAuditSink, trustLedger, circuitBreaker);
  });

  it('should auto-execute a budget change when trust and confidence are high', async () => {
    const adapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );

    // Seed earned trust to Tier 2 (moderate risk)
    trustLedger.setTier(tenantId, 'update_budget', 2);

    const req: ActionRequest = {
      idempotencyKey: 'req_001',
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1', // initial simulated budget: 1000
      payload: {budget: 1200}, // delta = 200 (within $500 limit)
      confidence: 0.9, // above 0.85 limit
    };

    const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

    const res = await engine.govern(adapter, req, ctx);

    expect(res.status).toBe('executed');
    expect(res.result?.ok).toBe(true);

    // Verify campaign budget was updated in simulator
    const camp = adapter.getSimulatedCampaign('c1');
    expect(camp?.budget).toBe(1200);

    // Verify audit logs were written
    expect(auditLogs.some((log) => log.status === 'planned')).toBe(true);
    expect(auditLogs.some((log) => log.status === 'auto_execute')).toBe(true);
    expect(auditLogs.some((log) => log.status === 'executed')).toBe(true);
  });

  it('should queue action if cost exceeds current tier cap (5-tier caps check)', async () => {
    const adapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );

    // Seed earned trust to Tier 1 (REVIEW, default cap $100)
    trustLedger.setTier(tenantId, 'update_budget', 1);

    const req: ActionRequest = {
      idempotencyKey: 'req_tier_cap_1',
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1', // initial budget 1000
      payload: {budget: 1200}, // delta = 200 > $100 cap
      confidence: 0.9,
    };

    const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

    const res = await engine.govern(adapter, req, ctx);
    expect(res.status).toBe('queued'); // Should queue because 200 > 100
  });

  it('should execute action if cost is within overridden tier cap', async () => {
    const adapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );

    // Seed earned trust to Tier 1 (REVIEW)
    trustLedger.setTier(tenantId, 'update_budget', 1);

    // Override REVIEW cap to $300 in tenant policy
    const customPolicy = {
      ...mockPolicy,
      tierCaps: {
        'REVIEW': 300,
      },
    };
    const customTenant = {
      ...tenant,
      policy: customPolicy,
    };

    const req: ActionRequest = {
      idempotencyKey: 'req_tier_cap_2',
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1',
      payload: {budget: 1200}, // delta = 200 <= $300 custom cap
      confidence: 0.9,
    };

    const ctx: Context = {tenant: customTenant, role: permittedRole, verifyWindowMs: 100};

    const res = await engine.govern(adapter, req, ctx);
    expect(res.status).toBe('executed'); // Should execute because 200 <= 300
  });

  it('should queue action if confidence is below threshold', async () => {
    const adapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );

    trustLedger.setTier(tenantId, 'update_budget', 2);

    const req: ActionRequest = {
      idempotencyKey: 'req_002',
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1',
      payload: {budget: 1100},
      confidence: 0.8, // below 0.85 limit
    };

    const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

    const res = await engine.govern(adapter, req, ctx);
    expect(res.status).toBe('queued');

    // Budget should remain original (1000)
    const camp = adapter.getSimulatedCampaign('c1');
    expect(camp?.budget).toBe(1000);
  });

  it('should block action if user role lacks permissions', async () => {
    const adapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );

    const req: ActionRequest = {
      idempotencyKey: 'req_003',
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1',
      payload: {budget: 1100},
      confidence: 0.9,
    };

    const ctx: Context = {tenant, role: restrictedRole, verifyWindowMs: 100};

    const res = await engine.govern(adapter, req, ctx);
    expect(res.status).toBe('blocked');
  });

  it('should execute, detect post-execution anomaly, trigger rollback, and trip circuit breaker', async () => {
    const adapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );
    // Set mock anomaly trigger on the 2nd read (which is the post-execution verification read)
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
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'shop_o1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });

    trustLedger.setTier(tenantId, 'update_budget', 3); // Seed high trust

    const req: ActionRequest = {
      idempotencyKey: 'c1', // In rollback handle simulator, targetId matches req.idempotencyKey
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1', // initial simulated budget: 1000
      payload: {budget: 1200},
      confidence: 0.95,
    };

    const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

    const res = await engine.govern(adapter, req, ctx);

    // Should indicate it was executed because verification is deferred to a background job
    expect(res.status).toBe('executed');
    expect(res.result?.auditRef).toContain('verify-deferred-');

    // Budget is not rolled back yet
    let camp = adapter.getSimulatedCampaign('c1');
    expect(camp?.budget).toBe(1200);

    // Get the scheduled job and run it manually
    const jobs = await engine.supabase.getPendingJobs(tenantId);
    expect(jobs.length).toBe(1);
    expect(jobs[0].type).toBe('settling_window');
    
    await engine.verifyPendingAction(jobs[0], adapter);

    // Simulated budget must now revert to original budget: 1000
    camp = adapter.getSimulatedCampaign('c1');
    expect(camp?.budget).toBe(1000);

    // Trust ledger should record the failure, dropping tier
    const currentTier = trustLedger.getTier(tenantId, 'update_budget');
    expect(currentTier).toBe(2); // Dropped from 3 to 2

    // Circuit breaker should be tripped for Google platform
    expect(circuitBreaker.isTripped('google')).toBe(true);

    // Verify audit trail captures the rollback
    expect(auditLogs.some((log) => log.status === 'rolled_back')).toBe(true);
  });

  it('should not re-execute an already executed request (idempotency check)', async () => {
    const adapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );

    trustLedger.setTier(tenantId, 'update_budget', 2);

    const req: ActionRequest = {
      idempotencyKey: 'req_idempotent_123',
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1',
      payload: {budget: 1200},
      confidence: 0.9,
    };

    const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

    // First execution
    const res1 = await engine.govern(adapter, req, ctx);
    expect(res1.status).toBe('executed');

    // Spy on adapter.execute
    spyOn(adapter, 'execute').and.callThrough();

    // Second execution with same idempotency key
    const res2 = await engine.govern(adapter, req, ctx);
    expect(res2.status).toBe('executed');
    expect(res2.result?.auditRef).toBe('cached-req_idempotent_123');

    // Verify adapter.execute was NOT called the second time
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it('should respect verifyWindowMs delay before running verification', async () => {
    const adapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );

    trustLedger.setTier(tenantId, 'update_budget', 2);

    const req: ActionRequest = {
      idempotencyKey: 'req_delay_verify_123',
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1',
      payload: {
        budget: 1200,
        verifyMetrics: {
          preExecutionROAS: 2.5,
          postExecutionROAS: 2.6,
        },
      },
      confidence: 0.9,
    };

    // We set a 150ms verification window
    const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 150};

    const startTime = Date.now();
    const res = await engine.govern(adapter, req, ctx);
    const endTime = Date.now();
    const elapsed = endTime - startTime;

    expect(res.status).toBe('executed');
    // It should return immediately as the thread doesn't sleep anymore
    expect(elapsed).toBeLessThan(30);

    // Verify a verify job was scheduled with correct run_at
    const jobs = await engine.supabase.getPendingJobs(tenantId);
    expect(jobs.length).toBe(1);
    expect(jobs[0].type).toBe('settling_window');
    const runAt = Date.parse(jobs[0].run_at);
    expect(runAt).toBeGreaterThanOrEqual(startTime + 150);
  });
});
