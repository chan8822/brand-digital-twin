import 'jasmine';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {GoogleExpress, MetaCampaign} from './google_express';
import {
  AuditSink,
  CircuitBreaker,
  Context,
  GovernanceEngine,
  Role,
  Tenant,
  TrustLedger,
} from './governance_engine';
import {ActionRequest} from './platform_adapter';

describe('Phase 4 Stack Migration & Integration Suite', () => {
  const tenantId = 'tenant_migration_789';
  const mockAuditSink: AuditSink = {
    record: async () => {},
  };

  const mockPolicy = {
    maxDailyDollarsRisk: 300, // conservative risk budget cap
    maxBudgetMovePct: 0.3,
    minConfidence: 0.8,
    escalationRole: 'cmo',
  };

  const tenant: Tenant = {
    tenantId,
    policy: mockPolicy,
  };

  const permittedRole: Role = {
    permits: () => true,
  };

  let trustLedger: TrustLedger;
  let circuitBreaker: CircuitBreaker;
  let engine: GovernanceEngine;
  let express: GoogleExpress;

  beforeEach(() => {
    trustLedger = new TrustLedger();
    circuitBreaker = new CircuitBreaker();
    engine = new GovernanceEngine(mockAuditSink, trustLedger, circuitBreaker);
    express = new GoogleExpress();
  });

  it('should translate a Meta campaign and successfully plan it under the Governance Engine', async () => {
    // 1. Setup source Meta Campaign configuration
    const metaCamp: MetaCampaign = {
      id: 'meta_c_111',
      name: 'Summer Shoes Blast',
      dailyBudget: 250, // Meta daily budget
      objective: 'CONVERSIONS',
      targeting: {
        genders: ['FEMALE'],
        interests: ['shoes', 'heels'],
      },
      adAssets: {
        headline: 'Stunning Heels',
        bodyText: 'Get 20% off summer sandals',
      },
    };

    // 2. Translate Meta configuration to Google Ads proposal
    const proposal = express.translateMetaToGoogle(metaCamp);

    expect(proposal.campaignName).toBe('Migrated_from_Meta_Summer Shoes Blast');
    expect(proposal.budget).toBe(200); // 80% of 250
    expect(proposal.advertisingChannelType).toBe('PERFORMANCE_MAX');
    expect(proposal.customIntentKeywords).toContain('shoes buy online');

    // 3. Formulate ActionRequest for Google Ads Campaign creation
    const googleAdapter = new GoogleAdsAdapter(
      '123-456-7890',
      'mock_dev',
      'mock_auth',
      tenantId,
    );

    // Seed moderate trust tier for budget creation
    trustLedger.setTier(tenantId, 'activate', 2);

    const req: ActionRequest = {
      idempotencyKey: 'migrated_camp_001',
      op: 'activate',
      entity: 'campaign',
      targetId: 'c_new_migrated',
      payload: {
        name: proposal.campaignName,
        budget: proposal.budget,
        channel: proposal.advertisingChannelType,
      },
      confidence: 0.9, // high confidence translation
    };

    const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

    // 4. Submit migrated plan to Governance Engine
    const res = await engine.govern(googleAdapter, req, ctx);

    // Since the daily risk (projected cost = $200) is within the policy's $300 limit,
    // and confidence is above 0.80, it should auto-execute campaign creation in the sandbox
    expect(res.status).toBe('executed');

    // Confirm campaign was launched in simulator
    const camp = googleAdapter.getSimulatedCampaign('c_new_migrated');
    expect(camp).toBeDefined();
    expect(camp?.name).toBe('Migrated_from_Meta_Summer Shoes Blast');
    expect(camp?.budget).toBe(200);
  });
});
