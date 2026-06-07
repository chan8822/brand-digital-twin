/**
 * @fileoverview IntelligentAnalystAgent MCP Server.
 * Exposes POAS calculator and margin optimization recommendations as MCP tools.
 */

import {IsolationContext} from '../core/isolation_context';
import {OneMcpServer, McpToolDefinition} from '../core/onemcp_server';
import {UnifiedIntelligenceBrain} from '../unified_brain';
import {PoasCalculator} from '../poas_calculator';
import {SupabaseClient} from '../supabase_client';

export class IntelligentAnalystAgent extends OneMcpServer {
  constructor() {
    super('analyst');

    // Tool 1: Optimize margins using UnifiedIntelligenceBrain recommendation card engine
    const optimizeMarginsTool: McpToolDefinition = {
      name: 'optimize_margins',
      description: 'Run margin audit and compile zone-partitioned healing recommendations.',
      inputSchema: {
        required: ['targetROI'],
        properties: {
          targetROI: {type: 'number'},
          targetPOAS: {type: 'number'},
        },
      },
    };

    this.registerTool(optimizeMarginsTool, async (context: IsolationContext, args: any) => {
      // Use context orgId as the tenantId for sandboxed database reads
      const tenantId = context.orgId;
      const db = new SupabaseClient();

      const brain = new UnifiedIntelligenceBrain(db);

      const recommendations = await brain.analyzeProfitability(tenantId);
      return {
        tenantId,
        status: 'SUCCESS',
        targetROI: args.targetROI,
        targetPOAS: args.targetPOAS ?? 1.0,
        recommendations,
      };
    });

    // Tool 2: Query raw POAS reports
    const queryPoasSqlTool: McpToolDefinition = {
      name: 'query_poas_sql',
      description: 'Query raw POAS/ROAS campaign reports for a given tenant.',
      inputSchema: {
        required: [],
        properties: {
          campaignId: {type: 'string'},
        },
      },
    };

    this.registerTool(queryPoasSqlTool, async (context: IsolationContext, args: any) => {
      const tenantId = context.orgId;
      const db = new SupabaseClient();
      const poasCalc = new PoasCalculator(db);

      const reports = await poasCalc.calculate(tenantId);
      if (args.campaignId) {
        return reports.filter((r) => r.campaignId === args.campaignId);
      }
      return reports;
    });
  }
}
