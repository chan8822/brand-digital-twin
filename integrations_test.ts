/**
 * @fileoverview Unit tests for OPA policy evaluation, Supabase client, and Pino-like logger.
 */

import {RealtimeEventBus} from './event_bus';
import {
  CircuitBreaker,
  GovernanceEngine,
  TrustLedger,
} from './governance_engine';
import {AuditSink, Context, Role, Waiver} from './governance_types';
import {PinoLogger} from './observability';
import {OpaPolicyEngine} from './opa_policy';
import {ActionPlan, ActionRequest, PlatformAdapter} from './platform_adapter';
import {SupabaseClient} from './supabase_client';

describe('Integrations (OPA, Supabase, Pino)', () => {
  let mockAuditSink: AuditSink;
  let mockTrustLedger: TrustLedger;
  let mockCircuitBreaker: CircuitBreaker;
  let mockAdapter: PlatformAdapter;

  beforeEach(() => {
    mockAuditSink = {record: async () => {}};
    mockTrustLedger = new TrustLedger();
    mockCircuitBreaker = new CircuitBreaker();
    mockAdapter = {
      platform: 'meta',
      schemaVersion: '1.0',
      capabilities: [
        {entity: 'campaign', ops: ['update_budget'], reversible: true},
      ],
      plan: async (req: ActionRequest) => ({
        request: req,
        valid: true,
        projectedCost: (req.payload as {cost?: number})?.cost ?? 200,
        warnings: [],
      }),
      execute: async () => ({ok: true, auditRef: 'exec-1'}),
      rollback: async () => ({ok: true, auditRef: 'rb-1'}),
      read: async () => [],
      healthCheck: async () => ({
        ok: true,
        latencyMs: 5,
        schemaDriftDetected: false,
        deprecationWarnings: [],
      }),
    };
  });

  describe('PinoLogger', () => {
    it('should format logs in structured JSON and obey minLevel', () => {
      const logger = new PinoLogger(30, true); // Info level minimum

      logger.debug('hidden trace');
      logger.info('visible message', {userId: 'user-123'});
      logger.error('error happened', {errCode: 500});

      expect(logger.loggedEntries.length).toBe(2);

      const parsedInfo = JSON.parse(logger.loggedEntries[0]) as {
        level: number;
        msg: string;
        userId: string;
      };
      expect(parsedInfo.level).toBe(30);
      expect(parsedInfo.msg).toBe('visible message');
      expect(parsedInfo.userId).toBe('user-123');

      const parsedErr = JSON.parse(logger.loggedEntries[1]) as {
        level: number;
        msg: string;
        errCode: number;
      };
      expect(parsedErr.level).toBe(50);
      expect(parsedErr.errCode).toBe(500);
    });
  });

  describe('SupabaseClient', () => {
    it('should persist and retrieve trust tiers and audit logs', async () => {
      const supabase = new SupabaseClient(
        'https://mock.supabase.co',
        'key',
        true,
      );

      // Verify initial state
      const initial = await supabase.getTrustTier('tenant-1', 'update_budget');
      expect(initial).toBeNull();

      // Save and retrieve
      await supabase.saveTrustTier('tenant-1', 'update_budget', 2);
      const updated = await supabase.getTrustTier('tenant-1', 'update_budget');
      expect(updated).toBe(2);

      // Audit logs
      await supabase.logAudit({
        tenant: 'tenant-1',
        timestamp: new Date().toISOString(),
        action_id: 'act-01',
        op: 'update_budget',
        entity: 'campaign',
        target_id: 'c-123',
        cost: 500,
        decision: 'AUTO_EXECUTE',
        reason: 'Success',
      });

      const logs = await supabase.getAuditLogs('tenant-1');
      expect(logs.length).toBe(1);
      expect(logs[0].action_id).toBe('act-01');
      expect(logs[0].decision).toBe('AUTO_EXECUTE');
    });

    it('should acquire and release distributed lease locks', async () => {
      const supabase = new SupabaseClient(
        'https://mock.supabase.co',
        'key',
        true,
      );

      // Acquire lock successfully
      const acquired = await supabase.acquireLock('c-123', 'agent-1', 1000);
      expect(acquired).toBe(true);

      // Fail to acquire held lock
      const reAcquired = await supabase.acquireLock('c-123', 'agent-2', 1000);
      expect(reAcquired).toBe(false);

      // Release lock
      await supabase.releaseLock('c-123', 'agent-1');

      // Now agent-2 should acquire it
      const acquiredBy2 = await supabase.acquireLock('c-123', 'agent-2', 1000);
      expect(acquiredBy2).toBe(true);
    });
  });

  describe('OPA Policy Engine', () => {
    it('should evaluate low-risk operations for trusted tenants', async () => {
      const opa = new OpaPolicyEngine('http://mock-url', true);
      const req: ActionRequest = {
        idempotencyKey: 'key-1',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'c-1',
        confidence: 0.9,
        payload: {cost: 200},
      };
      const plan: ActionPlan = {
        request: req,
        valid: true,
        projectedCost: 200,
        warnings: [],
      };
      const ctx: Context = {
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
      };

      // Allowed with trust tier >= 2
      const allowed = await opa.evaluate(req, plan, ctx, 2);
      expect(allowed).toBe(true);

      // Blocked with trust tier < 2
      const blocked = await opa.evaluate(req, plan, ctx, 1);
      expect(blocked).toBe(false);
    });

    it('should enforce CFO waiver rules for high-risk operations', async () => {
      const opa = new OpaPolicyEngine('http://mock-url', true);
      const req: ActionRequest = {
        idempotencyKey: 'key-1',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'c-1',
        confidence: 0.9,
        payload: {cost: 1500},
      };
      const plan: ActionPlan = {
        request: req,
        valid: true,
        projectedCost: 1500,
        warnings: [],
      };
      const ctx: Context = {
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
        activeWaivers: [
          {
            overrideRole: 'CFO',
            expiresAtMs: Date.now() + 60000,
            allowedOps: ['update_budget'],
            reason: 'Q3 scale up approved',
          },
        ],
      };

      // Allowed with valid CFO waiver
      const allowed = await opa.evaluate(req, plan, ctx, 2);
      expect(allowed).toBe(true);

      // Blocked if waiver expired
      const expiredWaiver: Waiver = {
        overrideRole: 'CFO',
        expiresAtMs: Date.now() - 1000,
        allowedOps: ['update_budget'],
        reason: 'Past campaign',
      };
      ctx.activeWaivers = [expiredWaiver];
      const blocked = await opa.evaluate(req, plan, ctx, 2);
      expect(blocked).toBe(false);
    });
  });

  describe('GovernanceEngine Integration Loop', () => {
    it('should persist decisions to Supabase and log via Pino', async () => {
      const supabase = new SupabaseClient('https://mock-url', 'key', true);
      // Seed variant to pass COGS coverage check (needs >= 70%)
      await supabase.saveVariant({
        variant_id: 'v-dummy-int',
        sku: 'sku-dummy-int',
        title: 'Dummy Variant Int',
        price: 10,
        cost: 5,
        tenant_id: 'tenant-1',
        ingested_at: new Date().toISOString(),
      });
      const opa = new OpaPolicyEngine('http://mock-url', true);
      const engine = new GovernanceEngine(
        mockAuditSink,
        mockTrustLedger,
        mockCircuitBreaker,
        undefined,
        opa,
        supabase,
      );

      const req: ActionRequest = {
        idempotencyKey: 'key-1',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'c-1',
        confidence: 0.9,
        payload: {cost: 200},
      };
      const ctx: Context = {
        tenant: {
          tenantId: 'tenant-1',
          policy: {
            maxDailyDollarsRisk: 2000,
            maxBudgetMovePct: 0.2,
            minConfidence: 0.8,
            escalationRole: 'cfo',
          },
        },
        role: {
          name: 'Media Buyer',
          permits: (op: string) => op === 'update_budget',
        } as unknown as Role,
        verifyWindowMs: 5000,
      };

      // Seed trust tier in Supabase
      await supabase.saveTrustTier('tenant-1', 'update_budget', 2);

      const response = await engine.govern(mockAdapter, req, ctx);
      expect(response.status).toBe('executed');

      // Verify audit logs in Supabase
      const dbLogs = await supabase.getAuditLogs('tenant-1');
      expect(dbLogs.some((l) => l.decision === 'AUTO_EXECUTE')).toBe(true);

      // Verify pino logging outputs
      expect(
        engine.logger.loggedEntries.some((l) =>
          l.includes('Planned action evaluation started'),
        ),
      ).toBe(true);
      expect(
        engine.logger.loggedEntries.some((l) =>
          l.includes('Decision resolved'),
        ),
      ).toBe(true);
    });
  });

  describe('RealtimeEventBus', () => {
    let bus: RealtimeEventBus;

    beforeEach(() => {
      bus = new RealtimeEventBus();
    });

    afterEach(() => {
      bus.cleanup();
    });

    it('should emit events immediately when below burst rate limit', () => {
      const events: any[] = [];
      bus.on('event', (e) => events.push(e));

      bus.emitRiskAlert('t1', 'a1', 'high', 'Alert 1');
      bus.emitRiskAlert('t1', 'a2', 'high', 'Alert 2');

      expect(events.length).toBe(2);
      expect(events[0].alertId).toBe('a1');
      expect(events[1].alertId).toBe('a2');
    });

    it('should queue and delay event emissions when burst capacity is exceeded', async () => {
      const events: any[] = [];
      bus.on('event', (e) => events.push(e));

      // Emit 12 events. The first 10 (burst limit) should emit immediately.
      // The remaining 2 should be queued and delayed.
      for (let i = 0; i < 12; i++) {
        bus.emitRiskAlert('t1', `alert-${i}`, 'info', `Msg ${i}`);
      }

      // Check immediately: only 10 should be emitted
      expect(events.length).toBe(10);

      // Wait up to 600ms for 11th event to emit
      let start = Date.now();
      while (events.length < 11 && Date.now() - start < 600) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(events.length).toBe(11);

      // Wait up to another 600ms (total 1200ms) for 12th event to emit
      start = Date.now();
      while (events.length < 12 && Date.now() - start < 600) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(events.length).toBe(12);
      expect(events[11].alertId).toBe('alert-11');
    });
  });
});
