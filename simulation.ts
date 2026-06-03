import {
  PlatformAdapter,
  Capability,
  HealthReport,
  ActionRequest,
  ActionPlan,
  ActionResult,
  RollbackHandle,
} from "./platform_adapter";
import { GovernanceEngine } from "./governance_engine";
import { Context } from "./governance_types";

// --- Chaos Adapter Wrapper ---
export class ChaosAdapterWrapper implements PlatformAdapter {
  platform: string;
  schemaVersion: string;
  capabilities: Capability[];

  chaosEnabled = false;
  failureRate = 0.0;
  latencyMinMs = 0;
  latencyMaxMs = 0;
  rateLimitTrip = false;

  constructor(private delegate: PlatformAdapter) {
    this.platform = delegate.platform;
    this.schemaVersion = delegate.schemaVersion;
    this.capabilities = delegate.capabilities;
  }

  setChaos(enabled: boolean, rate = 0.2, minMs = 50, maxMs = 200) {
    this.chaosEnabled = enabled;
    this.failureRate = rate;
    this.latencyMinMs = minMs;
    this.latencyMaxMs = maxMs;
  }

  setRateLimitTrip(trip: boolean) {
    this.rateLimitTrip = trip;
  }

  private async injectChaos() {
    if (!this.chaosEnabled) return;

    // Simulate latency
    if (this.latencyMaxMs > this.latencyMinMs) {
      const delay = Math.floor(Math.random() * (this.latencyMaxMs - this.latencyMinMs) + this.latencyMinMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (this.rateLimitTrip) {
      throw new Error("Rate Limit Exceeded (Status 429)");
    }

    // Simulate random failures
    if (Math.random() < this.failureRate) {
      throw new Error("Network timeout: failed to connect to advertising API service");
    }
  }

  async read(since: Date): Promise<any> {
    await this.injectChaos();
    return this.delegate.read(since);
  }

  async plan(req: ActionRequest): Promise<ActionPlan> {
    await this.injectChaos();
    return this.delegate.plan(req);
  }

  async execute(plan: ActionPlan): Promise<ActionResult> {
    await this.injectChaos();
    if (this.chaosEnabled && Math.random() < this.failureRate) {
      return { ok: false, auditRef: "chaos_fail", error: "Simulated partial write failure" };
    }
    return this.delegate.execute(plan);
  }

  async rollback(h: RollbackHandle): Promise<ActionResult> {
    await this.injectChaos();
    return this.delegate.rollback(h);
  }

  async healthCheck(): Promise<HealthReport> {
    if (this.rateLimitTrip) {
      return { ok: false, latencyMs: 0, schemaDriftDetected: false, deprecationWarnings: ["Rate limited"] };
    }
    return this.delegate.healthCheck();
  }
}

// --- Forensic Replayer ---
export class ForensicReplayer {
  constructor(private governance: GovernanceEngine) {}

  /**
   * Replays historical requests through governance engine policies.
   * Useful for testing policy changes against real audit trails.
   */
  async replay(auditLogs: any[], ctx: Context, adapter: PlatformAdapter): Promise<string[]> {
    const decisions: string[] = [];

    for (const log of auditLogs) {
      const req: ActionRequest = {
        idempotencyKey: log.action_id || log.idempotencyKey || `replay_${Math.random()}`,
        op: log.action_type || log.op || "update_budget",
        entity: log.target_entity || log.entity || "campaign",
        targetId: log.target_id || log.targetId || "c1",
        payload: log.proposed_payload || log.payload || {},
        confidence: log.confidence ?? 1.0,
      };

      const plan = await adapter.plan(req);
      const earned = await this.governance.getTrustTier(ctx.tenant.tenantId, req.op);
      const disp = await this.governance.decide(req, plan, ctx, adapter, earned);
      decisions.push(`${req.idempotencyKey}:${disp.kind}`);
    }

    return decisions;
  }
}
