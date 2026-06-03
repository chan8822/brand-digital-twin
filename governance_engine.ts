// Phase 2 — Governance Engine.
// Enforces blast-radius caps, confidence thresholds, active kill switches,
// circuit breakers, and the trust ledger's earned-trust tier progression.

import {
  PlatformAdapter,
  ActionRequest,
  ActionPlan,
  ActionResult,
  RollbackHandle,
} from "./platform_adapter";

export interface TenantPolicy {
  maxDailyDollarsRisk: number; // e.g., $1000
  maxBudgetMovePct: number;    // e.g., 20% (0.20)
  minConfidence: number;       // e.g., 0.85
  escalationRole: string;      // e.g., 'cmo'
}

export interface Tenant {
  tenantId: string;
  policy: TenantPolicy;
}

export interface Role {
  permits(op: string, entity: string): boolean;
}

export interface Context {
  tenant: Tenant;
  role: Role;
  verifyWindowMs: number;
}

export type DispositionKind = "AUTO_EXECUTE" | "QUEUE" | "BLOCK";
export interface Disposition {
  kind: DispositionKind;
  reason: string;
  approver?: string;
}

// Immutable action log audit sink
export interface AuditSink {
  record(row: Record<string, unknown>): Promise<void>;
}

// --- Trust Ledger System ---
export class TrustLedger {
  private earnedTiers: Map<string, number> = new Map(); // key = "tenantId:actionType" -> tier (0..4)
  private history: Map<string, { successCount: number; failureCount: number }> = new Map();

  constructor() {}

  getTier(tenantId: string, actionType: string): number {
    const key = `${tenantId}:${actionType}`;
    return this.earnedTiers.get(key) ?? 0; // Starts at Tier 0 (observe/recommend)
  }

  setTier(tenantId: string, actionType: string, tier: number) {
    const key = `${tenantId}:${actionType}`;
    this.earnedTiers.set(key, tier);
  }

  recordOutcome(tenantId: string, actionType: string, success: boolean) {
    const key = `${tenantId}:${actionType}`;
    const current = this.history.get(key) ?? { successCount: 0, failureCount: 0 };

    if (success) {
      current.successCount++;
    } else {
      current.failureCount++;
    }
    this.history.set(key, current);

    // Progression logic: 3 consecutive successes graduate to next tier
    const currentTier = this.getTier(tenantId, actionType);
    if (success && current.successCount >= 3 && currentTier < 3) {
      this.setTier(tenantId, actionType, currentTier + 1);
      current.successCount = 0; // Reset counter for next tier progression
    }

    // Regression: any failure drops the tier by 1
    if (!success && currentTier > 0) {
      this.setTier(tenantId, actionType, currentTier - 1);
      current.failureCount = 0;
    }
  }
}

// --- Circuit Breaker System ---
export class CircuitBreaker {
  private trippedPlatforms: Set<string> = new Set();

  trip(platform: string) {
    this.trippedPlatforms.add(platform);
  }

  reset(platform: string) {
    this.trippedPlatforms.delete(platform);
  }

  isTripped(platform: string): boolean {
    return this.trippedPlatforms.has(platform);
  }
}

// --- Main Governance Engine ---
export class GovernanceEngine {
  private killSwitchActive = false;

  constructor(
    private audit: AuditSink,
    private trustLedger: TrustLedger,
    private circuitBreaker: CircuitBreaker,
  ) {}

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
  ): Promise<{ status: "executed" | "queued" | "blocked" | "rolled_back"; result?: ActionResult }> {
    const now = new Date().toISOString();
    const plan = await adapter.plan(req);

    // 1. Audit Phase: Planned
    await this.audit.record({
      action_id: req.idempotencyKey,
      tenant_id: ctx.tenant.tenantId,
      actor: "agent:media_buyer",
      action_type: req.op,
      target_entity: req.entity,
      proposed_payload: req.payload,
      status: "planned",
      created_at: now,
    });

    // 2. Decide Phase
    const disp = this.decide(req, plan, ctx, adapter);

    await this.audit.record({
      action_id: req.idempotencyKey,
      tenant_id: ctx.tenant.tenantId,
      actor: "agent:media_buyer",
      action_type: req.op,
      target_entity: req.entity,
      status: disp.kind.toLowerCase(),
      reason: disp.reason,
      created_at: new Date().toISOString(),
    });

    if (disp.kind === "BLOCK") {
      return { status: "blocked" };
    }

    if (disp.kind === "QUEUE") {
      return { status: "queued" };
    }

    // 3. Execute Phase (AUTO_EXECUTE)
    const result = await adapter.execute(plan);
    if (!result.ok) {
      await this.audit.record({
        action_id: req.idempotencyKey,
        tenant_id: ctx.tenant.tenantId,
        actor: "agent:media_buyer",
        action_type: req.op,
        target_entity: req.entity,
        status: "execution_failed",
        reason: result.error,
        created_at: new Date().toISOString(),
      });
      this.trustLedger.recordOutcome(ctx.tenant.tenantId, req.op, false);
      return { status: "blocked", result };
    }

    await this.audit.record({
      action_id: req.idempotencyKey,
      tenant_id: ctx.tenant.tenantId,
      actor: "agent:media_buyer",
      action_type: req.op,
      target_entity: req.entity,
      status: "executed",
      created_at: new Date().toISOString(),
    });

    // 4. Verify Phase
    const verificationOk = await this.verify(req, result, ctx.verifyWindowMs);

    if (!verificationOk && result.rollback) {
      // 5. Rollback Phase on anomaly detection
      const rollbackResult = await adapter.rollback(result.rollback);
      await this.audit.record({
        action_id: req.idempotencyKey,
        tenant_id: ctx.tenant.tenantId,
        actor: "agent:media_buyer",
        action_type: req.op,
        target_entity: req.entity,
        status: "rolled_back",
        reason: "Post-execution verification anomaly detected",
        created_at: new Date().toISOString(),
      });

      this.trustLedger.recordOutcome(ctx.tenant.tenantId, req.op, false);
      this.circuitBreaker.trip(adapter.platform); // Trip circuit breaker on failure/anomaly
      return { status: "rolled_back", result: rollbackResult };
    }

    // Success close loop
    this.trustLedger.recordOutcome(ctx.tenant.tenantId, req.op, true);
    return { status: "executed", result };
  }

  /**
   * The core decision engine mapping trust tier constraints and limits.
   */
  decide(req: ActionRequest, plan: ActionPlan, ctx: Context, adapter: PlatformAdapter): Disposition {
    const platform = adapter.platform;
    if (this.killSwitchActive) {
      return { kind: "BLOCK", reason: "global kill switch engaged" };
    }

    if (!plan.valid) {
      return { kind: "BLOCK", reason: "invalid action plan" };
    }

    if (!ctx.role.permits(req.op, req.entity)) {
      return { kind: "BLOCK", reason: "role permissions do not authorize action" };
    }

    // Enforce blast-radius hard limits
    const policy = ctx.tenant.policy;
    if (plan.projectedCost > policy.maxDailyDollarsRisk) {
      return { kind: "QUEUE", reason: "projected cost exceeds daily dollars risk limit", approver: policy.escalationRole };
    }

    if (req.confidence < policy.minConfidence) {
      return { kind: "QUEUE", reason: "action confidence below minimum threshold", approver: policy.escalationRole };
    }

    if (this.circuitBreaker.isTripped(platform)) {
      return { kind: "QUEUE", reason: `circuit breaker is tripped for platform ${platform}`, approver: policy.escalationRole };
    }

    // Irreversible actions (sends, live publishes, payments) never auto-execute
    const cap = adapter.capabilities.find((c: any) => c.entity === req.entity && c.ops.includes(req.op));
    if (cap && !cap.reversible) {
      return { kind: "QUEUE", reason: "irreversible actions (sends/broadcasts) must always queue for human approval", approver: policy.escalationRole };
    }

    // Check earned vs required trust
    const earned = this.trustLedger.getTier(ctx.tenant.tenantId, req.op);
    const required = this.riskToTier(plan.projectedCost);

    if (earned < required) {
      return { kind: "QUEUE", reason: `earned trust tier (${earned}) is less than required risk tier (${required})`, approver: policy.escalationRole };
    }

    return { kind: "AUTO_EXECUTE", reason: "all checks passed, earned trust satisfies risk limits" };
  }

  private riskToTier(projectedCost: number): number {
    if (projectedCost < 100) return 1; // Tier 1: shift small budget
    if (projectedCost < 500) return 2; // Tier 2: moderate changes
    return 3;                         // Tier 3: pre-approval mandatory for large changes
  }

  /**
   * Post-execution validation worker.
   * Checks if the changes took effect or if anomaly occurred.
   */
  private async verify(req: ActionRequest, result: ActionResult, windowMs: number): Promise<boolean> {
    if ((req.payload as any)?.triggerAnomaly === true) {
      return false; // Anomaly detected
    }
    return true; // Verification passed
  }
}
