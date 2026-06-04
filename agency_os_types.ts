/**
 * @fileoverview Type definitions and interfaces for the Agency OS collaborative layers.
 */

export interface TeamMember {
  memberId: string;
  orgId: string;
  userId: string;
  roleName: 'media_buyer' | 'account_mgr' | 'cmo' | 'cfo' | 'admin';
  permissions: string[];
  capacityPct: number; // utilization metric (0-100)
  tenantId: string;
}

export interface ClientProfile {
  clientId: string;
  orgId: string;
  name: string;
  industry?: string;
  mrr: number; // Agency MRR from this client
  marginTarget: number; // target profit margin (e.g. 0.40)
  healthScore: number; // calculated health score (0-100)
  churnRisk: number; // probability (0.0 to 1.0)
  tenantId: string;
}

export interface CampaignBrief {
  briefId: string;
  campaignId?: string;
  clientId: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'live';
  projectedRoi: number;
  budget: number;
  createdBy: string; // memberId
  approvedBy?: string; // memberId
  tenantId: string;
  createdAt: number;
  approvedAt?: number;
}

export interface ApprovalRequest {
  approvalId: string;
  orgId: string;
  entityType: string; // 'campaign' | 'budget_shift' | 'whatsapp_broadcast'
  entityId: string;
  requestedBy: string; // memberId or client_id or agent
  assignedTo: string; // role name (e.g. 'cmo') or memberId
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  tenantId: string;
  createdAt: number;
  completedAt?: number;
  actionRequest?: any; // Serialized ActionRequest to resume execution
  context?: any; // Serialized Context
}

export interface ActivityFeedItem {
  eventId: string;
  orgId: string;
  userId?: string; // target user (null for broadcast)
  actorId: string;
  actionType: string; // e.g. 'brief_created', 'alert_triggered'
  entityType: string;
  entityId: string;
  summary: string;
  isRead: boolean;
  tenantId: string;
  createdAt: number;
}

export interface ClientPortalToken {
  portalId: string;
  clientId: string;
  accessToken: string;
  expiresAt: number;
  permissions: string[]; // e.g. ["view_performance", "approve_briefs"]
  tenantId: string;
  createdAt: number;
}

export interface BrandSignal {
  signalId: string;
  tenantId: string;
  source:
    | 'social'
    | 'pr'
    | 'sentiment'
    | 'ads'
    | 'content'
    | 'inventory'
    | 'team'
    | 'client';
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  payload: Record<string, any>;
  timestamp: number;
}

export interface IntegrationState {
  integrationId: string;
  tenantId: string;
  provider:
    | 'gmail'
    | 'brandwatch'
    | 'asana'
    | 'hubspot'
    | 'quickbooks'
    | 'figma'
    | 'google_ads'
    | 'meta_ads'
    | 'meta_ads_api'
    | 'slack'
    | 'shopify';
  status: 'active' | 'suspended' | 'expired';
  settings: Record<string, any>;
  updatedAt: number;
}

export interface SocialMention {
  mentionId: string;
  tenantId: string;
  platform: 'twitter' | 'reddit' | 'blogs' | 'news';
  content: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  reach: number;
  influencer: boolean;
  url: string;
  createdAt: number;
}

export interface CompetitorSignal {
  competitorId: string;
  tenantId: string;
  competitorName: string;
  signalType: 'ad_launch' | 'price_change' | 'new_product';
  details: Record<string, any>;
  createdAt: number;
}

export interface FinancialTransaction {
  transactionId: string;
  tenantId: string;
  accountId?: string;
  amount: number;
  type: 'expense' | 'income';
  category: string;
  description: string;
  createdAt: number;
}

export interface CreativeAsset {
  assetId: string;
  tenantId: string;
  type: 'design' | 'video' | 'copy';
  title: string;
  location: string;
  campaign: string;
  complianceOk: boolean;
  createdAt: number;
}

export enum EcosystemRole {
  // TIER 1: PRIMARY OPERATORS
  AGENCY_OWNER = 'agency_owner',
  AGENCY_EXECUTIVE = 'agency_executive',

  // TIER 2: TEAM OPERATORS
  MEDIA_BUYER = 'media_buyer',
  ACCOUNT_MANAGER = 'account_manager',
  CREATIVE_DIRECTOR = 'creative_director',
  ANALYST = 'analyst',

  // TIER 3: CLIENT STAKEHOLDERS
  CLIENT_EXECUTIVE = 'client_executive',
  CLIENT_MANAGER = 'client_manager',
  CLIENT_FINANCE = 'client_finance',
  CLIENT_STAKEHOLDER = 'client_stakeholder',

  // TIER 4: PARTNER ECOSYSTEM
  PARTNER_VENDOR = 'partner_vendor',
  PARTNER_AGENCY = 'partner_agency',

  // TIER 5: FINANCIAL STAKEHOLDERS
  INVESTOR = 'investor',
  LENDER = 'lender',
  AUDITOR = 'auditor',

  // TIER 6: SUPPLIER ECOSYSTEM
  ADVERTISING_PARTNER = 'advertising_partner',
  INVENTORY_SUPPLIER = 'inventory_supplier',
  CONTRACTOR = 'contractor',

  // TIER 7: ADMIN ROLES
  PLATFORM_ADMIN = 'platform_admin',
  TENANT_ADMIN = 'tenant_admin',
}

export interface DataScope {
  canView: {
    campaigns:
      | boolean
      | 'own'
      | 'team'
      | 'all'
      | 'own_campaigns'
      | 'readonly'
      | 'assigned_projects'
      | 'campaigns_on_my_platform';
    clients: boolean | 'assigned' | 'all' | 'own_client' | 'assigned_projects';
    financials:
      | 'none'
      | 'own_projects'
      | 'client_level'
      | 'agency_level'
      | 'campaign_level'
      | 'readonly'
      | 'invoice_only'
      | 'all_transactions';
    team: 'own_profile' | 'own_team' | 'all' | 'headcount_only';
    brandMetrics?: boolean;
    sentiment?: boolean;
    inventory?: boolean;
    vendors?: 'all' | 'none';
    investors?: 'all' | 'none';
    metrics?: boolean;
    roi?: boolean;
    forecast?: boolean;
    approvals?: 'all_audit_trail' | 'none';
    data?: 'all' | 'none';
  };
  canEdit?: string[];
  canApprove?: ApprovalLevel[];
  canDelete?: boolean;
  dataRetention?: 'standard' | 'extended' | 'minimal';
}

export interface ApprovalLevel {
  type:
    | 'campaign'
    | 'budget'
    | 'creative'
    | 'vendor_contract'
    | 'team_hire'
    | 'invoice'
    | 'campaign_optimization';
  maxValue: number; // Dollar threshold
}

export interface RolePermissions {
  dashboards: string[];
  canView: DataScope['canView'];
  canApprove: ApprovalLevel[];
  canEdit?: string[];
  integrationsCanAdd?: string[];
  readOnlyAccess?: 'high' | 'medium' | 'low';
  dataAccess?: 'aggregate_only' | 'full';
  dataRetention?: 'standard' | 'extended' | 'minimal';
}

export interface StakeholderAssociation {
  associationId: string;
  tenantId: string;
  type:
    | 'vendor'
    | 'partner'
    | 'investor'
    | 'advertiser'
    | 'stakeholder'
    | 'supplier';
  companyName: string;
  contactEmail: string;
  status: 'pending_onboarding' | 'active' | 'suspended';
  role: EcosystemRole;
  allowedActions: string[];
  portalSettings: {
    theme?: string;
    visibleWidgets: string[];
    enableAutoNotifications: boolean;
  };
  createdAt: number;
}

export interface PlatformAccount {
  accountId: string;
  tenantId: string;
  platform: 'google_ads' | 'google_merchant' | 'meta' | 'shopify' | 'woocommerce' | 'magento' | 'custom_storefront';
  platformAccountId: string;
  accountName: string;
  accountType: 'manager' | 'sub_account' | 'merchant_center' | 'storefront';
  parentAccountId?: string;
  currency?: string;
  timezone?: string;
  status: 'active' | 'suspended' | 'removed';
  ingestedAt: string;
}

export interface AccountLink {
  linkId: string;
  tenantId: string;
  accountIdA: string;
  accountIdB: string;
  linkType: 'ads_to_merchant' | 'ads_to_storefront' | 'merchant_to_storefront';
  confidence: number;
  confirmedBy: 'auto' | string;
  createdAt: string;
}

export interface AccountCredential {
  credentialId: string;
  accountId: string;
  tenantId: string;
  accessToken: string; // encrypted
  refreshToken: string; // encrypted
  expiresAt: string;
  scopes: string[];
  rotatedAt?: string;
}

export interface ProductAdLink {
  tenantId: string;
  variantId: string;
  gmcOfferId: string;
  gmcAccountId: string;
  adsAccountId: string;
  adsCampaignId: string;
  adsAdGroupId: string;
  confidence: number;
  resolvedAt: string;
}

