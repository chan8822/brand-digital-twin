import { CooldownManager } from './cooldown_manager';
import { SupabaseClient } from './supabase_client';
import { ActionRequest } from './platform_adapter';

describe('CooldownManager (P1.9)', () => {
  let db: SupabaseClient;
  let cooldownManager: CooldownManager;
  const tenantId = 'tenant_cooldown_123';

  beforeEach(() => {
    // Instantiate with mockMode = true
    db = new SupabaseClient('https://mock.supabase.co', 'mock-key', true);
    cooldownManager = new CooldownManager(db);
    cooldownManager.bypassInTests = false;
    db.resetLocalMockDb();
  });

  const sampleRequest: ActionRequest = {
    idempotencyKey: 'req_111',
    op: 'update_budget',
    entity: 'campaign',
    targetId: 'camp_888',
    payload: { bid: 1.5 },
    confidence: 0.95,
  };

  it('should allow execution if no previous execution is logged', async () => {
    const allowed = await cooldownManager.checkCooldown(tenantId, sampleRequest);
    expect(allowed).toBe(true);
  });

  it('should allow execution if previous execution is older than cooldown window', async () => {
    // Log an execution from 25 hours ago (default window = 24h)
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await db.logAudit({
      tenant: tenantId,
      timestamp: oldTimestamp,
      action_id: 'old_req',
      op: sampleRequest.op,
      entity: sampleRequest.entity,
      target_id: sampleRequest.targetId,
      cost: 100,
      decision: 'executed',
      reason: 'Applied campaign bid adjustment',
    });

    const allowed = await cooldownManager.checkCooldown(tenantId, sampleRequest);
    expect(allowed).toBe(true);
  });

  it('should block execution if a previous execution is logged inside the cooldown window', async () => {
    // Log an execution from 1 hour ago
    const recentTimestamp = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await db.logAudit({
      tenant: tenantId,
      timestamp: recentTimestamp,
      action_id: 'recent_req',
      op: sampleRequest.op,
      entity: sampleRequest.entity,
      target_id: sampleRequest.targetId,
      cost: 100,
      decision: 'executed',
      reason: 'Applied campaign bid adjustment',
    });

    const allowed = await cooldownManager.checkCooldown(tenantId, sampleRequest);
    expect(allowed).toBe(false);
  });

  it('should allow execution as failsafe if the database query fails', async () => {
    // Force database query to throw an error by spying on getRecentExecutions
    spyOn(db, 'getRecentExecutions').and.returnValue(Promise.reject(new Error('DB connection timeout')));

    const allowed = await cooldownManager.checkCooldown(tenantId, sampleRequest);
    // Should recover gracefully and allow execution as failsafe
    expect(allowed).toBe(true);
  });
});
