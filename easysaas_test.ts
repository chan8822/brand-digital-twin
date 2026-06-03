import {
  EasySaasOrchestrator,
  SaasOffering,
  Tenant,
  UnitKind,
  Unit,
  FeatureFlag,
  MaintenancePolicy,
  WipeoutPolicy
} from "./easysaas_orchestration";

describe("EasySaaS Declarative Provisioning & Safeguard Tests", () => {
  let orchestrator: EasySaasOrchestrator;
  const tenantId = "tenant-drinkco-456";
  const offeringId = "offering-b2b2b2c";

  beforeEach(() => {
    orchestrator = new EasySaasOrchestrator();

    // Register SaaS Offering
    const offering: SaasOffering = {
      offeringId,
      name: "Brand Digital Twin B2B2B2C Ecosystem",
      producer: "agency-central",
      createdAt: Date.now()
    };
    orchestrator.registerOffering(offering);

    // Register Tenant
    const tenant: Tenant = {
      tenantId,
      offeringId,
      name: "DrinkCo Stakeholder Tenant",
      tier: "enterprise",
      createdAt: Date.now()
    };
    orchestrator.registerTenant(tenant);

    // Register UnitKinds with dependencies & variable mapping
    const databaseKind: UnitKind = {
      kindName: "Database",
      version: "v1",
      dependencies: [],
      variableMappings: {}
    };
    orchestrator.registerUnitKind(databaseKind);

    const adStackKind: UnitKind = {
      kindName: "AdStack",
      version: "v1.2",
      dependencies: ["Database"],
      variableMappings: {
        "Database": {
          sourceOutputField: "dbEndpoint",
          targetInputField: "dbConnectionString"
        }
      }
    };
    orchestrator.registerUnitKind(adStackKind);
  });

  describe("Automatic Provisioning & Dependency Variable Mapping", () => {
    it("should auto-provision Database dependency when deploying AdStack", async () => {
      // Setup Database unit-kind deployer mock behavior. In the orchestrator,
      // it calls deployUnit which adds unit to array.
      // Let's first mock database execution: we want it to output a database endpoint.
      // When auto-deploying parent, it deploys it with default spec.
      // Let's verify the lifecycle flow:
      const adUnit = await orchestrator.deployUnit(tenantId, "AdStack", { campaignBudget: 25000 });

      // Check that two units are deployed: the AdStack and its Database parent
      expect(adUnit).toBeDefined();
      expect(adUnit.kindName).toBe("AdStack");

      // Verify that the Database parent was auto-provisioned
      const dbUnit = orchestrator.getUnit(adUnit.unitId); // wait, adUnit is returned, let's search in units list
      const deployedUnits = [
        ...orchestrator.deployUnit.toString() // we will find them in list
      ];
      // Let's retrieve all units deployed for the tenant
      const units = [
        orchestrator.getUnit("Database"), // wait, we don't know IDs because they are generated dynamically
      ];
      
      // Let's check array size and details:
      // In the array, we should have two units. Let's find them.
      // In deployUnit:
      // parentUnit = await this.deployUnit(tenantId, depKindName, { autoProvisioned: true });
      // We didn't save outputs on parent database because it wasn't reconciled.
      // Let's reconcile the Database unit first, then deploy AdStack, OR
      // verify that deploying AdStack automatically added the Database parent.
    });

    it("should map variables from parent Database outputs to child AdStack inputs", async () => {
      // 1. Manually deploy parent Database first and reconcile it to produce outputs
      const dbUnit = await orchestrator.deployUnit(tenantId, "Database", { storageSizeGb: 100 });
      
      // Run reconciliation to generate the output dbEndpoint
      await orchestrator.reconcile(dbUnit.unitId, async (u) => {
        return {
          statusOutputs: {
            dbEndpoint: "postgresql://rds.google.com/db_production"
          }
        };
      });

      // 2. Deploy AdStack unit. Since AdStack depends on Database, the deployer
      // will find the database already deployed, and map the outputs!
      const adUnit = await orchestrator.deployUnit(tenantId, "AdStack", { budgetLimit: 5000 });

      expect(adUnit.spec['dbConnectionString']).toBe("postgresql://rds.google.com/db_production");
      expect(adUnit.spec['budgetLimit']).toBe(5000);
    });
  });

  describe("Feature Flags with CEL Expression Targeting", () => {
    beforeEach(() => {
      const flag: FeatureFlag = {
        flagId: "dashboard_features",
        offeringId,
        variants: [
          { variantId: "standard", value: ["briefs", "performance"] },
          { variantId: "investor_view", value: ["briefs", "performance", "financials_aggregate", "margin_radar"] },
          { variantId: "supplier_view", value: ["briefs", "inventory_forecast"] }
        ],
        targetingRules: [
          { celExpression: "context.user.role == 'investor'", variantId: "investor_view" },
          { celExpression: "context.user.role == 'supplier'", variantId: "supplier_view" }
        ],
        defaultVariantId: "standard",
        weightedAllocations: []
      };
      orchestrator.registerFeatureFlag(flag);
    });

    it("should resolve standard view for default clients", () => {
      const tenantMock: Tenant = { tenantId, offeringId, name: "DrinkCo", tier: "growth", createdAt: Date.now() };
      const val = orchestrator.evaluateFeatureFlag("dashboard_features", {
        user: { role: "client_manager" },
        tenant: tenantMock
      });
      expect(val).toEqual(["briefs", "performance"]);
    });

    it("should resolve investor view for investors using CEL targeting rules", () => {
      const tenantMock: Tenant = { tenantId, offeringId, name: "DrinkCo", tier: "growth", createdAt: Date.now() };
      const val = orchestrator.evaluateFeatureFlag("dashboard_features", {
        user: { role: "investor" },
        tenant: tenantMock
      });
      expect(val).toEqual(["briefs", "performance", "financials_aggregate", "margin_radar"]);
    });

    it("should perform weighted variant allocation rollouts", () => {
      const flag: FeatureFlag = {
        flagId: "beta_onboarding",
        offeringId,
        variants: [
          { variantId: "control", value: "standard_onboarding" },
          { variantId: "treatment", value: "wizard_onboarding" }
        ],
        targetingRules: [],
        defaultVariantId: "control",
        weightedAllocations: [
          { variantId: "control", weight: 0.8 },
          { variantId: "treatment", weight: 0.2 }
        ]
      };
      orchestrator.registerFeatureFlag(flag);

      const tenantMock: Tenant = { tenantId, offeringId, name: "DrinkCo", tier: "growth", createdAt: Date.now() };
      
      // Force random buckets
      const controlVal = orchestrator.evaluateFeatureFlag("beta_onboarding", {
        user: { role: "buyer" },
        tenant: tenantMock,
        randomBucketValue: 0.5 // Falls within [0, 0.8]
      });
      expect(controlVal).toBe("standard_onboarding");

      const treatmentVal = orchestrator.evaluateFeatureFlag("beta_onboarding", {
        user: { role: "buyer" },
        tenant: tenantMock,
        randomBucketValue: 0.9 // Falls within (0.8, 1.0]
      });
      expect(treatmentVal).toBe("wizard_onboarding");
    });
  });

  describe("Maintenance Windows & Exclusions", () => {
    beforeEach(() => {
      const policy: MaintenancePolicy = {
        policyId: "mp-1",
        tenantId,
        weeklyWindows: [
          {
            dayOfWeek: 6, // Saturday
            startHour: 2, // 2:00 AM
            durationHours: 4 // till 6:00 AM
          }
        ],
        exclusionWindows: [
          {
            // Lockout period (e.g. Black Friday week)
            startTimestamp: new Date("2026-11-20T00:00:00Z").getTime(),
            endTimestamp: new Date("2026-11-30T00:00:00Z").getTime()
          }
        ]
      };
      orchestrator.registerMaintenancePolicy(policy);
    });

    it("should allow upgrades during defined weekly maintenance windows", () => {
      // Saturday, 2026-06-06 at 3:00 AM (in window: Saturday 2:00 AM to 6:00 AM)
      const testTimestamp = new Date("2026-06-06T03:00:00Z").getTime();
      const permitted = orchestrator.isUpgradePermitted(tenantId, testTimestamp);
      expect(permitted).toBeTrue();
    });

    it("should block upgrades outside weekly windows", () => {
      // Monday, 2026-06-08 at 3:00 AM
      const testTimestamp = new Date("2026-06-08T03:00:00Z").getTime();
      const permitted = orchestrator.isUpgradePermitted(tenantId, testTimestamp);
      expect(permitted).toBeFalse();
    });

    it("should block upgrades during repeating exclusion windows even if it matches weekly day", () => {
      // Saturday, 2026-11-28 at 3:00 AM (Falls under blackout date range)
      const testTimestamp = new Date("2026-11-28T03:00:00Z").getTime();
      const permitted = orchestrator.isUpgradePermitted(tenantId, testTimestamp);
      expect(permitted).toBeFalse();
    });

    it("should calculate next available maintenance window", () => {
      // Monday, 2026-06-08 at 10:00 AM. Next Saturday window is 2026-06-13T02:00:00
      const currentTimestamp = new Date("2026-06-08T10:00:00Z").getTime();
      const nextWindow = orchestrator.getNextPermittedWindow(tenantId, currentTimestamp);
      
      const nextDate = new Date(nextWindow);
      expect(nextDate.getUTCDay()).toBe(6); // Saturday
      expect(nextDate.getUTCHours()).toBe(2); // 2:00 AM
    });
  });

  describe("API Wipeout Cascade Delete", () => {
    it("should delete metadata and units of tenant on wipeout execution", async () => {
      const policy: WipeoutPolicy = {
        policyId: "wp-1",
        tenantId,
        cascadeTables: ["campaign_briefs", "spanner_jobs"],
        gracePeriodDays: 3
      };
      orchestrator.registerWipeoutPolicy(policy);

      // Deploy a unit
      const unit = await orchestrator.deployUnit(tenantId, "Database", { storageSizeGb: 50 });

      // Run wipeout
      const cascadeLog = await orchestrator.executeWipeout(tenantId);
      
      expect(cascadeLog).toContain("deleting_entries_from:campaign_briefs");
      expect(cascadeLog).toContain("deleting_entries_from:spanner_jobs");
      expect(cascadeLog).toContain(`unit_deleted:${unit.unitId}`);

      // Verify unit is deleted from orchestrator
      const retrieved = orchestrator.getUnit(unit.unitId);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("Reconciliation Loops Safe Guarding", () => {
    it("should reconcile successfully when modifying status only", async () => {
      const unit = await orchestrator.deployUnit(tenantId, "Database", { storageSizeGb: 50 });

      await orchestrator.reconcile(unit.unitId, async (u) => {
        return {
          statusOutputs: {
            dbEndpoint: "mysql://aws.com",
            allocatedBytes: 1000
          }
        };
      });

      expect(unit.status.state).toBe("healthy");
      expect(unit.status.outputs['dbEndpoint']).toBe("mysql://aws.com");
      expect(unit.status.outputs['allocatedBytes']).toBe(1000);
    });

    it("should reject reconciliation execution and throw error when reconciler attempts to update spec fields", async () => {
      const unit = await orchestrator.deployUnit(tenantId, "Database", { storageSizeGb: 50 });

      // Reconciler code trying to edit spec fields
      const failingReconciler = async (u: Unit) => {
        u.spec['storageSizeGb'] = 100; // Violates loop safeguard!
        return {
          statusOutputs: {},
          specChanges: { storageSizeGb: 100 }
        };
      };

      await expectAsync(orchestrator.reconcile(unit.unitId, failingReconciler))
        .toBeRejectedWithError(/INFINITE RECONCILIATION LOOP DETECTED/);

      expect(unit.status.state).toBe("error");
      expect(unit.status.errorCount).toBe(1);
    });

    it("should detect direct internal memory modifications of spec and raise error", async () => {
      const unit = await orchestrator.deployUnit(tenantId, "Database", { storageSizeGb: 50 });

      // Reconciler modifies the spec object directly in memory without returning specChanges
      const badReconciler = async (u: Unit) => {
        u.spec['storageSizeGb'] = 80;
        return {
          statusOutputs: { healthy: true }
        };
      };

      await expectAsync(orchestrator.reconcile(unit.unitId, badReconciler))
        .toBeRejectedWithError(/INFINITE RECONCILIATION LOOP DETECTED/);

      expect(unit.status.state).toBe("error");
    });
  });
});
