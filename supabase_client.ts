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
} from './agency_os_types';
import {BaseError} from './errors';
import {PinoLogger} from './observability';

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

/**
 * Supabase client orchestrator.
 */
export class SupabaseClient {
  // In-memory mock database backing for offline verification
  private mockTrust: TrustEntry[] = [];
  private mockAuditLogs: AuditLogEntry[] = [];
  private mockLocks: LockEntry[] = [];

  private mockOrders: OrderEntry[] = [];
  private mockOrderLines: OrderLineEntry[] = [];
  private mockCampaigns: CampaignEntry[] = [];
  private mockSpendFacts: SpendFactEntry[] = [];

  private mockTeamMembers: TeamMember[] = [];
  private mockClients: ClientProfile[] = [];
  private mockCampaignBriefs: CampaignBrief[] = [];
  private mockApprovals: ApprovalRequest[] = [];
  private mockActivityFeed: ActivityFeedItem[] = [];
  private mockClientPortals: ClientPortalToken[] = [];

  private mockBrandSignals: BrandSignal[] = [];
  private mockIntegrationStates: IntegrationState[] = [];
  private mockSocialMentions: SocialMention[] = [];
  private mockCompetitorSignals: CompetitorSignal[] = [];
  private mockFinancialTransactions: FinancialTransaction[] = [];
  private mockCreativeAssets: CreativeAsset[] = [];
  private mockStakeholderAssociations: StakeholderAssociation[] = [];

  private activeTenantId: string | null = null;
  private snapshots: {
    mockTrust: TrustEntry[];
    mockAuditLogs: AuditLogEntry[];
    mockLocks: LockEntry[];
    mockOrders: OrderEntry[];
    mockOrderLines: OrderLineEntry[];
    mockCampaigns: CampaignEntry[];
    mockSpendFacts: SpendFactEntry[];
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
    copy.mockOrders = this.mockOrders;
    copy.mockOrderLines = this.mockOrderLines;
    copy.mockCampaigns = this.mockCampaigns;
    copy.mockSpendFacts = this.mockSpendFacts;
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

  // --- TRANSACTION SIMULATION ---
  private transactionActive = false;

  async beginTransaction(): Promise<void> {
    this.transactionActive = true;
    this.snapshots = {
      mockTrust: JSON.parse(JSON.stringify(this.mockTrust)) as TrustEntry[],
      mockAuditLogs: JSON.parse(JSON.stringify(this.mockAuditLogs)) as AuditLogEntry[],
      mockLocks: JSON.parse(JSON.stringify(this.mockLocks)) as LockEntry[],
      mockOrders: JSON.parse(JSON.stringify(this.mockOrders)) as OrderEntry[],
      mockOrderLines: JSON.parse(JSON.stringify(this.mockOrderLines)) as OrderLineEntry[],
      mockCampaigns: JSON.parse(JSON.stringify(this.mockCampaigns)) as CampaignEntry[],
      mockSpendFacts: JSON.parse(JSON.stringify(this.mockSpendFacts)) as SpendFactEntry[],
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
      this.mockOrders = this.snapshots.mockOrders;
      this.mockOrderLines = this.snapshots.mockOrderLines;
      this.mockCampaigns = this.snapshots.mockCampaigns;
      this.mockSpendFacts = this.snapshots.mockSpendFacts;
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
      this.snapshots = null;
    }
    this.logger.info('Transaction boundary rolled back');
  }
}
