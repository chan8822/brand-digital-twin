/**
 * @fileoverview Stakeholder Portal & Ecosystem Orchestrator for Brand Digital Twin.
 */

import {
  ActivityFeedItem,
  ApprovalRequest,
  CampaignBrief,
  ClientProfile,
  CreativeAsset,
  EcosystemRole,
  FinancialTransaction,
  IntegrationState,
  StakeholderAssociation,
} from './agency_os_types';
import {SupabaseClient} from './supabase_client';

export interface OnboardingStep {
  step: number;
  title: string;
  description: string;
  actions?: string[];
  integrations?: Array<
    {type: string; required?: boolean; label?: string} | string
  >;
  roleSelection?: boolean;
  permissionsPreview?: boolean;
  dashboardPresets?: string[];
  customization?: boolean;
  features?: string[];
  preferences?: string[];
  optional?: boolean;
  requiresSignature?: boolean;
  metrics?: string[];
  alerts?: string[];
  required?: boolean;
  complexity?: string;
  campaignCount?: number;
  automation?: string;
}

export interface OnboardingFlow {
  steps: OnboardingStep[];
  estimatedTime: string;
  skipOption: boolean;
  complianceLevel?: string;
}

export interface DashboardDefinition {
  id: string;
  role: EcosystemRole;
  title: string;
  sections: DashboardSection[];
}

export interface DashboardSection {
  name: string;
  cards: DashboardCard[];
}

export interface DashboardCard {
  metric?: string;
  value?: string | number;
  trend?: string;
  source?: string;
  actions?: string[];
  alert?: boolean;
  type?: string;
  segments?: Array<{status: string; count: number; mrr: string}>;
  breakdown?: string[];
  capacityForecast?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title?: string;
  details?: string;
  comparison?: string;
  visualization?: string;
  color?: string;
  items?: any[];
  impact?: string;
  recommendation?: string;
  expectedROI?: string;
  estimatedSpend?: string;
  projects?: any[];
  dueDate?: string;
  daysUntilDue?: number;
  status?: string;
  clientComment?: string;
  amount?: string;
  value_dollars?: string;
  runway?: string;
  period?: string;
  confidence?: string;
  risk?: string;
  score?: string;
  atRiskClients?: number;
  plan_next_quarter?: string;
  forecast_roi?: string;
  rationale?: string;
  products?: any[];
}

/**
 * Orchestrates onboarding for different stakeholder tiers
 */
export class EcosystemOnboardingOrchestrator {
  constructor(private readonly db: SupabaseClient) {}

  async onboardUser(user: {
    email: string;
    role: EcosystemRole;
    organizationType: 'agency' | 'client' | 'partner' | 'investor' | 'supplier';
    invitedBy: string;
    clientId?: string;
  }): Promise<OnboardingFlow> {
    switch (user.organizationType) {
      case 'agency':
        return this.onboardAgencyUser(user);
      case 'client':
        return this.onboardClientUser(user);
      case 'partner':
        return this.onboardPartnerUser(user);
      case 'investor':
        return this.onboardInvestor(user);
      case 'supplier':
        return this.onboardSupplier(user);
      default:
        throw new Error(
          `Unsupported organization type: ${user.organizationType}`,
        );
    }
  }

  private async onboardAgencyUser(user: {
    email: string;
  }): Promise<OnboardingFlow> {
    return {
      steps: [
        {
          step: 1,
          title: 'Welcome to Brand Digital Twin',
          description: 'Your unified operating system',
          actions: ['create_account', 'verify_email'],
        },
        {
          step: 2,
          title: 'Connect Your Workspace',
          description:
            'Link Gmail, Google Drive, Slack for seamless collaboration',
          integrations: [
            {type: 'google_workspace', required: true},
            {type: 'slack', required: true},
            {type: 'asana', required: false},
          ],
          automation: 'auto_detect_workspace',
        },
        {
          step: 3,
          title: 'Set Role & Permissions',
          description: 'Define what you can see and do',
          roleSelection: true,
          permissionsPreview: true,
        },
        {
          step: 4,
          title: 'Connect Ad Platforms',
          description: 'Link Google Ads, Meta, Shopify',
          integrations: [
            {type: 'google_ads', required: true},
            {type: 'meta_ads', required: false},
            {type: 'shopify', required: false},
          ],
        },
        {
          step: 5,
          title: 'Dashboard Setup',
          description: 'Customize your home view',
          dashboardPresets: ['operator', 'manager', 'executive'],
          customization: true,
        },
      ],
      estimatedTime: '15 minutes',
      skipOption: false,
    };
  }

  private async onboardClientUser(user: {
    email: string;
    clientId?: string;
  }): Promise<OnboardingFlow> {
    let campaignCount = 0;
    if (user.clientId) {
      const briefs = await this.db.getCampaignBriefs('default-tenant');
      campaignCount = briefs.filter((b) => b.clientId === user.clientId).length;
    }
    return {
      steps: [
        {
          step: 1,
          title: 'Welcome! Your Agency has invited you',
          description: 'You now have access to real-time campaign performance',
          actions: ['accept_invitation', 'verify_email'],
        },
        {
          step: 2,
          title: 'Set Your Password',
          description: 'Secure your account',
          actions: ['set_password', '2fa_optional'],
        },
        {
          step: 3,
          title: 'Your Campaigns',
          description: 'See live performance metrics, ROI, and recommendations',
          actions: ['view_campaigns'],
          campaignCount,
        },
        {
          step: 4,
          title: 'Approve & Collaborate',
          description: 'Review briefs, approve campaigns, and provide feedback',
          features: [
            'approval_workflow',
            'comments',
            'real_time_notifications',
          ],
        },
        {
          step: 5,
          title: 'Communication Preferences',
          description: 'How often you want updates',
          preferences: [
            'daily_digest',
            'weekly_summary',
            'alerts_only',
            'custom',
          ],
        },
      ],
      estimatedTime: '5 minutes',
      skipOption: true,
    };
  }

  private async onboardPartnerUser(user: {
    email: string;
  }): Promise<OnboardingFlow> {
    return {
      steps: [
        {
          step: 1,
          title: 'Partnership Agreement',
          description: 'Review and sign partnership terms',
          actions: ['read_agreement', 'e_sign_agreement', 'accept_terms'],
          requiresSignature: true,
        },
        {
          step: 2,
          title: 'Project Access Setup',
          description: 'Access the projects assigned to you',
          actions: ['view_assignments', 'set_availability'],
        },
        {
          step: 3,
          title: 'Connect Your Tools',
          description: 'Link your own integrations for seamless handoff',
          integrations: ['figma', 'adobe', 'github', 'dropbox', 'slack'],
          optional: true,
        },
        {
          step: 4,
          title: 'Payment & Billing',
          description: 'Setup payment method and invoicing',
          actions: ['add_payment_method', 'set_invoicing_schedule', 'tax_info'],
        },
        {
          step: 5,
          title: 'Your Dashboard',
          description: 'See your projects, deliverables, and performance',
          actions: ['view_partner_dashboard'],
        },
      ],
      estimatedTime: '10 minutes',
      skipOption: false,
    };
  }

  private async onboardInvestor(user: {
    email: string;
  }): Promise<OnboardingFlow> {
    return {
      steps: [
        {
          step: 1,
          title: 'Confidentiality Agreement',
          description: 'Non-disclosure agreement for board member access',
          actions: ['read_nda', 'e_sign', 'accept'],
          requiresSignature: true,
        },
        {
          step: 2,
          title: 'Board Dashboard',
          description: 'Real-time financial performance and KPIs',
          metrics: [
            'revenue',
            'profitability',
            'cash_runway',
            'growth_rate',
            'team_health',
          ],
        },
        {
          step: 3,
          title: 'Reporting Preferences',
          description: 'Customize board reports and frequency',
          preferences: ['monthly', 'quarterly', 'as_needed'],
        },
        {
          step: 4,
          title: 'Alert Configuration',
          description: 'Be alerted on critical metrics',
          alerts: [
            'cash_runway_below_threshold',
            'revenue_miss',
            'churn_alert',
            'margin_decline',
          ],
        },
        {
          step: 5,
          title: 'Secure Access',
          description: 'Two-factor authentication required',
          actions: ['enable_2fa', 'setup_recovery_codes'],
          required: true,
        },
      ],
      estimatedTime: '8 minutes',
      skipOption: false,
      complianceLevel: 'high',
    };
  }

  private async onboardSupplier(user: {
    email: string;
  }): Promise<OnboardingFlow> {
    return {
      steps: [
        {
          step: 1,
          title: 'Supplier Agreement',
          description: 'Review data sharing and terms',
          actions: ['read_agreement', 'e_sign'],
          requiresSignature: true,
        },
        {
          step: 2,
          title: 'Business Verification',
          description: 'Quick verification of your business',
          actions: ['enter_tax_id', 'verify_registration'],
          automation: 'verify_automatically',
        },
        {
          step: 3,
          title: 'Inventory System Integration',
          description: 'Connect your inventory management system',
          integrations: [
            {type: 'shopify', label: 'Shopify'},
            {type: 'erp', label: 'ERP System'},
            {type: 'api', label: 'Custom API'},
          ],
          complexity: 'technical',
        },
        {
          step: 4,
          title: 'Data Sharing Permissions',
          description: 'Control what data brands can access',
          metrics: ['real_time_stock', 'demand_forecast', 'restock_schedule'],
        },
        {
          step: 5,
          title: 'Demand Insights',
          description: 'View brands advertising your products',
          actions: ['view_demand_dashboard'],
        },
      ],
      estimatedTime: '12 minutes',
      skipOption: false,
    };
  }
}

/**
 * Generates custom dashboards based on the user's role
 */
export class UnifiedDashboardEngine {
  constructor(private readonly db: SupabaseClient) {}

  async getDashboardDefinition(
    role: EcosystemRole,
    tenantId: string,
    associationId?: string,
  ): Promise<DashboardDefinition> {
    switch (role) {
      case EcosystemRole.AGENCY_OWNER:
        return this.getAgencyOwnerDashboard(tenantId);
      case EcosystemRole.CLIENT_EXECUTIVE:
        return this.getClientExecutiveDashboard(
          tenantId,
          associationId || 'default-client',
        );
      case EcosystemRole.PARTNER_VENDOR:
        return this.getPartnerVendorDashboard(
          tenantId,
          associationId || 'default-partner',
        );
      case EcosystemRole.INVESTOR:
        return this.getInvestorDashboard(tenantId);
      case EcosystemRole.INVENTORY_SUPPLIER:
        return this.getSupplierDashboard(
          tenantId,
          associationId || 'default-supplier',
        );
      default:
        throw new Error(`Dashboard not implemented for role: ${role}`);
    }
  }

  private async getAgencyOwnerDashboard(
    tenantId: string,
  ): Promise<DashboardDefinition> {
    const clients = await this.db.getClients(tenantId);
    const thriving = clients.filter((c) => c.healthScore > 75).length;
    const stable = clients.filter(
      (c) => c.healthScore >= 50 && c.healthScore <= 75,
    ).length;
    const atRisk = clients.filter((c) => c.healthScore < 50).length;

    return {
      id: 'agency_owner_v1',
      role: EcosystemRole.AGENCY_OWNER,
      title: 'Agency Command Center',
      sections: [
        {
          name: 'Financial Snapshot',
          cards: [
            {
              metric: 'Total Revenue',
              value: '$2.3M',
              trend: '+12% YoY',
              source: 'accounting_system',
            },
            {
              metric: 'Agency Margin',
              value: '38%',
              trend: '-2% vs month',
              alert: true,
              source: 'profitability_engine',
            },
            {
              metric: 'Cash Runway',
              value: '180 days',
              trend: 'Healthy',
              source: 'bank_sync',
            },
          ],
        },
        {
          name: 'Client Portfolio Health',
          cards: [
            {
              type: 'matrix',
              title: 'Clients by Health',
              segments: [
                {status: 'Thriving', count: thriving, mrr: '$850K'},
                {status: 'Stable', count: stable, mrr: '$420K'},
                {status: 'At Risk', count: atRisk, mrr: '$50K'},
              ],
            },
          ],
        },
        {
          name: 'Team & Capacity',
          cards: [
            {
              metric: 'Team Utilization',
              value: '89%',
              breakdown: ['billable: 70%', 'ops: 19%'],
              capacityForecast: 'At max 7 days',
            },
          ],
        },
      ],
    };
  }

  private async getClientExecutiveDashboard(
    tenantId: string,
    clientId: string,
  ): Promise<DashboardDefinition> {
    const briefs = await this.db.getCampaignBriefs(tenantId);
    const clientBriefs = briefs.filter((b) => b.clientId === clientId);
    const campaignItems = clientBriefs.map((b) => ({
      name: `Campaign ${b.briefId.substring(0, 5)}`,
      status: b.status === 'live' ? '🟢 Live' : '🟠 Draft',
      spend: `$${b.budget.toLocaleString()}`,
      roi: `${b.projectedRoi}x`,
      needsApproval: b.status === 'pending_approval',
    }));

    return {
      id: `client_exec_${clientId}`,
      role: EcosystemRole.CLIENT_EXECUTIVE,
      title: 'Your Campaign Performance Dashboard',
      sections: [
        {
          name: 'This Month Performance',
          cards: [
            {
              metric: 'Ad Spend',
              value: '$85K',
              comparison: 'vs budget: $100K (85%)',
              visualization: 'progress_bar',
            },
            {
              metric: 'Revenue Generated',
              value: '$340K',
              comparison: 'vs target: 4x (on track)',
              color: 'green',
            },
          ],
        },
        {
          name: 'Active Campaigns',
          cards: [{type: 'campaign_list', items: campaignItems}],
        },
      ],
    };
  }

  private async getPartnerVendorDashboard(
    tenantId: string,
    partnerId: string,
  ): Promise<DashboardDefinition> {
    const assets = await this.db.getCreativeAssets(tenantId);
    const partnerProjects = assets.map((a) => ({
      name: a.title,
      type: a.type,
      status: a.complianceOk ? '🟢 Completed' : '🟡 In Review',
      approved: a.complianceOk,
      amount: '$12,000',
    }));

    return {
      id: `partner_${partnerId}`,
      role: EcosystemRole.PARTNER_VENDOR,
      title: 'Your Project Dashboard',
      sections: [
        {
          name: 'Active Projects',
          cards: [{type: 'project_board', projects: partnerProjects}],
        },
        {
          name: 'Financial',
          cards: [
            {
              metric: 'Earned This Month',
              value: '$18,500',
              details: 'From completed projects',
            },
            {
              metric: 'Pending Invoice',
              value: '$12,000',
              details: 'Ready to bill',
            },
          ],
        },
      ],
    };
  }

  private async getInvestorDashboard(
    tenantId: string,
  ): Promise<DashboardDefinition> {
    const txns = await this.db.getFinancialTransactions(tenantId);
    const totalIncome = txns
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = txns
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);
    const profit = totalIncome - totalExpense;

    return {
      id: 'investor_dashboard',
      role: EcosystemRole.INVESTOR,
      title: 'Board Dashboard',
      sections: [
        {
          name: 'Financial Summary',
          cards: [
            {
              metric: 'Total Revenue',
              value: `$${totalIncome.toLocaleString()}`,
              period: 'YTD',
            },
            {metric: 'Net Profit', value: `$${profit.toLocaleString()}`},
            {
              metric: 'Cash Position',
              value: `$${(2100000).toLocaleString()}`,
              runway: '12 months',
              status: 'Healthy',
            },
          ],
        },
        {
          name: 'Risk Dashboard',
          cards: [
            {risk: 'Client Churn Risk', score: '8%', status: 'Low'},
            {risk: 'Team Burnout', score: '35%', status: 'Medium'},
          ],
        },
      ],
    };
  }

  private async getSupplierDashboard(
    tenantId: string,
    supplierId: string,
  ): Promise<DashboardDefinition> {
    const states = await this.db.getIntegrationStates(tenantId);
    const hasShopify = states.some(
      (s) => s.provider === 'shopify' && s.status === 'active',
    );

    return {
      id: `supplier_${supplierId}`,
      role: EcosystemRole.INVENTORY_SUPPLIER,
      title: 'Demand & Inventory Intelligence',
      sections: [
        {
          name: 'Real-Time Demand',
          cards: [
            {
              title: 'Products Being Advertised',
              products: [
                {
                  sku: 'PROD-001',
                  name: 'Premium Widget',
                  adSpend: '$85K this month',
                  stockLevel: 245,
                  daysOfStock: 8,
                },
              ],
            },
          ],
        },
        {
          name: 'System Status',
          cards: [
            {
              metric: 'Shopify Integration',
              value: hasShopify ? 'Connected' : 'Disconnected',
              status: hasShopify ? 'Healthy' : 'Action Required',
            },
          ],
        },
      ],
    };
  }
}

/**
 * Automates cross-ecosystem business execution
 */
export class EcosystemAutomationEngine {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Client Approval triggers notifications to Vendors/Partners & kickoff meetings
   */
  async automateApprovalWorkflow(campaign: CampaignBrief): Promise<void> {
    if (campaign.status !== 'approved') return;

    // 1. Notify Assigned Vendors
    const notification: ActivityFeedItem = {
      eventId: `evt-${Date.now()}-v`,
      orgId: campaign.clientId,
      actorId: 'system',
      actionType: 'vendor_assigned',
      entityType: 'campaign_brief',
      entityId: campaign.briefId,
      summary: `New campaign brief ${campaign.briefId} approved. Vendor task generated.`,
      isRead: false,
      tenantId: campaign.tenantId,
      createdAt: Date.now(),
    };
    await this.db.logActivity(notification);

    // 2. Schedule Kickoff Meeting (Mock action)
    const meetingNotification: ActivityFeedItem = {
      eventId: `evt-${Date.now()}-m`,
      orgId: campaign.clientId,
      actorId: 'system',
      actionType: 'kickoff_scheduled',
      entityType: 'campaign_brief',
      entityId: campaign.briefId,
      summary: `Google Meet kickoff scheduled for campaign ${campaign.briefId}`,
      isRead: false,
      tenantId: campaign.tenantId,
      createdAt: Date.now(),
    };
    await this.db.logActivity(meetingNotification);
  }

  /**
   * Performance deviations alert appropriate stakeholders (client vs executive)
   */
  async automatePerformanceNotifications(
    brief: CampaignBrief,
    metrics: {roi: number; targetRoi: number},
  ): Promise<void> {
    const deviation = (metrics.targetRoi - metrics.roi) / metrics.targetRoi;

    if (deviation > 0.3) {
      // Critical anomaly: alert agency executive and client executive
      const alert: ActivityFeedItem = {
        eventId: `evt-${Date.now()}-c`,
        orgId: brief.clientId,
        actorId: 'analytics_engine',
        actionType: 'critical_deviation',
        entityType: 'campaign_brief',
        entityId: brief.briefId,
        summary: `CRITICAL ROI DEVIATION: Campaign ${brief.briefId} ROI is ${metrics.roi}x (Target: ${metrics.targetRoi}x). Consider PAUSE.`,
        isRead: false,
        tenantId: brief.tenantId,
        createdAt: Date.now(),
      };
      await this.db.logActivity(alert);

      // Auto-pause if configuration says so
      // In this version, we will draft an approval for shift/pause
      const approval: ApprovalRequest = {
        approvalId: `app-${Date.now()}`,
        orgId: brief.clientId,
        entityType: 'campaign_pause',
        entityId: brief.briefId,
        requestedBy: 'analytics_engine',
        assignedTo: 'client_executive',
        status: 'pending',
        tenantId: brief.tenantId,
        createdAt: Date.now(),
      };
      await this.db.saveApproval(approval);
    } else if (deviation > 0.1) {
      // Mild anomaly: alert media buyer only
      const warning: ActivityFeedItem = {
        eventId: `evt-${Date.now()}-w`,
        orgId: brief.clientId,
        actorId: 'analytics_engine',
        actionType: 'performance_warning',
        entityType: 'campaign_brief',
        entityId: brief.briefId,
        summary: `Performance Warning: ROI is ${metrics.roi}x (Target: ${metrics.targetRoi}x).`,
        isRead: false,
        tenantId: brief.tenantId,
        createdAt: Date.now(),
      };
      await this.db.logActivity(warning);
    }
  }

  /**
   * Vendor deliverables completion generates invoice & schedules auto-payment
   */
  async automatePaymentWorkflow(
    tenantId: string,
    asset: CreativeAsset,
    amount: number,
    paymentMethod: string,
  ): Promise<void> {
    if (!asset.complianceOk) return;

    // Auto-generate invoice transaction
    const transactionId = `txn-${Date.now()}`;
    const invoiceTxn: FinancialTransaction = {
      transactionId,
      tenantId,
      amount,
      type: 'expense',
      category: 'vendor_payment',
      description: `Invoice auto-generated for creative asset ${asset.assetId}`,
      createdAt: Date.now(),
    };
    await this.db.saveFinancialTransaction(invoiceTxn);

    // Auto-approve if amount is under $5,000
    if (amount <= 5000) {
      const approval: ApprovalRequest = {
        approvalId: `app-${Date.now()}`,
        orgId: 'vendor-finance',
        entityType: 'vendor_invoice',
        entityId: transactionId,
        requestedBy: 'billing_engine',
        assignedTo: 'finance_manager',
        status: 'approved',
        reason: 'Auto-approved (below $5,000 threshold)',
        tenantId,
        createdAt: Date.now(),
        completedAt: Date.now(),
      };
      await this.db.saveApproval(approval);

      // Log scheduled payment
      const notification: ActivityFeedItem = {
        eventId: `evt-${Date.now()}`,
        orgId: 'vendor-finance',
        actorId: 'billing_engine',
        actionType: 'payment_scheduled',
        entityType: 'financial_transaction',
        entityId: transactionId,
        summary: `Payment of $${amount} via ${paymentMethod} scheduled for invoice ${transactionId}`,
        isRead: false,
        tenantId,
        createdAt: Date.now(),
      };
      await this.db.logActivity(notification);
    } else {
      // Create pending approval request
      const approval: ApprovalRequest = {
        approvalId: `app-${Date.now()}`,
        orgId: 'vendor-finance',
        entityType: 'vendor_invoice',
        entityId: transactionId,
        requestedBy: 'billing_engine',
        assignedTo: 'cfo',
        status: 'pending',
        tenantId,
        createdAt: Date.now(),
      };
      await this.db.saveApproval(approval);
    }
  }

  /**
   * Churn risk escalation triggers retention interventions
   */
  async automateChurnRiskIntervention(
    tenantId: string,
    client: ClientProfile,
  ): Promise<void> {
    if (client.churnRisk > 0.8) {
      // Immediate playbook: Pause lower performing campaigns, launch client review
      const actionItem: ActivityFeedItem = {
        eventId: `evt-${Date.now()}`,
        orgId: client.clientId,
        actorId: 'risk_radar',
        actionType: 'retention_playbook_triggered',
        entityType: 'client_profile',
        entityId: client.clientId,
        summary: `CRITICAL CHURN RISK (${(client.churnRisk * 100).toFixed(0)}%): Executing retention playbook. CMO check-in scheduled.`,
        isRead: false,
        tenantId,
        createdAt: Date.now(),
      };
      await this.db.logActivity(actionItem);

      // Create high-priority approval to assign task force
      const approval: ApprovalRequest = {
        approvalId: `app-${Date.now()}`,
        orgId: client.orgId,
        entityType: 'retention_squad',
        entityId: client.clientId,
        requestedBy: 'risk_radar',
        assignedTo: 'cmo',
        status: 'pending',
        tenantId,
        createdAt: Date.now(),
      };
      await this.db.saveApproval(approval);
    } else if (client.churnRisk > 0.6) {
      // Moderate churn risk: alert Account Manager to review health
      const warning: ActivityFeedItem = {
        eventId: `evt-${Date.now()}`,
        orgId: client.clientId,
        actorId: 'risk_radar',
        actionType: 'churn_warning',
        entityType: 'client_profile',
        entityId: client.clientId,
        summary: `Elevated Churn Risk (${(client.churnRisk * 100).toFixed(0)}%). Account Manager check-in recommended.`,
        isRead: false,
        tenantId,
        createdAt: Date.now(),
      };
      await this.db.logActivity(warning);
    }
  }

  /**
   * Supplier stock monitoring auto-pauses campaigns if supply-chain is in danger
   */
  async automateSupplierOptimization(
    tenantId: string,
    campaignId: string,
    sku: string,
    daysOfStock: number,
    autoPauseEnabled = true,
  ): Promise<void> {
    if (daysOfStock < 3) {
      // Alert supplier and brand campaign team immediately
      const alert: ActivityFeedItem = {
        eventId: `evt-${Date.now()}`,
        orgId: 'supplier-operations',
        actorId: 'inventory_monitor',
        actionType: 'critical_stockout_risk',
        entityType: 'campaign',
        entityId: campaignId,
        summary: `CRITICAL: SKU ${sku} has less than ${daysOfStock} days of stock remaining.`,
        isRead: false,
        tenantId,
        createdAt: Date.now(),
      };
      await this.db.logActivity(alert);

      if (autoPauseEnabled) {
        // Pauses/drafts pause approval for the campaign to avoid wasted ad spend
        const pauseRequest: ApprovalRequest = {
          approvalId: `app-${Date.now()}`,
          orgId: 'campaign-operations',
          entityType: 'campaign_pause',
          entityId: campaignId,
          requestedBy: 'inventory_monitor',
          assignedTo: 'account_manager',
          status: 'pending',
          reason: `Auto-pause suggested: low stock protection for SKU ${sku}`,
          tenantId,
          createdAt: Date.now(),
        };
        await this.db.saveApproval(pauseRequest);
      }
    } else if (daysOfStock < 7) {
      // Soft alert for restock
      const restockAlert: ActivityFeedItem = {
        eventId: `evt-${Date.now()}`,
        orgId: 'supplier-operations',
        actorId: 'inventory_monitor',
        actionType: 'restock_warning',
        entityType: 'inventory',
        entityId: sku,
        summary: `SKU ${sku} stock level is low (${daysOfStock} days left). Restock recommended.`,
        isRead: false,
        tenantId,
        createdAt: Date.now(),
      };
      await this.db.logActivity(restockAlert);
    }
  }
}

/**
 * Enforces strict multi-tenant and role-based data isolation
 */
export class EcosystemDataIsolation {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Verifies access of an active role to data scope details
   */
  async verifyAccess(
    role: EcosystemRole,
    action: 'read' | 'write' | 'approve',
    entityType:
      | 'campaign'
      | 'financials'
      | 'client_profile'
      | 'creative_asset'
      | 'supplier_data',
    userContext: {
      tenantId: string;
      clientId?: string;
      partnerId?: string;
      supplierSkus?: string[];
    },
    entity: {
      tenantId: string;
      clientId?: string;
      partnerId?: string;
      sku?: string;
    },
  ): Promise<boolean> {
    // 1. Tenant Isolation
    if (userContext.tenantId !== entity.tenantId) {
      return false;
    }

    // 2. Role matrix logic
    switch (role) {
      case EcosystemRole.AGENCY_OWNER:
      case EcosystemRole.AGENCY_EXECUTIVE:
        return true; // Agency owner can access everything within their tenant

      case EcosystemRole.MEDIA_BUYER:
      case EcosystemRole.ACCOUNT_MANAGER:
        // Buyers and managers can view campaigns and assets but not core agency financials
        if (entityType === 'financials') {
          return false;
        }
        return true;

      case EcosystemRole.CLIENT_EXECUTIVE:
      case EcosystemRole.CLIENT_MANAGER:
      case EcosystemRole.CLIENT_FINANCE:
      case EcosystemRole.CLIENT_STAKEHOLDER:
        // Client stakeholders can ONLY access their own client organization data
        if (!userContext.clientId || userContext.clientId !== entity.clientId) {
          return false;
        }
        if (role === EcosystemRole.CLIENT_STAKEHOLDER && action !== 'read') {
          return false; // Read-only role
        }
        if (
          role === EcosystemRole.CLIENT_FINANCE &&
          entityType !== 'financials' &&
          entityType !== 'campaign'
        ) {
          return false; // Finance can only access campaigns/financials
        }
        return true;

      case EcosystemRole.PARTNER_VENDOR:
        // Partner/Vendor can ONLY see assigned assets or partner profiles
        if (entityType === 'creative_asset') {
          return entity.partnerId === userContext.partnerId;
        }
        if (entityType === 'financials') {
          return action === 'write'; // Can write invoices but not read general financials
        }
        return false;

      case EcosystemRole.INVESTOR:
        // Investors can read financial snapshots (aggregates) but not campaign granular assets
        if (entityType === 'creative_asset') {
          return false;
        }
        return action === 'read';

      case EcosystemRole.INVENTORY_SUPPLIER:
        // Suppliers can ONLY view inventory supply chain for their allowed SKUs
        if (entityType === 'supplier_data') {
          if (!userContext.supplierSkus || !entity.sku) return false;
          return userContext.supplierSkus.includes(entity.sku);
        }
        return false;

      default:
        return false;
    }
  }
}
