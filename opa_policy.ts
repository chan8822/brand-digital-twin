/**
 * @fileoverview OPA Policy Evaluation client and simulator.
 */

import {ValidationError} from './errors';
import {Context, Waiver, SEMANTIC_TIERS} from './governance_types';
import {ActionPlan, ActionRequest} from './platform_adapter';

export interface OPAInput {
  op: string;
  entity: string;
  cost: number;
  trust_tier: number;
  earned_tier_cap: number;
  tenant_anomaly: boolean;
  waivers: Waiver[];
  current_time_ms: number;
}

export class OpaPolicyEngine {
  constructor(
    private readonly opaUrl = 'http://localhost:8181/v1/data/brand_twin/safety/allow',
    private readonly useFallback = true,
  ) {}

  /**
   * Evaluates the request against the OPA policy.
   */
  async evaluate(
    req: ActionRequest,
    plan: ActionPlan,
    ctx: Context,
    trustTier: number,
    earnedTierCap?: number,
  ): Promise<boolean> {
    let resolvedCap = earnedTierCap;
    if (resolvedCap === undefined) {
      const semanticName = SEMANTIC_TIERS[trustTier] || 'OBSERVE';
      const defaultCaps: Record<string, number> = {
        'OBSERVE': 0,
        'REVIEW': 100,
        'ASSISTED': 500,
        'AUTONOMOUS': 2000,
        'C_SUITE': 1000000,
      };
      resolvedCap = defaultCaps[semanticName] ?? 0;
    }

    const input: OPAInput = {
      op: req.op,
      entity: req.entity,
      cost: plan.projectedCost,
      trust_tier: trustTier,
      earned_tier_cap: resolvedCap,
      tenant_anomaly: ctx.triggerAnomaly ?? false,
      waivers: ctx.activeWaivers ?? [],
      current_time_ms: Date.now(),
    };

    if (!this.useFallback) {
      let response: any;
      try {
        response = await fetch(this.opaUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({input}),
        });
      } catch (err) {
        return this.fallbackEvaluate(input);
      }

      if (response && response.ok) {
        let body: any;
        try {
          body = await response.json();
        } catch (err) {
          return this.fallbackEvaluate(input);
        }

        if (
          body === null ||
          typeof body !== 'object' ||
          !('result' in body) ||
          typeof body.result !== 'boolean'
        ) {
          throw new ValidationError('Invalid OPA decision response payload');
        }
        return body.result;
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

    // Rule 1: Allow low-risk actions within earned tier cap
    if (input.cost <= input.earned_tier_cap) {
      const allowedOps = [
        'read',
        'update_budget',
        'pause',
        'activate',
        'scale_budget',
      ];
      if (allowedOps.includes(input.op)) {
        return true;
      }
    }

    // Rule 2 & 3: Check for matching valid waivers
    if (input.cost > input.earned_tier_cap) {
      for (const waiver of input.waivers) {
        if (
          waiver.expiresAtMs > input.current_time_ms &&
          waiver.allowedOps.includes(input.op)
        ) {
          if (waiver.overrideRole === 'CFO') {
            return true; // CFO covers high risk
          }
          if (waiver.overrideRole === 'Media Buyer' && input.cost < 5000) {
            return true; // Media buyer covers up to $5000
          }
        }
      }
    }

    return false;
  }
}
