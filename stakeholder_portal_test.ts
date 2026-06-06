import {
  CampaignBrief,
  ClientProfile,
  CreativeAsset,
  EcosystemRole,
  FinancialTransaction,
  IntegrationState,
} from './agency_os_types';
import {
  EcosystemAutomationEngine,
  EcosystemDataIsolation,
  EcosystemOnboardingOrchestrator,
  UnifiedDashboardEngine,
} from './stakeholder_portal_manager';
import {SupabaseClient} from './supabase_client';

describe('Multi-Stakeholder Ecosystem Portal & OS Tests', () => {
  let db: SupabaseClient;
  let onboardingOrchestrator: EcosystemOnboardingOrchestrator;
  let dashboardEngine: UnifiedDashboardEngine;
  let automationEngine: EcosystemAutomationEngine;
  let dataIsolation: EcosystemDataIsolation;

  const tenantId = 'test-tenant-123';

  beforeEach(() => {
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient('https://mock-url.supabase.co', 'mock-key', true);
    onboardingOrchestrator = new EcosystemOnboardingOrchestrator(db);
    dashboardEngine = new UnifiedDashboardEngine(db);
    automationEngine = new EcosystemAutomationEngine(db);
    dataIsolation = new EcosystemDataIsolation(db);
  });

  describe('Stakeholder Onboarding Flows', () => {
    it('should generate proper onboarding steps for an Agency user', async () => {
      const flow = await onboardingOrchestrator.onboardUser({
        email: 'owner@agency.com',
        role: EcosystemRole.AGENCY_OWNER,
        organizationType: 'agency',
        invitedBy: 'system',
      });
      expect(flow.steps.length).toBe(5);
      expect(flow.steps[0].title).toContain('Welcome to Brand Digital Twin');
      expect(flow.steps[1].integrations?.length).toBe(3); // google_workspace, slack, asana
      expect(flow.skipOption).toBeFalse();
    });

    it('should generate proper onboarding steps for a Client user', async () => {
      // Mock some client briefs
      await db.saveCampaignBrief({
        briefId: 'brief-1',
        clientId: 'client-a',
        status: 'live',
        projectedRoi: 4.0,
        budget: 50000,
        createdBy: 'buyer-1',
        tenantId: 'default-tenant',
        createdAt: Date.now(),
      });

      const flow = await onboardingOrchestrator.onboardUser({
        email: 'exec@client.com',
        role: EcosystemRole.CLIENT_EXECUTIVE,
        organizationType: 'client',
        invitedBy: 'agent-owner-1',
        clientId: 'client-a',
      });
      expect(flow.steps.length).toBe(5);
      expect(flow.steps[2].campaignCount).toBe(1);
      expect(flow.skipOption).toBeTrue();
    });

    it('should generate proper onboarding steps for an Investor user', async () => {
      const flow = await onboardingOrchestrator.onboardUser({
        email: 'investor@venture.com',
        role: EcosystemRole.INVESTOR,
        organizationType: 'investor',
        invitedBy: 'owner@agency.com',
      });
      expect(flow.steps.length).toBe(5);
      expect(flow.steps[0].requiresSignature).toBeTrue();
      expect(flow.complianceLevel).toBe('high');
    });
  });

  describe('Role-Specific Dashboard Generation', () => {
    it('should generate correct widgets for Agency Owner', async () => {
      await db.saveClient({
        clientId: 'c-1',
        orgId: 'org-1',
        name: 'Client 1',
        mrr: 10000,
        marginTarget: 0.4,
        healthScore: 80,
        churnRisk: 0.1,
        tenantId,
      });
      await db.saveClient({
        clientId: 'c-2',
        orgId: 'org-1',
        name: 'Client 2',
        mrr: 5000,
        marginTarget: 0.4,
        healthScore: 40,
        churnRisk: 0.7,
        tenantId,
      });

      const dashboard = await dashboardEngine.getDashboardDefinition(
        EcosystemRole.AGENCY_OWNER,
        tenantId,
      );
      expect(dashboard.title).toBe('Agency Command Center');

      const healthSection = dashboard.sections.find(
        (s) => s.name === 'Client Portfolio Health',
      );
      expect(healthSection).toBeDefined();

      const matrixCard = healthSection?.cards[0];
      expect(
        matrixCard?.segments?.find((s) => s.status === 'Thriving')?.count,
      ).toBe(1);
      expect(
        matrixCard?.segments?.find((s) => s.status === 'At Risk')?.count,
      ).toBe(1);
    });

    it('should generate correct widgets for Partner Vendor', async () => {
      await db.saveCreativeAsset({
        assetId: 'asset-1',
        tenantId,
        type: 'video',
        title: 'Video Campaign',
        location: 's3://assets',
        campaign: 'camp-1',
        complianceOk: true,
        createdAt: Date.now(),
      });

      const dashboard = await dashboardEngine.getDashboardDefinition(
        EcosystemRole.PARTNER_VENDOR,
        tenantId,
        'partner-1',
      );
      expect(dashboard.title).toBe('Your Project Dashboard');

      const projectSection = dashboard.sections.find(
        (s) => s.name === 'Active Projects',
      );
      const projectCard = projectSection?.cards[0];
      expect(projectCard?.projects?.length).toBe(1);
      expect(projectCard?.projects?.[0].status).toBe('🟢 Completed');
    });

    it('should generate correct widgets for Investor board view', async () => {
      await db.saveFinancialTransaction({
        transactionId: 't-1',
        tenantId,
        amount: 250000,
        type: 'income',
        category: 'client_billing',
        description: 'Billing Client 1',
        createdAt: Date.now(),
      });
      await db.saveFinancialTransaction({
        transactionId: 't-2',
        tenantId,
        amount: 50000,
        type: 'expense',
        category: 'payroll',
        description: 'Salaries',
        createdAt: Date.now(),
      });

      const dashboard = await dashboardEngine.getDashboardDefinition(
        EcosystemRole.INVESTOR,
        tenantId,
      );
      expect(dashboard.title).toBe('Board Dashboard');

      const summarySection = dashboard.sections.find(
        (s) => s.name === 'Financial Summary',
      );
      const revenueCard = summarySection?.cards.find(
        (c) => c.metric === 'Total Revenue',
      );
      const profitCard = summarySection?.cards.find(
        (c) => c.metric === 'Net Profit',
      );

      expect(revenueCard?.value).toBe('$250,000');
      expect(profitCard?.value).toBe('$200,000');
    });
  });

  describe('Ecosystem Automation Workflows', () => {
    it('should automate Vendor assignments on campaign approval', async () => {
      const campaign: CampaignBrief = {
        briefId: 'camp-brief-approved',
        clientId: 'client-a',
        status: 'approved',
        projectedRoi: 4.2,
        budget: 120000,
        createdBy: 'media-buyer-1',
        tenantId,
        createdAt: Date.now(),
      };

      await automationEngine.automateApprovalWorkflow(campaign);

      const feed = await db.getActivityFeed(tenantId);
      const vendorAssignment = feed.find(
        (f) => f.actionType === 'vendor_assigned',
      );
      const kickoffScheduled = feed.find(
        (f) => f.actionType === 'kickoff_scheduled',
      );

      expect(vendorAssignment).toBeDefined();
      expect(kickoffScheduled).toBeDefined();
      expect(vendorAssignment?.summary).toContain('Vendor task generated');
    });

    it('should trigger critical alerts and pause approval for critical ROI deviations', async () => {
      const brief: CampaignBrief = {
        briefId: 'brief-deviation',
        clientId: 'client-a',
        status: 'live',
        projectedRoi: 4.0,
        budget: 100000,
        createdBy: 'buyer-1',
        tenantId,
        createdAt: Date.now(),
      };

      // Target ROI: 4.0x, Actual ROI: 2.5x (deviation: 37.5% which is > 30%)
      await automationEngine.automatePerformanceNotifications(brief, {
        roi: 2.5,
        targetRoi: 4.0,
      });

      const feed = await db.getActivityFeed(tenantId);
      const alert = feed.find((f) => f.actionType === 'critical_deviation');
      expect(alert).toBeDefined();
      expect(alert?.summary).toContain('CRITICAL ROI DEVIATION');

      const approvals = await db.getApprovals(tenantId);
      const pauseApproval = approvals.find(
        (a) =>
          a.entityType === 'campaign_pause' && a.entityId === brief.briefId,
      );
      expect(pauseApproval).toBeDefined();
      expect(pauseApproval?.status).toBe('pending');
      expect(pauseApproval?.assignedTo).toBe('client_executive');
    });

    it('should auto-approve vendor invoice payments under $5000', async () => {
      const asset: CreativeAsset = {
        assetId: 'asset-ok',
        tenantId,
        type: 'design',
        title: 'Logo design',
        location: 's3://logo',
        campaign: 'camp-1',
        complianceOk: true,
        createdAt: Date.now(),
      };

      await automationEngine.automatePaymentWorkflow(
        tenantId,
        asset,
        3500,
        'stripe',
      );

      // Verify transaction was logged
      const txns = await db.getFinancialTransactions(tenantId);
      expect(txns.length).toBe(1);
      expect(txns[0].amount).toBe(3500);

      // Verify it was auto-approved and scheduled
      const approvals = await db.getApprovals(tenantId);
      const invoiceApproval = approvals.find(
        (a) => a.entityType === 'vendor_invoice',
      );
      expect(invoiceApproval).toBeDefined();
      expect(invoiceApproval?.status).toBe('approved');
      expect(invoiceApproval?.reason).toContain('Auto-approved');

      const feed = await db.getActivityFeed(tenantId);
      const paymentScheduled = feed.find(
        (f) => f.actionType === 'payment_scheduled',
      );
      expect(paymentScheduled).toBeDefined();
      expect(paymentScheduled?.summary).toContain('scheduled for invoice');
    });

    it('should route vendor invoice payments over $5000 to CFO approval', async () => {
      const asset: CreativeAsset = {
        assetId: 'asset-expensive',
        tenantId,
        type: 'video',
        title: 'Commercial video',
        location: 's3://video',
        campaign: 'camp-1',
        complianceOk: true,
        createdAt: Date.now(),
      };

      await automationEngine.automatePaymentWorkflow(
        tenantId,
        asset,
        12000,
        'wire',
      );

      const approvals = await db.getApprovals(tenantId);
      const invoiceApproval = approvals.find(
        (a) => a.entityType === 'vendor_invoice',
      );
      expect(invoiceApproval).toBeDefined();
      expect(invoiceApproval?.status).toBe('pending');
      expect(invoiceApproval?.assignedTo).toBe('cfo');
    });

    it('should trigger retention playbooks for high churn risk clients', async () => {
      const client: ClientProfile = {
        clientId: 'client-risk',
        orgId: 'org-1',
        name: 'Sinking Client',
        mrr: 15000,
        marginTarget: 0.4,
        healthScore: 25,
        churnRisk: 0.85,
        tenantId,
      };

      await automationEngine.automateChurnRiskIntervention(tenantId, client);

      const feed = await db.getActivityFeed(tenantId);
      const playbookAlert = feed.find(
        (f) => f.actionType === 'retention_playbook_triggered',
      );
      expect(playbookAlert).toBeDefined();
      expect(playbookAlert?.summary).toContain('Executing retention playbook');

      const approvals = await db.getApprovals(tenantId);
      const retentionSquadApproval = approvals.find(
        (a) => a.entityType === 'retention_squad',
      );
      expect(retentionSquadApproval).toBeDefined();
      expect(retentionSquadApproval?.status).toBe('pending');
      expect(retentionSquadApproval?.assignedTo).toBe('cmo');
    });

    it('should handle supplier stock protection and auto-pause approvals', async () => {
      const campaignId = 'camp-protect';
      // Under critical threshold (days of stock = 2)
      await automationEngine.automateSupplierOptimization(
        tenantId,
        campaignId,
        'PROD-X',
        2,
        true,
      );

      const feed = await db.getActivityFeed(tenantId);
      const criticalStockAlert = feed.find(
        (f) => f.actionType === 'critical_stockout_risk',
      );
      expect(criticalStockAlert).toBeDefined();
      expect(criticalStockAlert?.summary).toContain(
        'less than 2 days of stock',
      );

      const approvals = await db.getApprovals(tenantId);
      const pauseRequest = approvals.find(
        (a) => a.entityType === 'campaign_pause' && a.entityId === campaignId,
      );
      expect(pauseRequest).toBeDefined();
      expect(pauseRequest?.status).toBe('pending');
      expect(pauseRequest?.reason).toContain('low stock protection');
    });
  });

  describe('Multi-Tenant & Role Data Isolation', () => {
    it('should prevent access to cross-tenant data', async () => {
      const isAllowed = await dataIsolation.verifyAccess(
        EcosystemRole.AGENCY_OWNER,
        'read',
        'campaign',
        {tenantId: 'tenant-owner'},
        {tenantId: 'tenant-other'},
      );
      expect(isAllowed).toBeFalse();
    });

    it('should block media buyers from accessing core financials', async () => {
      const isAllowed = await dataIsolation.verifyAccess(
        EcosystemRole.MEDIA_BUYER,
        'read',
        'financials',
        {tenantId},
        {tenantId},
      );
      expect(isAllowed).toBeFalse();
    });

    it('should allow client stakeholders to read only their own campaigns', async () => {
      const isAllowedOwn = await dataIsolation.verifyAccess(
        EcosystemRole.CLIENT_EXECUTIVE,
        'read',
        'campaign',
        {tenantId, clientId: 'client-a'},
        {tenantId, clientId: 'client-a'},
      );
      expect(isAllowedOwn).toBeTrue();

      const isAllowedOther = await dataIsolation.verifyAccess(
        EcosystemRole.CLIENT_EXECUTIVE,
        'read',
        'campaign',
        {tenantId, clientId: 'client-a'},
        {tenantId, clientId: 'client-b'},
      );
      expect(isAllowedOther).toBeFalse();
    });

    it('should restrict partners to view only their assigned assets', async () => {
      const isAllowedOwn = await dataIsolation.verifyAccess(
        EcosystemRole.PARTNER_VENDOR,
        'read',
        'creative_asset',
        {tenantId, partnerId: 'partner-1'},
        {tenantId, partnerId: 'partner-1'},
      );
      expect(isAllowedOwn).toBeTrue();

      const isAllowedOther = await dataIsolation.verifyAccess(
        EcosystemRole.PARTNER_VENDOR,
        'read',
        'creative_asset',
        {tenantId, partnerId: 'partner-1'},
        {tenantId, partnerId: 'partner-2'},
      );
      expect(isAllowedOther).toBeFalse();
    });

    it('should prevent investors from reading detailed creative assets', async () => {
      const isAllowed = await dataIsolation.verifyAccess(
        EcosystemRole.INVESTOR,
        'read',
        'creative_asset',
        {tenantId},
        {tenantId},
      );
      expect(isAllowed).toBeFalse();
    });

    it('should restrict suppliers to view demand data of allowed SKUs only', async () => {
      const isAllowedSku = await dataIsolation.verifyAccess(
        EcosystemRole.INVENTORY_SUPPLIER,
        'read',
        'supplier_data',
        {tenantId, supplierSkus: ['SKU-A', 'SKU-B']},
        {tenantId, sku: 'SKU-A'},
      );
      expect(isAllowedSku).toBeTrue();

      const isAllowedBlockedSku = await dataIsolation.verifyAccess(
        EcosystemRole.INVENTORY_SUPPLIER,
        'read',
        'supplier_data',
        {tenantId, supplierSkus: ['SKU-A', 'SKU-B']},
        {tenantId, sku: 'SKU-C'},
      );
      expect(isAllowedBlockedSku).toBeFalse();
    });
  });
});
