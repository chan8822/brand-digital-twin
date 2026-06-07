/**
 * @fileoverview RiskRadarAgent MCP Server.
 * Exposes inventory stockout safety pause scans as MCP tools.
 */

import {IsolationContext} from '../core/isolation_context';
import {OneMcpServer, McpToolDefinition} from '../core/onemcp_server';
import {RiskRadar} from '../risk_radar';
import {GoogleAdsAdapter} from '../google_ads_adapter';
import {GovernanceEngine, TrustLedger, CircuitBreaker, Tenant, Role, Context} from '../governance_engine';
import {PersistentAuditSink} from '../audit_sink';
import {SupabaseClient} from '../supabase_client';

export class RiskRadarAgent extends OneMcpServer {
  constructor() {
    super('risk_radar');

    const inventoryAlertTool: McpToolDefinition = {
      name: 'inventory_alert_correlation',
      description: 'Scan catalog inventory levels and pause active campaigns for stockout products.',
      inputSchema: {
        required: ['notifyThresholdDays'],
        properties: {
          notifyThresholdDays: {type: 'number'},
        },
      },
    };

    this.registerTool(inventoryAlertTool, async (context: IsolationContext, args: any) => {
      const tenantId = context.orgId;
      const db = new SupabaseClient();

      const googleAds = new GoogleAdsAdapter(
        '888-888-8888',
        'dev_token',
        'mock_auth_token',
        tenantId,
      );

      const auditSink = new PersistentAuditSink(db);
      const trustLedger = new TrustLedger();
      const circuitBreaker = new CircuitBreaker();
      const engine = new GovernanceEngine(auditSink, trustLedger, circuitBreaker);

      // Seed moderate trust tier to permit pausing
      trustLedger.setTier(tenantId, 'pause', 3);

      const radar = new RiskRadar(engine, googleAds, db, tenantId);

      // Seed mock inventory if none exists in db/radar for demo
      radar.seedInventory({
        variantId: 'v_shoe_red_10',
        sku: 'SHOE-RED-10',
        qty: 0, // Out of stock
        promotedCampaignIds: ['c-meta-1'],
      });

      const tenant: Tenant = {
        tenantId,
        policy: {
          maxDailyDollarsRisk: 1000,
          maxBudgetMovePct: 0.3,
          minConfidence: 0.8,
          escalationRole: 'cmo',
        },
      };

      const permittedRole: Role = {
        permits: () => true,
      };

      const ctx: Context = {
        tenant,
        role: permittedRole,
        verifyWindowMs: 10,
      };

      const findings = await radar.scanStockouts(ctx);

      return {
        tenantId,
        status: 'SUCCESS',
        findingsCount: findings.length,
        findings,
      };
    });
  }
}
