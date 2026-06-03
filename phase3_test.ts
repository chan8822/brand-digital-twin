import 'jasmine';
import {GoogleAdsAdapter} from './google_ads_adapter';
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
import {RbiAaAdapter} from './rbi_aa_adapter';
import {RiskRadar} from './risk_radar';
import {TallyAdapter} from './tally_adapter';
import {WhatsAppAdapter} from './whatsapp_adapter';

describe('Phase 3 Multi-Surface, Messaging & Financials Suite', () => {
  const tenantId = 'tenant_test_456';
  const mockAuditSink: AuditSink = {
    record: async () => {},
  };

  const mockPolicy = {
    maxDailyDollarsRisk: 1000,
    maxBudgetMovePct: 0.2,
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

  beforeEach(() => {
    trustLedger = new TrustLedger();
    circuitBreaker = new CircuitBreaker();
    engine = new GovernanceEngine(mockAuditSink, trustLedger, circuitBreaker);
  });

  describe('Tally & RBI AA Adapters', () => {
    it('should fetch ledger balances from Tally Prime', async () => {
      const tally = new TallyAdapter('mock_tally_gateway', tenantId);
      const balance = await tally.getLedgerBalance('Cash in Hand');
      expect(balance.balance).toBe(154000.5);
      expect(balance.type).toBe('DEBIT');
    });

    it('should calculate cash runway from consented bank accounts via Account Aggregator', async () => {
      const aa = new RbiAaAdapter('mock_consent', tenantId);
      const accounts = await aa.getConsentedBalances();
      expect(accounts.length).toBe(1);
      expect(accounts[0].availableBalance).toBe(4250000.0); // 42.5 Lakhs

      const runway = await aa.calculateRunwayMonths(1000000); // 10 Lakhs monthly burn
      expect(runway).toBeCloseTo(4.25, 2);
    });
  });

  describe('WhatsApp Irreversible Broadcasts', () => {
    it('should block autonomous send and queue for approval because it is irreversible', async () => {
      const wa = new WhatsAppAdapter('phone_123', 'mock_token', tenantId);

      // Seed maximum trust
      trustLedger.setTier(tenantId, 'activate', 3);

      const req: ActionRequest = {
        idempotencyKey: 'wa_blast_001',
        op: 'activate',
        entity: 'whatsapp_broadcast',
        targetId: 'tpl_winter_sale_1',
        payload: {templateId: 'tpl_winter_sale_1', recipientCount: 1500},
        confidence: 0.95,
      };

      const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

      const res = await engine.govern(wa, req, ctx);

      // WhatsApp activation is irreversible (reversible = false), so it must queue!
      expect(res.status).toBe('queued');
      expect(wa.getSentMessagesCount()).toBe(0);
    });

    it('should invalidate plan if recipient count exceeds safety ceiling of 5,000', async () => {
      const wa = new WhatsAppAdapter('phone_123', 'mock_token', tenantId);

      const req: ActionRequest = {
        idempotencyKey: 'wa_blast_002',
        op: 'activate',
        entity: 'whatsapp_broadcast',
        targetId: 'tpl_winter_sale_1',
        payload: {templateId: 'tpl_winter_sale_1', recipientCount: 6500}, // above 5,000 ceiling
        confidence: 0.9,
      };

      const plan = await wa.plan(req);
      expect(plan.valid).toBe(false);
      expect(plan.warnings[0]).toContain('exceeds safety ceiling');
    });
  });

  describe('Risk Radar Engine', () => {
    it('should scan inventory levels and pause campaign automatically on stockout', async () => {
      const google = new GoogleAdsAdapter(
        '123-456-7890',
        'mock_dev',
        'mock_auth',
        tenantId,
      );

      // Seed high trust for campaign pausing
      trustLedger.setTier(tenantId, 'pause', 3);

      const radar = new RiskRadar(engine, google);

      // Seed an out-of-stock product variant (qty = 0) promoting campaign "c1"
      radar.seedInventory({
        variantId: 'v_shoe_red_10',
        sku: 'SHOE-RED-10',
        qty: 0, // OUT OF STOCK
        promotedCampaignIds: ['c1'],
      });

      const ctx: Context = {tenant, role: permittedRole, verifyWindowMs: 100};

      const actions = await radar.scanStockouts(ctx);

      expect(actions.length).toBe(1);
      expect(actions[0]).toBe('paused_campaign_c1_for_SHOE-RED-10');

      // Verify campaign status in google ads simulator is updated to PAUSED
      const camp = google.getSimulatedCampaign('c1');
      expect(camp?.status).toBe('PAUSED');
    });
  });
});
