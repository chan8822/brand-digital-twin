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

    trustLedger.setTier(tenantId, 'update_budget', 3); // Seed high trust

    const req: ActionRequest = {
      idempotencyKey: 'c1', // In rollback handle simulator, targetId matches req.idempotencyKey
      op: 'update_budget',
      entity: 'campaign',
      targetId: 'c1', // initial simulated budget: 1000
      payload: {budget: 1200, triggerAnomaly: true},
      confidence: 0.95,
    };

    const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

    const res = await engine.govern(adapter, req, ctx);

    // Should indicate it was rolled back
    expect(res.status).toBe('rolled_back');

    // Simulated budget must revert to original budget: 1000
    const camp = adapter.getSimulatedCampaign('c1');
    expect(camp?.budget).toBe(1000);

    // Trust ledger should record the failure, dropping tier
    const currentTier = trustLedger.getTier(tenantId, 'update_budget');
    expect(currentTier).toBe(2); // Dropped from 3 to 2

    // Circuit breaker should be tripped for Google platform
    expect(circuitBreaker.isTripped('google')).toBe(true);

    // Verify audit trail captures the rollback
    expect(auditLogs.some((log) => log.status === 'rolled_back')).toBe(true);
  });
});
