/**
 * @fileoverview GovernanceShadowAgent MCP Server.
 * Exposes write safety policy verification as MCP tools.
 */

import {IsolationContext} from '../core/isolation_context';
import {OneMcpServer, McpToolDefinition} from '../core/onemcp_server';
import {OpaPolicyEngine} from '../opa_policy';
import {ActionRequest, ActionPlan} from '../platform_adapter';
import {Context, Tenant, Role} from '../governance_types';

export class GovernanceShadowAgent extends OneMcpServer {
  constructor() {
    super('governance_shadow');

    const verifyPolicyTool: McpToolDefinition = {
      name: 'verify_policy_compliance',
      description: 'Evaluate a proposed write request against the tenant OPA policy and return compliance status.',
      inputSchema: {
        required: ['actionRequest'],
        properties: {
          actionRequest: {
            type: 'object',
            required: ['op', 'entity', 'confidence'],
            properties: {
              idempotencyKey: {type: 'string'},
              op: {type: 'string'},
              entity: {type: 'string'},
              targetId: {type: 'string'},
              payload: {type: 'object'},
              confidence: {type: 'number'},
            },
          },
          projectedCost: {type: 'number'},
          trustTier: {type: 'number'},
        },
      },
    };

    this.registerTool(verifyPolicyTool, async (context: IsolationContext, args: any) => {
      const opa = new OpaPolicyEngine();

      const req: ActionRequest = {
        idempotencyKey: args.actionRequest.idempotencyKey || `req-${Date.now()}`,
        op: args.actionRequest.op,
        entity: args.actionRequest.entity,
        targetId: args.actionRequest.targetId || 'target-1',
        payload: args.actionRequest.payload || {},
        confidence: args.actionRequest.confidence,
      };

      const projectedCost = args.projectedCost ?? 100;
      const plan: ActionPlan = {
        request: req,
        valid: true,
        projectedCost,
        warnings: [],
      };

      const tenant: Tenant = {
        tenantId: context.orgId,
        policy: {
          maxDailyDollarsRisk: 1000,
          maxBudgetMovePct: 0.3,
          minConfidence: 0.8,
          escalationRole: 'cmo',
        },
      };

      const role: Role = {
        name: context.role,
        permits: (op: string) => op === req.op,
      };

      const ctx: Context = {
        tenant,
        role,
        verifyWindowMs: 0,
      };

      const trustTier = args.trustTier ?? 2; // Default to REVIEW tier
      const allowed = await opa.evaluate(req, plan, ctx, trustTier);

      return {
        tenantId: context.orgId,
        isCompliant: allowed,
        disposition: allowed ? 'ALLOW' : 'DENY',
        details: allowed
          ? 'Action is compliant with the standard safety guardrails.'
          : 'Action exceeds policy cap or violates safety rules. Queueing/blocking required.',
      };
    });
  }
}
