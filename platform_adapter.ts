// PlatformAdapter interface and canonical contract definitions.

export type Op = "read" | "update_budget" | "pause" | "activate";

export interface Capability {
  entity: string; // 'campaign' | 'order' | 'audience' | etc.
  ops: Op[];
  reversible: boolean;
}

export interface HealthReport {
  ok: boolean;
  latencyMs: number;
  rateLimitRemaining?: number;
  schemaDriftDetected: boolean;
  deprecationWarnings: string[];
}

export interface RollbackHandle {
  rollbackId: string;
  platform: string;
  originalState: unknown;
}

export interface ActionRequest {
  idempotencyKey: string;
  op: Op;
  entity: string;
  targetId: string;
  payload: unknown;
  confidence: number;
}

export interface ActionPlan {
  request: ActionRequest;
  valid: boolean;
  projectedCost: number; // dollars-at-risk
  warnings: string[];
}

export interface ActionResult {
  ok: boolean;
  auditRef: string;
  rollback?: RollbackHandle;
  error?: string;
}

export interface PlatformAdapter {
  readonly platform: string;
  readonly schemaVersion: string;
  readonly capabilities: Capability[];

  // --- READ ---
  read(since: Date): Promise<any> | AsyncIterable<any>;

  // --- WRITE ---
  plan(req: ActionRequest): Promise<ActionPlan>;
  execute(plan: ActionPlan): Promise<ActionResult>;
  rollback(h: RollbackHandle): Promise<ActionResult>;

  // --- HEALTH ---
  healthCheck(): Promise<HealthReport>;
}
