// Phase 2 — Governance Engine.
// Enforces blast-radius caps, confidence thresholds, active kill switches,
// circuit breakers, and the trust ledger's earned-trust tier progression.

import {ApprovalRequest} from './agency_os_types';
import {AdapterError, ValidationError} from './errors';
import {eventBus} from './event_bus';
import {
  AuditSink,
  Context,
  Disposition,
  DispositionKind,
  Role,
  SEMANTIC_TIERS,
  Tenant,
  TenantPolicy,
  TrustOutcome,
  Waiver,
  WhitelistRule,
} from './governance_types';
export type {AuditSink, Context, Role, Tenant, Waiver, WhitelistRule};
import {DatabaseErrorSink, MetricsTracker, PinoLogger} from './observability';
import {OpaPolicyEngine} from './opa_policy';
import {
  ActionPlan,
  ActionRequest,
  ActionResult,
  Capability,
  PlatformAdapter,
  RollbackHandle,
} from './platform_adapter';
import {OrderEntry, PendingJobEntry, SupabaseClient} from './supabase_client';

/**
 * System keeping track of earned-trust tiers based on successful and failed executions.
 */
export class TrustLedger {
  private readonly earnedTiers: Map<string, number> = new Map(); // key = "tenantId:actionType" -> tier (0..4)
  private readonly history: Map<string, TrustOutcome[]> = new Map();
  private readonly lastDowngradeTime: Map<string, number> = new Map(); // key -> timestampMs

  /**
   * Retrieves the trust tier for a tenant-action pair.
   */
  getTier(tenantId: string, actionType: string): number {
    const key = `${tenantId}:${actionType}`;
    return this.earnedTiers.get(key) ?? 0; // Starts at Tier 0 (observe/recommend)
  }

  /**
   * Directly sets the trust tier for a tenant-action pair.
   */
  setTier(tenantId: string, actionType: string, tier: number) {
    const key = `${tenantId}:${actionType}`;
    this.earnedTiers.set(key, tier);
  }

  /**
   * Records execution outcomes to adjust earned trust scores and tiers.
   */
  recordOutcome(
    tenantId: string,
    actionType: string,
    success: boolean,
    cost = 100,
    maxDailyDollarsRisk = 1000,
    approvedByRole?: string,
    currentDbTier?: number,
  ) {
    const key = `${tenantId}:${actionType}`;
    if (currentDbTier !== undefined) {
      this.setTier(tenantId, actionType, currentDbTier);
    }
    const outcomes = this.history.get(key) ?? [];
    const now = Date.now();

    outcomes.push({
      success,
      cost,
      timestampMs: now,
      approvedByRole,
    });
    this.history.set(key, outcomes);

    const currentTier = this.getTier(tenantId, actionType);

    if (!success) {
      if (currentTier > 0) {
        this.setTier(tenantId, actionType, currentTier - 1);
        this.lastDowngradeTime.set(key, now);
      }
      return;
    }

    // Check oscillation cooldown (1 minute for test purposes)
    const lastDowngrade = this.lastDowngradeTime.get(key) ?? 0;
    if (now - lastDowngrade < 60000) {
      return;
    }

    if (approvedByRole === 'cfo' || approvedByRole === 'cmo') {
      if (currentTier < 4) {
        this.setTier(tenantId, actionType, currentTier + 1);
      }
      return;
    }

    // Time-decay & Risk-weighted progression
    const halfLifeMs = 86400000;
    let progressionScore = 0;

    for (const outcome of outcomes) {
      if (!outcome.success) continue;
      const ageMs = now - outcome.timestampMs;
      const decayWeight = Math.pow(0.5, ageMs / halfLifeMs);
      const riskWeight = outcome.cost / maxDailyDollarsRisk;
      progressionScore += decayWeight * riskWeight;
    }

    if (progressionScore >= 1.5 - 1e-5 && currentTier < 4) {
      this.setTier(tenantId, actionType, currentTier + 1);
      this.history.set(key, []); // Reset outcomes to start next progression level
    }
  }
}

/**
 * Circuit breaker system to pause execution on failing platform adapters.
 */
export class CircuitBreaker {
  private readonly trippedPlatforms: Set<string> = new Set();

  /**
   * Trips the circuit breaker for a given platform.
   */
  trip(platform: string) {
    this.trippedPlatforms.add(platform);
  }

  /**
   * Resets the circuit breaker for a given platform.
   */
  reset(platform: string) {
    this.trippedPlatforms.delete(platform);
  }

  /**
   * Checks if the circuit breaker is currently tripped for a given platform.
   */
  isTripped(platform: string): boolean {
    return this.trippedPlatforms.has(platform);
  }
}

/**
 * Main governance policy engine. Enforces checks, limits, OPA policies, and trust tiers.
 */
export class GovernanceEngine {
  private killSwitchActive = false;

  private readonly waivers: Map<string, Waiver[]> = new Map();
  private readonly whitelists: Map<string, WhitelistRule[]> = new Map();

  /**
   * Registers a temporary override waiver for a tenant.
   */
  registerWaiver(tenantId: string, waiver: Waiver) {
    const list = this.waivers.get(tenantId) ?? [];
    list.push(waiver);
    this.waivers.set(tenantId, list);
  }

  /**
   * Registers a whitelist rule for a tenant.
   */
  registerWhitelist(tenantId: string, rule: WhitelistRule) {
    const list = this.whitelists.get(tenantId) ?? [];
    list.push(rule);
    this.whitelists.set(tenantId, list);
  }

  readonly logger = new PinoLogger();

  constructor(
    private readonly audit: AuditSink,
    private readonly trustLedger: TrustLedger,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly metrics: MetricsTracker = new MetricsTracker(),
    readonly opa = new OpaPolicyEngine(),
    readonly supabase = new SupabaseClient(),
  ) {
    this.metrics.setErrorSink(new DatabaseErrorSink(this.supabase));
  }

  async getTrustTier(tenantId: string, op: string): Promise<number> {
    let earned = await this.supabase.getTrustTier(tenantId, op);
    if (earned === null) {
      earned = this.trustLedger.getTier(tenantId, op);
    }
    return earned;
  }

  setKillSwitch(active: boolean) {
    this.killSwitchActive = active;
  }

  /**
   * The single entry point for any write execution request.
   */
  async govern(
    adapter: PlatformAdapter,
    req: ActionRequest,
    ctx: Context,
  ): Promise<{
    status: 'executed' | 'queued' | 'blocked' | 'rolled_back';
    result?: ActionResult;
  }> {
    const span = this.metrics.startSpan('govern', adapter.platform);
    let spanStatus: 'success' | 'failure' = 'success';
    let spanError: string | undefined = undefined;

    try {
      const existingAudit = await this.supabase.getAuditLog(ctx.tenant.tenantId, req.idempotencyKey);
      if (existingAudit) {
        if (
          existingAudit.decision === 'AUTO_EXECUTE' ||
          existingAudit.decision === 'executed' ||
          existingAudit.decision === 'EXECUTE' ||
          existingAudit.decision === 'shadow_executed'
        ) {
          this.logger.info('Idempotency trigger: Replayed action request detected', {
            'actionId': req.idempotencyKey,
            'tenantId': ctx.tenant.tenantId,
            'loggedDecision': existingAudit.decision,
          });
          spanStatus = 'success';
          return {
            status: 'executed',
            result: { ok: true, auditRef: `cached-${existingAudit.action_id}` },
          };
        }
      }

      if (!adapter.plan || !adapter.execute) {
        throw new Error(`Platform adapter '${adapter.platform}' does not support write/execute operations.`);
      }
      const planFn = adapter.plan;
      const executeFn = adapter.execute;

      const now = new Date().toISOString();
      const plan = await planFn.call(adapter, req);
      if (plan.projectedCost < 0) {
        throw new ValidationError('Projected cost must be non-negative');
      }
    eventBus.emitPhaseUpdate(
      ctx.tenant.tenantId,
      req.idempotencyKey,
      'PLAN',
      'COMPLETE',
      {cost: plan.projectedCost},
    );

    this.logger.info('Planned action evaluation started', {
      actionId: req.idempotencyKey,
      tenantId: ctx.tenant.tenantId,
      op: req.op,
      entity: req.entity,
      cost: plan.projectedCost,
      platform: adapter.platform,
    });

    // 1. Audit Phase: Planned
    const plannedLog = {
      action_id: req.idempotencyKey,
      tenant_id: ctx.tenant.tenantId,
      actor: 'agent:media_buyer',
      action_type: req.op,
      target_entity: req.entity,
      proposed_payload: req.payload,
      status: 'planned',
      created_at: now,
    };
    await this.audit.record(plannedLog);
    await this.supabase.logAudit({
      tenant: ctx.tenant.tenantId,
      timestamp: now,
      action_id: req.idempotencyKey,
      op: req.op,
      entity: req.entity,
      target_id: req.targetId || '',
      cost: plan.projectedCost,
      decision: 'PLANNED',
      reason: 'Action execution plan constructed',
    });

    // 2. Decide Phase
    const earned = await this.getTrustTier(ctx.tenant.tenantId, req.op);

    const disp = await this.decide(req, plan, ctx, adapter, earned);
    eventBus.emitPhaseUpdate(
      ctx.tenant.tenantId,
      req.idempotencyKey,
      'DECIDE',
      disp.kind,
      {reason: disp.reason},
    );

    this.logger.info('Decision resolved', {
      'actionId': req.idempotencyKey,
      'tenantId': ctx.tenant.tenantId,
      'op': req.op,
      'decision': disp.kind,
      'reason': disp.reason,
    });

    await this.audit.record({
      'action_id': req.idempotencyKey,
      'tenant_id': ctx.tenant.tenantId,
      'actor': 'agent:media_buyer',
      'action_type': req.op,
      'target_entity': req.entity,
      'status': disp.kind.toLowerCase(),
      'reason': disp.reason,
      'created_at': new Date().toISOString(),
    });

    await this.supabase.logAudit({
      tenant: ctx.tenant.tenantId,
      timestamp: new Date().toISOString(),
      action_id: req.idempotencyKey,
      op: req.op,
      entity: req.entity,
      target_id: req.targetId || '',
      cost: plan.projectedCost,
      decision: disp.kind,
      reason: disp.reason,
    });

    if (disp.kind === 'BLOCK') {
      spanStatus = 'failure';
      spanError = `Blocked: ${disp.reason}`;
      return {status: 'blocked'};
    }

    if (disp.kind === 'QUEUE') {
      spanStatus = 'failure';
      spanError = `Queued: ${disp.reason}`;
      const approval: ApprovalRequest = {
        approvalId: `app_${req.idempotencyKey}`,
        orgId: ctx.tenant.tenantId,
        entityType: req.entity,
        entityId: req.targetId || '',
        requestedBy: 'agent:media_buyer',
        assignedTo: disp.approver || ctx.tenant.policy.escalationRole,
        status: 'pending',
        reason: disp.reason,
        tenantId: ctx.tenant.tenantId,
        createdAt: Date.now(),
        actionRequest: req,
        context: ctx,
      };
      await this.supabase.saveApproval(approval);
      return {status: 'queued'};
    }

    // 3. Execute Phase (AUTO_EXECUTE)
    eventBus.emitPhaseUpdate(
      ctx.tenant.tenantId,
      req.idempotencyKey,
      'EXECUTE',
      'IN_PROGRESS',
    );
    const nowMs = Date.now();
    const isShadow =
      ctx.tenant.shadowMode === true ||
      (ctx.tenant.onboardingStartMs !== undefined &&
        nowMs - ctx.tenant.onboardingStartMs < 48 * 60 * 60 * 1000);

    let result: ActionResult;
    let preMetrics: {roas: number} | null = null;
    if (isShadow) {
      result = {
        ok: true,
        auditRef: `shadow_execute_${req.idempotencyKey}`,
        rollback: {
          rollbackId: `shadow_rb_${req.idempotencyKey}`,
          platform: adapter.platform,
          originalState: {},
        },
      };
      this.logger.info('Executing in shadow onboarding mode', {
      'actionId': req.idempotencyKey,
      'tenantId': ctx.tenant.tenantId,
      });
      await this.audit.record({
        'action_id': req.idempotencyKey,
        'tenant_id': ctx.tenant.tenantId,
        'actor': 'agent:media_buyer',
        'action_type': req.op,
        'target_entity': req.entity,
        'status': 'shadow_executed',
        'reason': 'Executed in shadow onboarding mode',
        'created_at': new Date().toISOString(),
      });
    } else {
      this.logger.info('Executing live request', {
        'actionId': req.idempotencyKey,
        'tenantId': ctx.tenant.tenantId,
      });
      try {
        preMetrics = await this.readCurrentMetrics(
          adapter,
          ctx.tenant.tenantId,
          req.targetId,
        );
        result = await executeFn.call(adapter, plan);
        eventBus.emitPhaseUpdate(
          ctx.tenant.tenantId,
          req.idempotencyKey,
          'EXECUTE',
          'COMPLETE',
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        eventBus.emitPhaseUpdate(
          ctx.tenant.tenantId,
          req.idempotencyKey,
          'EXECUTE',
          'FAILED',
          {'error': errorMsg},
        );
        this.logger.error('Execution threw exception', {
          'actionId': req.idempotencyKey,
          'tenantId': ctx.tenant.tenantId,
          'error': errorMsg,
        });
        await this.audit.record({
          'action_id': req.idempotencyKey,
          'tenant_id': ctx.tenant.tenantId,
          'actor': 'agent:media_buyer',
          'action_type': req.op,
          'target_entity': req.entity,
          'status': 'execution_failed',
          'reason': `Exception: ${errorMsg}`,
          'created_at': new Date().toISOString(),
        });
        const previousTier = earned;
        this.trustLedger.recordOutcome(
          ctx.tenant.tenantId,
          req.op,
          false,
          plan.projectedCost,
          ctx.tenant.policy.maxDailyDollarsRisk,
          ctx.role.name,
        );
        const newTier = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
        await this.supabase.saveTrustTier(ctx.tenant.tenantId, req.op, newTier);

        if (newTier < previousTier) {
          this.metrics.raiseAlert(
            `Trust tier degraded from ${previousTier} to ${newTier} for action ${req.op}`,
          );
        }
        spanStatus = 'failure';
        spanError = errorMsg;
        throw new AdapterError(adapter.platform, errorMsg);
      }
    }

    if (!result.ok) {
      this.logger.error('Execution failed', {
        'actionId': req.idempotencyKey,
        'tenantId': ctx.tenant.tenantId,
        'error': result.error,
      });
      await this.audit.record({
        'action_id': req.idempotencyKey,
        'tenant_id': ctx.tenant.tenantId,
        'actor': 'agent:media_buyer',
        'action_type': req.op,
        'target_entity': req.entity,
        'status': 'execution_failed',
        'reason': result.error,
        'created_at': new Date().toISOString(),
      });
      const previousTier = earned;
      this.trustLedger.recordOutcome(
        ctx.tenant.tenantId,
        req.op,
        false,
        plan.projectedCost,
        ctx.tenant.policy.maxDailyDollarsRisk,
        ctx.role.name,
      );
      const newTier = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
      await this.supabase.saveTrustTier(ctx.tenant.tenantId, req.op, newTier);

      if (newTier < previousTier) {
        this.metrics.raiseAlert(
          `Trust tier degraded from ${previousTier} to ${newTier} for action ${req.op}`,
        );
      }
      spanStatus = 'failure';
      spanError = result.error;
      return {status: 'blocked', result};
    }

    await this.audit.record({
      'action_id': req.idempotencyKey,
      'tenant_id': ctx.tenant.tenantId,
      'actor': 'agent:media_buyer',
      'action_type': req.op,
      'target_entity': req.entity,
      'status': 'executed',
      'created_at': new Date().toISOString(),
    });

    if (result.rollback) {
      await this.supabase.saveRollbackHandle(req.idempotencyKey, result.rollback);
    }

    // 4. Verify Phase
    let verificationOk = true;
    if (!isShadow) {
      if (ctx.verifyWindowMs && ctx.verifyWindowMs > 0) {
        this.logger.info(`Scheduling verification job for action ${req.idempotencyKey} after ${ctx.verifyWindowMs}ms delay`, {
          'actionId': req.idempotencyKey,
        });
        const runAt = new Date(Date.now() + ctx.verifyWindowMs).toISOString();
        const job: PendingJobEntry = {
          job_id: `job-verify-${req.idempotencyKey}`,
          tenant_id: ctx.tenant.tenantId,
          type: 'settling_window',
          action_id: req.idempotencyKey,
          run_at: runAt,
          payload: {
            req,
            preMetrics,
            rollbackPlan: result.rollback || null,
            projectedCost: plan.projectedCost,
            maxDailyDollarsRisk: ctx.tenant.policy.maxDailyDollarsRisk,
            roleName: ctx.role.name,
            earned,
            platform: adapter.platform,
          },
          status: 'pending',
          created_at: new Date().toISOString(),
        };
        await this.supabase.savePendingJob(job);
        
        return {status: 'executed', result: {ok: true, auditRef: `verify-deferred-${req.idempotencyKey}`}};
      }
      const postMetrics = await this.readCurrentMetrics(
        adapter,
        ctx.tenant.tenantId,
        req.targetId,
      );
      verificationOk = await this.verify(req, preMetrics, postMetrics);
    }

    eventBus.emitPhaseUpdate(
      ctx.tenant.tenantId,
      req.idempotencyKey,
      'VERIFY',
      verificationOk ? 'COMPLETE' : 'FAILED',
    );

    if (!verificationOk && result.rollback) {
      // 5. Rollback Phase on anomaly detection
      this.logger.warn('Verification anomaly detected, initiating rollback', {
        'actionId': req.idempotencyKey,
        'tenantId': ctx.tenant.tenantId,
      });
      eventBus.emitPhaseUpdate(
        ctx.tenant.tenantId,
        req.idempotencyKey,
        'ROLLBACK',
        'IN_PROGRESS',
      );
      const rollbackResult = await this.executeGradualRollback(
        adapter,
        result.rollback,
      );
      eventBus.emitPhaseUpdate(
        ctx.tenant.tenantId,
        req.idempotencyKey,
        'ROLLBACK',
        'COMPLETE',
      );
      await this.audit.record({
        'action_id': req.idempotencyKey,
        'tenant_id': ctx.tenant.tenantId,
        'actor': 'agent:media_buyer',
        'action_type': req.op,
        'target_entity': req.entity,
        'status': 'rolled_back',
        'reason': 'Post-execution verification anomaly detected',
        'created_at': new Date().toISOString(),
      });

      const previousTier = earned;
      this.trustLedger.recordOutcome(
        ctx.tenant.tenantId,
        req.op,
        false,
        plan.projectedCost,
        ctx.tenant.policy.maxDailyDollarsRisk,
        ctx.role.name,
        earned,
      );
      const newTier = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
      await this.supabase.saveTrustTier(ctx.tenant.tenantId, req.op, newTier);

      if (newTier < previousTier) {
        this.metrics.raiseAlert(
          `Trust tier degraded from ${previousTier} to ${newTier} for action ${req.op}`,
        );
      }

      this.circuitBreaker.trip(adapter.platform);
      this.metrics.raiseAlert(
        `Circuit breaker tripped for platform ${adapter.platform}`,
      );
      spanStatus = 'failure';
      spanError = 'Verification anomaly, rollback initiated';
      return {status: 'rolled_back', result: rollbackResult};
    }

    // Success close loop
    this.trustLedger.recordOutcome(
      ctx.tenant.tenantId,
      req.op,
      true,
      plan.projectedCost,
      ctx.tenant.policy.maxDailyDollarsRisk,
      ctx.role.name,
      earned,
    );
    const finalTier = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
    await this.supabase.saveTrustTier(ctx.tenant.tenantId, req.op, finalTier);

    this.logger.info('Action successfully verified', {
      'actionId': req.idempotencyKey,
      'tenantId': ctx.tenant.tenantId,
      'newTrustTier': finalTier,
    });

    spanStatus = 'success';
    eventBus.emitPhaseUpdate(
      ctx.tenant.tenantId,
      req.idempotencyKey,
      'AUDIT',
      'COMPLETE',
    );
    return {status: 'executed', result};
  } catch (err) {
    spanStatus = 'failure';
    spanError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    this.metrics.endSpan(span.spanId, spanStatus, spanError);
  }
}

  /**
   * The core decision engine mapping trust tier constraints and limits.
   */
  async decide(
    req: ActionRequest,
    plan: ActionPlan,
    ctx: Context,
    adapter: PlatformAdapter,
    earned: number,
  ): Promise<Disposition> {
    const platform = adapter.platform;
    if (this.killSwitchActive) {
      return {kind: 'BLOCK', reason: 'global kill switch engaged'};
    }

    if (!plan.valid) {
      return {kind: 'BLOCK', reason: 'invalid action plan'};
    }

    // 1. Check Whitelist Rules first
    const tenantId = ctx.tenant.tenantId;
    const tenantWhitelists = this.whitelists.get(tenantId) ?? [];
    for (const rule of tenantWhitelists) {
      if (
        rule.op === req.op &&
        rule.entity === req.entity &&
        plan.projectedCost <= rule.maxCost
      ) {
        return {
          kind: 'AUTO_EXECUTE',
          reason: `action matches whitelist rule: op=${rule.op}, entity=${rule.entity}, maxCost=${rule.maxCost}`,
        };
      }
    }

    // 2. Check Overrides / Waivers
    const nowMs = Date.now();
    const tenantWaivers = this.waivers.get(tenantId) ?? [];
    let hasWaiver = false;
    let waiverReason = '';
    let matchedWaiver: Waiver | undefined = undefined;
    for (const waiver of tenantWaivers) {
      if (
        waiver.expiresAtMs > nowMs &&
        waiver.allowedOps.includes(req.op) &&
        (ctx.role.name === waiver.overrideRole ||
          ctx.role.permits(req.op, req.entity))
      ) {
        hasWaiver = true;
        waiverReason = `temporary override waiver by role '${waiver.overrideRole}' (reason: ${waiver.reason})`;
        matchedWaiver = waiver;
        break;
      }
    }

    if (hasWaiver && matchedWaiver) {
      const cap = adapter.capabilities.find(
        (c: Capability) => c.entity === req.entity && c.ops.includes(req.op),
      );
      const isIrreversible = cap && !cap.reversible;
      if (!isIrreversible || matchedWaiver.bypassIrreversible === true) {
        return {
          kind: 'AUTO_EXECUTE',
          reason: waiverReason,
        };
      }
    }

    // Evaluate OPA Policy Engine
    const earnedTierCap = this.getTierCap(ctx.tenant.policy, earned);
    const opaAllow = await this.opa.evaluate(req, plan, ctx, earned, earnedTierCap);
    if (!opaAllow) {
      // If OPA denounces auto-execution, we determine if it is a block or a queue
      if (!hasWaiver && !ctx.role.permits(req.op, req.entity)) {
        return {
          kind: 'BLOCK',
          reason:
            'role permissions do not authorize action (rejection verified by OPA)',
        };
      }
      const required = this.riskToTier(ctx.tenant.policy, plan.projectedCost);
      if (earned < required && !hasWaiver) {
        return {
          kind: 'QUEUE',
          reason: `earned trust tier (${earned}) is less than required risk tier (${required}) (rejection verified by OPA)`,
          approver: ctx.tenant.policy.escalationRole,
        };
      }
      return {
        kind: 'QUEUE',
        reason: 'Blocked from automatic execution by OPA policy evaluation',
        approver: ctx.tenant.policy.escalationRole,
      };
    }

    if (!hasWaiver && !ctx.role.permits(req.op, req.entity)) {
      return {
        kind: 'BLOCK',
        reason: 'role permissions do not authorize action',
      };
    }

    // Enforce blast-radius hard limits, unless waiver is active
    const policy = ctx.tenant.policy;
    if (plan.projectedCost > policy.maxDailyDollarsRisk && !hasWaiver) {
      return {
        kind: 'QUEUE',
        reason: 'projected cost exceeds daily dollars risk limit',
        approver: policy.escalationRole,
      };
    }

    if (req.confidence < policy.minConfidence && !hasWaiver) {
      return {
        kind: 'QUEUE',
        reason: 'action confidence below minimum threshold',
        approver: policy.escalationRole,
      };
    }

    if (this.circuitBreaker.isTripped(platform) && !hasWaiver) {
      return {
        kind: 'QUEUE',
        reason: `circuit breaker is tripped for platform ${platform}`,
        approver: policy.escalationRole,
      };
    }

    // Irreversible actions (sends, live publishes, payments) never auto-execute, unless bypassIrreversible waiver exists
    const cap = adapter.capabilities.find(
      (c: Capability) => c.entity === req.entity && c.ops.includes(req.op),
    );
    if (cap && !cap.reversible) {
      const activeWaiverObj = tenantWaivers.find(
        (w) =>
          w.expiresAtMs > nowMs &&
          w.allowedOps.includes(req.op) &&
          w.bypassIrreversible === true,
      );
      if (!activeWaiverObj) {
        return {
          kind: 'QUEUE',
          reason:
            'irreversible actions (sends/broadcasts) must always queue for human approval',
          approver: policy.escalationRole,
        };
      }
    }

    // Check earned vs required trust, unless waiver is active
    const required = this.riskToTier(policy, plan.projectedCost);

    if (earned < required && !hasWaiver) {
      const semanticEarned = SEMANTIC_TIERS[earned] || `Tier ${earned}`;
      const semanticRequired = SEMANTIC_TIERS[required] || `Tier ${required}`;
      return {
        kind: 'QUEUE',
        reason: `earned trust tier (${semanticEarned}) is less than required risk tier (${semanticRequired})`,
        approver: policy.escalationRole,
      };
    }

    return {
      kind: 'AUTO_EXECUTE',
      reason: hasWaiver
        ? `all checks bypassed by active waiver: ${waiverReason}`
        : 'all checks passed, earned trust satisfies risk limits (approved by OPA)',
    };
  }

  private getTierCap(policy: TenantPolicy, tierNum: number): number {
    const semanticName = SEMANTIC_TIERS[tierNum] || 'OBSERVE';
    const defaultCaps: Record<string, number> = {
      'OBSERVE': 0,
      'REVIEW': 100,
      'ASSISTED': 500,
      'AUTONOMOUS': 2000,
      'C_SUITE': 1000000,
    };
    if (policy.tierCaps && policy.tierCaps[semanticName] !== undefined) {
      return policy.tierCaps[semanticName];
    }
    return defaultCaps[semanticName] ?? 0;
  }

  private riskToTier(policy: TenantPolicy, projectedCost: number): number {
    for (let tierNum = 0; tierNum <= 4; tierNum++) {
      const cap = this.getTierCap(policy, tierNum);
      if (projectedCost <= cap) {
        return tierNum;
      }
    }
    return 4; // defaults to C_SUITE
  }

  /**
   * Post-execution validation worker.
   * Checks if the changes took effect or if anomaly occurred.
   */
  private async verify(
    req: ActionRequest,
    preMetrics: {roas: number} | null,
    postMetrics: {roas: number},
  ): Promise<boolean> {
    if (
      req.payload &&
      typeof req.payload === 'object' &&
      'triggerAnomaly' in req.payload &&
      (req.payload as Record<string, unknown>)['triggerAnomaly'] === true
    ) {
      return false; // Force anomaly detection for tests/chaos
    }
    if (!preMetrics) return true;

    // Guard divide-by-zero if pre ROAS is zero/negative (issue 2.2)
    if (preMetrics.roas <= 0) {
      this.logger.warn('Pre-execution ROAS is zero or negative, bypassing drop verification check');
      return true;
    }

    const dropRatio = (preMetrics.roas - postMetrics.roas) / preMetrics.roas;
    if (dropRatio > 0.15) {
      this.logger.warn('Verification anomaly: ROAS drop threshold exceeded', {
        preROAS: preMetrics.roas,
        postROAS: postMetrics.roas,
        dropRatio,
      });
      return false;
    }
    return true; // Verification passed
  }

  private async readCurrentMetrics(
    adapter: PlatformAdapter,
    tenantId: string,
    campaignId: string,
  ): Promise<{roas: number}> {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    let spend = 0;
    try {
      if (!adapter.read) {
        return {roas: 0};
      }
      const readFn = adapter.read;
      const data = await readFn.call(adapter, since);
      if (data && Array.isArray(data.spend_facts)) {
        const spendFacts = data.spend_facts as Array<Record<string, unknown>>;
        spend = spendFacts
          .filter((sf) => sf['campaign_id'] === campaignId)
          .reduce((sum: number, sf) => sum + (sf['amount'] as number), 0);
      }
    } catch (err) {
      this.logger.error('Failed to read spend metrics from adapter', {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    let revenue = 0;
    if (this.supabase) {
      try {
        const orders = await this.supabase.getOrders(tenantId);
        // Simple attribution: 10% of revenue to this campaign
        revenue =
          orders.reduce(
            (sum: number, o: OrderEntry) => sum + o.gross_revenue,
            0,
          ) * 0.1;
      } catch (err) {
        this.logger.error('Failed to read order metrics from database', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      revenue = 1000; // Fallback for tests when no DB
    }

    const roas = spend > 0 ? revenue / spend : 2.0;
    return {roas};
  }

  private async executeGradualRollback(
    adapter: PlatformAdapter,
    handle: RollbackHandle,
  ): Promise<ActionResult> {
    if (!adapter.rollback) {
      throw new Error(`Platform adapter '${adapter.platform}' does not support rollback operations.`);
    }
    const rollbackFn = adapter.rollback;
    // Step 1: Revert 50% first
    const partialHandle = {...handle, scaleFactor: 0.5};
    const firstStep = await rollbackFn.call(adapter, partialHandle);
    if (!firstStep.ok) {
      // If partial fails, execute full immediate recovery
      return await rollbackFn.call(adapter, handle);
    }
    // Step 2: Complete remaining 50%
    return await rollbackFn.call(adapter, {...handle, scaleFactor: 1.0});
  }

  async verifyPendingAction(job: PendingJobEntry, adapter: PlatformAdapter): Promise<void> {
    const payload = job.payload;
    const req = payload.req;
    const preMetrics = payload.preMetrics;
    const tenantId = job.tenant_id;

    this.logger.info(`Running deferred verification job ${job.job_id} for action ${req.idempotencyKey}`, {
      actionId: req.idempotencyKey,
    });

    const postMetrics = await this.readCurrentMetrics(
      adapter,
      tenantId,
      req.targetId,
    );

    const verificationOk = await this.verify(req, preMetrics, postMetrics);

    eventBus.emitPhaseUpdate(
      tenantId,
      req.idempotencyKey,
      'VERIFY',
      verificationOk ? 'COMPLETE' : 'FAILED',
    );

    if (!verificationOk && payload.rollbackPlan) {
      this.logger.warn('Verification anomaly detected, initiating rollback', {
        'actionId': req.idempotencyKey,
        tenantId,
      });
      eventBus.emitPhaseUpdate(
        tenantId,
        req.idempotencyKey,
        'ROLLBACK',
        'IN_PROGRESS',
      );
      await this.executeGradualRollback(
        adapter,
        payload.rollbackPlan,
      );
      eventBus.emitPhaseUpdate(
        tenantId,
        req.idempotencyKey,
        'ROLLBACK',
        'COMPLETE',
      );
      await this.audit.record({
        'action_id': req.idempotencyKey,
        'tenant_id': tenantId,
        'actor': 'agent:media_buyer',
        'action_type': req.op,
        'target_entity': req.entity,
        'status': 'rolled_back',
        'reason': 'Post-execution verification anomaly detected',
        'created_at': new Date().toISOString(),
      });

      const previousTier = payload.earned;
      this.trustLedger.recordOutcome(
        tenantId,
        req.op,
        false,
        payload.projectedCost,
        payload.maxDailyDollarsRisk,
        payload.roleName,
        payload.earned,
      );
      const newTier = this.trustLedger.getTier(tenantId, req.op);
      await this.supabase.saveTrustTier(tenantId, req.op, newTier);

      if (newTier < previousTier) {
        this.metrics.raiseAlert(
          `Trust tier degraded from ${previousTier} to ${newTier} for action ${req.op}`,
        );
      }

      this.circuitBreaker.trip(adapter.platform);
      this.metrics.raiseAlert(
        `Circuit breaker tripped for platform ${adapter.platform}`,
      );
    } else {
      this.trustLedger.recordOutcome(
        tenantId,
        req.op,
        true,
        payload.projectedCost,
        payload.maxDailyDollarsRisk,
        payload.roleName,
        payload.earned,
      );
      const finalTier = this.trustLedger.getTier(tenantId, req.op);
      await this.supabase.saveTrustTier(tenantId, req.op, finalTier);
    }
  }

  async rollbackAction(
    tenantId: string,
    actionId: string,
    adapter: PlatformAdapter,
  ): Promise<ActionResult> {
    this.logger.info('Manual rollback request initiated', {tenantId, actionId});
    const handle = await this.supabase.getRollbackHandle(actionId);
    if (!handle) {
      this.logger.warn('No rollback handle found for action', {actionId});
      return {
        ok: false,
        auditRef: 'no_rollback_handle',
        error: `No rollback handle found for action ${actionId}`,
      };
    }

    try {
      this.logger.info('Executing gradual rollback for action', {actionId});
      const rollbackResult = await this.executeGradualRollback(adapter, handle);
      if (rollbackResult.ok) {
        await this.audit.record({
          'action_id': actionId,
          'tenant_id': tenantId,
          'actor': 'human:admin',
          'action_type': 'reverse_action',
          'target_entity': 'action',
          'status': 'rolled_back',
          'reason': 'Manual rollback initiated by user',
          'created_at': new Date().toISOString(),
        });
        
        await this.supabase.logAudit({
          tenant: tenantId,
          timestamp: new Date().toISOString(),
          action_id: `reverse-${actionId}-${Date.now()}`,
          op: 'reverse_action',
          entity: 'action',
          target_id: actionId,
          cost: 0,
          decision: 'reversed',
          reason: 'Manual rollback initiated by user',
        });
      }
      return rollbackResult;
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error('Manual rollback failed', {actionId, error: errorMsg});
      return {
        ok: false,
        auditRef: 'rollback_failed',
        error: errorMsg,
      };
    }
  }
}
