/**
 * @fileoverview EasySaaS Declarative Resource Modeling, Dependency Management,
 * Feature Flags, Maintenance Exclusions, Wipeout, and Safe Reconciliation.
 */

// Declarative Primitives

export interface SaasOffering {
  offeringId: string;
  name: string;
  producer: string;
  createdAt: number;
}

export interface Tenant {
  tenantId: string;
  offeringId: string;
  name: string;
  tier: 'free' | 'growth' | 'enterprise';
  createdAt: number;
}

export interface VariableMapping {
  sourceOutputField: string;
  targetInputField: string;
}

export interface UnitKind {
  kindName: string;
  version: string;
  dependencies: string[]; // parent UnitKind names
  variableMappings: Record<string, VariableMapping>; // Key: parent UnitKind
}

export interface Unit {
  unitId: string;
  tenantId: string;
  kindName: string;
  spec: Record<string, any>;
  status: {
    state: 'provisioning' | 'healthy' | 'updating' | 'error' | 'deleted';
    outputs: Record<string, any>;
    lastReconciledAt?: number;
    errorCount?: number;
  };
}

// Feature Flags with CEL Targeting

export interface FlagVariant {
  variantId: string;
  value: any; // Visibility config, UI tweaks, etc.
}

export interface FlagTargetingRule {
  celExpression: string; // e.g. "context.user.role == 'investor'"
  variantId: string;
}

export interface FeatureFlag {
  flagId: string;
  offeringId: string;
  variants: FlagVariant[];
  targetingRules: FlagTargetingRule[];
  defaultVariantId: string;
  weightedAllocations?: Array<{ variantId: string; weight: number }>; // e.g. [ {variantId: 'v1', weight: 0.1} ]
}

// Maintenance Policies

export interface MaintenanceWindow {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startHour: number; // 0-23
  durationHours: number;
}

export interface MaintenancePolicy {
  policyId: string;
  tenantId: string;
  weeklyWindows: MaintenanceWindow[];
  exclusionWindows: Array<{ startTimestamp: number; endTimestamp: number }>;
}

// Wipeout Cascades

export interface WipeoutPolicy {
  policyId: string;
  tenantId: string;
  cascadeTables: string[]; // e.g., ["user_profiles", "spanner_jobs", "campaign_briefs"]
  gracePeriodDays: number;
}

// System Orchestrator class

export class EasySaasOrchestrator {
  private offerings: SaasOffering[] = [];
  private tenants: Tenant[] = [];
  private unitKinds: Map<string, UnitKind> = new Map();
  private units: Unit[] = [];
  private flags: FeatureFlag[] = [];
  private maintenancePolicies: MaintenancePolicy[] = [];
  private wipeoutPolicies: WipeoutPolicy[] = [];

  // Register Primitives
  registerOffering(offering: SaasOffering): void {
    this.offerings.push(offering);
  }

  registerTenant(tenant: Tenant): void {
    this.tenants.push(tenant);
  }

  registerUnitKind(kind: UnitKind): void {
    this.unitKinds.set(kind.kindName, kind);
  }

  getUnit(unitId: string): Unit | undefined {
    return this.units.find(u => u.unitId === unitId);
  }

  registerFeatureFlag(flag: FeatureFlag): void {
    this.flags.push(flag);
  }

  registerMaintenancePolicy(policy: MaintenancePolicy): void {
    this.maintenancePolicies.push(policy);
  }

  registerWipeoutPolicy(policy: WipeoutPolicy): void {
    this.wipeoutPolicies.push(policy);
  }

  // Feature Flag CEL Evaluator (mock evaluator)
  evaluateFeatureFlag(
    flagId: string,
    context: { user: { role: string }; tenant: Tenant; randomBucketValue?: number }
  ): any {
    const flag = this.flags.find(f => f.flagId === flagId);
    if (!flag) throw new Error(`Flag ${flagId} not found`);

    // 1. Evaluate Targeting Rules (CEL Mock interpreter)
    for (const rule of flag.targetingRules) {
      if (this.evaluateCelExpression(rule.celExpression, context)) {
        const variant = flag.variants.find(v => v.variantId === rule.variantId);
        return variant ? variant.value : null;
      }
    }

    // 2. Evaluate Weighted Allocations (for gradual rollouts)
    if (flag.weightedAllocations && flag.weightedAllocations.length > 0) {
      const bucket = context.randomBucketValue ?? Math.random();
      let cumulative = 0;
      for (const alloc of flag.weightedAllocations) {
        cumulative += alloc.weight;
        if (bucket <= cumulative) {
          const variant = flag.variants.find(v => v.variantId === alloc.variantId);
          return variant ? variant.value : null;
        }
      }
    }

    // 3. Fallback to default variant
    const defaultVariant = flag.variants.find(v => v.variantId === flag.defaultVariantId);
    return defaultVariant ? defaultVariant.value : null;
  }

  private evaluateCelExpression(expression: string, context: any): boolean {
    // Basic mock parser of Common Expression Language
    if (expression === "context.user.role == 'investor'") {
      return context.user?.role === 'investor';
    }
    if (expression === "context.tenant.tier == 'enterprise'") {
      return context.tenant?.tier === 'enterprise';
    }
    if (expression === "context.user.role == 'supplier'") {
      return context.user?.role === 'supplier';
    }
    return false;
  }

  // Dependency Management & Lifecycle Provisioning
  async deployUnit(tenantId: string, kindName: string, spec: Record<string, any>): Promise<Unit> {
    const kind = this.unitKinds.get(kindName);
    if (!kind) throw new Error(`UnitKind ${kindName} not found`);

    // 1. Check parent dependencies
    for (const depKindName of kind.dependencies) {
      // Find if tenant already has parent unit deployed
      let parentUnit = this.units.find(u => u.tenantId === tenantId && u.kindName === depKindName);
      if (!parentUnit) {
        // Automatic Provisioning: parent was not found, deploy it first automatically!
        parentUnit = await this.deployUnit(tenantId, depKindName, { autoProvisioned: true });
      }

      // Automatic Variable Mapping: map parent outputs to child spec
      const mappings = kind.variableMappings[depKindName];
      if (mappings) {
        const value = parentUnit.status.outputs[mappings.sourceOutputField];
        spec[mappings.targetInputField] = value;
      }
    }

    // Create unit
    const unit: Unit = {
      unitId: `unit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenantId,
      kindName,
      spec,
      status: {
        state: 'provisioning',
        outputs: {}
      }
    };
    this.units.push(unit);
    return unit;
  }

  // Maintenance policy enforcement
  isUpgradePermitted(tenantId: string, timestamp: number): boolean {
    const policy = this.maintenancePolicies.find(p => p.tenantId === tenantId);
    if (!policy) return true; // No policy -> always permitted

    // 1. Check exclusion windows (upgrades forbidden)
    for (const excl of policy.exclusionWindows) {
      if (timestamp >= excl.startTimestamp && timestamp <= excl.endTimestamp) {
        return false;
      }
    }

    // 2. Check weekly maintenance windows
    const date = new Date(timestamp);
    const dayOfWeek = date.getUTCDay(); // 0-6
    const hour = date.getUTCHours();

    for (const win of policy.weeklyWindows) {
      if (win.dayOfWeek === dayOfWeek) {
        const start = win.startHour;
        const end = start + win.durationHours;
        if (hour >= start && hour < end) {
          return true; // Falls in a weekly window
        }
      }
    }

    return false;
  }

  // Calculate next upgrade window
  getNextPermittedWindow(tenantId: string, currentTimestamp: number): number {
    const policy = this.maintenancePolicies.find(p => p.tenantId === tenantId);
    if (!policy || policy.weeklyWindows.length === 0) return currentTimestamp;

    let testTime = currentTimestamp;
    const oneHourMs = 60 * 60 * 1000;

    // Search day-by-day, hour-by-hour (up to 7 days ahead)
    for (let i = 0; i < 24 * 7; i++) {
      if (this.isUpgradePermitted(tenantId, testTime)) {
        return testTime;
      }
      testTime += oneHourMs;
    }

    return currentTimestamp;
  }

  // Wipeout Cascading Deletion
  async executeWipeout(tenantId: string): Promise<string[]> {
    const policy = this.wipeoutPolicies.find(p => p.tenantId === tenantId);
    if (!policy) return [];

    // Cascade deletion of resources
    const deletedResources: string[] = [];
    for (const table of policy.cascadeTables) {
      deletedResources.push(`deleting_entries_from:${table}`);
    }

    // Delete all deployed units for tenant
    this.units = this.units.filter(u => {
      if (u.tenantId === tenantId) {
        deletedResources.push(`unit_deleted:${u.unitId}`);
        return false;
      }
      return true;
    });

    return deletedResources;
  }

  // Safe Reconciliation Loop Controller
  async reconcile(
    unitId: string,
    reconcilerFn: (unit: Unit) => Promise<{ statusOutputs: Record<string, any>; specChanges?: Record<string, any> }>
  ): Promise<void> {
    const unit = this.units.find(u => u.unitId === unitId);
    if (!unit) return;

    // Snapshot of spec to verify controller hasn't modified spec fields
    const specSnapshot = JSON.stringify(unit.spec);

    unit.status.state = 'updating';

    // Execute the controller reconcile step
    const result = await reconcilerFn(unit);

    // Safeguard: verify spec was NOT changed by the reconciler.
    // If reconcilerFn changed or returned specChanges, we block/throw to prevent infinite loop.
    if (result.specChanges && Object.keys(result.specChanges).length > 0) {
      unit.status.state = 'error';
      unit.status.errorCount = (unit.status.errorCount ?? 0) + 1;
      throw new Error(
        `INFINITE RECONCILIATION LOOP DETECTED: Controller attempted to modify spec fields of unit ${unitId}. Updates to spec must be triggered via client/API operations only.`
      );
    }

    // Verify snapshot check
    if (JSON.stringify(unit.spec) !== specSnapshot) {
      unit.status.state = 'error';
      unit.status.errorCount = (unit.status.errorCount ?? 0) + 1;
      throw new Error(
        `INFINITE RECONCILIATION LOOP DETECTED: Spec modified internally in reconciler memory for unit ${unitId}.`
      );
    }

    // Save outputs and update state to healthy
    unit.status.outputs = result.statusOutputs;
    unit.status.state = 'healthy';
    unit.status.lastReconciledAt = Date.now();
  }
}
