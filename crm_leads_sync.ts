import {SupabaseClient, CrmLeadEntry} from './supabase_client';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {MetaAdsAdapter} from './meta_ads_adapter';

export interface LeadSyncResult {
  googleSuccessCount: number;
  googleFailCount: number;
  metaSuccessCount: number;
  metaFailCount: number;
}

export class CrmLeadsSync {
  constructor(private readonly db: SupabaseClient) {}

  async syncLeads(
    tenantId: string,
    googleAdapter: GoogleAdsAdapter,
    metaAdapter: MetaAdsAdapter,
    metaPixelId: string,
  ): Promise<LeadSyncResult> {
    const result: LeadSyncResult = {
      googleSuccessCount: 0,
      googleFailCount: 0,
      metaSuccessCount: 0,
      metaFailCount: 0,
    };

    // 1. Fetch all leads for this tenant
    const leads = await this.db.getCrmLeads(tenantId);

    // 2. Filter leads needing sync
    const googleSyncLeads = leads.filter(
      (l) => l.gclid && l.status !== 'prospect' && l.status !== l.google_synced_status,
    );

    const metaSyncLeads = leads.filter(
      (l) => l.fbclid && l.status !== 'prospect' && l.status !== l.meta_synced_status,
    );

    if (googleSyncLeads.length === 0 && metaSyncLeads.length === 0) {
      return result;
    }

    // Helper to format ISO date to Google Ads API expected YYYY-MM-DD HH:MM:SS+TZ format
    const formatGoogleDateTime = (isoStr: string): string => {
      const d = new Date(isoStr);
      const pad = (n: number) => String(n).padStart(2, '0');
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const min = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}+0000`;
    };

    // 3. Sync to Google Ads
    if (googleSyncLeads.length > 0) {
      const adjustments: any[] = [];
      const validLeads: CrmLeadEntry[] = [];

      for (const lead of googleSyncLeads) {
        adjustments.push({
          gclidDateTimePair: {
            gclid: lead.gclid!,
            conversionDateTime: formatGoogleDateTime(lead.updated_at),
          },
          adjustmentType: 'RESTATEMENT',
          restatementValue: {
            adjustedValue: lead.value,
            currencyCode: 'USD',
          },
        });
        validLeads.push(lead);
      }

      if (adjustments.length > 0) {
        try {
          const adsCreds = await this.db.getCredentials(tenantId);
          const googleCred = adsCreds.find((c) => c.platform === 'google_ads');
          const googleCustId = googleCred?.credential_key || 'mock-customer-id';

          const uploadRes = await googleAdapter.uploadConversionAdjustments(
            googleCustId,
            adjustments,
          );

          result.googleSuccessCount = uploadRes.successCount;
          result.googleFailCount = uploadRes.failCount;

          if (uploadRes.successCount > 0) {
            for (let i = 0; i < uploadRes.successCount; i++) {
              const lead = validLeads[i];
              lead.google_synced_status = lead.status;
              await this.db.saveCrmLead(lead);
            }
          }
        } catch (err) {
          result.googleFailCount = adjustments.length;
        }
      }
    }

    // 4. Sync to Meta Ads CAPI
    if (metaSyncLeads.length > 0) {
      const events: any[] = [];
      const validLeads: CrmLeadEntry[] = [];

      for (const lead of metaSyncLeads) {
        // Map CRM status to Meta CAPI standard lead/conversion event name
        const eventName = lead.status === 'closed_won' ? 'ClosedWon' : 'LeadQualification';

        events.push({
          event_name: eventName,
          event_time: Math.floor(new Date(lead.updated_at).getTime() / 1000),
          action_source: 'system_generated',
          user_data: {
            fbc: `fb.1.1.${lead.fbclid!}`,
          },
          custom_data: {
            value: lead.value,
            currency: 'USD',
          },
        });
        validLeads.push(lead);
      }

      if (events.length > 0) {
        try {
          const uploadRes = await metaAdapter.uploadOfflineEvents(metaPixelId, events);

          result.metaSuccessCount = uploadRes.successCount;
          result.metaFailCount = uploadRes.failCount;

          if (uploadRes.successCount > 0) {
            for (let i = 0; i < uploadRes.successCount; i++) {
              const lead = validLeads[i];
              lead.meta_synced_status = lead.status;
              await this.db.saveCrmLead(lead);
            }
          }
        } catch (err) {
          result.metaFailCount = events.length;
        }
      }
    }

    return result;
  }
}
