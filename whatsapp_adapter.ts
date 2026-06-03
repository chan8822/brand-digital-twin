// Phase 3 — WhatsApp Broadcast Adapter.
// Implements the PlatformAdapter contract for irreversible messaging sends.

import {
  PlatformAdapter,
  Capability,
  HealthReport,
  ActionRequest,
  ActionPlan,
  ActionResult,
  RollbackHandle,
} from "./platform_adapter";

export class WhatsAppAdapter implements PlatformAdapter {
  readonly platform = "whatsapp";
  readonly schemaVersion = "whatsapp_cloud_api@v17.0";
  readonly capabilities: Capability[] = [
    { entity: "whatsapp_broadcast", ops: ["activate"], reversible: false }, // IRREVERSIBLE BY DESIGN
  ];

  // Simulator trackers
  private sentMessagesCount = 0;

  constructor(
    private phoneId: string,
    private token: string,
    private tenantId: string,
  ) {}

  async read(since: Date): Promise<any[]> {
    // In production, syncs sent messages, delivery receipts, and template configurations.
    return [{ id: "tpl_winter_sale_1", status: "APPROVED", category: "MARKETING" }];
  }

  async plan(req: ActionRequest): Promise<ActionPlan> {
    const warnings: string[] = [];
    const payload = req.payload as { templateId: string; recipientCount: number };

    if (!payload || typeof payload.recipientCount !== "number") {
      return { request: req, valid: false, projectedCost: 0, warnings: ["Missing or invalid recipientCount."] };
    }

    // Safeguard: hard limit of 5,000 users per autonomous blast
    if (payload.recipientCount > 5000) {
      return {
        request: req,
        valid: false,
        projectedCost: payload.recipientCount * 0.02, // Estimate $0.02 per message
        warnings: [`Recipient count ${payload.recipientCount} exceeds safety ceiling of 5,000.`],
      };
    }

    return {
      request: req,
      valid: true,
      projectedCost: payload.recipientCount * 0.02,
      warnings,
    };
  }

  async execute(plan: ActionPlan): Promise<ActionResult> {
    if (!plan.valid) {
      return { ok: false, auditRef: "invalid_plan", error: "WhatsApp plan is invalid." };
    }

    const payload = plan.request.payload as { templateId: string; recipientCount: number };
    this.sentMessagesCount += payload.recipientCount;

    return {
      ok: true,
      auditRef: `whatsapp_${plan.request.idempotencyKey}`,
      // No rollback object returned because this action is irreversible (reversible: false)
    };
  }

  async rollback(h: RollbackHandle): Promise<ActionResult> {
    // Irreversible actions cannot be rolled back
    return {
      ok: false,
      auditRef: `rollback_${h.rollbackId}`,
      error: "WhatsApp broadcast template is irreversible and cannot be rolled back.",
    };
  }

  async healthCheck(): Promise<HealthReport> {
    return { ok: true, latencyMs: 5, schemaDriftDetected: false, deprecationWarnings: [] };
  }

  getSentMessagesCount() {
    return this.sentMessagesCount;
  }
}
