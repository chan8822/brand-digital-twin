/**
 * @fileoverview Main orchestrator and executive planner of the Agency OS.
 * The OrganizationCEOAgent manages execution loops, delegating sub-tasks securely.
 */

import {IsolationContext} from '../core/isolation_context';
import {OneMcpServer} from '../core/onemcp_server';

export interface TaskDelegationRequest {
  targetAgent: 'analyst' | 'risk_radar' | 'governance_shadow';
  command: string;
  payload: Record<string, any>;
}

export class OrganizationCEOAgent {
  constructor(
    private readonly tenantContext: IsolationContext,
    private readonly mcpRegistry: Map<string, OneMcpServer>,
  ) {}

  /**
   * Evaluates input, creates a plan, and executes tasks using decoupled downstream servers.
   */
  public async executeExecutiveStrategy(
    strategyBrief: string,
  ): Promise<Record<string, any>> {
    console.info(
      `[CEO Agent] Initiating execution loop for strategy under Org: ${this.tenantContext.orgId}`,
    );

    // Step 1: Securely parse task allocations
    const subTasks: TaskDelegationRequest[] =
      this.decomposeStrategy(strategyBrief);
    const executionReports: any[] = [];

    // Step 2: Sequentially process each delegated agent task within bounded safety layers
    for (const task of subTasks) {
      const response = await this.delegateToAgent(task);
      executionReports.push({
        agent: task.targetAgent,
        status: response.error ? 'FAILED' : 'SUCCESS',
        result: response.result || response.error,
      });
    }

    return {
      orgId: this.tenantContext.orgId,
      spaceId: this.tenantContext.spaceId,
      strategyStatus: 'COMPLETED',
      executionReports,
    };
  }

  private decomposeStrategy(brief: string): TaskDelegationRequest[] {
    // Deterministic stub representing strategic planning translation
    return [
      {
        targetAgent: 'analyst',
        command: 'optimize_margins',
        payload: {targetROI: 4.0, targetPOAS: 1.5},
      },
      {
        targetAgent: 'risk_radar',
        command: 'inventory_alert_correlation',
        payload: {notifyThresholdDays: 5},
      },
    ];
  }

  private async delegateToAgent(request: TaskDelegationRequest): Promise<any> {
    const server = this.mcpRegistry.get(request.targetAgent);
    if (!server) {
      return {
        error: `Delegation Error: Destination agent server '${request.targetAgent}' is unreachable.`,
      };
    }

    // Call tool dynamically with mandatory isolation context
    return await server.callTool(
      this.tenantContext,
      request.command,
      request.payload,
      `msg_${Date.now()}`,
    );
  }
}
