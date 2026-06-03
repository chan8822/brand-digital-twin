/**
 * @fileoverview Onboarding and configuration wizard.
 */

import {ClientProfile, IntegrationState, TeamMember} from './agency_os_types';
import {SupabaseClient} from './supabase_client';

export interface OnboardingParams {
  tenantId: string;
  clientName: string;
  industry: string;
  mrr: number;
  marginTarget: number;
  teamMembers: Array<{
    memberId: string;
    roleName: 'media_buyer' | 'account_mgr' | 'cmo' | 'cfo' | 'admin';
    permissions: string[];
    capacityPct: number;
  }>;
  platforms: string[]; // e.g. ['google_ads', 'meta_ads', 'slack']
}

export class OnboardingWizard {
  constructor(private readonly db: SupabaseClient) {}

  /**
   * Run the setup routine, writing all seed records.
   */
  async runSetup(
    params: OnboardingParams,
  ): Promise<{
    success: boolean;
    client: ClientProfile;
    initializedIntegrationsCount: number;
  }> {
    // 1. Create client profile
    const client: ClientProfile = {
      clientId: `client-${Date.now()}`,
      orgId: `org-${params.tenantId}`,
      name: params.clientName,
      industry: params.industry,
      mrr: params.mrr,
      marginTarget: params.marginTarget,
      healthScore: 100, // initialized at perfect health
      churnRisk: 0.0,
      tenantId: params.tenantId,
    };
    await this.db.saveClient(client);

    // 2. Add team members
    for (const member of params.teamMembers) {
      const teamMember: TeamMember = {
        memberId: member.memberId,
        orgId: `org-${params.tenantId}`,
        userId: `user-${member.memberId}`,
        roleName: member.roleName,
        permissions: member.permissions,
        capacityPct: member.capacityPct,
        tenantId: params.tenantId,
      };
      await this.db.saveTeamMember(teamMember);
    }

    // 3. Initialize integration states
    let count = 0;
    for (const platform of params.platforms) {
      const integration: IntegrationState = {
        integrationId: `state-${platform}-${params.tenantId}`,
        tenantId: params.tenantId,
        provider: platform as IntegrationState['provider'],
        status: 'active',
        settings: {
          accessToken: `token-initial-${platform}`,
          lastRotated: Date.now(),
        },
        updatedAt: Date.now(),
      };
      await this.db.saveIntegrationState(integration);
      count++;
    }

    // Log onboarding activity event
    await this.db.logActivity({
      eventId: `act-onboard-${Date.now()}`,
      orgId: `org-${params.tenantId}`,
      actorId: 'onboarding-wizard',
      actionType: 'onboarding_completed',
      entityType: 'tenant',
      entityId: params.tenantId,
      summary: `Onboarding completed for tenant ${params.tenantId}. Client profile '${params.clientName}' and ${count} integrations initialized.`,
      isRead: false,
      tenantId: params.tenantId,
      createdAt: Date.now(),
    });

    return {
      success: true,
      client,
      initializedIntegrationsCount: count,
    };
  }
}
