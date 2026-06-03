import {
  TeamMember,
  ClientProfile,
  CampaignBrief,
  ApprovalRequest,
  ActivityFeedItem,
  ClientPortalToken,
  BrandSignal,
  IntegrationState,
  SocialMention,
  CompetitorSignal,
  FinancialTransaction,
  CreativeAsset,
  StakeholderAssociation
} from "./agency_os_types";

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

/**
 * Supabase client orchestrator.
 */
export class SupabaseClient {
  // In-memory mock database backing for offline verification
  private mockTrust: TrustEntry[] = [];
  private mockAuditLogs: AuditLogEntry[] = [];
  private mockLocks: LockEntry[] = [];

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

  constructor(
    private readonly supabaseUrl = "https://your-project.supabase.co",
    private readonly supabaseKey = "mock-key",
    private readonly mockMode = true,
  ) {}

  // --- TRUST LEDGER PERSISTENCE ---

  async getTrustTier(tenant: string, op: string): Promise<number | null> {
    if (this.mockMode) {
      const match = this.mockTrust.find((t) => t.tenant === tenant && t.op === op);
      return match ? match.tier : null;
    }

    // Live SQL via Supabase REST client (concept)
    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_trust?tenant=eq.${tenant}&op=eq.${op}&select=tier`;
      const response = await fetch(url, {
        headers: {
          "apikey": this.supabaseKey,
          "Authorization": `Bearer ${this.supabaseKey}`,
        },
      });
      if (response.ok) {
        const data = await response.json() as { tier: number }[];
        return data.length > 0 ? data[0].tier : null;
      }
    } catch {
      // Offline fallback
    }
    return null;
  }

  async saveTrustTier(tenant: string, op: string, tier: number): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockTrust.findIndex((t) => t.tenant === tenant && t.op === op);
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
      await fetch(url, {
        method: "POST",
        headers: {
          "apikey": this.supabaseKey,
          "Authorization": `Bearer ${this.supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({ tenant, op, tier, updated_at: new Date().toISOString() }),
      });
    } catch {
      // Ignore failures or handle
    }
  }

  // --- AUDIT LOG STORAGE ---

  async logAudit(entry: AuditLogEntry): Promise<void> {
    if (this.mockMode) {
      this.mockAuditLogs.push({ ...entry, id: `log-${this.mockAuditLogs.length}` });
      return;
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_audit_logs`;
      await fetch(url, {
        method: "POST",
        headers: {
          "apikey": this.supabaseKey,
          "Authorization": `Bearer ${this.supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entry),
      });
    } catch {
      // Fail-safe
    }
  }

  async getAuditLogs(tenant: string): Promise<AuditLogEntry[]> {
    if (this.mockMode) {
      return this.mockAuditLogs.filter((l) => l.tenant === tenant);
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_audit_logs?tenant=eq.${tenant}&select=*`;
      const response = await fetch(url, {
        headers: {
          "apikey": this.supabaseKey,
          "Authorization": `Bearer ${this.supabaseKey}`,
        },
      });
      if (response.ok) {
        return await response.json() as AuditLogEntry[];
      }
    } catch {
      // Offline fallback
    }
    return [];
  }

  // --- DISTRIBUTED LOCKS ---

  async acquireLock(campaignId: string, lockedBy: string, leaseMs: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + leaseMs).toISOString();

    if (this.mockMode) {
      const now = new Date().toISOString();
      const existing = this.mockLocks.find((l) => l.campaign_id === campaignId);

      if (existing && existing.expires_at > now) {
        return false; // Lock is currently held
      }

      if (existing) {
        existing.locked_by = lockedBy;
        existing.expires_at = expiresAt;
      } else {
        this.mockLocks.push({ campaign_id: campaignId, locked_by: lockedBy, expires_at: expiresAt });
      }
      return true;
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_locks`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "apikey": this.supabaseKey,
          "Authorization": `Bearer ${this.supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=representation",
        },
        body: JSON.stringify({ campaign_id: campaignId, locked_by: lockedBy, expires_at: expiresAt }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async releaseLock(campaignId: string, lockedBy: string): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockLocks.findIndex((l) => l.campaign_id === campaignId && l.locked_by === lockedBy);
      if (idx >= 0) {
        this.mockLocks.splice(idx, 1);
      }
      return;
    }

    try {
      const url = `${this.supabaseUrl}/rest/v1/brand_twin_locks?campaign_id=eq.${campaignId}&locked_by=eq.${lockedBy}`;
      await fetch(url, {
        method: "DELETE",
        headers: {
          "apikey": this.supabaseKey,
          "Authorization": `Bearer ${this.supabaseKey}`,
        },
      });
    } catch {
      // Ignore
    }
  }

  // --- TEAM MEMBER PERSISTENCE ---
  async getTeamMembers(tenant: string): Promise<TeamMember[]> {
    if (this.mockMode) return this.mockTeamMembers.filter(m => m.tenantId === tenant);
    return [];
  }
  async saveTeamMember(member: TeamMember): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockTeamMembers.findIndex(m => m.memberId === member.memberId);
      if (idx >= 0) this.mockTeamMembers[idx] = member;
      else this.mockTeamMembers.push(member);
      return;
    }
  }

  // --- CLIENT PERSISTENCE ---
  async getClients(tenant: string): Promise<ClientProfile[]> {
    if (this.mockMode) return this.mockClients.filter(c => c.tenantId === tenant);
    return [];
  }
  async saveClient(client: ClientProfile): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockClients.findIndex(c => c.clientId === client.clientId);
      if (idx >= 0) this.mockClients[idx] = client;
      else this.mockClients.push(client);
      return;
    }
  }

  // --- CAMPAIGN BRIEFS ---
  async getCampaignBriefs(tenant: string): Promise<CampaignBrief[]> {
    if (this.mockMode) return this.mockCampaignBriefs.filter(b => b.tenantId === tenant);
    return [];
  }
  async saveCampaignBrief(brief: CampaignBrief): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockCampaignBriefs.findIndex(b => b.briefId === brief.briefId);
      if (idx >= 0) this.mockCampaignBriefs[idx] = brief;
      else this.mockCampaignBriefs.push(brief);
    }
  }

  // --- APPROVALS QUEUE ---
  async getApprovals(tenant: string): Promise<ApprovalRequest[]> {
    if (this.mockMode) return this.mockApprovals.filter(a => a.tenantId === tenant);
    return [];
  }
  async saveApproval(approval: ApprovalRequest): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockApprovals.findIndex(a => a.approvalId === approval.approvalId);
      if (idx >= 0) this.mockApprovals[idx] = approval;
      else this.mockApprovals.push(approval);
    }
  }

  // --- ACTIVITY FEED ---
  async getActivityFeed(tenant: string, userId?: string): Promise<ActivityFeedItem[]> {
    if (this.mockMode) {
      return this.mockActivityFeed.filter(
        item => item.tenantId === tenant && (!item.userId || item.userId === userId)
      );
    }
    return [];
  }
  async logActivity(item: ActivityFeedItem): Promise<void> {
    if (this.mockMode) {
      this.mockActivityFeed.push(item);
    }
  }

  // --- CLIENT PORTALS ---
  async getClientPortal(tenant: string, clientId: string): Promise<ClientPortalToken | null> {
    if (this.mockMode) {
      const match = this.mockClientPortals.find(p => p.tenantId === tenant && p.clientId === clientId);
      return match || null;
    }
    return null;
  }
  async saveClientPortal(token: ClientPortalToken): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockClientPortals.findIndex(p => p.portalId === token.portalId);
      if (idx >= 0) this.mockClientPortals[idx] = token;
      else this.mockClientPortals.push(token);
    }
  }

  // --- BRAND SIGNALS ---
  async getBrandSignals(tenant: string): Promise<BrandSignal[]> {
    if (this.mockMode) return this.mockBrandSignals.filter(s => s.tenantId === tenant);
    return [];
  }
  async saveBrandSignal(signal: BrandSignal): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockBrandSignals.findIndex(s => s.signalId === signal.signalId);
      if (idx >= 0) this.mockBrandSignals[idx] = signal;
      else this.mockBrandSignals.push(signal);
    }
  }

  // --- INTEGRATION STATES ---
  async getIntegrationState(tenant: string, provider: string): Promise<IntegrationState | null> {
    if (this.mockMode) {
      const match = this.mockIntegrationStates.find(i => i.tenantId === tenant && i.provider === provider);
      return match || null;
    }
    return null;
  }
  async getIntegrationStates(tenant: string): Promise<IntegrationState[]> {
    if (this.mockMode) {
      return this.mockIntegrationStates.filter(i => i.tenantId === tenant);
    }
    return [];
  }
  async saveIntegrationState(state: IntegrationState): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockIntegrationStates.findIndex(i => i.integrationId === state.integrationId);
      if (idx >= 0) this.mockIntegrationStates[idx] = state;
      else this.mockIntegrationStates.push(state);
    }
  }

  // --- SOCIAL MENTIONS ---
  async getSocialMentions(tenant: string): Promise<SocialMention[]> {
    if (this.mockMode) return this.mockSocialMentions.filter(m => m.tenantId === tenant);
    return [];
  }
  async saveSocialMention(mention: SocialMention): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockSocialMentions.findIndex(m => m.mentionId === mention.mentionId);
      if (idx >= 0) this.mockSocialMentions[idx] = mention;
      else this.mockSocialMentions.push(mention);
    }
  }

  // --- COMPETITOR SIGNALS ---
  async getCompetitorSignals(tenant: string): Promise<CompetitorSignal[]> {
    if (this.mockMode) return this.mockCompetitorSignals.filter(c => c.tenantId === tenant);
    return [];
  }
  async saveCompetitorSignal(signal: CompetitorSignal): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockCompetitorSignals.findIndex(c => c.competitorId === signal.competitorId);
      if (idx >= 0) this.mockCompetitorSignals[idx] = signal;
      else this.mockCompetitorSignals.push(signal);
    }
  }

  // --- FINANCIAL TRANSACTIONS ---
  async getFinancialTransactions(tenant: string): Promise<FinancialTransaction[]> {
    if (this.mockMode) return this.mockFinancialTransactions.filter(t => t.tenantId === tenant);
    return [];
  }
  async saveFinancialTransaction(txn: FinancialTransaction): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockFinancialTransactions.findIndex(t => t.transactionId === txn.transactionId);
      if (idx >= 0) this.mockFinancialTransactions[idx] = txn;
      else this.mockFinancialTransactions.push(txn);
    }
  }

  // --- CREATIVE ASSETS ---
  async getCreativeAssets(tenant: string): Promise<CreativeAsset[]> {
    if (this.mockMode) return this.mockCreativeAssets.filter(a => a.tenantId === tenant);
    return [];
  }
  async saveCreativeAsset(asset: CreativeAsset): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockCreativeAssets.findIndex(a => a.assetId === asset.assetId);
      if (idx >= 0) this.mockCreativeAssets[idx] = asset;
      else this.mockCreativeAssets.push(asset);
    }
  }

  // --- STAKEHOLDER ASSOCIATIONS ---
  async getStakeholderAssociations(tenant: string): Promise<StakeholderAssociation[]> {
    if (this.mockMode) return this.mockStakeholderAssociations.filter(a => a.tenantId === tenant);
    return [];
  }
  async saveStakeholderAssociation(association: StakeholderAssociation): Promise<void> {
    if (this.mockMode) {
      const idx = this.mockStakeholderAssociations.findIndex(a => a.associationId === association.associationId);
      if (idx >= 0) this.mockStakeholderAssociations[idx] = association;
      else this.mockStakeholderAssociations.push(association);
    }
  }

  // --- TRANSACTION SIMULATION ---
  private transactionActive = false;

  async beginTransaction(): Promise<void> {
    this.transactionActive = true;
    console.log("[db] Transaction boundary started.");
  }

  async commitTransaction(): Promise<void> {
    this.transactionActive = false;
    console.log("[db] Transaction boundary committed.");
  }

  async rollbackTransaction(): Promise<void> {
    this.transactionActive = false;
    console.log("[db] Transaction boundary rolled back.");
  }
}
