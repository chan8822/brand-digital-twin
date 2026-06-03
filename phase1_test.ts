import "jasmine";
import { GoogleAdsAdapter } from "./google_ads_adapter";
import { MetaAdsAdapter } from "./meta_ads_adapter";
import { IdentityResolver } from "./identity_resolver";
import { AnalystAgent } from "./analyst_agent";

describe("Phase 1 Integration Suite", () => {
  const tenantId = "tenant_test_123";

  // --- 1. Google Ads Adapter Test ---
  describe("GoogleAdsAdapter", () => {
    it("should fetch and normalize GAQL response into canonical campaigns and spend facts", async () => {
      const adapter = new GoogleAdsAdapter("123-456-7890", "mock_dev_token", "mock_auth_token", tenantId);

      // Mock search function
      const mockResults = [
        {
          campaign: { id: "888", name: "Winter Search Campaign", status: "ENABLED", advertisingChannelType: "SEARCH" },
          metrics: { costMicros: "150000000" }, // $150.00
          segments: { date: "2026-06-01" },
          customer: { currencyCode: "USD" },
        },
        {
          campaign: { id: "888", name: "Winter Search Campaign", status: "ENABLED", advertisingChannelType: "SEARCH" },
          metrics: { costMicros: "250000000" }, // $250.00
          segments: { date: "2026-06-02" },
          customer: { currencyCode: "USD" },
        },
      ];

      spyOn(adapter as any, "search").and.returnValue(Promise.resolve(mockResults));

      const rows = await adapter.read(new Date("2026-06-01"));

      expect(rows.campaigns.length).toBe(1);
      expect(rows.campaigns[0]["campaign_id"]).toBe("888");
      expect(rows.campaigns[0]["name"]).toBe("Winter Search Campaign");
      expect(rows.campaigns[0]["objective"]).toBe("SEARCH");
      expect(rows.campaigns[0]["status"]).toBe("ENABLED");

      expect(rows.spend_facts.length).toBe(2);
      expect(rows.spend_facts[0]["campaign_id"]).toBe("888");
      expect(rows.spend_facts[0]["day"]).toBe("2026-06-01");
      expect(rows.spend_facts[0]["amount"]).toBe(150.00);
      expect(rows.spend_facts[1]["day"]).toBe("2026-06-02");
      expect(rows.spend_facts[1]["amount"]).toBe(250.00);
    });
  });

  // --- 2. Meta Ads Adapter Test ---
  describe("MetaAdsAdapter", () => {
    it("should fetch and normalize Meta API response into canonical campaigns and spend facts", async () => {
      const adapter = new MetaAdsAdapter("act_555", "mock_access_token", tenantId);

      const mockCampaigns = {
        data: [
          { id: "777", name: "Meta Conversion Ads", status: "ACTIVE", objective: "CONVERSIONS" },
        ],
      };

      const mockInsights = {
        data: [
          { campaign_id: "777", campaign_name: "Meta Conversion Ads", spend: "89.50", date_start: "2026-06-01", account_currency: "USD" },
        ],
      };

      spyOn(adapter as any, "fetchGraph").and.callFake((path: string) => {
        if (path.includes("campaigns")) {
          return Promise.resolve(mockCampaigns);
        } else if (path.includes("insights")) {
          return Promise.resolve(mockInsights);
        }
        return Promise.resolve({ data: [] });
      });

      const rows = await adapter.read(new Date("2026-06-01"));

      expect(rows.campaigns.length).toBe(1);
      expect(rows.campaigns[0]["campaign_id"]).toBe("777");
      expect(rows.campaigns[0]["objective"]).toBe("CONVERSIONS");

      expect(rows.spend_facts.length).toBe(1);
      expect(rows.spend_facts[0]["campaign_id"]).toBe("777");
      expect(rows.spend_facts[0]["amount"]).toBe(89.50);
    });
  });

  // --- 3. Identity Resolver Test ---
  describe("IdentityResolver", () => {
    it("should resolve and cluster identifiers to a single customer ID", () => {
      const resolver = new IdentityResolver(tenantId);

      // Scenario 1: New customer signs up with email
      const res1 = resolver.resolve([{ identifierType: "email", rawIdentifier: "alice@gmail.com" }]);
      expect(res1.isNew).toBe(true);
      const aliceId = res1.customerId;

      // Scenario 2: Same customer logs in later with same email, adds phone number
      const res2 = resolver.resolve([
        { identifierType: "email", rawIdentifier: "alice@gmail.com" },
        { identifierType: "phone", rawIdentifier: "+1234567890" },
      ]);
      expect(res2.customerId).toBe(aliceId);
      expect(res2.isNew).toBe(false);

      // Scenario 3: Another customer signs up with phone only
      const res3 = resolver.resolve([{ identifierType: "phone", rawIdentifier: "+9876543210" }]);
      expect(res3.isNew).toBe(true);
      const bobId = res3.customerId;

      // Scenario 4: A transaction occurs linking Bob's phone and Alice's email (a merge scenario)
      const res4 = resolver.resolve([
        { identifierType: "email", rawIdentifier: "alice@gmail.com" },
        { identifierType: "phone", rawIdentifier: "+9876543210" },
      ]);

      // Bob's ID and Alice's ID should merge to one
      expect(res4.isNew).toBe(false);
      expect(res4.customerId).toBeDefined();
      expect(res4.mergedFromCustomerId).toBeDefined();
    });
  });

  // --- 4. Analyst Agent Test ---
  describe("AnalystAgent", () => {
    const analyst = new AnalystAgent(tenantId);

    it("should flag unprofitable spend when POAS is below 1.0", () => {
      const campaigns = [
        { campaign_id: "c1", name: "Wasteful PMax", tenant_id: tenantId },
      ];
      const spendFacts = [
        { campaign_id: "c1", amount: 500.00, tenant_id: tenantId }, // spent $500
      ];
      // 10% of gross revenue is attributed to the campaign in analyst logic.
      // With $2000 gross revenue, attributed = $200.
      // POAS = 200 / 500 = 0.4 < 1.0
      const orders = [
        { order_id: "o1", gross_revenue: 2000.00, tenant_id: tenantId },
      ];

      const recommendations = analyst.analyzeUnprofitableSpend(campaigns, spendFacts, orders);
      expect(recommendations.length).toBe(1);
      expect(recommendations[0].type).toBe("unprofitable_spend");
      expect(recommendations[0].severity).toBe("high");
      expect(recommendations[0].suggestedAction).toContain("Wasteful PMax");
    });

    it("should flag stockout risks when advertising low stock products", () => {
      const variants = [
        { variant_id: "v1", sku: "LOWSTOCK-SKU", stock: 3, cost_cogs: 20.00 },
      ];
      const campaigns = [
        { campaign_id: "c2", name: "Promo LOWSTOCK-SKU Campaign", tenant_id: tenantId },
      ];
      const spendFacts = [
        { campaign_id: "c2", amount: 150.00, tenant_id: tenantId },
      ];

      const recommendations = analyst.analyzeStockoutRisks(variants, campaigns, spendFacts);
      expect(recommendations.length).toBe(1);
      expect(recommendations[0].type).toBe("stockout_risk");
      expect(recommendations[0].projectedSavings).toBe(150.00);
    });

    it("should flag margin drift when unit costs erode margin", () => {
      const variants = [
        { variant_id: "v2", sku: "SHIRT-01", cost_cogs: 30.00 }, // Current COGS is $30
      ];
      const orderLines = [
        { variant_id: "v2", unit_cost: 20.00, qty: 5 }, // Hist average cost was $20
        { variant_id: "v2", unit_cost: 20.00, qty: 5 },
      ];

      const recommendations = analyst.analyzeMarginDrift(variants, orderLines);
      expect(recommendations.length).toBe(1);
      expect(recommendations[0].type).toBe("margin_drift");
      expect(recommendations[0].title).toContain("Margin Erosion");
    });
  });
});
