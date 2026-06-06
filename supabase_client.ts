import {
  ActivityFeedItem,
  ApprovalRequest,
  BrandSignal,
  CampaignBrief,
  ClientPortalToken,
  ClientProfile,
  CompetitorSignal,
  CreativeAsset,
  FinancialTransaction,
  IntegrationState,
  SocialMention,
  StakeholderAssociation,
  TeamMember,
  PlatformAccount,
  AccountLink,
  AccountCredential,
  ProductAdLink,
} from './agency_os_types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {BaseError} from './errors';
import {PinoLogger} from './observability';
import {BaselineContext, CategoryBenchmarks} from './healing_types';
import {config} from './config';

export interface PlatformAccountEntry {
  account_id: string;
  tenant_id: string;
  platform: string;
  platform_account_id: string;
  account_name: string | null;
  account_type: string;
  parent_account_id?: string | null;
  currency?: string | null;
  timezone?: string | null;
  status: string;
  ingested_at: string;
}

export interface AccountLinkEntry {
  link_id: string;
  tenant_id: string;
  account_id_a: string;
  account_id_b: string;
  link_type: string;
  confidence: number;
  confirmed_by: string;
  created_at: string;
}

export interface AccountCredentialEntry {
  credential_id: string;
  account_id: string;
  tenant_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  rotated_at: string | null;
}

export interface ProductAdLinkEntry {
  tenant_id: string;
  variant_id: string;
  gmc_offer_id: string;
  gmc_account_id: string;
  ads_account_id: string;
  ads_campaign_id: string;
  ads_ad_group_id: string;
  confidence: number;
  resolved_at: string;
}

export interface TrustEntry {
  tenant: string;
  op: string;
  tier: number;
  updated_at: string;
}

export interface AuditLogEntry {
  id?: string;
  tenant: string;
  timestamp: string;
  action_id: string;
  op: string;
  entity: string;
  target_id: string;
  cost: number;
  decision: string;
  reason: string;
}

export interface LockEntry {
  campaign_id: string;
  locked_by: string;
  expires_at: string;
}

export interface OrderEntry {
  order_id: string;
  customer_id: string | null;
  account_id: string | null;
  channel: string;
  surface: string;
  placed_at: string;
  currency: string;
  gross_revenue: number;
  total_discounts: number;
  total_tax: number;
  shipping_charged: number;
  status: string;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  ingested_at: string;
}

export interface OrderLineEntry {
  order_line_id: string;
  order_id: string;
  variant_id: string | null;
  sku: string | null;
  qty: number;
  unit_price: number;
  line_discount: number;
  unit_cost: number;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  ingested_at: string;
}

export interface CampaignEntry {
  campaign_id: string;
  platform: string;
  name: string;
  objective: string;
  status: string;
  surface: string;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  ingested_at: string;
  daily_budget?: number;
}

export interface SpendFactEntry {
  campaign_id: string;
  platform: string;
  day: string;
  amount: number;
  currency: string;
  tenant_id: string;
  source_system: string;
  ingested_at: string;
}

export interface CustomerEntry {
  customer_id: string;
  account_id: string | null;
  type: string;
  first_seen: string;
  consent_status: string | null;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  ingested_at: string;
}

export interface IdentityLinkEntry {
  customer_id: string;
  identifier_type: string;
  identifier_hash: string;
  confidence: number;
  tenant_id: string;
  source_system: string;
  ingested_at: string;
}

export interface RefundEntry {
  refund_id: string;
  order_line_id: string;
  amount: number;
  refunded_at: string;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  ingested_at: string;
}

export interface UserEntry {
  user_id: string;
  email: string;
  pw_hash: string;
  status: 'pending_verification' | 'active' | 'disabled';
  deleted_at?: string;
  created_at: string;
}

export interface RefreshTokenEntry {
  token_hash: string;
  user_id: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

export interface OrgEntry {
  org_id: string;
  name: string;
  owner_user: string;
  plan: string;
  deleted_at?: string;
  created_at: string;
}

export interface LegalAcceptanceEntry {
  acceptance_id: string;
  user_id: string;
  doc_version: string;
  ip_address: string | null;
  accepted_at: string;
}

export interface OrgMemberEntry {
  org_id: string;
  user_id: string;
  role: string;
}

export interface FulfillmentCostEntry {
  order_id: string;
  shipping_cost: number;
  marketplace_fee: number;
  carrier: string | null;
  tenant_id: string;
  source_system: string;
  source_id: string;
  source_version: string;
  ingested_at: string;
}

export interface TouchpointEntry {
  touchpoint_id: string;
  customer_id: string | null;
  campaign_id: string | null;
  order_id: string | null;
  occurred_at: string;
  type: string; // 'impression' | 'click'
  tenant_id: string;
  source_system: string;
  ingested_at: string;
}

export interface CredentialEntry {
  tenant_id: string;
  platform: string;
  credential_key: string;
  encrypted_value: string;
  refresh_token: string | null;
  expires_at: string | null;
  updated_at: string;
}

export interface GovernanceEventEntry {
  id?: string;
  action_id: string;
  tenant_id: string;
  actor: string;
  action_type: string;
  target_entity: string;
  status: string;
  reason: string;
  created_at: string;
}

export interface VariantEntry {
  variant_id: string;
  tenant_id: string;
  sku: string;
  price: number;
  cost: number | null;
  title: string;
  ingested_at: string;
  provenance?: string | null;
}

export interface RecommendationEventEntry {
  event_id: string;
  recommendation_id: string;
  tenant_id: string;
  action: 'shown' | 'approved' | 'executed' | 'dismissed' | 'reversed';
  reason: string | null;
  created_at: string;
}

export interface InviteAllowlistEntry {
  allowed_pattern: string;
  added_at: string;
}

export interface PendingJobEntry {
  job_id: string;
  tenant_id: string;
  type: 'poas_daily' | 'settling_window' | 'hard_delete_account';
  action_id: string | null;
  run_at: string;
  payload: any | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  locked_by?: string | null;
  expires_at?: string | null;
}

export interface OnboardingEventEntry {
  event_id: string;
  tenant_id: string;
  stage: string;
  event_name: string;
  timestamp: string;
  duration_ms: number | null;
  data: any | null;
}

/**
 * Represents a record of an applied database schema migration version.
 */
export interface SchemaMigrationEntry {
  version: number;
  name: string;
  applied_at: string;
  checksum: string;
}

export interface ErrorEventEntry {
  event_id: string;
  tenant_id: string | null;
  severity: 'error' | 'warning' | 'critical';
  source: string;
  message: string;
  context: any | null;
  trace_id: string | null;
  created_at: string;
}
export interface SubscriptionEntry {
  org_id: string;
  status: 'trial' | 'suggest_amount' | 'pending_review' | 'active' | 'past_due' | 'suspended';
  amount: number | null;
  currency: string;
  period: string; // 'month'
  trial_day: number;
  trial_length_days: number;
  next_charge_at: string | null;
  note: string | null;
  updated_at: string;
}

interface MockDbContainer {
  mockTrust: TrustEntry[];
  mockErrorEvents: ErrorEventEntry[];
  mockAuditLogs: AuditLogEntry[];
  mockLocks: LockEntry[];
  mockCredentials: CredentialEntry[];
  mockGovernanceEvents: GovernanceEventEntry[];
  mockOrders: OrderEntry[];
  mockOrderLines: OrderLineEntry[];
  mockCampaigns: CampaignEntry[];
  mockSpendFacts: SpendFactEntry[];
  mockCustomers: CustomerEntry[];
  mockIdentityLinks: IdentityLinkEntry[];
  mockRefunds: RefundEntry[];
  mockFulfillmentCosts: FulfillmentCostEntry[];
  mockTouchpoints: TouchpointEntry[];
  mockTeamMembers: TeamMember[];
  mockClients: ClientProfile[];
  mockCampaignBriefs: CampaignBrief[];
  mockApprovals: ApprovalRequest[];
  mockActivityFeed: ActivityFeedItem[];
  mockClientPortals: ClientPortalToken[];
  mockBrandSignals: BrandSignal[];
  mockIntegrationStates: IntegrationState[];
  mockSocialMentions: SocialMention[];
  mockCompetitorSignals: CompetitorSignal[];
  mockFinancialTransactions: FinancialTransaction[];
  mockCreativeAssets: CreativeAsset[];
  mockStakeholderAssociations: StakeholderAssociation[];
  mockBaselineContexts: Array<{tenant_id: string; context: BaselineContext}>;
  mockCategoryBenchmarks: Array<{tenant_id: string; benchmarks: CategoryBenchmarks}>;
  mockPlatformAccounts: PlatformAccountEntry[];
  mockAccountLinks: AccountLinkEntry[];
  mockAccountCredentials: AccountCredentialEntry[];
  mockProductAdLinks: ProductAdLinkEntry[];
  mockVariants: VariantEntry[];
  mockPendingJobs: PendingJobEntry[];
  mockOnboardingEvents: OnboardingEventEntry[];
  mockRecommendationEvents: RecommendationEventEntry[];
  mockInviteAllowlist: InviteAllowlistEntry[];
  mockUsers: UserEntry[];
  mockRefreshTokens: RefreshTokenEntry[];
  mockOrgs: OrgEntry[];
  mockOrgMembers: OrgMemberEntry[];
  mockLegalAcceptances: LegalAcceptanceEntry[];
  mockSchemaMigrations: SchemaMigrationEntry[];
  mockRollbacks: Record<string, any>;
  mockSubscriptions: SubscriptionEntry[];
}

class GlobalMockDb {
  static mockTrust: TrustEntry[] = [];
  static mockAuditLogs: AuditLogEntry[] = [];
  static mockLocks: LockEntry[] = [];
  static mockCredentials: CredentialEntry[] = [];
  static mockGovernanceEvents: GovernanceEventEntry[] = [];
  static mockOrders: OrderEntry[] = [];
  static mockOrderLines: OrderLineEntry[] = [];
  static mockCampaigns: CampaignEntry[] = [];
  static mockSpendFacts: SpendFactEntry[] = [];
  static mockCustomers: CustomerEntry[] = [];
  static mockIdentityLinks: IdentityLinkEntry[] = [];
  static mockRefunds: RefundEntry[] = [];
  static mockFulfillmentCosts: FulfillmentCostEntry[] = [];
  static mockTouchpoints: TouchpointEntry[] = [];
  static mockTeamMembers: TeamMember[] = [];
  static mockClients: ClientProfile[] = [];
  static mockCampaignBriefs: CampaignBrief[] = [];
  static mockApprovals: ApprovalRequest[] = [];
  static mockActivityFeed: ActivityFeedItem[] = [];
  static mockClientPortals: ClientPortalToken[] = [];
  static mockBrandSignals: BrandSignal[] = [];
  static mockIntegrationStates: IntegrationState[] = [];
  static mockSocialMentions: SocialMention[] = [];
  static mockCompetitorSignals: CompetitorSignal[] = [];
  static mockFinancialTransactions: FinancialTransaction[] = [];
  static mockCreativeAssets: CreativeAsset[] = [];
  static mockStakeholderAssociations: StakeholderAssociation[] = [];
  static mockBaselineContexts: Array<{tenant_id: string; context: BaselineContext}> = [];
  static mockCategoryBenchmarks: Array<{tenant_id: string; benchmarks: CategoryBenchmarks}> = [];
  static mockPlatformAccounts: PlatformAccountEntry[] = [];
  static mockAccountLinks: AccountLinkEntry[] = [];
  static mockAccountCredentials: AccountCredentialEntry[] = [];
  static mockProductAdLinks: ProductAdLinkEntry[] = [];
  static mockVariants: VariantEntry[] = [];
  static mockPendingJobs: PendingJobEntry[] = [];
  static mockOnboardingEvents: OnboardingEventEntry[] = [];
  static mockRecommendationEvents: RecommendationEventEntry[] = [];
  static mockInviteAllowlist: InviteAllowlistEntry[] = [];
  static mockUsers: UserEntry[] = [];
  static mockRefreshTokens: RefreshTokenEntry[] = [];
  static mockOrgs: OrgEntry[] = [];
  static mockOrgMembers: OrgMemberEntry[] = [];
  static mockLegalAcceptances: LegalAcceptanceEntry[] = [];
  static mockSchemaMigrations: SchemaMigrationEntry[] = [];
  static mockErrorEvents: ErrorEventEntry[] = [];
  static mockRollbacks: Record<string, any> = {};
  static mockSubscriptions: SubscriptionEntry[] = [];
}

/**
 * Supabase client orchestrator.
 */
export class SupabaseClient {
  static useSharedMockDb = false;

  private localMockDb: MockDbContainer = {
    mockTrust: [],
    mockErrorEvents: [],
    mockAuditLogs: [],
    mockLocks: [],
    mockCredentials: [],
    mockGovernanceEvents: [],
    mockOrders: [],
    mockOrderLines: [],
    mockCampaigns: [],
    mockSpendFacts: [],
    mockCustomers: [],
    mockIdentityLinks: [],
    mockRefunds: [],
    mockFulfillmentCosts: [],
    mockTouchpoints: [],
    mockTeamMembers: [],
    mockClients: [],
    mockCampaignBriefs: [],
    mockApprovals: [],
    mockActivityFeed: [],
    mockClientPortals: [],
    mockBrandSignals: [],
    mockIntegrationStates: [],
    mockSocialMentions: [],
    mockCompetitorSignals: [],
    mockFinancialTransactions: [],
    mockCreativeAssets: [],
    mockStakeholderAssociations: [],
    mockBaselineContexts: [],
    mockCategoryBenchmarks: [],
    mockPlatformAccounts: [],
    mockAccountLinks: [],
    mockAccountCredentials: [],
    mockProductAdLinks: [],
    mockVariants: [],
    mockPendingJobs: [],
    mockOnboardingEvents: [],
    mockRecommendationEvents: [],
    mockInviteAllowlist: [],
    mockUsers: [],
    mockRefreshTokens: [],
    mockOrgs: [],
    mockOrgMembers: [],
    mockLegalAcceptances: [],
    mockSchemaMigrations: [],
    mockRollbacks: {},
    mockSubscriptions: [],
  };

  static resetGlobalMockDb() {
    GlobalMockDb.mockTrust = [];
    GlobalMockDb.mockAuditLogs = [];
    GlobalMockDb.mockLocks = [];
    GlobalMockDb.mockCredentials = [];
    GlobalMockDb.mockGovernanceEvents = [];
    GlobalMockDb.mockOrders = [];
    GlobalMockDb.mockOrderLines = [];
    GlobalMockDb.mockCampaigns = [];
    GlobalMockDb.mockSpendFacts = [];
    GlobalMockDb.mockCustomers = [];
    GlobalMockDb.mockIdentityLinks = [];
    GlobalMockDb.mockRefunds = [];
    GlobalMockDb.mockFulfillmentCosts = [];
    GlobalMockDb.mockSubscriptions = [];
    GlobalMockDb.mockTouchpoints = [];
    GlobalMockDb.mockTeamMembers = [];
    GlobalMockDb.mockClients = [];
    GlobalMockDb.mockCampaignBriefs = [];
    GlobalMockDb.mockApprovals = [];
    GlobalMockDb.mockActivityFeed = [];
    GlobalMockDb.mockClientPortals = [];
    GlobalMockDb.mockBrandSignals = [];
    GlobalMockDb.mockIntegrationStates = [];
    GlobalMockDb.mockSocialMentions = [];
    GlobalMockDb.mockCompetitorSignals = [];
    GlobalMockDb.mockFinancialTransactions = [];
    GlobalMockDb.mockCreativeAssets = [];
    GlobalMockDb.mockStakeholderAssociations = [];
    GlobalMockDb.mockBaselineContexts = [];
    GlobalMockDb.mockCategoryBenchmarks = [];
    GlobalMockDb.mockPlatformAccounts = [];
    GlobalMockDb.mockAccountLinks = [];
    GlobalMockDb.mockAccountCredentials = [];
    GlobalMockDb.mockProductAdLinks = [];
    GlobalMockDb.mockVariants = [];
    GlobalMockDb.mockPendingJobs = [];
    GlobalMockDb.mockOnboardingEvents = [];
    GlobalMockDb.mockRecommendationEvents = [];
    GlobalMockDb.mockInviteAllowlist = [];
    GlobalMockDb.mockUsers = [];
    GlobalMockDb.mockRefreshTokens = [];
    GlobalMockDb.mockOrgs = [];
    GlobalMockDb.mockOrgMembers = [];
    GlobalMockDb.mockLegalAcceptances = [];
    GlobalMockDb.mockSchemaMigrations = [];
    GlobalMockDb.mockErrorEvents = [];
    GlobalMockDb.mockRollbacks = {};
  }
  
  resetLocalMockDb() {
    this.localMockDb = {
      mockTrust: [],
      mockErrorEvents: [],
      mockAuditLogs: [],
      mockLocks: [],
      mockCredentials: [],
      mockGovernanceEvents: [],
      mockOrders: [],
      mockOrderLines: [],
      mockCampaigns: [],
      mockSpendFacts: [],
      mockCustomers: [],
      mockIdentityLinks: [],
      mockRefunds: [],
      mockFulfillmentCosts: [],
      mockTouchpoints: [],
      mockTeamMembers: [],
      mockClients: [],
      mockCampaignBriefs: [],
      mockApprovals: [],
      mockActivityFeed: [],
      mockClientPortals: [],
      mockBrandSignals: [],
      mockIntegrationStates: [],
      mockSocialMentions: [],
      mockCompetitorSignals: [],
      mockFinancialTransactions: [],
      mockCreativeAssets: [],
      mockStakeholderAssociations: [],
      mockBaselineContexts: [],
      mockCategoryBenchmarks: [],
      mockPlatformAccounts: [],
      mockAccountLinks: [],
      mockAccountCredentials: [],
      mockProductAdLinks: [],
      mockVariants: [],
      mockPendingJobs: [],
      mockOnboardingEvents: [],
      mockRecommendationEvents: [],
      mockInviteAllowlist: [],
      mockUsers: [],
      mockRefreshTokens: [],
      mockOrgs: [],
      mockOrgMembers: [],
      mockLegalAcceptances: [],
      mockSchemaMigrations: [],
      mockRollbacks: {},
      mockSubscriptions: [],
    };
  }

  private get mockTrust(): TrustEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockTrust : this.localMockDb.mockTrust; }
  private set mockTrust(v: TrustEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockTrust = v; else this.localMockDb.mockTrust = v; }

  private get mockAuditLogs(): AuditLogEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockAuditLogs : this.localMockDb.mockAuditLogs; }
  private set mockAuditLogs(v: AuditLogEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockAuditLogs = v; else this.localMockDb.mockAuditLogs = v; }

  private get mockLocks(): LockEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockLocks : this.localMockDb.mockLocks; }
  private set mockLocks(v: LockEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockLocks = v; else this.localMockDb.mockLocks = v; }

  private get mockCredentials(): CredentialEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockCredentials : this.localMockDb.mockCredentials; }
  private set mockCredentials(v: CredentialEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockCredentials = v; else this.localMockDb.mockCredentials = v; }

  private get mockGovernanceEvents(): GovernanceEventEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockGovernanceEvents : this.localMockDb.mockGovernanceEvents; }
  private set mockGovernanceEvents(v: GovernanceEventEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockGovernanceEvents = v; else this.localMockDb.mockGovernanceEvents = v; }

  private get mockOrders(): OrderEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockOrders : this.localMockDb.mockOrders; }
  private set mockOrders(v: OrderEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockOrders = v; else this.localMockDb.mockOrders = v; }

  private get mockOrderLines(): OrderLineEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockOrderLines : this.localMockDb.mockOrderLines; }
  private set mockOrderLines(v: OrderLineEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockOrderLines = v; else this.localMockDb.mockOrderLines = v; }

  private get mockCampaigns(): CampaignEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockCampaigns : this.localMockDb.mockCampaigns; }
  private set mockCampaigns(v: CampaignEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockCampaigns = v; else this.localMockDb.mockCampaigns = v; }

  private get mockSpendFacts(): SpendFactEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockSpendFacts : this.localMockDb.mockSpendFacts; }
  private set mockSpendFacts(v: SpendFactEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockSpendFacts = v; else this.localMockDb.mockSpendFacts = v; }

  private get mockCustomers(): CustomerEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockCustomers : this.localMockDb.mockCustomers; }
  private set mockCustomers(v: CustomerEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockCustomers = v; else this.localMockDb.mockCustomers = v; }

  private get mockIdentityLinks(): IdentityLinkEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockIdentityLinks : this.localMockDb.mockIdentityLinks; }
  private set mockIdentityLinks(v: IdentityLinkEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockIdentityLinks = v; else this.localMockDb.mockIdentityLinks = v; }

  private get mockRefunds(): RefundEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockRefunds : this.localMockDb.mockRefunds; }
  private set mockRefunds(v: RefundEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockRefunds = v; else this.localMockDb.mockRefunds = v; }

  private get mockFulfillmentCosts(): FulfillmentCostEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockFulfillmentCosts : this.localMockDb.mockFulfillmentCosts; }
  private set mockFulfillmentCosts(v: FulfillmentCostEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockFulfillmentCosts = v; else this.localMockDb.mockFulfillmentCosts = v; }

  private get mockTouchpoints(): TouchpointEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockTouchpoints : this.localMockDb.mockTouchpoints; }
  private set mockTouchpoints(v: TouchpointEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockTouchpoints = v; else this.localMockDb.mockTouchpoints = v; }

  private get mockTeamMembers(): TeamMember[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockTeamMembers : this.localMockDb.mockTeamMembers; }
  private set mockTeamMembers(v: TeamMember[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockTeamMembers = v; else this.localMockDb.mockTeamMembers = v; }

  private get mockClients(): ClientProfile[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockClients : this.localMockDb.mockClients; }
  private set mockClients(v: ClientProfile[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockClients = v; else this.localMockDb.mockClients = v; }

  private get mockCampaignBriefs(): CampaignBrief[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockCampaignBriefs : this.localMockDb.mockCampaignBriefs; }
  private set mockCampaignBriefs(v: CampaignBrief[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockCampaignBriefs = v; else this.localMockDb.mockCampaignBriefs = v; }

  private get mockApprovals(): ApprovalRequest[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockApprovals : this.localMockDb.mockApprovals; }
  private set mockApprovals(v: ApprovalRequest[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockApprovals = v; else this.localMockDb.mockApprovals = v; }

  private get mockActivityFeed(): ActivityFeedItem[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockActivityFeed : this.localMockDb.mockActivityFeed; }
  private set mockActivityFeed(v: ActivityFeedItem[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockActivityFeed = v; else this.localMockDb.mockActivityFeed = v; }

  private get mockClientPortals(): ClientPortalToken[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockClientPortals : this.localMockDb.mockClientPortals; }
  private set mockClientPortals(v: ClientPortalToken[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockClientPortals = v; else this.localMockDb.mockClientPortals = v; }

  private get mockBrandSignals(): BrandSignal[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockBrandSignals : this.localMockDb.mockBrandSignals; }
  private set mockBrandSignals(v: BrandSignal[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockBrandSignals = v; else this.localMockDb.mockBrandSignals = v; }

  private get mockIntegrationStates(): IntegrationState[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockIntegrationStates : this.localMockDb.mockIntegrationStates; }
  private set mockIntegrationStates(v: IntegrationState[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockIntegrationStates = v; else this.localMockDb.mockIntegrationStates = v; }

  private get mockSocialMentions(): SocialMention[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockSocialMentions : this.localMockDb.mockSocialMentions; }
  private set mockSocialMentions(v: SocialMention[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockSocialMentions = v; else this.localMockDb.mockSocialMentions = v; }

  private get mockCompetitorSignals(): CompetitorSignal[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockCompetitorSignals : this.localMockDb.mockCompetitorSignals; }
  private set mockCompetitorSignals(v: CompetitorSignal[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockCompetitorSignals = v; else this.localMockDb.mockCompetitorSignals = v; }

  private get mockFinancialTransactions(): FinancialTransaction[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockFinancialTransactions : this.localMockDb.mockFinancialTransactions; }
  private set mockFinancialTransactions(v: FinancialTransaction[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockFinancialTransactions = v; else this.localMockDb.mockFinancialTransactions = v; }

  private get mockCreativeAssets(): CreativeAsset[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockCreativeAssets : this.localMockDb.mockCreativeAssets; }
  private set mockCreativeAssets(v: CreativeAsset[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockCreativeAssets = v; else this.localMockDb.mockCreativeAssets = v; }

  private get mockStakeholderAssociations(): StakeholderAssociation[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockStakeholderAssociations : this.localMockDb.mockStakeholderAssociations; }
  private set mockStakeholderAssociations(v: StakeholderAssociation[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockStakeholderAssociations = v; else this.localMockDb.mockStakeholderAssociations = v; }

  private get mockBaselineContexts(): Array<{tenant_id: string; context: BaselineContext}> { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockBaselineContexts : this.localMockDb.mockBaselineContexts; }
  private set mockBaselineContexts(v: Array<{tenant_id: string; context: BaselineContext}>) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockBaselineContexts = v; else this.localMockDb.mockBaselineContexts = v; }

  private get mockCategoryBenchmarks(): Array<{tenant_id: string; benchmarks: CategoryBenchmarks}> { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockCategoryBenchmarks : this.localMockDb.mockCategoryBenchmarks; }
  private set mockCategoryBenchmarks(v: Array<{tenant_id: string; benchmarks: CategoryBenchmarks}>) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockCategoryBenchmarks = v; else this.localMockDb.mockCategoryBenchmarks = v; }

  private get mockPlatformAccounts(): PlatformAccountEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockPlatformAccounts : this.localMockDb.mockPlatformAccounts; }
  private set mockPlatformAccounts(v: PlatformAccountEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockPlatformAccounts = v; else this.localMockDb.mockPlatformAccounts = v; }

  private get mockAccountLinks(): AccountLinkEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockAccountLinks : this.localMockDb.mockAccountLinks; }
  private set mockAccountLinks(v: AccountLinkEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockAccountLinks = v; else this.localMockDb.mockAccountLinks = v; }

  private get mockAccountCredentials(): AccountCredentialEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockAccountCredentials : this.localMockDb.mockAccountCredentials; }
  private set mockAccountCredentials(v: AccountCredentialEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockAccountCredentials = v; else this.localMockDb.mockAccountCredentials = v; }

  private get mockProductAdLinks(): ProductAdLinkEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockProductAdLinks : this.localMockDb.mockProductAdLinks; }
  private set mockProductAdLinks(v: ProductAdLinkEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockProductAdLinks = v; else this.localMockDb.mockProductAdLinks = v; }

  private get mockVariants(): VariantEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockVariants : this.localMockDb.mockVariants; }
  private set mockVariants(v: VariantEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockVariants = v; else this.localMockDb.mockVariants = v; }

  private get mockPendingJobs(): PendingJobEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockPendingJobs : this.localMockDb.mockPendingJobs; }
  private set mockPendingJobs(v: PendingJobEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockPendingJobs = v; else this.localMockDb.mockPendingJobs = v; }

  private get mockOnboardingEvents(): OnboardingEventEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockOnboardingEvents : this.localMockDb.mockOnboardingEvents; }
  private set mockOnboardingEvents(v: OnboardingEventEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockOnboardingEvents = v; else this.localMockDb.mockOnboardingEvents = v; }

  private get mockRecommendationEvents(): RecommendationEventEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockRecommendationEvents : this.localMockDb.mockRecommendationEvents; }
  private set mockRecommendationEvents(v: RecommendationEventEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockRecommendationEvents = v; else this.localMockDb.mockRecommendationEvents = v; }

  private get mockInviteAllowlist(): InviteAllowlistEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockInviteAllowlist : this.localMockDb.mockInviteAllowlist; }
  private set mockInviteAllowlist(v: InviteAllowlistEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockInviteAllowlist = v; else this.localMockDb.mockInviteAllowlist = v; }

  private get mockUsers(): UserEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockUsers : this.localMockDb.mockUsers; }
  private set mockUsers(v: UserEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockUsers = v; else this.localMockDb.mockUsers = v; }

  private get mockRefreshTokens(): RefreshTokenEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockRefreshTokens : this.localMockDb.mockRefreshTokens; }
  private set mockRefreshTokens(v: RefreshTokenEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockRefreshTokens = v; else this.localMockDb.mockRefreshTokens = v; }

  private get mockOrgs(): OrgEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockOrgs : this.localMockDb.mockOrgs; }
  private set mockOrgs(v: OrgEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockOrgs = v; else this.localMockDb.mockOrgs = v; }

  private get mockOrgMembers(): OrgMemberEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockOrgMembers : this.localMockDb.mockOrgMembers; }
  private set mockOrgMembers(v: OrgMemberEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockOrgMembers = v; else this.localMockDb.mockOrgMembers = v; }
  private get mockLegalAcceptances(): LegalAcceptanceEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockLegalAcceptances : this.localMockDb.mockLegalAcceptances; }
  private set mockLegalAcceptances(v: LegalAcceptanceEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockLegalAcceptances = v; else this.localMockDb.mockLegalAcceptances = v; }

  private get mockSchemaMigrations(): SchemaMigrationEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockSchemaMigrations : this.localMockDb.mockSchemaMigrations; }
  private set mockSchemaMigrations(v: SchemaMigrationEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockSchemaMigrations = v; else this.localMockDb.mockSchemaMigrations = v; }
  private get mockSubscriptions(): SubscriptionEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockSubscriptions : this.localMockDb.mockSubscriptions; }
  private set mockSubscriptions(v: SubscriptionEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockSubscriptions = v; else this.localMockDb.mockSubscriptions = v; }

  private get mockErrorEvents(): ErrorEventEntry[] { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockErrorEvents : this.localMockDb.mockErrorEvents; }
  private set mockErrorEvents(v: ErrorEventEntry[]) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockErrorEvents = v; else this.localMockDb.mockErrorEvents = v; }

  private get mockRollbacks(): Record<string, any> { return SupabaseClient.useSharedMockDb ? GlobalMockDb.mockRollbacks : this.localMockDb.mockRollbacks; }
  private set mockRollbacks(v: Record<string, any>) { if (SupabaseClient.useSharedMockDb) GlobalMockDb.mockRollbacks = v; else this.localMockDb.mockRollbacks = v; }

  private activeTenantId: string | null = null;
  private snapshots: {
    mockTrust: TrustEntry[];
    mockAuditLogs: AuditLogEntry[];
    mockLocks: LockEntry[];
    mockCredentials: CredentialEntry[];
    mockGovernanceEvents: GovernanceEventEntry[];
    mockOrders: OrderEntry[];
    mockOrderLines: OrderLineEntry[];
    mockCampaigns: CampaignEntry[];
    mockSpendFacts: SpendFactEntry[];
    mockCustomers: CustomerEntry[];
    mockIdentityLinks: IdentityLinkEntry[];
    mockRefunds: RefundEntry[];
    mockFulfillmentCosts: FulfillmentCostEntry[];
    mockTouchpoints: TouchpointEntry[];
    mockTeamMembers: TeamMember[];
    mockClients: ClientProfile[];
    mockCampaignBriefs: CampaignBrief[];
    mockApprovals: ApprovalRequest[];
    mockActivityFeed: ActivityFeedItem[];
    mockClientPortals: ClientPortalToken[];
    mockBrandSignals: BrandSignal[];
    mockIntegrationStates: IntegrationState[];
    mockSocialMentions: SocialMention[];
    mockCompetitorSignals: CompetitorSignal[];
    mockFinancialTransactions: FinancialTransaction[];
    mockCreativeAssets: CreativeAsset[];
    mockStakeholderAssociations: StakeholderAssociation[];
    mockPlatformAccounts: PlatformAccountEntry[];
    mockAccountLinks: AccountLinkEntry[];
    mockAccountCredentials: AccountCredentialEntry[];
    mockProductAdLinks: ProductAdLinkEntry[];
    mockVariants: VariantEntry[];
    mockPendingJobs: PendingJobEntry[];
    mockOnboardingEvents: OnboardingEventEntry[];
    mockRecommendationEvents: RecommendationEventEntry[];
    mockInviteAllowlist: InviteAllowlistEntry[];
    mockBaselineContexts: Array<{tenant_id: string; context: BaselineContext}>;
    mockCategoryBenchmarks: Array<{tenant_id: string; benchmarks: CategoryBenchmarks}>;
    mockUsers: UserEntry[];
    mockRefreshTokens: RefreshTokenEntry[];
    mockOrgs: OrgEntry[];
    mockOrgMembers: OrgMemberEntry[];
    mockLegalAcceptances: LegalAcceptanceEntry[];
    mockSchemaMigrations: SchemaMigrationEntry[];
    mockErrorEvents: ErrorEventEntry[];
    mockRollbacks: Record<string, any>;
    mockSubscriptions: SubscriptionEntry[];
  } | null = null;

  private readonly logger: PinoLogger;

  constructor(
    private readonly supabaseUrl = 'https://your-project.supabase.co',
    private readonly supabaseKey = 'mock-key',
    private readonly mockMode = true,
    logger?: PinoLogger,
  ) {
    this.logger = logger || new PinoLogger();
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async runMigrations(
    migrationsDir: string,
    options?: { dryRun?: boolean },
  ): Promise<{ applied: string[] }> {
    this.logger.info('Running database migrations', { migrationsDir, dryRun: !!options?.dryRun });

    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const applied: string[] = [];

    await this.beginTransaction();

    try {
      let appliedRecords: SchemaMigrationEntry[] = [];
      if (this.mockMode) {
        appliedRecords = [...this.mockSchemaMigrations];
      } else {
        const url = `${this.supabaseUrl}/rest/v1/schema_migrations?select=*`;
        const response = await fetch(url, {
          headers: {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
          },
        });
        if (response.ok) {
          appliedRecords = (await response.json()) as SchemaMigrationEntry[];
        }
      }

      const appliedMap = new Map<number, SchemaMigrationEntry>();
      for (const record of appliedRecords) {
        appliedMap.set(record.version, record);
      }

      for (const file of files) {
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (!match) {
          throw new Error(`Invalid migration filename format: ${file}. Expected NNNN_name.sql`);
        }
        const version = parseInt(match[1], 10);
        const name = match[2];

        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, 'utf8');
        const checksum = createHash('sha256').update(sqlContent).digest('hex');

        const appliedRecord = appliedMap.get(version);

        if (appliedRecord) {
          if (appliedRecord.checksum !== checksum) {
            throw new Error(
              `Migration checksum mismatch for version ${version} (${file}). ` +
              `Applied checksum: ${appliedRecord.checksum}, Local file checksum: ${checksum}. ` +
              `Aborting to prevent database corruption.`
            );
          }
          continue;
        }

        this.logger.info(`Applying migration: ${file}`);
        applied.push(file);

        if (!options?.dryRun) {
          if (this.mockMode) {
            this.mockSchemaMigrations.push({
              version,
              name,
              applied_at: new Date().toISOString(),
              checksum,
            });
          } else {
            const url = `${this.supabaseUrl}/rest/v1/schema_migrations`;
            await fetch(url, {
              method: 'POST',
              headers: {
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${this.supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ version, name, checksum }),
            });
          }
        }
      }

      await this.commitTransaction();
      return { applied };
    } catch (err) {
      await this.rollbackTransaction();
      this.logger.error('Database migration failed', { error: err });
      throw err;
    }
  }

  async exportBackup(): Promise<string> {
    this.logger.info('Exporting database backup snapshot');
    const snapshot = {
      mockTrust: this.mockTrust,
      mockErrorEvents: this.mockErrorEvents,
      mockAuditLogs: this.mockAuditLogs,
      mockLocks: this.mockLocks,
      mockCredentials: this.mockCredentials,
      mockGovernanceEvents: this.mockGovernanceEvents,
      mockOrders: this.mockOrders,
      mockOrderLines: this.mockOrderLines,
      mockSubscriptions: this.mockSubscriptions,
      mockCampaigns: this.mockCampaigns,
      mockSpendFacts: this.mockSpendFacts,
      mockCustomers: this.mockCustomers,
      mockIdentityLinks: this.mockIdentityLinks,
      mockRefunds: this.mockRefunds,
      mockFulfillmentCosts: this.mockFulfillmentCosts,
      mockTouchpoints: this.mockTouchpoints,
      mockTeamMembers: this.mockTeamMembers,
      mockClients: this.mockClients,
      mockCampaignBriefs: this.mockCampaignBriefs,
      mockApprovals: this.mockApprovals,
      mockActivityFeed: this.mockActivityFeed,
      mockClientPortals: this.mockClientPortals,
      mockBrandSignals: this.mockBrandSignals,
      mockIntegrationStates: this.mockIntegrationStates,
      mockSocialMentions: this.mockSocialMentions,
      mockCompetitorSignals: this.mockCompetitorSignals,
      mockFinancialTransactions: this.mockFinancialTransactions,
      mockCreativeAssets: this.mockCreativeAssets,
      mockStakeholderAssociations: this.mockStakeholderAssociations,
      mockBaselineContexts: this.mockBaselineContexts,
      mockCategoryBenchmarks: this.mockCategoryBenchmarks,
      mockPlatformAccounts: this.mockPlatformAccounts,
      mockAccountLinks: this.mockAccountLinks,
      mockAccountCredentials: this.mockAccountCredentials,
      mockProductAdLinks: this.mockProductAdLinks,
      mockVariants: this.mockVariants,
      mockPendingJobs: this.mockPendingJobs,
      mockOnboardingEvents: this.mockOnboardingEvents,
      mockUsers: this.mockUsers,
      mockRefreshTokens: this.mockRefreshTokens,
      mockOrgs: this.mockOrgs,
      mockOrgMembers: this.mockOrgMembers,
      mockLegalAcceptances: this.mockLegalAcceptances,
      mockSchemaMigrations: this.mockSchemaMigrations,
      mockRollbacks: this.mockRollbacks,
    };
    return JSON.stringify(snapshot, null, 2);
  }

  async restoreBackup(backupJson: string): Promise<void> {
    this.logger.info('Restoring database from backup snapshot');
    const snapshot = JSON.parse(backupJson) as MockDbContainer;

    if (SupabaseClient.useSharedMockDb) {
      GlobalMockDb.mockTrust = snapshot.mockTrust || [];
      GlobalMockDb.mockErrorEvents = snapshot.mockErrorEvents || [];
      GlobalMockDb.mockAuditLogs = snapshot.mockAuditLogs || [];
      GlobalMockDb.mockLocks = snapshot.mockLocks || [];
      GlobalMockDb.mockCredentials = snapshot.mockCredentials || [];
      GlobalMockDb.mockGovernanceEvents = snapshot.mockGovernanceEvents || [];
      GlobalMockDb.mockOrders = snapshot.mockOrders || [];
      GlobalMockDb.mockOrderLines = snapshot.mockOrderLines || [];
      GlobalMockDb.mockCampaigns = snapshot.mockCampaigns || [];
      GlobalMockDb.mockSpendFacts = snapshot.mockSpendFacts || [];
      GlobalMockDb.mockCustomers = snapshot.mockCustomers || [];
      GlobalMockDb.mockIdentityLinks = snapshot.mockIdentityLinks || [];
      GlobalMockDb.mockRefunds = snapshot.mockRefunds || [];
      GlobalMockDb.mockFulfillmentCosts = snapshot.mockFulfillmentCosts || [];
      GlobalMockDb.mockTouchpoints = snapshot.mockTouchpoints || [];
      GlobalMockDb.mockTeamMembers = snapshot.mockTeamMembers || [];
      GlobalMockDb.mockClients = snapshot.mockClients || [];
      GlobalMockDb.mockCampaignBriefs = snapshot.mockCampaignBriefs || [];
      GlobalMockDb.mockApprovals = snapshot.mockApprovals || [];
      GlobalMockDb.mockActivityFeed = snapshot.mockActivityFeed || [];
      GlobalMockDb.mockClientPortals = snapshot.mockClientPortals || [];
      GlobalMockDb.mockBrandSignals = snapshot.mockBrandSignals || [];
      GlobalMockDb.mockIntegrationStates = snapshot.mockIntegrationStates || [];
      GlobalMockDb.mockSocialMentions = snapshot.mockSocialMentions || [];
      GlobalMockDb.mockCompetitorSignals = snapshot.mockCompetitorSignals || [];
      GlobalMockDb.mockFinancialTransactions = snapshot.mockFinancialTransactions || [];
      GlobalMockDb.mockCreativeAssets = snapshot.mockCreativeAssets || [];
      GlobalMockDb.mockStakeholderAssociations = snapshot.mockStakeholderAssociations || [];
      GlobalMockDb.mockBaselineContexts = snapshot.mockBaselineContexts || [];
      GlobalMockDb.mockCategoryBenchmarks = snapshot.mockCategoryBenchmarks || [];
      GlobalMockDb.mockPlatformAccounts = snapshot.mockPlatformAccounts || [];
      GlobalMockDb.mockAccountLinks = snapshot.mockAccountLinks || [];
      GlobalMockDb.mockAccountCredentials = snapshot.mockAccountCredentials || [];
      GlobalMockDb.mockProductAdLinks = snapshot.mockProductAdLinks || [];
      GlobalMockDb.mockVariants = snapshot.mockVariants || [];
      GlobalMockDb.mockPendingJobs = snapshot.mockPendingJobs || [];
      GlobalMockDb.mockOnboardingEvents = snapshot.mockOnboardingEvents || [];
      GlobalMockDb.mockUsers = snapshot.mockUsers || [];
      GlobalMockDb.mockRefreshTokens = snapshot.mockRefreshTokens || [];
      GlobalMockDb.mockOrgs = snapshot.mockOrgs || [];
      GlobalMockDb.mockOrgMembers = snapshot.mockOrgMembers || [];
      GlobalMockDb.mockLegalAcceptances = snapshot.mockLegalAcceptances || [];
      GlobalMockDb.mockSchemaMigrations = snapshot.mockSchemaMigrations || [];
      GlobalMockDb.mockRollbacks = snapshot.mockRollbacks || {};
      GlobalMockDb.mockSubscriptions = snapshot.mockSubscriptions || [];
    } else {
      this.localMockDb.mockTrust = snapshot.mockTrust || [];
      this.localMockDb.mockErrorEvents = snapshot.mockErrorEvents || [];
      this.localMockDb.mockAuditLogs = snapshot.mockAuditLogs || [];
      this.localMockDb.mockLocks = snapshot.mockLocks || [];
      this.localMockDb.mockCredentials = snapshot.mockCredentials || [];
      this.localMockDb.mockGovernanceEvents = snapshot.mockGovernanceEvents || [];
      this.localMockDb.mockOrders = snapshot.mockOrders || [];
      this.localMockDb.mockOrderLines = snapshot.mockOrderLines || [];
      this.localMockDb.mockCampaigns = snapshot.mockCampaigns || [];
      this.localMockDb.mockSpendFacts = snapshot.mockSpendFacts || [];
      this.localMockDb.mockCustomers = snapshot.mockCustomers || [];
      this.localMockDb.mockIdentityLinks = snapshot.mockIdentityLinks || [];
      this.localMockDb.mockRefunds = snapshot.mockRefunds || [];
      this.localMockDb.mockFulfillmentCosts = snapshot.mockFulfillmentCosts || [];
      this.localMockDb.mockTouchpoints = snapshot.mockTouchpoints || [];
      this.localMockDb.mockTeamMembers = snapshot.mockTeamMembers || [];
      this.localMockDb.mockClients = snapshot.mockClients || [];
      this.localMockDb.mockCampaignBriefs = snapshot.mockCampaignBriefs || [];
      this.localMockDb.mockApprovals = snapshot.mockApprovals || [];
      this.localMockDb.mockActivityFeed = snapshot.mockActivityFeed || [];
      this.localMockDb.mockClientPortals = snapshot.mockClientPortals || [];
      this.localMockDb.mockBrandSignals = snapshot.mockBrandSignals || [];
      this.localMockDb.mockIntegrationStates = snapshot.mockIntegrationStates || [];
      this.localMockDb.mockSocialMentions = snapshot.mockSocialMentions || [];
      this.localMockDb.mockCompetitorSignals = snapshot.mockCompetitorSignals || [];
      this.localMockDb.mockFinancialTransactions = snapshot.mockFinancialTransactions || [];
      this.localMockDb.mockCreativeAssets = snapshot.mockCreativeAssets || [];
      this.localMockDb.mockStakeholderAssociations = snapshot.mockStakeholderAssociations || [];
      this.localMockDb.mockBaselineContexts = snapshot.mockBaselineContexts || [];
      this.localMockDb.mockCategoryBenchmarks = snapshot.mockCategoryBenchmarks || [];
      this.localMockDb.mockPlatformAccounts = snapshot.mockPlatformAccounts || [];
      this.localMockDb.mockAccountLinks = snapshot.mockAccountLinks || [];
      this.localMockDb.mockAccountCredentials = snapshot.mockAccountCredentials || [];
      this.localMockDb.mockProductAdLinks = snapshot.mockProductAdLinks || [];
      this.localMockDb.mockVariants = snapshot.mockVariants || [];
      this.localMockDb.mockPendingJobs = snapshot.mockPendingJobs || [];
      this.localMockDb.mockOnboardingEvents = snapshot.mockOnboardingEvents || [];
      this.localMockDb.mockUsers = snapshot.mockUsers || [];
      this.localMockDb.mockRefreshTokens = snapshot.mockRefreshTokens || [];
      this.localMockDb.mockOrgs = snapshot.mockOrgs || [];
      this.localMockDb.mockOrgMembers = snapshot.mockOrgMembers || [];
      this.localMockDb.mockLegalAcceptances = snapshot.mockLegalAcceptances || [];
      this.localMockDb.mockSchemaMigrations = snapshot.mockSchemaMigrations || [];
      this.localMockDb.mockRollbacks = snapshot.mockRollbacks || {};
      this.localMockDb.mockSubscriptions = snapshot.mockSubscriptions || [];
    }
  }

  clone(): SupabaseClient {
    const copy = new SupabaseClient(
      this.supabaseUrl,
      this.supabaseKey,
      this.mockMode,
      this.logger,
    );
    copy.mockTrust = this.mockTrust;
    copy.mockAuditLogs = this.mockAuditLogs;
    copy.mockLocks = this.mockLocks;
    copy.mockCredentials = this.mockCredentials;
    copy.mockGovernanceEvents = this.mockGovernanceEvents;
    copy.mockOrders = this.mockOrders;
    copy.mockOrderLines = this.mockOrderLines;
    copy.mockCampaigns = this.mockCampaigns;
    copy.mockSpendFacts = this.mockSpendFacts;
    copy.mockCustomers = this.mockCustomers;
    copy.mockIdentityLinks = this.mockIdentityLinks;
    copy.mockRefunds = this.mockRefunds;
    copy.mockFulfillmentCosts = this.mockFulfillmentCosts;
    copy.mockTouchpoints = this.mockTouchpoints;
    copy.mockTeamMembers = this.mockTeamMembers;
    copy.mockClients = this.mockClients;
    copy.mockCampaignBriefs = this.mockCampaignBriefs;
    copy.mockApprovals = this.mockApprovals;
    copy.mockActivityFeed = this.mockActivityFeed;
    copy.mockClientPortals = this.mockClientPortals;
    copy.mockBrandSignals = this.mockBrandSignals;
    copy.mockIntegrationStates = this.mockIntegrationStates;
    copy.mockSocialMentions = this.mockSocialMentions;
    copy.mockCompetitorSignals = this.mockCompetitorSignals;
    copy.mockFinancialTransactions = this.mockFinancialTransactions;
    copy.mockCreativeAssets = this.mockCreativeAssets;
    copy.mockStakeholderAssociations = this.mockStakeholderAssociations;
    copy.mockPlatformAccounts = this.mockPlatformAccounts;
    copy.mockAccountLinks = this.mockAccountLinks;
    copy.mockAccountCredentials = this.mockAccountCredentials;
    copy.mockProductAdLinks = this.mockProductAdLinks;
    copy.mockVariants = this.mockVariants;
    copy.mockPendingJobs = this.mockPendingJobs;
    copy.mockOnboardingEvents = this.mockOnboardingEvents;
    copy.mockUsers = this.mockUsers;
    copy.mockRefreshTokens = this.mockRefreshTokens;
    copy.mockOrgs = this.mockOrgs;
    copy.mockOrgMembers = this.mockOrgMembers;
    copy.mockLegalAcceptances = this.mockLegalAcceptances;
    copy.mockRollbacks = this.mockRollbacks;
    return copy;
  }


  setTenantContext(tenantId: string | null): void {
    this.activeTenantId = tenantId;
    this.logger.info('Active database tenant context set', {'tenantId': tenantId});
  }

  private assertRls(tenant: string): void {
    if (this.activeTenantId !== null && this.activeTenantId !== tenant) {
      this.logger.warn('Row-level security isolation check failed', {
        'activeTenantId': this.activeTenantId,
        'targetTenant': tenant,
      });
      throw new BaseError(
        'RLS_VIOLATION',
        403,
        `Row-level security violation: connection context is '${this.activeTenantId}' but query target tenant is '${tenant}'`,
      );
    }
  }



  // --- TRUST LEDGER PERSISTENCE ---

  async getTrustTier(tenant: string, op: string): Promise<number | null> {
    this.assertRls(tenant);
    this.logger.debug('Fetching trust tier', {'tenant': tenant, 'op': op});
    if (this.mockMode) {
      const match = this.mockTrust.find(
        (t) => t.tenant === tenant && t.op === op,
      );
      this.logger.debug('Mock trust tier query completed', {
        'tenant': tenant,
        'op': op,
        'found': !!match,
        'tier': match ? match.tier : null,
      });
      return match ? match.tier : null;
    }

    // Live SQL via Supabase REST client (concept)
    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_trust?tenant=eq.${tenant}&op=eq.${op}&select=tier`;
      const response = await fetch(url, {
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
      });
      if (response.ok) {
        const data = (await response.json()) as {tier: number}[];
        const tier = data.length > 0 ? data[0].tier : null;
        this.logger.debug('Live trust tier query completed', {
          'tenant': tenant,
          'op': op,
          'found': data.length > 0,
          'tier': tier,
        });
        return tier;
      } else {
        this.logger.warn('Live trust tier query returned error status', {
          'tenant': tenant,
          'op': op,
          'status': response.status,
        });
      }
    } catch (err: any) {
      this.logger.error('Live trust tier query threw network error', {
        'tenant': tenant,
        'op': op,
        'error': err?.message || String(err),
      });
    }
    return null;
  }

  async saveTrustTier(tenant: string, op: string, tier: number): Promise<void> {
    this.assertRls(tenant);
    this.logger.info('Saving trust tier', {'tenant': tenant, 'op': op, 'tier': tier});
    if (this.mockMode) {
      const idx = this.mockTrust.findIndex(
        (t) => t.tenant === tenant && t.op === op,
      );
      if (idx >= 0) {
        this.mockTrust[idx].tier = tier;
        this.mockTrust[idx].updated_at = new Date().toISOString();
      } else {
        this.mockTrust.push({
          tenant,
          op,
          tier,
          updated_at: new Date().toISOString(),
        });
      }
      return;
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_trust`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          tenant,
          op,
          tier,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        this.logger.warn('Live save trust tier returned error status', {
          'tenant': tenant,
          'op': op,
          'status': response.status,
        });
      }
    } catch (err: any) {
      this.logger.error('Live save trust tier threw error', {
        'tenant': tenant,
        'op': op,
        'error': err?.message || String(err),
      });
    }
  }

  // --- AUDIT LOG STORAGE ---

  async logAudit(entry: AuditLogEntry): Promise<void> {
    this.assertRls(entry.tenant);
    this.logger.info('Storing audit log entry', {
      'tenant': entry.tenant,
      'op': entry.op,
      'entity': entry.entity,
      'targetId': entry.target_id,
    });
    if (this.mockMode) {
      this.mockAuditLogs.push({
        ...entry,
        id: `log-${this.mockAuditLogs.length}`,
      });
      return;
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_audit_logs`;
      const response = await fetch(url, {
        method: 'POST',

        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch {
      // Fail-safe
    }
  }

  // --- GOVERNANCE ACTIVITY EVENTS ---
  async saveGovernanceEvent(event: GovernanceEventEntry): Promise<void> {
    this.assertRls(event.tenant_id);
    this.logger.info('Storing governance compliance event', {
      'tenant': event.tenant_id,
      'actionId': event.action_id,
      'status': event.status,
    });
    if (this.mockMode) {
      this.mockGovernanceEvents.push({
        ...event,
        id: `gov-ev-${this.mockGovernanceEvents.length}`,
      });
      return;
    }
  }

  async saveErrorEvent(event: ErrorEventEntry): Promise<void> {
    if (event.tenant_id) {
      this.assertRls(event.tenant_id);
    }
    this.logger.error('Storing error event', {
      'tenant': event.tenant_id,
      'severity': event.severity,
      'source': event.source,
      'message': event.message,
    });
    if (this.mockMode) {
      this.mockErrorEvents.push(event);
      return;
    }

    const url = `${this.supabaseUrl}/rest/v1/error_events`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(event),
    });
  }

  async getErrorEvents(tenantId: string | null): Promise<ErrorEventEntry[]> {
    if (tenantId) {
      this.assertRls(tenantId);
    }
    if (this.mockMode) {
      return this.mockErrorEvents.filter((e) => e.tenant_id === tenantId);
    }

    const url = `${this.supabaseUrl}/rest/v1/error_events?tenant_id=${tenantId ? 'eq.' + tenantId : 'is.null'}&select=*`;
    const response = await fetch(url, {
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
      },
    });
    if (response.ok) {
      return (await response.json()) as ErrorEventEntry[];
    }
    return [];
  }

  async getGovernanceEvents(tenant: string): Promise<GovernanceEventEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockGovernanceEvents.filter((e) => e.tenant_id === tenant);
    }
    return [];
  }

  async getAuditLog(tenant: string, actionId: string): Promise<AuditLogEntry | null> {
    this.assertRls(tenant);
    this.logger.debug('Fetching specific audit log', {'tenant': tenant, 'actionId': actionId});
    if (this.mockMode) {
      const log = [...this.mockAuditLogs].reverse().find((l) => l.tenant === tenant && l.action_id === actionId);
      return log || null;
    }
    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_audit_logs?tenant=eq.${tenant}&action_id=eq.${actionId}&order=timestamp.desc&limit=1&select=*`;
      const response = await fetch(url, {
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
      });
      if (response.ok) {
        const data = (await response.json()) as AuditLogEntry[];
        return data.length > 0 ? data[0] : null;
      }
    } catch (err: any) {
      this.logger.error('Live get audit log threw error', {
        'tenant': tenant,
        'actionId': actionId,
        'error': err?.message || String(err),
      });
    }
    return null;
  }

  async getAuditLogs(tenant: string): Promise<AuditLogEntry[]> {
    this.assertRls(tenant);
    this.logger.debug('Fetching audit logs', {'tenant': tenant});
    if (this.mockMode) {
      const logs = this.mockAuditLogs.filter((l) => l.tenant === tenant);
      this.logger.debug('Mock audit logs query completed', {
        'tenant': tenant,
        'count': logs.length,
      });
      return logs;
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_audit_logs?tenant=eq.${tenant}&select=*`;
      const response = await fetch(url, {
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
      });
      if (response.ok) {
        const data = (await response.json()) as AuditLogEntry[];
        this.logger.debug('Live audit logs query completed', {
          'tenant': tenant,
          'count': data.length,
        });
        return data;
      } else {
        this.logger.warn('Live audit logs query returned error status', {
          'tenant': tenant,
          'status': response.status,
        });
      }
    } catch (err: any) {
      this.logger.error('Live audit logs query threw error', {
        'tenant': tenant,
        'error': err?.message || String(err),
      });
    }
    return [];
  }

  // --- DISTRIBUTED LOCKS ---

  async acquireLock(
    campaignId: string,
    lockedBy: string,
    leaseMs: number,
  ): Promise<boolean> {
    const expiresAt = new Date(Date.now() + leaseMs).toISOString();
    this.logger.info('Attempting to acquire lock', {
      'campaignId': campaignId,
      'lockedBy': lockedBy,
      'leaseMs': leaseMs,
      'expiresAt': expiresAt,
    });

    if (this.mockMode) {
      const now = new Date().toISOString();
      const existing = this.mockLocks.find((l) => l.campaign_id === campaignId);

      if (existing && existing.expires_at > now) {
        this.logger.warn('Lock acquisition failed (already held)', {
          'campaignId': campaignId,
          'lockedBy': lockedBy,
          'heldBy': existing.locked_by,
          'expiresAt': existing.expires_at,
        });
        return false;
      }

      if (existing) {
        existing.locked_by = lockedBy;
        existing.expires_at = expiresAt;
      } else {
        this.mockLocks.push({
          campaign_id: campaignId,
          locked_by: lockedBy,
          expires_at: expiresAt,
        });
      }
      this.logger.info('Lock acquired successfully (mock)', {
        'campaignId': campaignId,
        'lockedBy': lockedBy,
        'expiresAt': expiresAt,
      });
      return true;
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_locks`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          campaign_id: campaignId,
          locked_by: lockedBy,
          expires_at: expiresAt,
        }),
      });
      const ok = response.ok;
      this.logger.info('Lock acquisition response (live)', {
        'campaignId': campaignId,
        'lockedBy': lockedBy,
        'status': response.status,
        'success': ok,
      });
      return ok;
    } catch (err: any) {
      this.logger.error('Lock acquisition threw error (live)', {
        'campaignId': campaignId,
        'lockedBy': lockedBy,
        'error': err?.message || String(err),
      });
      return false;
    }
  }

  async releaseLock(campaignId: string, lockedBy: string): Promise<void> {
    this.logger.info('Releasing lock', {
      'campaignId': campaignId,
      'lockedBy': lockedBy,
    });
    if (this.mockMode) {
      const idx = this.mockLocks.findIndex(
        (l) => l.campaign_id === campaignId && l.locked_by === lockedBy,
      );
      if (idx >= 0) {
        this.mockLocks.splice(idx, 1);
        this.logger.info('Lock released successfully (mock)', {
          'campaignId': campaignId,
          'lockedBy': lockedBy,
        });
      } else {
        this.logger.warn('Lock to release not found or held by another (mock)', {
          'campaignId': campaignId,
          'lockedBy': lockedBy,
        });
      }
      return;
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_locks?campaign_id=eq.${campaignId}&locked_by=eq.${lockedBy}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
      });
      this.logger.info('Lock release completed (live)', {
        'campaignId': campaignId,
        'lockedBy': lockedBy,
        'status': response.status,
      });
    } catch (err: any) {
      this.logger.error('Lock release threw error (live)', {
        'campaignId': campaignId,
        'lockedBy': lockedBy,
        'error': err?.message || String(err),
      });
    }
  }


  // --- TEAM MEMBER PERSISTENCE ---
  async getTeamMembers(tenant: string): Promise<TeamMember[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockTeamMembers.filter((m) => m.tenantId === tenant);
    }
    return [];
  }
  async saveTeamMember(member: TeamMember): Promise<void> {
    this.assertRls(member.tenantId);
    if (this.mockMode) {
      const idx = this.mockTeamMembers.findIndex(
        (m) => m.memberId === member.memberId,
      );
      if (idx >= 0) {
        this.mockTeamMembers[idx] = member;
      } else {
        this.mockTeamMembers.push(member);
      }
      return;
    }
  }

  // --- CLIENT PERSISTENCE ---
  async getClients(tenant: string): Promise<ClientProfile[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockClients.filter((c) => c.tenantId === tenant);
    }
    return [];
  }

  async getAllTenants(): Promise<string[]> {
    // No RLS check here as it is a global admin/background operation
    if (this.mockMode) {
      const tenants = new Set<string>();
      for (const c of this.mockClients) {
        tenants.add(c.tenantId);
      }
      for (const c of this.mockCampaigns) {
        tenants.add(c.tenant_id);
      }
      return Array.from(tenants);
    }
    return [];
  }
  async saveClient(client: ClientProfile): Promise<void> {
    this.assertRls(client.tenantId);
    if (this.mockMode) {
      const idx = this.mockClients.findIndex(
        (c) => c.clientId === client.clientId,
      );
      if (idx >= 0) {
        this.mockClients[idx] = client;
      } else {
        this.mockClients.push(client);
      }
      return;
    }
  }

  // --- CAMPAIGN BRIEFS ---
  async getCampaignBriefs(tenant: string): Promise<CampaignBrief[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockCampaignBriefs.filter((b) => b.tenantId === tenant);
    }
    return [];
  }
  async saveCampaignBrief(brief: CampaignBrief): Promise<void> {
    this.assertRls(brief.tenantId);
    if (this.mockMode) {
      const idx = this.mockCampaignBriefs.findIndex(
        (b) => b.briefId === brief.briefId,
      );
      if (idx >= 0) {
        this.mockCampaignBriefs[idx] = brief;
      } else {
        this.mockCampaignBriefs.push(brief);
      }
    }
  }

  // --- APPROVALS QUEUE ---
  async getApprovals(tenant: string): Promise<ApprovalRequest[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockApprovals.filter((a) => a.tenantId === tenant);
    }
    return [];
  }
  async saveApproval(approval: ApprovalRequest): Promise<void> {
    this.assertRls(approval.tenantId);
    if (this.mockMode) {
      const idx = this.mockApprovals.findIndex(
        (a) => a.approvalId === approval.approvalId,
      );
      if (idx >= 0) {
        this.mockApprovals[idx] = approval;
      } else {
        this.mockApprovals.push(approval);
      }
    }
  }

  // --- ACTIVITY FEED ---
  async getActivityFeed(
    tenant: string,
    userId?: string,
  ): Promise<ActivityFeedItem[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockActivityFeed.filter(
        (item) =>
          item.tenantId === tenant && (!item.userId || item.userId === userId),
      );
    }
    return [];
  }
  async logActivity(item: ActivityFeedItem): Promise<void> {
    this.assertRls(item.tenantId);
    if (this.mockMode) {
      this.mockActivityFeed.push(item);
    }
  }

  // --- CLIENT PORTALS ---
  async getClientPortal(
    tenant: string,
    clientId: string,
  ): Promise<ClientPortalToken | null> {
    this.assertRls(tenant);
    if (this.mockMode) {
      const match = this.mockClientPortals.find(
        (p) => p.tenantId === tenant && p.clientId === clientId,
      );
      return match || null;
    }
    return null;
  }
  async saveClientPortal(token: ClientPortalToken): Promise<void> {
    this.assertRls(token.tenantId);
    if (this.mockMode) {
      const idx = this.mockClientPortals.findIndex(
        (p) => p.portalId === token.portalId,
      );
      if (idx >= 0) {
        this.mockClientPortals[idx] = token;
      } else {
        this.mockClientPortals.push(token);
      }
    }
  }

  // --- BRAND SIGNALS ---
  async getBrandSignals(tenant: string): Promise<BrandSignal[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockBrandSignals.filter((s) => s.tenantId === tenant);
    }
    return [];
  }
  async saveBrandSignal(signal: BrandSignal): Promise<void> {
    this.assertRls(signal.tenantId);
    if (this.mockMode) {
      const idx = this.mockBrandSignals.findIndex(
        (s) => s.signalId === signal.signalId,
      );
      if (idx >= 0) {
        this.mockBrandSignals[idx] = signal;
      } else {
        this.mockBrandSignals.push(signal);
      }
    }
  }

  // --- INTEGRATION STATES ---
  async getIntegrationState(
    tenant: string,
    provider: string,
  ): Promise<IntegrationState | null> {
    this.assertRls(tenant);
    if (this.mockMode) {
      const match = this.mockIntegrationStates.find(
        (i) => i.tenantId === tenant && i.provider === provider,
      );
      return match || null;
    }
    return null;
  }
  async getIntegrationStates(tenant: string): Promise<IntegrationState[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockIntegrationStates.filter((i) => i.tenantId === tenant);
    }
    return [];
  }
  async saveIntegrationState(state: IntegrationState): Promise<void> {
    this.assertRls(state.tenantId);
    if (this.mockMode) {
      const idx = this.mockIntegrationStates.findIndex(
        (i) => i.integrationId === state.integrationId,
      );
      if (idx >= 0) {
        this.mockIntegrationStates[idx] = state;
      } else {
        this.mockIntegrationStates.push(state);
      }
    }
  }

  // --- SOCIAL MENTIONS ---
  async getSocialMentions(tenant: string): Promise<SocialMention[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockSocialMentions.filter((m) => m.tenantId === tenant);
    }
    return [];
  }
  async saveSocialMention(mention: SocialMention): Promise<void> {
    this.assertRls(mention.tenantId);
    if (this.mockMode) {
      const idx = this.mockSocialMentions.findIndex(
        (m) => m.mentionId === mention.mentionId,
      );
      if (idx >= 0) {
        this.mockSocialMentions[idx] = mention;
      } else {
        this.mockSocialMentions.push(mention);
      }
    }
  }

  // --- COMPETITOR SIGNALS ---
  async getCompetitorSignals(tenant: string): Promise<CompetitorSignal[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockCompetitorSignals.filter((c) => c.tenantId === tenant);
    }
    return [];
  }
  async saveCompetitorSignal(signal: CompetitorSignal): Promise<void> {
    this.assertRls(signal.tenantId);
    if (this.mockMode) {
      const idx = this.mockCompetitorSignals.findIndex(
        (c) => c.competitorId === signal.competitorId,
      );
      if (idx >= 0) {
        this.mockCompetitorSignals[idx] = signal;
      } else {
        this.mockCompetitorSignals.push(signal);
      }
    }
  }

  // --- FINANCIAL TRANSACTIONS ---
  async getFinancialTransactions(
    tenant: string,
  ): Promise<FinancialTransaction[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockFinancialTransactions.filter(
        (t) => t.tenantId === tenant,
      );
    }
    return [];
  }
  async saveFinancialTransaction(txn: FinancialTransaction): Promise<void> {
    this.assertRls(txn.tenantId);
    if (this.mockMode) {
      const idx = this.mockFinancialTransactions.findIndex(
        (t) => t.transactionId === txn.transactionId,
      );
      if (idx >= 0) {
        this.mockFinancialTransactions[idx] = txn;
      } else {
        this.mockFinancialTransactions.push(txn);
      }
    }
  }

  // --- CREATIVE ASSETS ---
  async getCreativeAssets(tenant: string): Promise<CreativeAsset[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockCreativeAssets.filter((a) => a.tenantId === tenant);
    }
    return [];
  }
  async saveCreativeAsset(asset: CreativeAsset): Promise<void> {
    this.assertRls(asset.tenantId);
    if (this.mockMode) {
      const idx = this.mockCreativeAssets.findIndex(
        (a) => a.assetId === asset.assetId,
      );
      if (idx >= 0) {
        this.mockCreativeAssets[idx] = asset;
      } else {
        this.mockCreativeAssets.push(asset);
      }
    }
  }

  // --- STAKEHOLDER ASSOCIATIONS ---
  async getStakeholderAssociations(
    tenant: string,
  ): Promise<StakeholderAssociation[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockStakeholderAssociations.filter(
        (a) => a.tenantId === tenant,
      );
    }
    return [];
  }
  async saveStakeholderAssociation(
    association: StakeholderAssociation,
  ): Promise<void> {
    this.assertRls(association.tenantId);
    if (this.mockMode) {
      const idx = this.mockStakeholderAssociations.findIndex(
        (a) => a.associationId === association.associationId,
      );
      if (idx >= 0) {
        this.mockStakeholderAssociations[idx] = association;
      } else {
        this.mockStakeholderAssociations.push(association);
      }
    }
  }

  // --- ORDERS ---
  async getOrders(tenant: string): Promise<OrderEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockOrders.filter((o) => o.tenant_id === tenant);
    }
    return [];
  }
  async saveOrder(order: OrderEntry): Promise<void> {
    this.assertRls(order.tenant_id);
    if (this.mockMode) {
      const idx = this.mockOrders.findIndex((o) => o.order_id === order.order_id);
      if (idx >= 0) {
        this.mockOrders[idx] = order;
      } else {
        this.mockOrders.push(order);
      }
    }
  }

  // --- ORDER LINES ---
  async getOrderLines(tenant: string): Promise<OrderLineEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockOrderLines.filter((l) => l.tenant_id === tenant);
    }
    return [];
  }
  async saveOrderLine(line: OrderLineEntry): Promise<void> {
    this.assertRls(line.tenant_id);
    if (this.mockMode) {
      const idx = this.mockOrderLines.findIndex(
        (l) => l.order_line_id === line.order_line_id,
      );
      if (idx >= 0) {
        this.mockOrderLines[idx] = line;
      } else {
        this.mockOrderLines.push(line);
      }
    }
  }

  // --- CAMPAIGNS ---
  async getCampaigns(tenant: string): Promise<CampaignEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockCampaigns.filter((c) => c.tenant_id === tenant);
    }
    return [];
  }
  async saveCampaign(campaign: CampaignEntry): Promise<void> {
    this.assertRls(campaign.tenant_id);
    if (this.mockMode) {
      const idx = this.mockCampaigns.findIndex(
        (c) => c.campaign_id === campaign.campaign_id,
      );
      if (idx >= 0) {
        this.mockCampaigns[idx] = campaign;
      } else {
        this.mockCampaigns.push(campaign);
      }
    }
  }

  async clearCampaigns(tenant: string): Promise<void> {
    this.assertRls(tenant);
    if (this.mockMode) {
      this.mockCampaigns = this.mockCampaigns.filter((c) => c.tenant_id !== tenant);
    }
  }

  // --- SPEND FACTS ---
  async getSpendFacts(tenant: string): Promise<SpendFactEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockSpendFacts.filter((s) => s.tenant_id === tenant);
    }
    return [];
  }
  async saveSpendFact(fact: SpendFactEntry): Promise<void> {
    this.assertRls(fact.tenant_id);
    if (this.mockMode) {
      const idx = this.mockSpendFacts.findIndex(
        (s) => s.campaign_id === fact.campaign_id && s.day === fact.day,
      );
      if (idx >= 0) {
        this.mockSpendFacts[idx] = fact;
      } else {
        this.mockSpendFacts.push(fact);
      }
    }
  }

  // --- CUSTOMERS ---
  async getCustomers(tenant: string): Promise<CustomerEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockCustomers.filter((c) => c.tenant_id === tenant);
    }
    return [];
  }
  async saveCustomer(customer: CustomerEntry): Promise<void> {
    this.assertRls(customer.tenant_id);
    if (this.mockMode) {
      const idx = this.mockCustomers.findIndex(
        (c) => c.customer_id === customer.customer_id,
      );
      if (idx >= 0) {
        this.mockCustomers[idx] = customer;
      } else {
        this.mockCustomers.push(customer);
      }
    }
  }

  // --- IDENTITY LINKS ---
  async getIdentityLinks(tenant: string): Promise<IdentityLinkEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockIdentityLinks.filter((l) => l.tenant_id === tenant);
    }
    return [];
  }
  async saveIdentityLink(link: IdentityLinkEntry): Promise<void> {
    this.assertRls(link.tenant_id);
    if (this.mockMode) {
      const idx = this.mockIdentityLinks.findIndex(
        (l) =>
          l.customer_id === link.customer_id &&
          l.identifier_type === link.identifier_type &&
          l.identifier_hash === link.identifier_hash,
      );
      if (idx < 0) {
        this.mockIdentityLinks.push(link);
      }
    }
  }

  // --- REFUNDS ---
  async getRefunds(tenant: string): Promise<RefundEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockRefunds.filter((r) => r.tenant_id === tenant);
    }
    return [];
  }
  async saveRefund(refund: RefundEntry): Promise<void> {
    this.assertRls(refund.tenant_id);
    if (this.mockMode) {
      const idx = this.mockRefunds.findIndex((r) => r.refund_id === refund.refund_id);
      if (idx >= 0) {
        this.mockRefunds[idx] = refund;
      } else {
        this.mockRefunds.push(refund);
      }
    }
  }

  // --- FULFILLMENT COSTS ---
  async getFulfillmentCosts(tenant: string): Promise<FulfillmentCostEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockFulfillmentCosts.filter((f) => f.tenant_id === tenant);
    }
    return [];
  }
  async saveFulfillmentCost(cost: FulfillmentCostEntry): Promise<void> {
    this.assertRls(cost.tenant_id);
    if (this.mockMode) {
      const idx = this.mockFulfillmentCosts.findIndex(
        (f) => f.order_id === cost.order_id,
      );
      if (idx >= 0) {
        this.mockFulfillmentCosts[idx] = cost;
      } else {
        this.mockFulfillmentCosts.push(cost);
      }
    }
  }

  // --- TOUCHPOINTS ---
  async getTouchpoints(tenant: string): Promise<TouchpointEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockTouchpoints.filter((t) => t.tenant_id === tenant);
    }
    return [];
  }
  async saveTouchpoint(touchpoint: TouchpointEntry): Promise<void> {
    this.assertRls(touchpoint.tenant_id);
    if (this.mockMode) {
      const idx = this.mockTouchpoints.findIndex(
        (t) => t.touchpoint_id === touchpoint.touchpoint_id,
      );
      if (idx >= 0) {
        this.mockTouchpoints[idx] = touchpoint;
      } else {
        this.mockTouchpoints.push(touchpoint);
      }
    }
  }

  // --- CREDENTIALS ---
  async getCredentials(tenant: string): Promise<CredentialEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockCredentials.filter((c) => c.tenant_id === tenant);
    }
    return [];
  }

  async saveCredential(cred: CredentialEntry): Promise<void> {
    this.assertRls(cred.tenant_id);
    if (this.mockMode) {
      const idx = this.mockCredentials.findIndex(
        (c) =>
          c.tenant_id === cred.tenant_id &&
          c.platform === cred.platform &&
          c.credential_key === cred.credential_key,
      );
      if (idx >= 0) {
        this.mockCredentials[idx] = cred;
      } else {
        this.mockCredentials.push(cred);
      }
    }
  }

  async deleteCredential(tenant: string, platform: string, key: string): Promise<void> {
    this.assertRls(tenant);
    if (this.mockMode) {
      this.mockCredentials = this.mockCredentials.filter(
        (c) =>
          !(
            c.tenant_id === tenant &&
            c.platform === platform &&
            c.credential_key === key
          ),
      );
    }
  }

  async savePlatformAccount(account: PlatformAccountEntry): Promise<void> {
    this.assertRls(account.tenant_id);
    if (this.mockMode) {
      const idx = this.mockPlatformAccounts.findIndex(
        (a) => a.tenant_id === account.tenant_id && a.account_id === account.account_id
      );
      if (idx >= 0) {
        this.mockPlatformAccounts[idx] = account;
      } else {
        this.mockPlatformAccounts.push(account);
      }
    }
  }

  async getPlatformAccounts(tenant: string): Promise<PlatformAccountEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockPlatformAccounts.filter((a) => a.tenant_id === tenant);
    }
    return [];
  }

  async listSubAccounts(tenant: string, parentAccountId: string): Promise<PlatformAccountEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockPlatformAccounts.filter(
        (a) => a.tenant_id === tenant && a.parent_account_id === parentAccountId
      );
    }
    return [];
  }

  async saveAccountLink(link: AccountLinkEntry): Promise<void> {
    this.assertRls(link.tenant_id);
    if (this.mockMode) {
      const idx = this.mockAccountLinks.findIndex(
        (l) => l.tenant_id === link.tenant_id && l.link_id === link.link_id
      );
      if (idx >= 0) {
        this.mockAccountLinks[idx] = link;
      } else {
        this.mockAccountLinks.push(link);
      }
    }
  }

  async getAccountLinks(tenant: string): Promise<AccountLinkEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockAccountLinks.filter((l) => l.tenant_id === tenant);
    }
    return [];
  }

  async saveAccountCredential(cred: AccountCredentialEntry): Promise<void> {
    this.assertRls(cred.tenant_id);
    if (this.mockMode) {
      const idx = this.mockAccountCredentials.findIndex(
        (c) => c.tenant_id === cred.tenant_id && c.credential_id === cred.credential_id
      );
      if (idx >= 0) {
        this.mockAccountCredentials[idx] = cred;
      } else {
        this.mockAccountCredentials.push(cred);
      }
    }
  }

  async getAccountCredential(tenant: string, accountId: string): Promise<AccountCredentialEntry | null> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockAccountCredentials.find((c) => c.tenant_id === tenant && c.account_id === accountId) || null;
    }
    return null;
  }

  async saveProductAdLink(link: ProductAdLinkEntry): Promise<void> {
    this.assertRls(link.tenant_id);
    if (this.mockMode) {
      const idx = this.mockProductAdLinks.findIndex(
        (l) =>
          l.tenant_id === link.tenant_id &&
          l.variant_id === link.variant_id &&
          l.gmc_offer_id === link.gmc_offer_id &&
          l.ads_ad_group_id === link.ads_ad_group_id
      );
      if (idx >= 0) {
        this.mockProductAdLinks[idx] = link;
      } else {
        this.mockProductAdLinks.push(link);
      }
    }
  }

  async getProductAdLinks(tenant: string): Promise<ProductAdLinkEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockProductAdLinks.filter((l) => l.tenant_id === tenant);
    }
    return [];
  }

  // --- PRODUCT CATALOG (VARIANTS) ---
  async getVariants(tenant: string): Promise<VariantEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockVariants.filter((v) => v.tenant_id === tenant);
    }
    return [];
  }

  async saveVariant(variant: VariantEntry): Promise<void> {
    this.assertRls(variant.tenant_id);
    if (this.mockMode) {
      const idx = this.mockVariants.findIndex(
        (v) => v.tenant_id === variant.tenant_id && v.variant_id === variant.variant_id
      );
      if (idx >= 0) {
        this.mockVariants[idx] = variant;
      } else {
        this.mockVariants.push(variant);
      }
    }
  }

  async clearVariants(tenant: string): Promise<void> {
    this.assertRls(tenant);
    if (this.mockMode) {
      this.mockVariants = this.mockVariants.filter((v) => v.tenant_id !== tenant);
    }
  }

  async getBaselineContext(tenant: string): Promise<BaselineContext | null> {
    this.assertRls(tenant);
    if (this.mockMode) {
      const entry = this.mockBaselineContexts.find((c) => c.tenant_id === tenant);
      return entry ? entry.context : null;
    }
    return null;
  }

  async saveBaselineContext(tenant: string, context: BaselineContext): Promise<void> {
    this.assertRls(tenant);
    if (this.mockMode) {
      const idx = this.mockBaselineContexts.findIndex((c) => c.tenant_id === tenant);
      if (idx >= 0) {
        this.mockBaselineContexts[idx] = {tenant_id: tenant, context};
      } else {
        this.mockBaselineContexts.push({tenant_id: tenant, context});
      }
    }
  }

  async getCategoryBenchmarks(tenant: string): Promise<CategoryBenchmarks | null> {
    this.assertRls(tenant);
    if (this.mockMode) {
      const entry = this.mockCategoryBenchmarks.find((b) => b.tenant_id === tenant);
      return entry ? entry.benchmarks : null;
    }
    return null;
  }

  async saveCategoryBenchmarks(tenant: string, benchmarks: CategoryBenchmarks): Promise<void> {
    this.assertRls(tenant);
    if (this.mockMode) {
      const idx = this.mockCategoryBenchmarks.findIndex((b) => b.tenant_id === tenant);
      if (idx >= 0) {
        this.mockCategoryBenchmarks[idx] = {tenant_id: tenant, benchmarks};
      } else {
        this.mockCategoryBenchmarks.push({tenant_id: tenant, benchmarks});
      }
    }
  }

  // --- BACKGROUND JOBS PERSISTENCE ---
  async savePendingJob(job: PendingJobEntry): Promise<void> {
    this.assertRls(job.tenant_id);
    if (this.mockMode) {
      const idx = this.mockPendingJobs.findIndex((j) => j.job_id === job.job_id);
      if (idx >= 0) {
        this.mockPendingJobs[idx] = job;
      } else {
        this.mockPendingJobs.push(job);
      }
    }
  }

  async getPendingJobs(tenant: string): Promise<PendingJobEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockPendingJobs.filter((j) => j.tenant_id === tenant);
    }
    return [];
  }

  async getOverdueJobs(currentTimeMs: number): Promise<PendingJobEntry[]> {
    if (this.mockMode) {
      return this.mockPendingJobs.filter(
        (j) => j.status === 'pending' && Date.parse(j.run_at) <= currentTimeMs
      );
    }
    return [];
  }

  async claimNextOverdueJob(currentTimeMs: number, ownerId: string): Promise<PendingJobEntry | null> {
    if (this.mockMode) {
      const job = this.mockPendingJobs.find((j) => {
        const isPending = j.status === 'pending' && Date.parse(j.run_at) <= currentTimeMs;
        const isLeaseExpired =
          j.status === 'processing' &&
          j.expires_at &&
          Date.parse(j.expires_at) <= currentTimeMs;
        return isPending || isLeaseExpired;
      });
      if (job) {
        job.status = 'processing';
        job.locked_by = ownerId;
        job.expires_at = new Date(currentTimeMs + 10000).toISOString(); // 10s lease by default
        this.logger.info(`[Mock DB] Atomically claimed job ${job.job_id} for owner ${ownerId}`);
        return {...job};
      }
      return null;
    }
    return null;
  }

  async claimJob(
    jobId: string,
    workerId: string,
    currentTimeMs: number,
    leaseDurationMs: number
  ): Promise<boolean> {
    if (this.mockMode) {
      const job = this.mockPendingJobs.find((j) => j.job_id === jobId);
      if (!job) return false;

      const isClaimable =
        job.status === 'pending' ||
        job.status === 'failed' ||
        (job.status === 'processing' &&
          job.expires_at &&
          Date.parse(job.expires_at) <= currentTimeMs);

      if (isClaimable) {
        job.status = 'processing';
        job.locked_by = workerId;
        job.expires_at = new Date(currentTimeMs + leaseDurationMs).toISOString();
        return true;
      }
      return false;
    }
    return false;
  }

  async heartbeatJob(
    jobId: string,
    workerId: string,
    currentTimeMs: number,
    leaseDurationMs: number
  ): Promise<boolean> {
    if (this.mockMode) {
      const job = this.mockPendingJobs.find((j) => j.job_id === jobId);
      if (!job) return false;

      if (job.status === 'processing' && job.locked_by === workerId) {
        job.expires_at = new Date(currentTimeMs + leaseDurationMs).toISOString();
        return true;
      }
      return false;
    }
    return false;
  }

  async completeJob(jobId: string, workerId: string): Promise<boolean> {
    if (this.mockMode) {
      const job = this.mockPendingJobs.find((j) => j.job_id === jobId);
      if (!job) return false;

      if (job.status === 'processing' && job.locked_by === workerId) {
        job.status = 'completed';
        job.locked_by = null;
        job.expires_at = null;
        return true;
      }
      return false;
    }
    return false;
  }

  async updateJobStatus(jobId: string, status: PendingJobEntry['status']): Promise<void> {
    if (this.mockMode) {
      const job = this.mockPendingJobs.find((j) => j.job_id === jobId);
      if (job) {
        job.status = status;
      }
    }
  }

  async deletePendingJob(jobId: string): Promise<void> {
    if (this.mockMode) {
      this.mockPendingJobs = this.mockPendingJobs.filter((j) => j.job_id !== jobId);
    }
  }

  // --- ONBOARDING TELEMETRY PERSISTENCE ---
  async saveOnboardingEvent(event: OnboardingEventEntry): Promise<void> {
    this.assertRls(event.tenant_id);
    if (this.mockMode) {
      this.mockOnboardingEvents.push(event);
    }
  }

  async getOnboardingEvents(tenant: string): Promise<OnboardingEventEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockOnboardingEvents.filter((e) => e.tenant_id === tenant);
    }
    return [];
  }

  // --- AUTH & ORG HIERARCHY ---

  async saveUser(user: UserEntry): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockUsers.findIndex(u => u.user_id === user.user_id);
      if (idx >= 0) {
        this.mockUsers[idx] = user;
      } else {
        this.mockUsers.push(user);
      }
      return;
    }
  }

  async getSubscription(orgId: string): Promise<SubscriptionEntry | null> {
    if (this.mockMode) {
      return this.mockSubscriptions.find(s => s.org_id === orgId) || null;
    }
    const url = `${this.supabaseUrl}/rest/v1/subscriptions?org_id=eq.${encodeURIComponent(orgId)}&select=*`;
    const response = await fetch(url, {
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
      }
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to fetch subscription: ${response.statusText}`);
    }
    const data = await response.json() as SubscriptionEntry[];
    return data[0] || null;
  }

  async saveSubscription(sub: SubscriptionEntry): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockSubscriptions.findIndex(s => s.org_id === sub.org_id);
      if (idx >= 0) {
        this.mockSubscriptions[idx] = sub;
      } else {
        this.mockSubscriptions.push(sub);
      }
      return;
    }
    const url = `${this.supabaseUrl}/rest/v1/subscriptions?org_id=eq.${encodeURIComponent(sub.org_id)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': this.supabaseKey,
        'Authorization': `Bearer ${this.supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(sub)
    });
    if (!response.ok) {
      throw new Error(`Failed to save subscription: ${response.statusText}`);
    }
  }

  async getUserByEmail(email: string): Promise<UserEntry | null> {
    if (this.mockMode) {
      return this.mockUsers.find(u => u.email === email) || null;
    }
    return null;
  }

  async getUserById(userId: string): Promise<UserEntry | null> {
    if (this.mockMode) {
      return this.mockUsers.find(u => u.user_id === userId) || null;
    }
    return null;
  }

  async saveRefreshToken(token: RefreshTokenEntry): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockRefreshTokens.findIndex(t => t.token_hash === token.token_hash);
      if (idx >= 0) {
        this.mockRefreshTokens[idx] = token;
      } else {
        this.mockRefreshTokens.push(token);
      }
      return;
    }
  }

  async getRefreshTokenHash(tokenHash: string): Promise<RefreshTokenEntry | null> {
    if (this.mockMode) {
      return this.mockRefreshTokens.find(t => t.token_hash === tokenHash) || null;
    }
    return null;
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    if (this.mockMode) {
      const token = this.mockRefreshTokens.find(t => t.token_hash === tokenHash);
      if (token) {
        token.revoked = true;
      }
      return;
    }
  }

  async getRefreshTokensForUser(userId: string): Promise<RefreshTokenEntry[]> {
    if (this.mockMode) {
      return this.mockRefreshTokens.filter(t => t.user_id === userId);
    }
    return [];
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    if (this.mockMode) {
      const tokens = this.mockRefreshTokens.filter(t => t.user_id === userId);
      for (const t of tokens) {
        t.revoked = true;
      }
      return;
    }
  }


  async saveOrg(org: OrgEntry): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockOrgs.findIndex(o => o.org_id === org.org_id);
      if (idx >= 0) {
        this.mockOrgs[idx] = org;
      } else {
        this.mockOrgs.push(org);
      }
      return;
    }
  }

  async getOrg(orgId: string): Promise<OrgEntry | null> {
    if (this.mockMode) {
      return this.mockOrgs.find(o => o.org_id === orgId) || null;
    }
    return null;
  }

  async saveOrgMember(member: OrgMemberEntry): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockOrgMembers.findIndex(m => m.org_id === member.org_id && m.user_id === member.user_id);
      if (idx >= 0) {
        this.mockOrgMembers[idx] = member;
      } else {
        this.mockOrgMembers.push(member);
      }
      return;
    }
  }

  async getOrgMembers(orgId: string): Promise<OrgMemberEntry[]> {
    if (this.mockMode) {
      return this.mockOrgMembers.filter(m => m.org_id === orgId);
    }
    return [];
  }

  async getUserOrgs(userId: string): Promise<OrgEntry[]> {
    if (this.mockMode) {
      const memberships = this.mockOrgMembers.filter(m => m.user_id === userId);
      return this.mockOrgs.filter(o => memberships.some(m => m.org_id === o.org_id));
    }
    return [];
  }

  async getOrgBrands(orgId: string): Promise<ClientProfile[]> {
    if (this.mockMode) {
      return this.mockClients.filter(c => c.orgId === orgId);
    }
    return [];
  }

  // --- LEGAL CONSENT & DATA RIGHTS (GDPR) ---

  async saveLegalAcceptance(entry: LegalAcceptanceEntry): Promise<void> {
    if (this.mockMode) {
      this.mockLegalAcceptances.push(entry);
      return;
    }
  }

  async resetUserLegalConsents(userId: string): Promise<void> {
    if (this.mockMode) {
      this.mockLegalAcceptances = this.mockLegalAcceptances.filter((a) => a.user_id !== userId);
    }
  }

  async getLatestLegalAcceptance(userId: string): Promise<LegalAcceptanceEntry | null> {
    if (this.mockMode) {
      const userAcceptances = this.mockLegalAcceptances
        .filter((a) => a.user_id === userId)
        .sort((a, b) => Date.parse(b.accepted_at) - Date.parse(a.accepted_at));
      return userAcceptances.length > 0 ? userAcceptances[0] : null;
    }
    return null;
  }

  async deleteUser(userId: string): Promise<void> {
    if (this.mockMode) {
      this.mockUsers = this.mockUsers.filter((u) => u.user_id !== userId);
      this.mockRefreshTokens = this.mockRefreshTokens.filter((t) => t.user_id !== userId);
      this.mockOrgMembers = this.mockOrgMembers.filter((m) => m.user_id !== userId);
      this.mockLegalAcceptances = this.mockLegalAcceptances.filter((a) => a.user_id !== userId);
      return;
    }
  }

  async deleteOrg(orgId: string): Promise<void> {
    if (this.mockMode) {
      this.mockOrgs = this.mockOrgs.filter((o) => o.org_id !== orgId);
      this.mockOrgMembers = this.mockOrgMembers.filter((m) => m.org_id !== orgId);
      return;
    }
  }

  async hardDeleteTenantData(tenantId: string): Promise<void> {
    if (this.mockMode) {
      // 1. Delete all platform accounts, account links, credentials, Variants
      this.mockPlatformAccounts = this.mockPlatformAccounts.filter((pa) => pa.tenant_id !== tenantId);
      this.mockAccountLinks = this.mockAccountLinks.filter((al) => al.tenant_id !== tenantId);
      this.mockAccountCredentials = this.mockAccountCredentials.filter((ac) => ac.tenant_id !== tenantId);
      this.mockVariants = this.mockVariants.filter((v) => v.tenant_id !== tenantId);
      this.mockProductAdLinks = this.mockProductAdLinks.filter((pl) => pl.tenant_id !== tenantId);

      // 2. Delete all client profile configurations
      this.mockClients = this.mockClients.filter((c) => c.tenantId !== tenantId);

      // 3. Delete Campaign and Orders transaction data
      this.mockCampaigns = this.mockCampaigns.filter((c) => c.tenant_id !== tenantId);
      this.mockOrders = this.mockOrders.filter((o) => o.tenant_id !== tenantId);
      this.mockOrderLines = this.mockOrderLines.filter((ol) => ol.tenant_id !== tenantId);
      this.mockSpendFacts = this.mockSpendFacts.filter((s) => s.tenant_id !== tenantId);
      this.mockCustomers = this.mockCustomers.filter((c) => c.tenant_id !== tenantId);
      this.mockIdentityLinks = this.mockIdentityLinks.filter((i) => i.tenant_id !== tenantId);
      this.mockRefunds = this.mockRefunds.filter((r) => r.tenant_id !== tenantId);
      this.mockFulfillmentCosts = this.mockFulfillmentCosts.filter((fc) => fc.tenant_id !== tenantId);
      this.mockTouchpoints = this.mockTouchpoints.filter((tp) => tp.tenant_id !== tenantId);

      // 4. Delete Signals, Integrations, and Social
      this.mockBrandSignals = this.mockBrandSignals.filter((bs) => bs.tenantId !== tenantId);
      this.mockIntegrationStates = this.mockIntegrationStates.filter((is) => is.tenantId !== tenantId);
      this.mockSocialMentions = this.mockSocialMentions.filter((sm) => sm.tenantId !== tenantId);
      this.mockCompetitorSignals = this.mockCompetitorSignals.filter((cs) => cs.tenantId !== tenantId);
      this.mockFinancialTransactions = this.mockFinancialTransactions.filter((ft) => ft.tenantId !== tenantId);
      this.mockCreativeAssets = this.mockCreativeAssets.filter((ca) => ca.tenantId !== tenantId);
      this.mockStakeholderAssociations = this.mockStakeholderAssociations.filter((sa) => sa.tenantId !== tenantId);

      // 5. Delete scheduler / job states
      this.mockPendingJobs = this.mockPendingJobs.filter((pj) => pj.tenant_id !== tenantId);
      this.mockOnboardingEvents = this.mockOnboardingEvents.filter((oe) => oe.tenant_id !== tenantId);
      this.mockRecommendationEvents = this.mockRecommendationEvents.filter((re) => re.tenant_id !== tenantId);
      this.mockBaselineContexts = this.mockBaselineContexts.filter((bc) => bc.tenant_id !== tenantId);
      this.mockCategoryBenchmarks = this.mockCategoryBenchmarks.filter((cb) => cb.tenant_id !== tenantId);

      // 6. Delete other structures (Team members, briefings, approvals, trust logs)
      this.mockTeamMembers = this.mockTeamMembers.filter((tm) => tm.tenantId !== tenantId);
      this.mockCampaignBriefs = this.mockCampaignBriefs.filter((cb) => cb.tenantId !== tenantId);
      this.mockApprovals = this.mockApprovals.filter((ap) => ap.tenantId !== tenantId);
      this.mockActivityFeed = this.mockActivityFeed.filter((af) => af.tenantId !== tenantId);
      this.mockClientPortals = this.mockClientPortals.filter((cp) => cp.tenantId !== tenantId);

      this.mockTrust = this.mockTrust.filter((t) => t.tenant !== tenantId);
      const tenantCampaigns = this.mockCampaigns.filter((c) => c.tenant_id === tenantId).map(c => c.campaign_id);
      this.mockLocks = this.mockLocks.filter((l) => !tenantCampaigns.includes(l.campaign_id));
      this.mockCredentials = this.mockCredentials.filter((c) => c.tenant_id !== tenantId);
    }
  }

  async anonymizeLogs(tenantId: string): Promise<void> {
    if (this.mockMode) {
      // Scrub from audit logs
      for (const log of this.mockAuditLogs) {
        if (log.tenant === tenantId) {
          log.reason = '[SCRUBBED]';
        }
      }
      // Scrub from governance events
      for (const event of this.mockGovernanceEvents) {
        if (event.tenant_id === tenantId) {
          event.actor = '[REDACTED]';
          event.reason = '[SCRUBBED]';
        }
      }
    }
  }

  async exportTenantData(tenantId: string, userId?: string): Promise<any> {
    if (this.mockMode) {
      const user = userId ? this.mockUsers.find((u) => u.user_id === userId) || null : null;
      return {
        tenantId,
        user,
        clients: this.mockClients.filter((c) => c.tenantId === tenantId),
        platformAccounts: this.mockPlatformAccounts.filter((pa) => pa.tenant_id === tenantId),
        campaigns: this.mockCampaigns.filter((c) => c.tenant_id === tenantId),
        customers: this.mockCustomers.filter((c) => c.tenant_id === tenantId),
        orders: this.mockOrders.filter((o) => o.tenant_id === tenantId),
        brandSignals: this.mockBrandSignals.filter((bs) => bs.tenantId === tenantId),
        teamMembers: this.mockTeamMembers.filter((tm) => tm.tenantId === tenantId),
      };
    }
    return {};
  }

  // --- RECOMMENDATION TELEMETRY ---
  async saveRecommendationEvent(event: RecommendationEventEntry): Promise<void> {
    this.assertRls(event.tenant_id);
    if (this.mockMode) {
      const idx = this.mockRecommendationEvents.findIndex((e) => e.event_id === event.event_id);
      if (idx >= 0) {
        this.mockRecommendationEvents[idx] = event;
      } else {
        this.mockRecommendationEvents.push(event);
      }
    }
  }

  async getRecommendationEvents(tenant: string): Promise<RecommendationEventEntry[]> {
    this.assertRls(tenant);
    if (this.mockMode) {
      return this.mockRecommendationEvents.filter((e) => e.tenant_id === tenant);
    }
    return [];
  }

  // --- INVITE ALLOWLIST ---
  async isEmailAllowed(email: string): Promise<boolean> {
    if (!config.auth.inviteAllowlistEnabled) {
      return true;
    }

    if (this.mockMode) {
      // Auto-seed default allowed emails if list is empty
      const allowed = [
        '*@google.com',
        'allowed@brandtwin.io',
        'admin@example.com',
      ];
      if (this.mockInviteAllowlist.length === 0) {
        this.mockInviteAllowlist = allowed.map((e) => ({ allowed_pattern: e, added_at: new Date().toISOString() }));
      }

      // Check if email matches any pattern in invite allowlist (case-insensitive, wildcard support)
      return this.mockInviteAllowlist.some((x) => {
        const pattern = x.allowed_pattern.toLowerCase();
        const testEmail = email.toLowerCase();
        if (pattern.includes('*')) {
          const regexStr = '^' + pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*') + '$';
          const regex = new RegExp(regexStr);
          return regex.test(testEmail);
        }
        return pattern === testEmail;
      });
    }
    return false;
  }

  async addToAllowlist(emailOrPattern: string): Promise<void> {
    if (this.mockMode) {
      if (!this.mockInviteAllowlist.some((x) => x.allowed_pattern.toLowerCase() === emailOrPattern.toLowerCase())) {
        this.mockInviteAllowlist.push({ allowed_pattern: emailOrPattern, added_at: new Date().toISOString() });
      }
    }
  }

  // --- ROLLBACK PERSISTENCE ---
  async saveRollbackHandle(actionId: string, handle: any): Promise<void> {
    this.logger.info('Saving rollback handle for action', {actionId});
    this.mockRollbacks[actionId] = handle;
  }

  async getRollbackHandle(actionId: string): Promise<any | null> {
    this.logger.debug('Fetching rollback handle for action', {actionId});
    return this.mockRollbacks[actionId] || null;
  }

  // --- TRANSACTION SIMULATION ---
  private transactionActive = false;

  async beginTransaction(): Promise<void> {
    this.transactionActive = true;
    this.snapshots = {
      mockTrust: JSON.parse(JSON.stringify(this.mockTrust)) as TrustEntry[],
      mockAuditLogs: JSON.parse(JSON.stringify(this.mockAuditLogs)) as AuditLogEntry[],
      mockLocks: JSON.parse(JSON.stringify(this.mockLocks)) as LockEntry[],
      mockCredentials: JSON.parse(JSON.stringify(this.mockCredentials)) as CredentialEntry[],
      mockGovernanceEvents: JSON.parse(JSON.stringify(this.mockGovernanceEvents)) as GovernanceEventEntry[],
      mockOrders: JSON.parse(JSON.stringify(this.mockOrders)) as OrderEntry[],
      mockOrderLines: JSON.parse(JSON.stringify(this.mockOrderLines)) as OrderLineEntry[],
      mockCampaigns: JSON.parse(JSON.stringify(this.mockCampaigns)) as CampaignEntry[],
      mockSpendFacts: JSON.parse(JSON.stringify(this.mockSpendFacts)) as SpendFactEntry[],
      mockCustomers: JSON.parse(JSON.stringify(this.mockCustomers)) as CustomerEntry[],
      mockIdentityLinks: JSON.parse(JSON.stringify(this.mockIdentityLinks)) as IdentityLinkEntry[],
      mockRefunds: JSON.parse(JSON.stringify(this.mockRefunds)) as RefundEntry[],
      mockFulfillmentCosts: JSON.parse(JSON.stringify(this.mockFulfillmentCosts)) as FulfillmentCostEntry[],
      mockTouchpoints: JSON.parse(JSON.stringify(this.mockTouchpoints)) as TouchpointEntry[],
      mockTeamMembers: JSON.parse(JSON.stringify(this.mockTeamMembers)) as TeamMember[],
      mockClients: JSON.parse(JSON.stringify(this.mockClients)) as ClientProfile[],
      mockCampaignBriefs: JSON.parse(JSON.stringify(this.mockCampaignBriefs)) as CampaignBrief[],
      mockApprovals: JSON.parse(JSON.stringify(this.mockApprovals)) as ApprovalRequest[],
      mockActivityFeed: JSON.parse(JSON.stringify(this.mockActivityFeed)) as ActivityFeedItem[],
      mockClientPortals: JSON.parse(JSON.stringify(this.mockClientPortals)) as ClientPortalToken[],
      mockBrandSignals: JSON.parse(JSON.stringify(this.mockBrandSignals)) as BrandSignal[],
      mockIntegrationStates: JSON.parse(JSON.stringify(this.mockIntegrationStates)) as IntegrationState[],
      mockSocialMentions: JSON.parse(JSON.stringify(this.mockSocialMentions)) as SocialMention[],
      mockCompetitorSignals: JSON.parse(JSON.stringify(this.mockCompetitorSignals)) as CompetitorSignal[],
      mockFinancialTransactions: JSON.parse(JSON.stringify(this.mockFinancialTransactions)) as FinancialTransaction[],
      mockCreativeAssets: JSON.parse(JSON.stringify(this.mockCreativeAssets)) as CreativeAsset[],
      mockStakeholderAssociations: JSON.parse(JSON.stringify(this.mockStakeholderAssociations)) as StakeholderAssociation[],
      mockPlatformAccounts: JSON.parse(JSON.stringify(this.mockPlatformAccounts)) as PlatformAccountEntry[],
      mockAccountLinks: JSON.parse(JSON.stringify(this.mockAccountLinks)) as AccountLinkEntry[],
      mockAccountCredentials: JSON.parse(JSON.stringify(this.mockAccountCredentials)) as AccountCredentialEntry[],
      mockProductAdLinks: JSON.parse(JSON.stringify(this.mockProductAdLinks)) as ProductAdLinkEntry[],
      mockVariants: JSON.parse(JSON.stringify(this.mockVariants)) as VariantEntry[],
      mockPendingJobs: JSON.parse(JSON.stringify(this.mockPendingJobs)) as PendingJobEntry[],
      mockOnboardingEvents: JSON.parse(JSON.stringify(this.mockOnboardingEvents)) as OnboardingEventEntry[],
      mockRecommendationEvents: JSON.parse(JSON.stringify(this.mockRecommendationEvents)) as RecommendationEventEntry[],
      mockInviteAllowlist: JSON.parse(JSON.stringify(this.mockInviteAllowlist)) as InviteAllowlistEntry[],
      mockBaselineContexts: JSON.parse(JSON.stringify(this.mockBaselineContexts)) as Array<{tenant_id: string; context: BaselineContext}>,
      mockCategoryBenchmarks: JSON.parse(JSON.stringify(this.mockCategoryBenchmarks)) as Array<{tenant_id: string; benchmarks: CategoryBenchmarks}>,
      mockUsers: JSON.parse(JSON.stringify(this.mockUsers)) as UserEntry[],
      mockRefreshTokens: JSON.parse(JSON.stringify(this.mockRefreshTokens)) as RefreshTokenEntry[],
      mockOrgs: JSON.parse(JSON.stringify(this.mockOrgs)) as OrgEntry[],
      mockOrgMembers: JSON.parse(JSON.stringify(this.mockOrgMembers)) as OrgMemberEntry[],
      mockLegalAcceptances: JSON.parse(JSON.stringify(this.mockLegalAcceptances)) as LegalAcceptanceEntry[],
      mockSchemaMigrations: JSON.parse(JSON.stringify(this.mockSchemaMigrations)) as SchemaMigrationEntry[],
      mockErrorEvents: JSON.parse(JSON.stringify(this.mockErrorEvents)) as ErrorEventEntry[],
      mockRollbacks: JSON.parse(JSON.stringify(this.mockRollbacks)) as Record<string, any>,
      mockSubscriptions: JSON.parse(JSON.stringify(this.mockSubscriptions)) as SubscriptionEntry[],
    };
    this.logger.info('Transaction boundary started');
  }

  async commitTransaction(): Promise<void> {
    this.transactionActive = false;
    this.snapshots = null;
    this.logger.info('Transaction boundary committed');
  }

  async rollbackTransaction(): Promise<void> {
    this.transactionActive = false;
    if (this.snapshots) {
      this.mockTrust = this.snapshots.mockTrust;
      this.mockAuditLogs = this.snapshots.mockAuditLogs;
      this.mockLocks = this.snapshots.mockLocks;
      this.mockCredentials = this.snapshots.mockCredentials;
      this.mockGovernanceEvents = this.snapshots.mockGovernanceEvents;
      this.mockOrders = this.snapshots.mockOrders;
      this.mockOrderLines = this.snapshots.mockOrderLines;
      this.mockCampaigns = this.snapshots.mockCampaigns;
      this.mockSpendFacts = this.snapshots.mockSpendFacts;
      this.mockCustomers = this.snapshots.mockCustomers;
      this.mockIdentityLinks = this.snapshots.mockIdentityLinks;
      this.mockRefunds = this.snapshots.mockRefunds;
      this.mockFulfillmentCosts = this.snapshots.mockFulfillmentCosts;
      this.mockTouchpoints = this.snapshots.mockTouchpoints;
      this.mockTeamMembers = this.snapshots.mockTeamMembers;
      this.mockClients = this.snapshots.mockClients;
      this.mockCampaignBriefs = this.snapshots.mockCampaignBriefs;
      this.mockApprovals = this.snapshots.mockApprovals;
      this.mockActivityFeed = this.snapshots.mockActivityFeed;
      this.mockClientPortals = this.snapshots.mockClientPortals;
      this.mockBrandSignals = this.snapshots.mockBrandSignals;
      this.mockIntegrationStates = this.snapshots.mockIntegrationStates;
      this.mockSocialMentions = this.snapshots.mockSocialMentions;
      this.mockCompetitorSignals = this.snapshots.mockCompetitorSignals;
      this.mockFinancialTransactions = this.snapshots.mockFinancialTransactions;
      this.mockCreativeAssets = this.snapshots.mockCreativeAssets;
      this.mockStakeholderAssociations = this.snapshots.mockStakeholderAssociations;
      this.mockPlatformAccounts = this.snapshots.mockPlatformAccounts;
      this.mockAccountLinks = this.snapshots.mockAccountLinks;
      this.mockAccountCredentials = this.snapshots.mockAccountCredentials;
      this.mockProductAdLinks = this.snapshots.mockProductAdLinks;
      this.mockVariants = this.snapshots.mockVariants;
      this.mockPendingJobs = this.snapshots.mockPendingJobs;
      this.mockOnboardingEvents = this.snapshots.mockOnboardingEvents;
      this.mockRecommendationEvents = this.snapshots.mockRecommendationEvents;
      this.mockInviteAllowlist = this.snapshots.mockInviteAllowlist;
      this.mockBaselineContexts = this.snapshots.mockBaselineContexts;
      this.mockCategoryBenchmarks = this.snapshots.mockCategoryBenchmarks;
      this.mockUsers = this.snapshots.mockUsers;
      this.mockRefreshTokens = this.snapshots.mockRefreshTokens;
      this.mockOrgs = this.snapshots.mockOrgs;
      this.mockOrgMembers = this.snapshots.mockOrgMembers;
      this.mockLegalAcceptances = this.snapshots.mockLegalAcceptances;
      this.mockSchemaMigrations = this.snapshots.mockSchemaMigrations;
      this.mockErrorEvents = this.snapshots.mockErrorEvents;
      this.mockRollbacks = this.snapshots.mockRollbacks;
      this.mockSubscriptions = this.snapshots.mockSubscriptions;
      this.snapshots = null;
    }
    this.logger.info('Transaction boundary rolled back');
  }
}
