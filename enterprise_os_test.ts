import {OrganizationCEOAgent} from './agents/ceo_agent';
import {IntelligentAnalystAgent} from './agents/analyst_agent';
import {RiskRadarAgent} from './agents/risk_radar_agent';
import {GovernanceShadowAgent} from './agents/governance_shadow_agent';
import {IsolationContext, TenantIdentity} from './core/isolation_context';
import {McpToolDefinition, OneMcpServer} from './core/onemcp_server';
import {SupabaseClient} from 'google3/experimental/brand_twin/supabase_client';


// Mock sub-agent MCP servers
class MockAnalystMcpServer extends OneMcpServer {
  constructor() {
    super('analyst');

    // Register tool
    const optimizeMarginsTool: McpToolDefinition = {
      name: 'optimize_margins',
      description: 'Optimize margins and budget distribution.',
      inputSchema: {
        required: ['targetROI'],
        properties: {
          targetROI: {type: 'number'},
          targetPOAS: {type: 'number'},
        },
      },
    };

    this.registerTool(optimizeMarginsTool, async (context, args) => {
      // Simulate access checking
      const path = context.resolveIsolatedPath('/data', 'poas.sql');
      return {
        message: 'Optimized margins successfully',
        resolvedPath: path,
        targetROI: args.targetROI,
        targetPOAS: args.targetPOAS ?? 1.0,
      };
    });
  }
}

class MockRiskRadarMcpServer extends OneMcpServer {
  constructor() {
    super('risk_radar');

    const inventoryAlertTool: McpToolDefinition = {
      name: 'inventory_alert_correlation',
      description: 'Check stock levels and alert correlations.',
      inputSchema: {
        required: ['notifyThresholdDays'],
        properties: {
          notifyThresholdDays: {type: 'number'},
        },
      },
    };

    this.registerTool(inventoryAlertTool, async (context, args) => {
      return {
        message: 'Checked inventory health',
        alertSent: false,
        notifyThresholdDays: args.notifyThresholdDays,
      };
    });
  }
}

describe('Enterprise Agency OS (OneMCP & Bounded Contexts) Tests', () => {
  let analystServer: MockAnalystMcpServer;
  let riskRadarServer: MockRiskRadarMcpServer;
  let mcpRegistry: Map<string, OneMcpServer>;

  beforeEach(() => {
    analystServer = new MockAnalystMcpServer();
    riskRadarServer = new MockRiskRadarMcpServer();

    mcpRegistry = new Map<string, OneMcpServer>();
    mcpRegistry.set('analyst', analystServer);
    mcpRegistry.set('risk_radar', riskRadarServer);
  });

  describe('Multi-Tenant Path Isolation & Security Context', () => {
    it('should resolve isolated path safely within tenant bounds and strip traversing vectors', () => {
      const identity: TenantIdentity = {
        orgId: 'tenant-alpha',
        spaceId: 'space-1',
        role: 'client_executive',
        userId: 'user-123',
      };

      const context = IsolationContext.create(identity);
      expect(context.orgId).toBe('tenant-alpha');
      expect(context.spaceId).toBe('space-1');

      // Happy path path resolution
      const path = context.resolveIsolatedPath('/data', 'poas.sql');
      expect(path).toBe('/data/tenants/tenant-alpha/space-1/poas.sql');

      // Traversing injection attack check
      const traversalPath = context.resolveIsolatedPath(
        '/data',
        '../../../tenant-beta/space-2/poas.sql',
      );
      // Slashes and dots will be sanitized:
      // replace(/[^a-zA-Z0-9.-_]/g, '') strips slashes
      expect(traversalPath).not.toContain('tenant-beta');
      expect(traversalPath).toContain('tenants/tenant-alpha/space-1');
    });

    it('should enforce mandatory tenant identifiers', () => {
      expect(() => {
        IsolationContext.create({
          orgId: '',
          spaceId: 'space-1',
          role: 'client_executive',
          userId: 'user-123',
        });
      }).toThrowError(/Missing mandatory org_id/);

      expect(() => {
        IsolationContext.create({
          orgId: 'tenant-a',
          spaceId: '  ',
          role: 'client_executive',
          userId: 'user-123',
        });
      }).toThrowError(/Missing mandatory space_id/);
    });
  });

  describe('OneMCP Server Specifications', () => {
    it('should list registered tools', async () => {
      const identity: TenantIdentity = {
        orgId: 'tenant-alpha',
        spaceId: 'space-1',
        role: 'client_executive',
        userId: 'user-123',
      };
      const context = IsolationContext.create(identity);

      const tools = await analystServer.listTools(context);
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('optimize_margins');
    });

    it('should validate input schema and reject call on missing required arguments', async () => {
      const identity: TenantIdentity = {
        orgId: 'tenant-alpha',
        spaceId: 'space-1',
        role: 'client_executive',
        userId: 'user-123',
      };
      const context = IsolationContext.create(identity);

      // Missing targetROI (required)
      const response = await analystServer.callTool(
        context,
        'optimize_margins',
        {targetPOAS: 1.5},
        'rpc-1',
      );
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain(
        "Missing required parameter 'targetROI'",
      );
    });

    it('should return -32601 on missing tools', async () => {
      const identity: TenantIdentity = {
        orgId: 'tenant-alpha',
        spaceId: 'space-1',
        role: 'client_executive',
        userId: 'user-123',
      };
      const context = IsolationContext.create(identity);

      const response = await analystServer.callTool(
        context,
        'non_existent_tool',
        {},
        'rpc-1',
      );
      expect(response.error?.code).toBe(-32601);
    });
  });

  describe('Unified Planner CEO Agent delegation', () => {
    it('should successfully plan and delegate strategies across OneMCP servers', async () => {
      const identity: TenantIdentity = {
        orgId: 'tenant-alpha',
        spaceId: 'space-1',
        role: 'agency_owner',
        userId: 'ceo-1',
      };
      const context = IsolationContext.create(identity);
      const ceoAgent = new OrganizationCEOAgent(context, mcpRegistry);

      const strategyReport = await ceoAgent.executeExecutiveStrategy(
        'Optimize Q3 portfolio margins and correlation alerts',
      );

      expect(strategyReport['orgId']).toBe('tenant-alpha');
      expect(strategyReport['strategyStatus']).toBe('COMPLETED');
      expect(strategyReport['executionReports'].length).toBe(2);

      const analystReport = strategyReport['executionReports'].find(
        (r: any) => r.agent === 'analyst',
      );
      expect(analystReport.status).toBe('SUCCESS');
      expect(analystReport.result.targetROI).toBe(4.0);
      expect(analystReport.result.resolvedPath).toContain(
        '/data/tenants/tenant-alpha/space-1/poas.sql',
      );

      const riskReport = strategyReport['executionReports'].find(
        (r: any) => r.agent === 'risk_radar',
      );
      expect(riskReport.status).toBe('SUCCESS');
      expect(riskReport.result.notifyThresholdDays).toBe(5);
    });

    it('should log errors when a strategy delegator hits an unreachable agent', async () => {
      const identity: TenantIdentity = {
        orgId: 'tenant-alpha',
        spaceId: 'space-1',
        role: 'agency_owner',
        userId: 'ceo-1',
      };
      const context = IsolationContext.create(identity);

      // Only register analyst, leaving risk_radar missing from the registry
      const partialRegistry = new Map<string, OneMcpServer>();
      partialRegistry.set('analyst', analystServer);

      const ceoAgent = new OrganizationCEOAgent(context, partialRegistry);
      const strategyReport =
        await ceoAgent.executeExecutiveStrategy('Optimize strategy');

      expect(strategyReport['strategyStatus']).toBe('COMPLETED');

      const riskReport = strategyReport['executionReports'].find(
        (r: any) => r.agent === 'risk_radar',
      );
      expect(riskReport.status).toBe('FAILED');
      expect(riskReport.result).toContain(
        "Destination agent server 'risk_radar' is unreachable",
      );
    });
  });

  describe('Real Bounded MCP Agents Integration', () => {
    let db: SupabaseClient;
    const realTenantId = 'tenant-alpha';

    beforeEach(async () => {
      SupabaseClient.useSharedMockDb = true;
      SupabaseClient.resetGlobalMockDb();

      db = new SupabaseClient();
      await db.clearCampaigns(realTenantId);

      // Seed a campaign
      await db.saveCampaign({
        campaign_id: 'c-meta-1',
        tenant_id: realTenantId,
        name: 'Meta Lookalike Purchase',
        platform: 'meta',
        objective: 'CONVERSIONS',
        status: 'active',
        surface: 'meta_ads',
        source_id: 'c-meta-1',
        source_system: 'meta',
        source_version: 'v18',
        ingested_at: new Date().toISOString(),
      });

      // Seed a spend fact
      await db.saveSpendFact({
        campaign_id: 'c-meta-1',
        platform: 'meta',
        day: new Date().toISOString().split('T')[0],
        amount: 1000,
        currency: 'USD',
        tenant_id: realTenantId,
        source_system: 'meta',
        ingested_at: new Date().toISOString(),
      });

      // Seed an order (gross revenue $800) and order line (cost $500)
      // Since order gross revenue is $800, and spend is $1000, POAS is 300 / 1000 = 0.30 (unprofitable)
      await db.saveOrder({
        order_id: 'o1',
        customer_id: 'cust1',
        account_id: null,
        channel: 'online',
        surface: 'shopify',
        placed_at: new Date().toISOString(),
        currency: 'USD',
        gross_revenue: 800,
        total_discounts: 0,
        total_tax: 0,
        shipping_charged: 0,
        status: 'PAID',
        tenant_id: realTenantId,
        source_system: 'shopify',
        source_id: 'o1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });

      await db.saveOrderLine({
        order_line_id: 'ol1',
        order_id: 'o1',
        variant_id: 'v1',
        sku: 'BLUE-SHIRT-M',
        qty: 1,
        unit_price: 800,
        line_discount: 0,
        unit_cost: 500, // COGS = $500, pre-ad margin = $300
        tenant_id: realTenantId,
        source_system: 'shopify',
        source_id: 'ol1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });

      // Seed click touchpoint to attribute order to campaign
      await db.saveTouchpoint({
        touchpoint_id: 'tp1',
        customer_id: 'cust1',
        campaign_id: 'c-meta-1',
        order_id: 'o1',
        occurred_at: new Date(Date.now() - 10000).toISOString(),
        type: 'click',
        tenant_id: realTenantId,
        source_system: 'meta',
        ingested_at: new Date().toISOString(),
      });

      // Also seed a purchase touchpoint for tracking checks
      await db.saveTouchpoint({
        touchpoint_id: 'tp1-conv',
        customer_id: 'cust1',
        campaign_id: 'c-meta-1',
        order_id: 'o1',
        occurred_at: new Date().toISOString(),
        type: 'purchase',
        source_system: 'sgtm',
        tenant_id: realTenantId,
        ingested_at: new Date().toISOString(),
      });
    });

    afterEach(() => {
      SupabaseClient.useSharedMockDb = false;
    });

    it('IntelligentAnalystAgent should diagnose unprofitable campaign and return healing recommendations', async () => {
      const identity: TenantIdentity = {
        orgId: realTenantId,
        spaceId: 'space-1',
        role: 'analyst',
        userId: 'user-123',
      };
      const context = IsolationContext.create(identity);
      const agent = new IntelligentAnalystAgent();

      const response = await agent.callTool(context, 'optimize_margins', { targetROI: 3.0 }, 'rpc-1');

      expect(response.error).toBeUndefined();
      expect(response.result.status).toBe('SUCCESS');
      expect(response.result.recommendations.length).toBeGreaterThan(0);

      const card = response.result.recommendations[0];
      expect(card.campaignName).toBe('Meta Lookalike Purchase');
      expect(card.osActs.length).toBe(1);
      expect(card.userApproves.length).toBe(1);
      expect(card.adsCantFix.length).toBe(0);
    });

    it('RiskRadarAgent should scan stockouts and output safety pausing findings', async () => {
      const identity: TenantIdentity = {
        orgId: realTenantId,
        spaceId: 'space-1',
        role: 'risk_officer',
        userId: 'user-123',
      };
      const context = IsolationContext.create(identity);
      const agent = new RiskRadarAgent();

      const response = await agent.callTool(context, 'inventory_alert_correlation', { notifyThresholdDays: 5 }, 'rpc-2');

      expect(response.error).toBeUndefined();
      expect(response.result.status).toBe('SUCCESS');
      expect(response.result.findingsCount).toBe(1);
      expect(response.result.findings[0].code).toBe('paused_campaign_c-meta-1_for_SHOE-RED-10');
    });

    it('GovernanceShadowAgent should evaluate action requests against OPA engine rules', async () => {
      const identity: TenantIdentity = {
        orgId: realTenantId,
        spaceId: 'space-1',
        role: 'media_buyer',
        userId: 'user-123',
      };
      const context = IsolationContext.create(identity);
      const agent = new GovernanceShadowAgent();

      // Test Case A: Under Cap ($400 < $500 cap for Media Buyer role on trust tier 2)
      const resA = await agent.callTool(context, 'verify_policy_compliance', {
        actionRequest: {
          op: 'scale_budget',
          entity: 'campaign',
          confidence: 0.9,
        },
        projectedCost: 400,
        trustTier: 2,
      }, 'rpc-3');

      expect(resA.result.isCompliant).toBe(true);
      expect(resA.result.disposition).toBe('ALLOW');

      // Test Case B: Over Cap ($600 > $500 cap for Media Buyer role on trust tier 2)
      const resB = await agent.callTool(context, 'verify_policy_compliance', {
        actionRequest: {
          op: 'scale_budget',
          entity: 'campaign',
          confidence: 0.9,
        },
        projectedCost: 600,
        trustTier: 2,
      }, 'rpc-4');

      expect(resB.result.isCompliant).toBe(false);
      expect(resB.result.disposition).toBe('DENY');
    });
  });
});
