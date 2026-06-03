/**
 * @fileoverview Unit tests for the Agency OS collaborative features.
 */

import {
  ApprovalWorkflowManager,
  CollaborationHub,
  CSuiteFinancialEngine,
} from './agency_os';
import {ClientProfile, TeamMember} from './agency_os_types';
import {GovernanceEngine} from './governance_engine';
import {ActionRequest} from './platform_adapter';
import {SupabaseClient} from './supabase_client';

describe('Agency OS Collaboration & Strategy Suite', () => {
  let db: SupabaseClient;
  let hub: CollaborationHub;
  let approvalsMgr: ApprovalWorkflowManager;
  let financialEngine: CSuiteFinancialEngine;

  beforeEach(() => {
    db = new SupabaseClient('https://mock.supabase.co', 'mock-key', true);
    hub = new CollaborationHub(db);
    // Construct dummy GovernanceEngine wrapper
    const mockEngine = {} as GovernanceEngine;
    approvalsMgr = new ApprovalWorkflowManager(db, mockEngine);
    financialEngine = new CSuiteFinancialEngine(db);
  });

  describe('Team & Client Workspace Management', () => {
    it('should calculate client health score dynamically based on audit history and risk', async () => {
      const client: ClientProfile = {
        clientId: 'client-nike',
        orgId: 'org-1',
        name: 'Nike',
        mrr: 50000,
        marginTarget: 0.4,
        healthScore: 100,
        churnRisk: 0.1,
        tenantId: 'tenant-1',
      };
      await db.saveClient(client);

      // Seed audit records to compute success ratio
      await db.logAudit({
        tenant: 'tenant-1',
        timestamp: new Date().toISOString(),
        action_id: 'a1',
        op: 'pause',
        entity: 'campaign',
        target_id: 'client-nike-c1',
        cost: 100,
        decision: 'executed',
        reason: 'low stock',
      });
      await db.logAudit({
        tenant: 'tenant-1',
        timestamp: new Date().toISOString(),
        action_id: 'a2',
        op: 'pause',
        entity: 'campaign',
        target_id: 'client-nike-c1',
        cost: 100,
        decision: 'executed',
        reason: 'low stock',
      });

      const score = await hub.calculateClientHealth('tenant-1', 'client-nike');
      expect(score).toBe(100);
    });
  });

  describe('Approvals Workflow Manager', () => {
    it('should route governance queue items to the approval registry and allow sign-off by authorized roles', async () => {
      const req: ActionRequest = {
        idempotencyKey: 'req-key-1',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'camp-123',
        payload: {},
        confidence: 0.7,
      };
      const ctx = {
        tenant: {
          tenantId: 'tenant-1',
          policy: {
            maxDailyDollarsRisk: 1000,
            maxBudgetMovePct: 0.2,
            minConfidence: 0.85,
            escalationRole: 'cmo',
          },
        },
        role: {
          permits: () => true,
        },
        verifyWindowMs: 10000,
      };

      const approval = await approvalsMgr.queueForManualReview(
        req,
        ctx,
        'Low confidence score',
        'cmo',
      );
      expect(approval.status).toBe('pending');
      expect(approval.assignedTo).toBe('cmo');

      // Sign off using CMO role
      const cmoUser: TeamMember = {
        memberId: 'mem-cmo-1',
        orgId: 'org-1',
        userId: 'user-cmo',
        roleName: 'cmo',
        permissions: ['approve'],
        capacityPct: 50,
        tenantId: 'tenant-1',
      };

      const success = await approvalsMgr.processApproval(
        approval.approvalId,
        cmoUser,
        true,
        'Looks good to me',
      );
      expect(success).toBe(true);

      const updated = (await db.getApprovals('tenant-1'))[0];
      expect(updated.status).toBe('approved');
    });

    it('should prevent unauthorized roles from signing off reviews', async () => {
      const req: ActionRequest = {
        idempotencyKey: 'req-key-2',
        op: 'update_budget',
        entity: 'campaign',
        targetId: 'c2',
        payload: {},
        confidence: 0.5,
      };
      const ctx = {
        tenant: {
          tenantId: 'tenant-1',
          policy: {
            maxDailyDollarsRisk: 1000,
            maxBudgetMovePct: 0.2,
            minConfidence: 0.85,
            escalationRole: 'cmo',
          },
        },
        role: {
          permits: () => true,
        },
        verifyWindowMs: 10000,
      };

      const approval = await approvalsMgr.queueForManualReview(
        req,
        ctx,
        'Low confidence score',
        'cmo',
      );

      // Media buyer tries to sign off
      const buyerUser: TeamMember = {
        memberId: 'mem-buyer-1',
        orgId: 'org-1',
        userId: 'user-buyer',
        roleName: 'media_buyer',
        permissions: [],
        capacityPct: 80,
        tenantId: 'tenant-1',
      };

      await expectAsync(
        approvalsMgr.processApproval(approval.approvalId, buyerUser, true),
      ).toBeRejectedWithError(/Permission Denied/);
    });
  });

  describe('C-Suite Portfolio Financials', () => {
    it('should calculate correct aggregate MRR and margins, and run scenario forecasts', async () => {
      const client1: ClientProfile = {
        clientId: 'c1',
        orgId: 'org-1',
        name: 'Nike',
        mrr: 10000,
        marginTarget: 0.4,
        healthScore: 90,
        churnRisk: 0,
        tenantId: 'tenant-1',
      };
      const client2: ClientProfile = {
        clientId: 'c2',
        orgId: 'org-1',
        name: 'Glossier',
        mrr: 20000,
        marginTarget: 0.5,
        healthScore: 95,
        churnRisk: 0,
        tenantId: 'tenant-1',
      };

      await db.saveClient(client1);
      await db.saveClient(client2);

      const stats = await financialEngine.getPortfolioProfitability('tenant-1');
      expect(stats.totalRevenue).toBe(30000);
      expect(stats.totalMargin).toBe(14000); // 10000*0.4 + 20000*0.5

      // Scenario modeling: increase spend by $5000 at 3.0x ROI, headcount cost $2000
      // Additional Margin = (5000*3) - 5000 = 10000. Net Profit Delta = 10000 - 2000 = 8000.
      const forecast = financialEngine.runScenarioModel(
        stats.totalMargin,
        5000,
        3.0,
        2000,
      );
      expect(forecast.netProfitDelta).toBe(8000);
      expect(forecast.newMarginPct).toBe(22000);
    });
  });
});
