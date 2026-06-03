import {OrganizationCEOAgent} from './agents/ceo_agent';
import {IsolationContext, TenantIdentity} from './core/isolation_context';
import {McpToolDefinition, OneMcpServer} from './core/onemcp_server';

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
});
