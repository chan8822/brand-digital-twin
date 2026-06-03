/**
 * @fileoverview Integration tests for advanced operational enhancements.
 */

import {ClientProfile, CreativeAsset} from './agency_os_types';
import {AttributionEngine, Touchpoint} from './attribution_engine';
import {Incident, IncidentResponseManager} from './incident_response';
import {AgentOrchestrator, Proposal} from './multi_agent_governance';
import {OnboardingParams, OnboardingWizard} from './onboarding_wizard';
import {SupabaseClient} from './supabase_client';

describe('Advanced Operations Integration Suite', () => {
  let db: SupabaseClient;
  const tenantId = 'tenant-adv-999';

  beforeEach(async () => {
    db = new SupabaseClient(
      'https://mock-adv.supabase.co',
      'mock-adv-key',
      true,
    );

    // Seed base client data
    const client: ClientProfile = {
      clientId: 'client-acme-adv',
      orgId: `org-${tenantId}`,
      name: 'Acme Advanced Corp',
      industry: 'Retail',
      mrr: 15000,
      marginTarget: 0.35,
      healthScore: 85,
      churnRisk: 0.05,
      tenantId,
    };
    await db.saveClient(client);
  });

  describe('Multi-Agent Collaborative Governance', () => {
    it('should reach approved consensus when both CFO and Creative Director agree', async () => {
      const orchestrator = new AgentOrchestrator(db);

      // Seed compliant asset
      const asset: CreativeAsset = {
        assetId: 'asset-ok',
        tenantId,
        type: 'design',
        title: 'Compliance Approved Ad',
        location: 'https://figma.com/file/approved-ad',
        campaign: 'camp-v1',
        complianceOk: true,
        createdAt: Date.now(),
      };
      await db.saveCreativeAsset(asset);

      const proposal = orchestrator.getMediaBuyer().proposeReallocation(
        tenantId,
        'camp-v1',
        'meta',
        'google',
        25000, // below CFO cap ($50,000)
        0.15, // 15% better POAS
      );

      const result = await orchestrator.processConsensus(proposal);
      expect(result.consensusReached).toBeTrue();
      expect(result.finalStatus).toBe('approved');
      expect(result.votes.length).toBe(2);
      expect(result.votes.every((v) => v.approved)).toBeTrue();
    });

    it('should reject proposal if Creative Director flags non-compliant assets', async () => {
      const orchestrator = new AgentOrchestrator(db);

      // Seed non-compliant asset
      const asset: CreativeAsset = {
        assetId: 'asset-fail',
        tenantId,
        type: 'design',
        title: 'Non Compliant Banner',
        location: 'https://figma.com/file/bad-banner',
        campaign: 'camp-v2',
        complianceOk: false, // flag violation
        createdAt: Date.now(),
      };
      await db.saveCreativeAsset(asset);

      const proposal: Proposal = {
        proposalId: 'prop-fail-creative',
        tenantId,
        campaignId: 'camp-v2',
        sourceChannel: 'meta',
        targetChannel: 'google',
        amount: 5000,
        rationale: 'Optimizing ROI',
        status: 'pending',
      };

      const result = await orchestrator.processConsensus(proposal);
      expect(result.consensusReached).toBeFalse();
      expect(result.finalStatus).toBe('escalated');
      expect(
        result.votes.some((v) => v.role === 'creative_director' && !v.approved),
      ).toBeTrue();
    });
  });

  describe('Cross-Channel Marketing Attribution', () => {
    const engine = new AttributionEngine();
    const touchpoints: Touchpoint[] = [
      {
        platform: 'meta',
        timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
        campaignId: 'c-meta',
      },
      {
        platform: 'google',
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
        campaignId: 'c-google',
      },
      {
        platform: 'meta',
        timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
        campaignId: 'c-meta-last',
      },
    ];

    it('should compute correct linear values', () => {
      const credits = engine.calculateLinearAttribution(touchpoints, 300);
      // 3 touchpoints, each gets 100 value. meta gets 200 total, google gets 100.
      const meta = credits.find((c) => c.platform === 'meta')!;
      const google = credits.find((c) => c.platform === 'google')!;
      expect(meta.allocatedValue).toBe(200);
      expect(google.allocatedValue).toBe(100);
    });

    it('should compute time-decay values favoring closer touchpoints', () => {
      const purchaseTime = Date.now();
      const credits = engine.calculateTimeDecayAttribution(
        touchpoints,
        100,
        purchaseTime,
        7,
      );
      const meta = credits.find((c) => c.platform === 'meta')!;
      const google = credits.find((c) => c.platform === 'google')!;
      // Google touchpoint (2 days ago) gets more weight than Meta first touchpoint (5 days ago)
      expect(google.allocatedValue).toBeGreaterThan(0);
      expect(meta.allocatedValue).toBeGreaterThan(0);
    });

    it('should compute position-based U-shape values', () => {
      const credits = engine.calculatePositionBasedAttribution(
        touchpoints,
        100,
      );
      // U-Shape: 40% first (meta), 40% last (meta), 20% middle (google)
      // meta total credit: 40 + 40 = 80
      // google credit: 20
      const meta = credits.find((c) => c.platform === 'meta')!;
      const google = credits.find((c) => c.platform === 'google')!;
      expect(meta.allocatedValue).toBe(80);
      expect(google.allocatedValue).toBe(20);
    });
  });

  describe('Automated Incident Response & Self-Healing', () => {
    it('should rotate credentials automatically on auth failure', async () => {
      const manager = new IncidentResponseManager(db);

      // Seed integration state
      await db.saveIntegrationState({
        integrationId: `state-meta-${tenantId}`,
        tenantId,
        provider: 'meta_ads_api' as any,
        status: 'suspended',
        settings: {accessToken: 'old-broken-token'},
        updatedAt: Date.now(),
      });

      const incident: Incident = {
        incidentId: 'inc-auth-101',
        tenantId,
        source: 'meta_ads_api',
        type: 'auth_failure',
        message: 'API returned 401 Unauthorized',
        timestamp: Date.now(),
      };

      const result = await manager.handleIncident(incident);
      expect(result.selfHealed).toBeTrue();
      expect(result.actionTaken).toContain('Rotated credentials');

      const states = await db.getIntegrationStates(tenantId);
      const updated = states.find((s) => s.provider === 'meta_ads_api')!;
      expect(updated.status).toBe('active');
      expect(updated.settings['accessToken']).toContain('token-backup-');
    });

    it('should trigger budget re-routing after 3 high error rate incident occurrences', async () => {
      const manager = new IncidentResponseManager(db);
      const incident: Incident = {
        incidentId: 'inc-err-1',
        tenantId,
        source: 'meta_ads_api',
        type: 'high_error_rate',
        message: 'API error rate at 22%',
        timestamp: Date.now(),
      };

      // 1st failure - just logged
      let result = await manager.handleIncident(incident);
      expect(result.selfHealed).toBeFalse();

      // 2nd failure - just logged
      result = await manager.handleIncident(incident);
      expect(result.selfHealed).toBeFalse();

      // 3rd failure - triggers budget reroute self-healing flow
      result = await manager.handleIncident(incident);
      expect(result.selfHealed).toBeTrue();
      expect(result.actionTaken).toContain('Re-routed spend');
    });
  });

  describe('Interactive Onboarding Wizard', () => {
    it('should initialize client profile, team members, and integration states correctly', async () => {
      const wizard = new OnboardingWizard(db);
      const params: OnboardingParams = {
        tenantId: 'tenant-new-wizard',
        clientName: 'Wizard Brand Inc',
        industry: 'SaaS',
        mrr: 20000,
        marginTarget: 0.4,
        teamMembers: [
          {
            memberId: 'wizard-member-1',
            roleName: 'account_mgr',
            permissions: ['approve_briefs'],
            capacityPct: 20,
          },
        ],
        platforms: ['google_ads', 'slack'],
      };

      const result = await wizard.runSetup(params);
      expect(result.success).toBeTrue();
      expect(result.initializedIntegrationsCount).toBe(2);
      expect(result.client.name).toBe('Wizard Brand Inc');

      // Verify records are stored in mock DB
      const clients = await db.getClients('tenant-new-wizard');
      expect(clients.length).toBe(1);
      expect(clients[0].name).toBe('Wizard Brand Inc');

      const members = await db.getTeamMembers('tenant-new-wizard');
      expect(members.length).toBe(1);
      expect(members[0].memberId).toBe('wizard-member-1');

      const integrations = await db.getIntegrationStates('tenant-new-wizard');
      expect(integrations.length).toBe(2);
      expect(integrations.map((i) => i.provider)).toContain(
        'google_ads' as any,
      );
      expect(integrations.map((i) => i.provider)).toContain('slack' as any);
    });
  });
});
