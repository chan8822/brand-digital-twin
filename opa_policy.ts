/**
 * @fileoverview OPA Policy Evaluation client and simulator.
 */

import { ActionRequest, ActionPlan } from "./platform_adapter";
import { Context, Waiver } from "./governance_types";

export interface OPAInput {
  op: string;
  entity: string;
  cost: number;
  trust_tier: number;
  tenant_anomaly: boolean;
  waivers: Waiver[];
  current_time_ms: number;
}

export class OpaPolicyEngine {
  constructor(
    private readonly opaUrl = "http://localhost:8181/v1/data/brand_twin/safety/allow",
    private readonly useFallback = true,
  ) {}

  /**
   * Evaluates the request against the OPA policy.
   */
  async evaluate(req: ActionRequest, plan: ActionPlan, ctx: Context, trustTier: number): Promise<boolean> {
    const input: OPAInput = {
      op: req.op,
      entity: req.entity,
      cost: plan.projectedCost,
      trust_tier: trustTier,
      tenant_anomaly: ctx.triggerAnomaly ?? false,
      waivers: ctx.activeWaivers ?? [],
      current_time_ms: Date.now(),
    };

    if (!this.useFallback) {
      try {
        const response = await fetch(this.opaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });
        if (response.ok) {
          const body = await response.json() as { result?: boolean };
          return body.result ?? false;
        }
      } catch (err) {
        // Fall back or fail depending on config
      }
    }

    return this.fallbackEvaluate(input);
  }

  /**
   * Internal pure JS/TS evaluation mirroring the policy.rego logic.
   * Ensures offline testing and simulation works seamlessly out of the box.
   */
  private fallbackEvaluate(input: OPAInput): boolean {
    if (input.tenant_anomaly) {
      return false;
    }

    // Rule 1: Allow low-risk actions for trusted tenants
    if (input.cost < 1000 && input.trust_tier >= 2) {
      const allowedOps = ["read", "update_budget", "pause", "activate", "scale_budget", "update_feed"];
      if (allowedOps.includes(input.op)) {
        return true;
      }
    }

    // Rule 2 & 3: Check for matching valid waivers
    for (const waiver of input.waivers) {
      if (waiver.expiresAtMs > input.current_time_ms && waiver.allowedOps.includes(input.op)) {
        if (waiver.overrideRole === "CFO") {
          return true; // CFO covers high risk
        }
        if (waiver.overrideRole === "Media Buyer" && input.cost < 5000) {
          return true; // Media buyer covers up to $5000
        }
      }
    }

    return false;
  }
}
