import {SupabaseClient} from './supabase_client';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {MetaAdsAdapter} from './meta_ads_adapter';
import {CrmLeadsSync} from './crm_leads_sync';

describe('CRM Lead Progression Sync Tests (PROAS)', () => {
  let db: SupabaseClient;
  let googleAdapter: GoogleAdsAdapter;
  let metaAdapter: MetaAdsAdapter;
  let syncEngine: CrmLeadsSync;

  beforeEach(() => {
    db = new SupabaseClient('mock-url', 'mock-key', true);
    db.setTenantContext('tenant-crm');
    googleAdapter = new GoogleAdsAdapter('cust-123', 'dev-tok', 'mock-token', 'tenant-crm');
    metaAdapter = new MetaAdsAdapter('act-123', 'mock_access_token', 'tenant-crm');
    syncEngine = new CrmLeadsSync(db);
  });

  it('should ignore prospects but sync SQL and Closed Won lead milestones correctly', async () => {
    // 1. Seed leads:
    // Lead 1: Google Click, status prospect -> should NOT sync.
    // Lead 2: Google Click, status sql -> should sync value 150.
    // Lead 3: Meta Click, status closed_won -> should sync value 2500.
    await Promise.all([
      db.saveCrmLead({
        lead_id: 'lead-prospect',
        tenant_id: 'tenant-crm',
        email: 'prospect@example.com',
        gclid: 'GCLID_PROSPECT',
        status: 'prospect',
        value: 10,
        updated_at: '2026-06-01T08:00:00Z',
      }),
      db.saveCrmLead({
        lead_id: 'lead-sql',
        tenant_id: 'tenant-crm',
        email: 'sql_buyer@example.com',
        gclid: 'GCLID_SQL_WIN',
        status: 'sql',
        value: 150,
        updated_at: '2026-06-01T09:00:00Z',
      }),
      db.saveCrmLead({
        lead_id: 'lead-closed',
        tenant_id: 'tenant-crm',
        email: 'closed_buyer@example.com',
        fbclid: 'FBCLID_CLOSED_WIN',
        status: 'closed_won',
        value: 2500,
        updated_at: '2026-06-01T10:00:00Z',
      }),
    ]);

    spyOn(googleAdapter, 'uploadConversionAdjustments').and.callThrough();
    spyOn(metaAdapter, 'uploadOfflineEvents').and.callThrough();

    // 2. Run Sync
    const syncRes = await syncEngine.syncLeads(
      'tenant-crm',
      googleAdapter,
      metaAdapter,
      'pixel-leads',
    );

    // Verify summary counts
    expect(syncRes.googleSuccessCount).toBe(1); // lead-sql
    expect(syncRes.googleFailCount).toBe(0);
    expect(syncRes.metaSuccessCount).toBe(1); // lead-closed
    expect(syncRes.metaFailCount).toBe(0);

    // Verify Google Ads adapter payload values (SQL lead value 150)
    expect(googleAdapter.uploadConversionAdjustments).toHaveBeenCalled();
    const googleCallArgs = (googleAdapter.uploadConversionAdjustments as jasmine.Spy).calls.mostRecent().args;
    const googlePayload = googleCallArgs[1];
    expect(googlePayload.length).toBe(1);
    expect(googlePayload[0].gclidDateTimePair.gclid).toBe('GCLID_SQL_WIN');
    expect(googlePayload[0].restatementValue.adjustedValue).toBe(150);

    // Verify Meta Ads adapter payload values (Closed Won event ClosedWon value 2500)
    expect(metaAdapter.uploadOfflineEvents).toHaveBeenCalled();
    const metaCallArgs = (metaAdapter.uploadOfflineEvents as jasmine.Spy).calls.mostRecent().args;
    const metaPayload = metaCallArgs[1];
    expect(metaPayload.length).toBe(1);
    expect(metaPayload[0].event_name).toBe('ClosedWon');
    expect(metaPayload[0].user_data.fbc).toBe('fb.1.1.FBCLID_CLOSED_WIN');
    expect(metaPayload[0].custom_data.value).toBe(2500);

    // 3. Verify DB sync status fields were updated
    const updatedLeads = await db.getCrmLeads('tenant-crm');
    const sqlLead = updatedLeads.find((l) => l.lead_id === 'lead-sql');
    const closedLead = updatedLeads.find((l) => l.lead_id === 'lead-closed');
    const prospectLead = updatedLeads.find((l) => l.lead_id === 'lead-prospect');

    expect(sqlLead).toBeDefined();
    expect(sqlLead!.google_synced_status).toBe('sql');
    expect(closedLead).toBeDefined();
    expect(closedLead!.meta_synced_status).toBe('closed_won');
    expect(prospectLead).toBeDefined();
    expect(prospectLead!.google_synced_status).toBeFalsy();

    // 4. Verify subsequent sync processes 0 new items
    const secondSyncRes = await syncEngine.syncLeads(
      'tenant-crm',
      googleAdapter,
      metaAdapter,
      'pixel-leads',
    );
    expect(secondSyncRes.googleSuccessCount).toBe(0);
    expect(secondSyncRes.metaSuccessCount).toBe(0);

    // 5. Test progression transition:
    // Transition Lead 2 (SQL) from 'sql' to 'closed_won' and increase its value to 5000
    sqlLead!.status = 'closed_won';
    sqlLead!.value = 5000;
    sqlLead!.updated_at = new Date().toISOString();
    await db.saveCrmLead(sqlLead!);

    const thirdSyncRes = await syncEngine.syncLeads(
      'tenant-crm',
      googleAdapter,
      metaAdapter,
      'pixel-leads',
    );

    expect(thirdSyncRes.googleSuccessCount).toBe(1); // lead-sql transitions to closed_won and syncs
    expect(thirdSyncRes.googleFailCount).toBe(0);

    const googleCallArgs2 = (googleAdapter.uploadConversionAdjustments as jasmine.Spy).calls.mostRecent().args;
    const googlePayload2 = googleCallArgs2[1];
    expect(googlePayload2[0].gclidDateTimePair.gclid).toBe('GCLID_SQL_WIN');
    expect(googlePayload2[0].restatementValue.adjustedValue).toBe(5000); // restated to 5000!

    const finalLeads = await db.getCrmLeads('tenant-crm');
    const finalSqlLead = finalLeads.find((l) => l.lead_id === 'lead-sql');
    expect(finalSqlLead!.google_synced_status).toBe('closed_won');
  });
});
