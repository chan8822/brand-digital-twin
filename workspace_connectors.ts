/**
 * @fileoverview Connectors to external office suites and chat platforms.
 */

import {ApprovalRequest, BrandSignal, TeamMember} from './agency_os_types';
import {SupabaseClient} from './supabase_client';

/**
 * GoogleWorkspaceConnector handles interactions with GSuite APIs.
 */
export class GoogleWorkspaceConnector {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Scans a member's Calendar events to log scheduling signals (e.g. busy levels, client syncs).
   */
  async scanCalendarSignals(
    tenantId: string,
    member: TeamMember,
  ): Promise<BrandSignal[]> {
    const signals: BrandSignal[] = [
      {
        signalId: `sig-cal-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        tenantId,
        source: 'team',
        type: 'calendar_utilization',
        severity: member.capacityPct > 85 ? 'high' : 'info',
        message: `Team member ${member.memberId} calendar capacity is at ${member.capacityPct}%`,
        payload: {memberId: member.memberId, capacityPct: member.capacityPct},
        timestamp: Date.now(),
      },
    ];

    for (const signal of signals) {
      await this.db.saveBrandSignal(signal);
    }
    return signals;
  }

  /**
   * Mock utility to export automated PDF/Google Doc agency performance report.
   */
  async generateClientReportDoc(
    tenantId: string,
    clientId: string,
  ): Promise<string> {
    const docUrl = `https://docs.google.com/document/d/mock-report-${clientId}-${Date.now()}`;
    await this.db.logActivity({
      eventId: `evt-rep-${Date.now()}`,
      orgId: 'org-1',
      actorId: 'system',
      actionType: 'report_generated',
      entityType: 'client',
      entityId: clientId,
      summary: `Exported monthly client performance report to GDocs: ${docUrl}`,
      isRead: false,
      tenantId,
      createdAt: Date.now(),
    });
    return docUrl;
  }
}

/**
 * Microsoft365Connector handles MS Office and Outlook mail/calendar interfaces.
 */
export class Microsoft365Connector {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Scans Outlook inbox items for brand keyword alerts.
   */
  async scanOutlookKeywords(tenantId: string): Promise<BrandSignal[]> {
    // Simulated discovery of an urgent PR flag in Outlook
    const signal: BrandSignal = {
      signalId: `sig-m365-${Date.now()}`,
      tenantId,
      source: 'pr',
      type: 'outlook_flag',
      severity: 'medium',
      message:
        "Urgent email subject flagged: 'Urgent: Competitor pricing change on Shopify'",
      payload: {keyword: 'competitor pricing', priority: 'urgent'},
      timestamp: Date.now(),
    };
    await this.db.saveBrandSignal(signal);
    return [signal];
  }
}

/**
 * SlackConnector orchestrates real-time notifications and interactive block kit approvals.
 */
export class SlackConnector {
  private readonly sentSlackMessages: Array<{
    channel: string;
    text: string;
    blocks?: any;
  }> = [];

  constructor(private readonly db: SupabaseClient) {}

  /**
   * Sends a message to a channel with support for rich Block Kit blocks.
   */
  async postMessage(
    channel: string,
    text: string,
    blocks?: any,
  ): Promise<boolean> {
    this.sentSlackMessages.push({channel, text, blocks});
    return true;
  }

  /**
   * Gets list of sent Slack messages (useful for tests).
   */
  getSentMessages() {
    return this.sentSlackMessages;
  }

  /**
   * Dispatches approval requests to Slack with simulated block triggers.
   */
  async dispatchApprovalInteractiveBlock(
    approval: ApprovalRequest,
  ): Promise<boolean> {
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Manual Approval Needed:* ${approval.reason}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {type: 'plain_text', text: 'Approve'},
            value: 'approved',
            action_id: 'approve_btn',
          },
          {
            type: 'button',
            text: {type: 'plain_text', text: 'Reject'},
            value: 'rejected',
            action_id: 'reject_btn',
          },
        ],
      },
    ];

    return this.postMessage(
      '#approvals',
      `Approval Request: ${approval.approvalId}`,
      blocks,
    );
  }
}
