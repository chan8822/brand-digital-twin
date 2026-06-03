/**
 * @fileoverview Unit and integration tests for 360 Agency Operations OS components.
 */

import {AccountHealthMonitor} from './account_health';
import {
  ClientProfile,
  CompetitorSignal,
  CreativeAsset,
  FinancialTransaction,
  SocialMention,
  TeamMember,
} from './agency_os_types';
import {InventoryStatus} from './forecasting';
import {
  BrandMonitoringHub,
  CreativeHub,
  CRMHub,
  FinanceHub,
  ProjectManagementHub,
} from './operational_hubs';
import {SupabaseClient} from './supabase_client';
import {UnifiedIntelligenceBrain} from './unified_brain';
import {GoogleWorkspaceConnector, SlackConnector} from './workspace_connectors';

describe('360 Agency Operations OS Integration Suite', () => {
  let db: SupabaseClient;
  let slack: SlackConnector;
  let googleSuite: GoogleWorkspaceConnector;

  let brandHub: BrandMonitoringHub;
  let pmHub: ProjectManagementHub;
  let crmHub: CRMHub;
  let financeHub: FinanceHub;
  let creativeHub: CreativeHub;

  let brain: UnifiedIntelligenceBrain;
  let monitor: AccountHealthMonitor;

  const tenantId = 'tenant-ops-123';

  beforeEach(async () => {
    db = new SupabaseClient(
      'https://mock-ops.supabase.co',
      'mock-ops-key',
      true,
    );
    slack = new SlackConnector(db);
    googleSuite = new GoogleWorkspaceConnector(db);

    brandHub = new BrandMonitoringHub(db);
    pmHub = new ProjectManagementHub(db);
    crmHub = new CRMHub(db);
    financeHub = new FinanceHub(db);
    creativeHub = new CreativeHub(db);

    brain = new UnifiedIntelligenceBrain(db);
    monitor = new AccountHealthMonitor(db);

    // Setup base client and team data
    const client: ClientProfile = {
      clientId: 'client-acme',
      orgId: 'org-1',
      name: 'Acme Corp',
      industry: 'SaaS',
      mrr: 30000,
      marginTarget: 0.4, // 40% target
      healthScore: 95,
      churnRisk: 0.1,
      tenantId,
    };
    await db.saveClient(client);

    const buyer: TeamMember = {
      memberId: 'member-buyer',
      orgId: 'org-1',
      userId: 'user-buyer',
      roleName: 'media_buyer',
      permissions: ['write_ads'],
      capacityPct: 90, // busy
      tenantId,
    };
    const mgr: TeamMember = {
      memberId: 'member-mgr',
      orgId: 'org-1',
      userId: 'user-mgr',
      roleName: 'account_mgr',
      permissions: ['approve_briefs'],
      capacityPct: 30, // free
      tenantId,
    };
    await db.saveTeamMember(buyer);
    await db.saveTeamMember(mgr);
  });

  describe('Inbound Brand Monitoring & Crisis Alerts', () => {
    it('should trigger critical brand signal and dispatch alert on negative influencer posts', async () => {
      const mention: SocialMention = {
        mentionId: 'men-1',
        tenantId,
        platform: 'twitter',
        content: 'Acme Corp product has terrible downtime! Do not buy!',
        sentiment: 'negative',
        reach: 100000,
        influencer: true,
        url: 'https://twitter.com/influencer/status/123',
        createdAt: Date.now(),
      };

      const signal = await brandHub.ingestMention(mention);
      expect(signal).not.toBeNull();
      expect(signal!.type).toBe('negative_sentiment_crisis');
      expect(signal!.severity).toBe('critical');

      // Verify brain detects the crisis and recommends action
      const brandHealth = await brain.analyzeBrandHealth(tenantId);
      expect(brandHealth.crisisActive).toBeTrue();
      expect(brandHealth.recommendations.length).toBeGreaterThan(0);
      expect(brandHealth.recommendations[0].type).toBe('pr_response');
    });

    it('should record competitor signals and create intelligence events', async () => {
      const competitorSig: CompetitorSignal = {
        competitorId: 'comp-acme',
        tenantId,
        competitorName: 'BetaCorp',
        signalType: 'price_change',
        details: {oldPrice: 19.99, newPrice: 14.99},
        createdAt: Date.now(),
      };

      const signal = await brandHub.ingestCompetitorSignal(competitorSig);
      expect(signal.type).toBe('competitor_intel');
      expect(signal.severity).toBe('medium');
    });
  });

  describe('Team Workload Capacity & Bottlenecks', () => {
    it('should flag overloading backlogs and suggest rebalancing work to free members', async () => {
      // 1. Log backlog overload signal
      const signal = await pmHub.analyzeTaskBottlenecks(
        tenantId,
        'member-buyer',
        18,
      );
      expect(signal).not.toBeNull();
      expect(signal!.type).toBe('backlog_overload');

      // 2. Trigger calendar signal as well
      const buyerProfile = (await db.getTeamMembers(tenantId)).find(
        (m) => m.memberId === 'member-buyer',
      )!;
      await googleSuite.scanCalendarSignals(tenantId, buyerProfile);

      // 3. Analyze rebalancing options via the brain
      const capacityStatus = await brain.analyzeTeamCapacity(tenantId);
      expect(capacityStatus.avgCapacityPct).toBe(60); // (90 + 30) / 2
      expect(capacityStatus.recommendations.length).toBeGreaterThan(0);
      expect(capacityStatus.recommendations[0].type).toBe('rebalance_workload');
      expect(capacityStatus.recommendations[0].targetId).toBe('member-buyer');
    });
  });

  describe('Financial Syncing & Scenario Runway Forecasts', () => {
    it('should alert on high expenses and project correct margin variations', async () => {
      const expense: FinancialTransaction = {
        transactionId: 'tx-1',
        tenantId,
        amount: 15000,
        type: 'expense',
        category: 'software',
        description: 'Annual Enterprise SaaS renewal',
        createdAt: Date.now(),
      };

      const signal = await financeHub.ingestTransaction(expense);
      expect(signal).not.toBeNull();
      expect(signal!.severity).toBe('high');

      // Income transaction
      await financeHub.ingestTransaction({
        transactionId: 'tx-2',
        tenantId,
        amount: 8000,
        type: 'income',
        category: 'client_payment',
        description: 'Invoice payout #444',
        createdAt: Date.now(),
      });

      // Run scenario forecasts
      const forecast = await brain.generateForecasts(
        tenantId,
        1000,
        [0.05, 0.02, -0.01],
      );
      expect(forecast.runwayMonths).toBe(35.7); // 250000 cash reserve / (15000 - 8000) monthly burn
      expect(forecast.conservativeMarginPct).toBeLessThan(
        forecast.optimisticMarginPct,
      );
    });
  });

  describe('Creative Brand Compliance Checks', () => {
    it('should flag assets that violate brand guidelines', async () => {
      const asset: CreativeAsset = {
        assetId: 'ast-101',
        tenantId,
        type: 'video',
        title: 'Summer Promo Draft',
        location: 'https://figma.com/file/mock-summer',
        campaign: 'camp-summer',
        complianceOk: false, // failed guidelines
        createdAt: Date.now(),
      };

      const signal = await creativeHub.registerAsset(asset);
      expect(signal).not.toBeNull();
      expect(signal!.type).toBe('compliance_violation');
    });
  });

  describe('Unified Account Health Dashboard & Anomaly Radar', () => {
    it('should calculate dimensional dashboard scores, capture metric anomalies, and issue warnings', async () => {
      // Ingest signals to populate databases
      await pmHub.analyzeTaskBottlenecks(tenantId, 'member-buyer', 20);
      await brandHub.ingestMention({
        mentionId: 'men-2',
        tenantId,
        platform: 'twitter',
        content: 'Acme product is okay.',
        sentiment: 'neutral',
        reach: 50,
        influencer: false,
        url: 'url',
        createdAt: Date.now(),
      });

      const inventory: InventoryStatus[] = [
        {variantId: 'var-1', stockCount: 5, salesLast7Days: 28}, // 1.25 days of stock, stockout in 30 hours
      ];

      // Seed historical records to test 20% shifts
      const history: Record<string, number[]> = {
        daily_spend: [1000, 1020, 1250], // shift > 20%
        active_users: [5000, 5100, 5050],
      };

      const dashboard = await monitor.computeDashboard(
        tenantId,
        'client-acme',
        inventory,
        1000,
        [0.05],
        history,
      );

      expect(dashboard).not.toBeNull();
      expect(dashboard!.overallScore).toBeGreaterThan(0);
      expect(dashboard!.dimensionalScores.brand).toBe(100);
      expect(dashboard!.anomalies.length).toBe(1);
      expect(dashboard!.anomalies[0]).toContain('daily_spend');
      expect(dashboard!.predictiveAlerts.length).toBeGreaterThan(0);
      expect(
        dashboard!.predictiveAlerts.some((a) => a.includes('Inventory risk')),
      ).toBeTrue();
    });
  });
});
