import {PoasScheduler} from './poas_scheduler';
import {SupabaseClient} from './supabase_client';

describe('PoasScheduler', () => {
  let db: SupabaseClient;
  let scheduler: PoasScheduler;
  const tenantId = 'tenant-sched-test';

  beforeEach(async () => {
    SupabaseClient.useSharedMockDb = true;
    SupabaseClient.resetGlobalMockDb();

    db = new SupabaseClient('https://mock.supabase.co', 'mock-key', true);
    db.setTenantContext(tenantId);
    scheduler = new PoasScheduler(db, 1000);

    // Clear db collections
    await db.clearCampaigns(tenantId);
    
    // Seed Client to ensure tenant is picked up by getAllTenants
    await db.saveClient({
      clientId: 'client-1',
      orgId: `org-${tenantId}`,
      name: 'Test Client',
      tenantId: tenantId,
      healthScore: 100,
      churnRisk: 0.0,
      marginTarget: 0.4,
      mrr: 5000,
    });

    // Seed campaigns
    // Campaign 1: Unprofitable (POAS < 1.0)
    await db.saveCampaign({
      campaign_id: 'c-unprofit',
      tenant_id: tenantId,
      name: 'Unprofitable Meta Ads',
      platform: 'meta',
      objective: 'CONVERSIONS',
      status: 'ENABLED',
      surface: 'meta_ads',
      source_id: 'c-unprofit',
      source_system: 'meta',
      source_version: 'v18',
      ingested_at: new Date().toISOString(),
    });

    // Campaign 2: Profitable (POAS >= 1.0)
    await db.saveCampaign({
      campaign_id: 'c-profit',
      tenant_id: tenantId,
      name: 'Profitable Google Ads',
      platform: 'google',
      objective: 'SEARCH',
      status: 'ENABLED',
      surface: 'google_search',
      source_id: 'c-profit',
      source_system: 'google',
      source_version: 'v15',
      ingested_at: new Date().toISOString(),
    });

    // Seed spend
    await db.saveSpendFact({
      campaign_id: 'c-unprofit',
      platform: 'meta',
      day: '2026-06-05',
      amount: 1000,
      currency: 'USD',
      tenant_id: tenantId,
      source_system: 'meta',
      ingested_at: new Date().toISOString(),
    });
    await db.saveSpendFact({
      campaign_id: 'c-profit',
      platform: 'google',
      day: '2026-06-05',
      amount: 500,
      currency: 'USD',
      tenant_id: tenantId,
      source_system: 'google',
      ingested_at: new Date().toISOString(),
    });

    // Seed orders & order lines
    await db.saveOrder({
      order_id: 'o1',
      customer_id: 'cust1',
      account_id: null,
      channel: 'online',
      surface: 'shopify',
      placed_at: new Date().toISOString(),
      currency: 'USD',
      gross_revenue: 1200,
      total_discounts: 0,
      total_tax: 0,
      shipping_charged: 0,
      status: 'PAID',
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'o1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });
    await db.saveOrderLine({
      order_line_id: 'ol1',
      order_id: 'o1',
      variant_id: 'v1',
      sku: 'SKU1',
      qty: 1,
      unit_price: 1200,
      line_discount: 0,
      unit_cost: 1000, // COGS is $1000
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });
    await db.saveTouchpoint({
      touchpoint_id: 'tp1',
      customer_id: 'cust1',
      campaign_id: 'c-unprofit',
      order_id: 'o1',
      occurred_at: new Date(Date.now() - 1000).toISOString(),
      type: 'click',
      tenant_id: tenantId,
      source_system: 'meta',
      ingested_at: new Date().toISOString(),
    });

    await db.saveOrder({
      order_id: 'o2',
      customer_id: 'cust2',
      account_id: null,
      channel: 'online',
      surface: 'shopify',
      placed_at: new Date().toISOString(),
      currency: 'USD',
      gross_revenue: 1500,
      total_discounts: 0,
      total_tax: 0,
      shipping_charged: 0,
      status: 'PAID',
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'o2',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });
    await db.saveOrderLine({
      order_line_id: 'ol2',
      order_id: 'o2',
      variant_id: 'v2',
      sku: 'SKU2',
      qty: 1,
      unit_price: 1500,
      line_discount: 0,
      unit_cost: 500, // COGS is $500
      tenant_id: tenantId,
      source_system: 'shopify',
      source_id: 'ol2',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });
    await db.saveTouchpoint({
      touchpoint_id: 'tp2',
      customer_id: 'cust2',
      campaign_id: 'c-profit',
      order_id: 'o2',
      occurred_at: new Date(Date.now() - 1000).toISOString(),
      type: 'click',
      tenant_id: tenantId,
      source_system: 'google',
      ingested_at: new Date().toISOString(),
    });
  });

  afterEach(() => {
    SupabaseClient.useSharedMockDb = false;
  });

  it('should schedule, run, reschedule, and flag unprofitable campaigns', async () => {
    // 1. Register tenant to create initial daily job
    await scheduler.registerTenant(tenantId);
    let jobs = await db.getPendingJobs(tenantId);
    expect(jobs.length).toBe(1);
    expect(jobs[0].type).toBe('poas_daily');
    expect(jobs[0].status).toBe('pending');

    // 2. Run the polling queue execution
    await scheduler.pollAndExecute();

    // 3. Verify unprofitable campaign has brand signal
    const signals = await db.getBrandSignals(tenantId);
    const lowPerfSignals = signals.filter((s) => s.type === 'low_performance_roi');
    expect(lowPerfSignals.length).toBe(1);
    expect(lowPerfSignals[0].payload['campaignId']).toBe('c-unprofit');

    // 4. Verify original job is rescheduled in future (24 hours from now)
    jobs = await db.getPendingJobs(tenantId);
    expect(jobs.length).toBe(1);
    expect(jobs[0].status).toBe('pending');
    expect(Date.parse(jobs[0].run_at)).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);

    // 5. Subsequent immediate run does not execute (no new signals, no duplicate jobs)
    await scheduler.pollAndExecute();
    const consecutiveJobs = await db.getPendingJobs(tenantId);
    expect(consecutiveJobs.length).toBe(1);
    expect(consecutiveJobs[0].job_id).toBe(jobs[0].job_id); // unchanged
  });

  it('should not duplicate signals on consecutive runs', async () => {
    await scheduler.registerTenant(tenantId);
    await scheduler.pollAndExecute();
    let signals = await db.getBrandSignals(tenantId);
    expect(signals.filter((s) => s.type === 'low_performance_roi').length).toBe(1);

    // Force run another job by manually saving one that is overdue
    const forceOverdueJob = {
      job_id: `job-poas-force-${Date.now()}`,
      tenant_id: tenantId,
      type: 'poas_daily' as const,
      action_id: null,
      run_at: new Date(Date.now() - 1000).toISOString(),
      payload: null,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
    };
    await db.savePendingJob(forceOverdueJob);

    await scheduler.pollAndExecute();
    signals = await db.getBrandSignals(tenantId);
    // Should still have only 1 signal because alreadySignaled guard matches the campaign ID
    expect(signals.filter((s) => s.type === 'low_performance_roi').length).toBe(1);
  });

  it('should split multiple overdue jobs across concurrent scheduler nodes without double-execution', async () => {
    const schedulerA = new PoasScheduler(db, 1000);
    const schedulerB = new PoasScheduler(db, 1000);

    const tenants = ['tenant-1', 'tenant-2', 'tenant-3', 'tenant-4'];
    db.setTenantContext(null);

    // Clear all pending jobs first
    (db as any).mockPendingJobs = [];

    for (const t of tenants) {
      await db.saveClient({
        clientId: `client-${t}`,
        orgId: `org-${t}`,
        name: `Client ${t}`,
        tenantId: t,
        healthScore: 100,
        churnRisk: 0.0,
        marginTarget: 0.4,
        mrr: 5000,
      });

      const job = {
        job_id: `job-poas-${t}`,
        tenant_id: t,
        type: 'poas_daily' as const,
        action_id: null,
        run_at: new Date(Date.now() - 5000).toISOString(),
        payload: null,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
      };
      await db.savePendingJob(job);
    }

    await Promise.all([
      schedulerA.pollAndExecute(),
      schedulerB.pollAndExecute(),
    ]);

    const rawJobs = (db as any).mockPendingJobs;
    expect(rawJobs.length).toBe(4);
    for (const job of rawJobs) {
      expect(job.status).toBe('pending');
      expect(Date.parse(job.run_at)).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    }
  });
});
