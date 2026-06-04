/**
 * @fileoverview Main orchestration and logic modules for Agency OS.
 */

import {
  ActivityFeedItem,
  ApprovalRequest,
  CampaignBrief,
  ClientPortalToken,
  ClientProfile,
  TeamMember,
} from './agency_os_types';
import {GovernanceEngine} from './governance_engine';
import {Context, Role} from './governance_types';
import {PinoLogger} from './observability';
import {ActionRequest, PlatformAdapter} from './platform_adapter';
import {SupabaseClient} from './supabase_client';

/**
 * CollaborationHub coordinates client profiles, team assignments, and client health metrics.
 */
export class CollaborationHub {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Calculates the client health score dynamically based on audit logs, success rates, and active risk metrics.
   */
  async calculateClientHealth(
    tenantId: string,
    clientId: string,
  ): Promise<number> {
    const clients = await this.db.getClients(tenantId);
    const client = clients.find((c) => c.clientId === clientId);
    if (!client) return 0;

    const auditLogs = await this.db.getAuditLogs(tenantId);
    // Find audit logs matching this client (where the target target_id contains client ID or the reason contains client name)
    const clientAudits = auditLogs.filter(
      (l) => l.target_id.includes(clientId) || l.reason.includes(client.name),
    );

    if (clientAudits.length === 0) {
      // Default baseline health is 80 if no audits have run yet
      let score = 80;
      if (client.churnRisk > 0.5) score -= 20;
      return Math.max(0, Math.min(100, score));
    }

    const successCount = clientAudits.filter(
      (l) => l.decision === 'executed' || l.decision === 'auto_executed',
    ).length;
    const successRatio = successCount / clientAudits.length;

    let health = Math.round(successRatio * 100);
    if (client.churnRisk > 0.5) health -= 20;

    return Math.max(0, Math.min(100, health));
  }
}

/**
 * ApprovalWorkflowManager orchestrates interactive sign-offs on actions that require human review.
 */
export class ApprovalWorkflowManager {
  private readonly logger = new PinoLogger();

  constructor(
    private readonly db: SupabaseClient,
    private readonly governance: GovernanceEngine,
  ) {}

  /**
   * Submits a request queued by the Governance Engine into the approvals registry.
   */
  async queueForManualReview(
    req: ActionRequest,
    ctx: Context,
    reason: string,
    assignedRole: string,
  ): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      approvalId: `appr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      orgId: 'org-1',
      entityType: req.entity,
      entityId: req.targetId,
      requestedBy: ctx.role.name || 'agent',
      assignedTo: assignedRole,
      status: 'pending',
      reason: reason,
      tenantId: ctx.tenant.tenantId,
      createdAt: Date.now(),
      actionRequest: req,
      context: ctx,
    };
    await this.db.saveApproval(approval);

    // Notify activity feed
    await this.db.logActivity({
      eventId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      orgId: 'org-1',
      actorId: 'system',
      actionType: 'approval_requested',
      entityType: req.entity,
      entityId: req.targetId,
      summary: `Action '${req.op}' on ${req.entity} (${req.targetId}) requires manual approval from role ${assignedRole}`,
      isRead: false,
      tenantId: ctx.tenant.tenantId,
      createdAt: Date.now(),
    });

    return approval;
  }

  /**
   * Actions a pending approval. Validates permissions of the signing team member.
   */
  async processApproval(
    approvalId: string,
    approverMember: TeamMember,
    approved: boolean,
    comments?: string,
    adapter?: PlatformAdapter,
  ): Promise<boolean> {
    const approvals = await this.db.getApprovals(approverMember.tenantId);
    const request = approvals.find((a) => a.approvalId === approvalId);
    if (!request || request.status !== 'pending') return false;

    // Check permissions of the approver
    if (
      request.assignedTo !== approverMember.roleName &&
      approverMember.roleName !== 'admin'
    ) {
      throw new Error(
        `Permission Denied: Approver role '${approverMember.roleName}' is not authorized to sign off for role '${request.assignedTo}'`,
      );
    }

    request.status = approved ? 'approved' : 'rejected';
    request.reason =
      comments ||
      (approved
        ? 'Approved via Agency OS portal'
        : 'Rejected via Agency OS portal');
    request.completedAt = Date.now();

    await this.db.saveApproval(request);

    // Log activity to the feed
    await this.db.logActivity({
      eventId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      orgId: request.orgId,
      actorId: approverMember.memberId,
      actionType: approved ? 'approval_signed_off' : 'approval_rejected',
      entityType: request.entityType,
      entityId: request.entityId,
      summary: `Approval request ${approvalId} was ${request.status} by ${approverMember.roleName}`,
      isRead: false,
      tenantId: request.tenantId,
      createdAt: Date.now(),
    });

    // Resume execution if approved
    if (approved && request.actionRequest && adapter) {
      this.logger.info(
        'Approval signed off: resuming execution via GovernanceEngine',
        {
          approvalId,
          idempotencyKey: request.actionRequest.idempotencyKey,
        },
      );

      const resumeCtx: Context = {
        tenant: request.context.tenant,
        role: {
          name: approverMember.roleName,
          permits: () => true, // elevated override permission
        },
        verifyWindowMs: request.context.verifyWindowMs,
      };

      // Register temporary waiver to bypass standard policy bounds
      this.governance.registerWaiver(request.tenantId, {
        allowedOps: [request.actionRequest.op],
        overrideRole: approverMember.roleName,
        reason: `Approved override sign-off (comments: ${comments || 'none'})`,
        expiresAtMs: Date.now() + 5 * 60 * 1000, // 5 min window
      });

      const res = await this.governance.govern(
        adapter,
        request.actionRequest,
        resumeCtx,
      );
      this.logger.info('Resumed governance execution complete', {
        approvalId,
        status: res.status,
      });

      if (res.status !== 'executed') {
        throw new Error(`Resumed execution failed: status is ${res.status}`);
      }
    }

    return true;
  }
}

/**
 * CSuiteFinancialEngine handles portfolio revenue, target margins, and ROI models.
 */
export class CSuiteFinancialEngine {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Aggregate revenue and margins across all clients in the portfolio.
   */
  async getPortfolioProfitability(tenantId: string): Promise<{
    totalRevenue: number;
    totalMargin: number;
    avgProfitMarginPct: number;
  }> {
    const clients = await this.db.getClients(tenantId);
    let totalRevenue = 0;
    let totalMargin = 0;

    for (const client of clients) {
      totalRevenue += client.mrr;
      totalMargin += client.mrr * client.marginTarget;
    }

    return {
      totalRevenue,
      totalMargin,
      avgProfitMarginPct: totalRevenue > 0 ? totalMargin / totalRevenue : 0,
    };
  }

  /**
   * Forecasts target margins and profitability for budget changes or headcount updates.
   */
  runScenarioModel(
    currentMargin: number,
    spendDelta: number,
    projectedRoi: number,
    headcountCost: number,
  ): {netProfitDelta: number; newMarginPct: number} {
    const revenueDelta = spendDelta * projectedRoi;
    const additionalMargin = revenueDelta - spendDelta;
    const netProfitDelta = additionalMargin - headcountCost;

    return {
      netProfitDelta,
      // Note: newMarginPct represents the absolute margin value after scenario updates
      newMarginPct: currentMargin + netProfitDelta,
    };
  }
}
