// Phase 0 — shadow-mode governance.
// The chokepoint exists from commit one, but in Phase 0 it can only SIMULATE.
// Every action is planned and written to action_log as 'simulated'; execute() is never reached.
// Leaving shadow is a per-tenant config flag (Phase 2), never a code path that ships early.

import * as crypto from "node:crypto";

export type ActionRequest = {
  actor: string;          // 'agent:media_buyer' | 'human:<id>'
  actionType: string;     // 'budget.update' | 'campaign.pause' | ...
  target: string;         // canonical ref of the thing being acted on
  payload: unknown;
  confidence?: number;
};

export type Disposition = { kind: "SIMULATED" | "BLOCKED"; reason: string };

export interface AuditSink {
  record(row: Record<string, unknown>): Promise<void>; // writes to brand_twin.action_log
}

export interface TenantConfig {
  phase: "shadow" | "live";
  policyVersion: string;
}

const uuid = () => crypto.randomUUID();

export class ShadowGovernance {
  constructor(
    private audit: AuditSink,
    private config: (tenantId: string) => Promise<TenantConfig>
  ) {}

  // The only entry point for any write intent. In Phase 0 it cannot execute.
  async govern(tenantId: string, req: ActionRequest): Promise<Disposition> {
    const cfg = await this.config(tenantId);
    const base = {
      action_id: uuid(),
      tenant_id: tenantId,
      actor: req.actor,
      action_type: req.actionType,
      target_entity: req.target,
      proposed_payload: JSON.stringify(req.payload),
      policy_version: cfg.policyVersion,
      confidence: req.confidence ?? null,
      approver: null,
      rollback_ref: null,
      created_at: new Date().toISOString(),
    };

    // Invariant: in any non-live phase, nothing executes. Period.
    if (cfg.phase !== "live") {
      const disp: Disposition = {
        kind: "SIMULATED",
        reason: "shadow phase: action planned, not executed",
      };
      await this.audit.record({ ...base, status: "simulated", reason: disp.reason });
      return disp;
    }

    // Phase 2+ replaces this branch with the real decide() -> tiers, caps, approval queue, execute.
    const disp: Disposition = {
      kind: "BLOCKED",
      reason: "live governance not enabled in Phase 0",
    };
    await this.audit.record({ ...base, status: "blocked", reason: disp.reason });
    return disp;
  }
}
