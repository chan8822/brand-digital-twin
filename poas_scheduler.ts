import {BrandSignal} from './agency_os_types';
import {config} from './config';
import {CredentialVault} from './credential_vault';
import {GovernanceEngine} from './governance_engine';
import {Context} from './governance_types';
import {PinoLogger} from './observability';
import {PaymentProcessor, MockPaymentProcessor} from './payment_processor';
import {BankAdapter} from './bank_adapter';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {MetaAdsAdapter} from './meta_ads_adapter';
import {OfflineConversionsSync} from './offline_conversions_sync';
import {PlatformAdapter} from './platform_adapter';
import {PoasCalculator} from './poas_calculator';
import {RiskRadar} from './risk_radar';
import {SupabaseClient, PendingJobEntry} from './supabase_client';

export class PoasScheduler {
  private pollingIntervalId: NodeJS.Timeout | null = null;
  private readonly adapters = new Map<string, PlatformAdapter>();
  private engine: GovernanceEngine | null = null;
  private readonly logger = new PinoLogger(30, false);

  private readonly paymentProcessor: PaymentProcessor;

  constructor(
    private readonly db: SupabaseClient,
    private readonly pollIntervalMs = 5 * 60 * 1000, // 5 minutes default
    paymentProcessor?: PaymentProcessor,
  ) {
    this.paymentProcessor = paymentProcessor || new MockPaymentProcessor();
  }

  registerAdapter(platform: string, adapter: PlatformAdapter) {
    this.adapters.set(platform, adapter);
  }

  registerGovernanceEngine(engine: GovernanceEngine) {
    this.engine = engine;
  }

  // Schedules the daily POAS job and optionally billing trials for a tenant if none exists
  async registerTenant(tenantId: string, scheduleBilling = false) {
    const jobs = await this.db.getPendingJobs(tenantId);
    
    const hasDaily = jobs.some((j) => j.type === 'poas_daily');
    if (!hasDaily) {
      const job: PendingJobEntry = {
        job_id: `job-poas-daily-${tenantId}`,
        tenant_id: tenantId,
        type: 'poas_daily',
        action_id: null,
        run_at: new Date().toISOString(), // run immediately
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      await this.db.savePendingJob(job);
    }

    const hasLift = jobs.some((j) => j.type === 'lift_sync');
    if (!hasLift) {
      const job: PendingJobEntry = {
        job_id: `job-lift-sync-${tenantId}`,
        tenant_id: tenantId,
        type: 'lift_sync',
        action_id: null,
        run_at: new Date().toISOString(), // run immediately
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      await this.db.savePendingJob(job);
    }

    if (scheduleBilling) {
      const hasNudge = jobs.some((j) => j.type === 'billing_trial_nudge');
      if (!hasNudge) {
        const now = Date.now();
        const nudgeRunAt = new Date(now + 14 * 24 * 3600 * 1000).toISOString();
        await this.db.savePendingJob({
          job_id: `job-billing-nudge-${tenantId}-${now}`,
          tenant_id: tenantId,
          type: 'billing_trial_nudge',
          action_id: null,
          run_at: nudgeRunAt,
          payload: null,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
        
        const flipRunAt = new Date(now + 15 * 24 * 3600 * 1000).toISOString();
        await this.db.savePendingJob({
          job_id: `job-billing-flip-${tenantId}-${now}`,
          tenant_id: tenantId,
          type: 'billing_trial_flip',
          action_id: null,
          run_at: flipRunAt,
          payload: null,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  start() {
    if (this.pollingIntervalId) return;
    this.pollingIntervalId = setInterval(async () => {
      await this.pollAndExecute();
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
  }

  async pollAndExecute() {
    const now = Date.now();
    const ownerId = `scheduler-node-${Math.random().toString(36).substring(2, 7)}`;

    while (true) {
      const job = await this.db.claimNextOverdueJob(now, ownerId);
      if (!job) {
        break; // No more overdue jobs to claim
      }

      try {
        if (job.type === 'poas_daily') {
          let success = false;
          try {
            await this.executePoasDaily(job.tenant_id);
            success = true;
          } catch (err: any) {
            this.logger.error(`Failed executing daily POAS job ${job.job_id}:`, {
              error: err.message || String(err),
            });
            await this.db.updateJobStatus(job.job_id, 'failed');
          }

          // Reschedule for 24h later
          const nextRun = new Date(now + 24 * 3600 * 1000).toISOString();
          const nextJob: PendingJobEntry = {
            job_id: `job-poas-daily-${job.tenant_id}-${Date.now()}`,
            tenant_id: job.tenant_id,
            type: 'poas_daily',
            action_id: null,
            run_at: nextRun,
            payload: null,
            status: 'pending',
            created_at: new Date().toISOString(),
          };
          await this.db.savePendingJob(nextJob);

          if (success) {
            // Delete old job
            await this.db.deletePendingJob(job.job_id);
          }
        } else if (job.type === 'lift_sync') {
          let success = false;
          try {
            await this.executeLiftSync(job.tenant_id);
            success = true;
          } catch (err: any) {
            this.logger.error(`Failed executing lift sync job ${job.job_id}:`, {
              error: err.message || String(err),
            });
            await this.db.updateJobStatus(job.job_id, 'failed');
          }

          // Reschedule for 24h later
          const nextRun = new Date(now + 24 * 3600 * 1000).toISOString();
          const nextJob: PendingJobEntry = {
            job_id: `job-lift-sync-${job.tenant_id}-${Date.now()}`,
            tenant_id: job.tenant_id,
            type: 'lift_sync',
            action_id: null,
            run_at: nextRun,
            payload: null,
            status: 'pending',
            created_at: new Date().toISOString(),
          };
          await this.db.savePendingJob(nextJob);

          if (success) {
            await this.db.deletePendingJob(job.job_id);
          }
        } else if (job.type === 'settling_window') {
          const payload = job.payload;
          if (!payload || !payload.platform) {
            throw new Error(`Job ${job.job_id} payload is missing adapter platform`);
          }
          const adapter = this.adapters.get(payload.platform);
          if (!adapter) {
            throw new Error(`No platform adapter registered for platform '${payload.platform}'`);
          }

          if (!this.engine) {
            throw new Error(`GovernanceEngine is not registered on PoasScheduler`);
          }

          await this.engine.verifyPendingAction(job, adapter);

          // Delete job upon success
          await this.db.deletePendingJob(job.job_id);
        } else if (job.type === 'hard_delete_account') {
          const payload = job.payload;
          if (!payload || !payload.orgId || !payload.userId) {
            throw new Error(`Job ${job.job_id} payload is missing orgId or userId`);
          }

          // 1. Revoke and clean up credential secrets from secure vault and remote providers
          const vault = new CredentialVault(this.db, config.auth.masterKey);
          await vault.revokeAllCredentials(payload.orgId, this.db.isMockMode);

          // 2. Hard delete all tenant data across all mock DB tables
          await this.db.hardDeleteTenantData(payload.orgId);

          // 2. Anonymize user details/actor tags in audit logs and governance events
          await this.db.anonymizeLogs(payload.orgId);

          // 3. Delete user logins, auth entries
          await this.db.deleteUser(payload.userId);
          await this.db.deleteOrg(payload.orgId);

          // 4. Delete the job itself
          await this.db.deletePendingJob(job.job_id);
        } else if (job.type === 'billing_trial_nudge') {
          await this.executeBillingTrialNudge(job.tenant_id);
          await this.db.deletePendingJob(job.job_id);
        } else if (job.type === 'billing_trial_flip') {
          await this.executeBillingTrialFlip(job.tenant_id);
          await this.db.deletePendingJob(job.job_id);
        } else if (job.type === 'billing_charge_recurring') {
          await this.executeBillingChargeRecurring(job.tenant_id);
          await this.db.deletePendingJob(job.job_id);
        } else if (job.type === 'billing_dunning_retry') {
          await this.executeBillingDunningRetry(job.tenant_id, job.payload);
          await this.db.deletePendingJob(job.job_id);
        }
      } catch (err: any) {
        this.logger.error(`Failed executing job ${job.job_id}:`, {
          error: err.message || String(err),
        });
        await this.db.updateJobStatus(job.job_id, 'failed');
      }
    }
  }

  async executePoasDaily(tenantId: string) {
    const tenantDb = this.db.clone();
    tenantDb.setTenantContext(tenantId);
    
    const calcForTenant = new PoasCalculator(tenantDb);
    const reports = await calcForTenant.calculate(tenantId);

    // Scan reports for unprofitable campaigns
    const existingSignals = await tenantDb.getBrandSignals(tenantId);

    for (const report of reports) {
      const isActive = report.status === 'ENABLED' || report.status === 'active';
      if (report.poas !== null && report.poas < 1.0 && isActive) {
        const alreadySignaled = existingSignals.some(
          (s) => s.type === 'low_performance_roi' && s.payload['campaignId'] === report.campaignId
        );

        if (!alreadySignaled) {
          const signal: BrandSignal = {
            signalId: `sig-poas-${report.campaignId}-${Date.now()}`,
            tenantId: tenantId,
            source: 'ads',
            type: 'low_performance_roi',
            severity: 'high',
            message: `Campaign '${report.campaignName}' has unprofitable POAS of ${report.poas} (ROAS may look fine but COGS/refunds eating margin).`,
            payload: {
              campaignId: report.campaignId,
              poas: report.poas,
              spend: report.spend,
            },
            timestamp: Date.now(),
          };
          await tenantDb.saveBrandSignal(signal);
        }
      }
    }

    // Sync offline conversions (gross profit restatements) to ad platforms
    const googleAdapter = this.adapters.get('google') as GoogleAdsAdapter;
    const metaAdapter = this.adapters.get('meta') as MetaAdsAdapter;

    if (googleAdapter && metaAdapter) {
      const credentials = await tenantDb.getCredentials(tenantId).catch(() => []);
      const metaPixelCred = credentials.find(c => c.platform === 'meta_pixel');
      const metaPixelId = metaPixelCred?.credential_key || 'mock-pixel-id';

      const sync = new OfflineConversionsSync(tenantDb);
      try {
        const res = await sync.syncConversions(tenantId, googleAdapter, metaAdapter, metaPixelId);
        this.logger.info(`Conversions offline sync completed for tenant ${tenantId}`, {
          googleSuccess: res.googleSuccessCount,
          metaSuccess: res.metaSuccessCount,
        });
      } catch (err: any) {
        this.logger.error(`Conversions offline sync failed for tenant ${tenantId}:`, {
          error: err.message || String(err),
        });
      }
    }
  }

  private async executeBillingTrialNudge(tenantId: string) {
    const sub = await this.db.getSubscription(tenantId);
    if (!sub || sub.status !== 'trial') return;

    const tenantDb = this.db.clone();
    tenantDb.setTenantContext(tenantId);
    
    if (!this.engine) {
      throw new Error(`GovernanceEngine is not registered on PoasScheduler`);
    }
    const googleAdapter = this.adapters.get('google') as GoogleAdsAdapter;
    if (!googleAdapter) {
      throw new Error(`GoogleAdsAdapter is not registered on PoasScheduler`);
    }

    const radar = new RiskRadar(this.engine, googleAdapter, tenantDb, tenantId);
    const ctx: Context = {
      tenant: {
        tenantId,
        policy: {
          maxDailyDollarsRisk: 1000,
          maxBudgetMovePct: 0.2,
          minConfidence: 0.85,
          escalationRole: 'cmo',
        },
      },
      role: {name: 'admin', permits: () => true},
      verifyWindowMs: 0,
    };

    const calcForTenant = new PoasCalculator(tenantDb);
    const reports = await calcForTenant.calculate(tenantId);

    const mockBankAdapter: BankAdapter = {
      platform: 'mock_bank',
      schemaVersion: 'v1',
      getConsentedBalances: async () => [],
      calculateRunwayMonths: async () => 10,
    };

    let dollarDrag = 0;
    let criticalCount = 0;
    try {
      const findings = [
        ...(await radar.scanConversionTracking(ctx)),
        ...(await radar.scanCheckoutEvents(ctx)),
        ...(await radar.scanROIEfficiency(ctx)),
        ...(await radar.scanFinancialRunway(ctx, mockBankAdapter, 1000)),
        ...(await radar.scanBudgetCappedWinners(ctx, reports)),
        ...(await radar.scanStockouts(ctx)),
      ];
      dollarDrag = findings.reduce((sum, f) => sum + f.dollarImpact, 0);
      criticalCount = findings.filter(f => f.severity === 'CRITICAL').length;
    } catch (err: any) {
      this.logger.error(`Failed to scan findings for trial nudge:`, {
        error: err.message || String(err),
      });
    }

    await this.db.logActivity({
      eventId: `act-bill-nudge-${Date.now()}`,
      orgId: tenantId,
      actorId: 'billing-system',
      actionType: 'billing_trial_nudge',
      entityType: 'subscription',
      entityId: tenantId,
      summary: `Trial ending soon. Potential profit drag: $${dollarDrag} across ${criticalCount} critical issues. Upgrade to unlock auto-healing.`,
      isRead: false,
      tenantId,
      createdAt: Date.now(),
    });

    this.logger.info(`Sent trial nudge for tenant ${tenantId}. Drag: $${dollarDrag}, Criticals: ${criticalCount}`);
  }

  private async executeBillingTrialFlip(tenantId: string) {
    const sub = await this.db.getSubscription(tenantId);
    if (!sub || sub.status !== 'trial') return;

    sub.status = 'suggest_amount';
    sub.updated_at = new Date().toISOString();
    await this.db.saveSubscription(sub);

    await this.db.logActivity({
      eventId: `act-bill-flip-${Date.now()}`,
      orgId: tenantId,
      actorId: 'billing-system',
      actionType: 'billing_trial_flipped',
      entityType: 'subscription',
      entityId: tenantId,
      summary: `Trial expired. Subscription transitioned to 'suggest_amount'.`,
      isRead: false,
      tenantId,
      createdAt: Date.now(),
    });

    this.logger.info(`Flipped trial to suggest_amount for tenant ${tenantId}`);
  }

  private async executeBillingChargeRecurring(tenantId: string) {
    const sub = await this.db.getSubscription(tenantId);
    if (!sub || (sub.status !== 'active' && sub.status !== 'past_due')) return;

    const amount = sub.amount || 499;
    const res = await this.paymentProcessor.chargeOnFile(tenantId, amount);

    if (res.success) {
      sub.status = 'active';
      const now = Date.now();
      sub.next_charge_at = new Date(now + 30 * 24 * 3600 * 1000).toISOString();
      sub.updated_at = new Date().toISOString();
      await this.db.saveSubscription(sub);

      await this.db.saveReceipt({
        receipt_id: `rcpt-rec-${tenantId}-${Date.now()}`,
        org_id: tenantId,
        amount: amount,
        currency: sub.currency || 'USD',
        receipt_url: res.receiptUrl || '',
        charged_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      await this.db.logActivity({
        eventId: `act-bill-charge-success-${Date.now()}`,
        orgId: tenantId,
        actorId: 'billing-system',
        actionType: 'billing_charge_success',
        entityType: 'subscription',
        entityId: tenantId,
        summary: `Successfully charged recurring payment of $${amount}. Receipt: ${res.receiptUrl || 'N/A'}`,
        isRead: false,
        tenantId,
        createdAt: Date.now(),
      });

      await this.db.savePendingJob({
        job_id: `job-billing-charge-${tenantId}-${Date.now()}`,
        tenant_id: tenantId,
        type: 'billing_charge_recurring',
        action_id: null,
        run_at: sub.next_charge_at,
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      this.logger.info(`Charged recurring payment for tenant ${tenantId}: $${amount}`);
    } else {
      sub.status = 'past_due';
      sub.updated_at = new Date().toISOString();
      await this.db.saveSubscription(sub);

      await this.db.logActivity({
        eventId: `act-bill-charge-fail-${Date.now()}`,
        orgId: tenantId,
        actorId: 'billing-system',
        actionType: 'billing_charge_failed',
        entityType: 'subscription',
        entityId: tenantId,
        summary: `Recurring charge of $${amount} failed. Subscription is now 'past_due'. Retrying in 1 day.`,
        isRead: false,
        tenantId,
        createdAt: Date.now(),
      });

      const retryRunAt = new Date(Date.now() + 1 * 24 * 3600 * 1000).toISOString();
      await this.db.savePendingJob({
        job_id: `job-billing-retry-${tenantId}-${Date.now()}`,
        tenant_id: tenantId,
        type: 'billing_dunning_retry',
        action_id: null,
        run_at: retryRunAt,
        payload: {retryCount: 1},
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      this.logger.warn(`Recurring charge failed for tenant ${tenantId}. Flipped to past_due.`);
    }
  }

  private async executeBillingDunningRetry(tenantId: string, payload: any) {
    const retryCount = payload?.retryCount || 1;
    const sub = await this.db.getSubscription(tenantId);
    if (!sub || sub.status !== 'past_due') return;

    const amount = sub.amount || 499;
    const res = await this.paymentProcessor.chargeOnFile(tenantId, amount);

    if (res.success) {
      sub.status = 'active';
      const now = Date.now();
      sub.next_charge_at = new Date(now + 30 * 24 * 3600 * 1000).toISOString();
      sub.updated_at = new Date().toISOString();
      await this.db.saveSubscription(sub);

      await this.db.saveReceipt({
        receipt_id: `rcpt-dun-${tenantId}-${Date.now()}`,
        org_id: tenantId,
        amount: amount,
        currency: sub.currency || 'USD',
        receipt_url: res.receiptUrl || '',
        charged_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      await this.db.logActivity({
        eventId: `act-bill-retry-success-${Date.now()}`,
        orgId: tenantId,
        actorId: 'billing-system',
        actionType: 'billing_charge_success',
        entityType: 'subscription',
        entityId: tenantId,
        summary: `Dunning retry ${retryCount} succeeded. Charged $${amount}. Subscription active.`,
        isRead: false,
        tenantId,
        createdAt: Date.now(),
      });

      await this.db.savePendingJob({
        job_id: `job-billing-charge-${tenantId}-${Date.now()}`,
        tenant_id: tenantId,
        type: 'billing_charge_recurring',
        action_id: null,
        run_at: sub.next_charge_at,
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      this.logger.info(`Dunning retry ${retryCount} succeeded for tenant ${tenantId}`);
    } else {
      if (retryCount < 3) {
        const nextRetry = retryCount + 1;
        const delayDays = nextRetry === 2 ? 2 : 4;
        const retryRunAt = new Date(Date.now() + delayDays * 24 * 3600 * 1000).toISOString();

        await this.db.logActivity({
          eventId: `act-bill-retry-fail-${nextRetry}-${Date.now()}`,
          orgId: tenantId,
          actorId: 'billing-system',
          actionType: 'billing_charge_failed',
          entityType: 'subscription',
          entityId: tenantId,
          summary: `Dunning retry ${retryCount} failed. Scheduling retry ${nextRetry} in ${delayDays} days.`,
          isRead: false,
          tenantId,
          createdAt: Date.now(),
        });

        await this.db.savePendingJob({
          job_id: `job-billing-retry-${tenantId}-${Date.now()}`,
          tenant_id: tenantId,
          type: 'billing_dunning_retry',
          action_id: null,
          run_at: retryRunAt,
          payload: {retryCount: nextRetry},
          status: 'pending',
          created_at: new Date().toISOString(),
        });

        this.logger.warn(`Dunning retry ${retryCount} failed for tenant ${tenantId}. Scheduled retry ${nextRetry}.`);
      } else {
        sub.status = 'suspended';
        sub.updated_at = new Date().toISOString();
        await this.db.saveSubscription(sub);

        await this.db.logActivity({
          eventId: `act-bill-suspended-${Date.now()}`,
          orgId: tenantId,
          actorId: 'billing-system',
          actionType: 'billing_suspended',
          entityType: 'subscription',
          entityId: tenantId,
          summary: `All 3 dunning retries failed. Subscription is now 'suspended'. Autonomous actions disabled.`,
          isRead: false,
          tenantId,
          createdAt: Date.now(),
        });

        this.logger.error(`All dunning retries failed for tenant ${tenantId}. Subscription SUSPENDED.`);
      }
    }
  }

  async executeLiftSync(tenantId: string) {
    const tenantDb = this.db.clone();
    tenantDb.setTenantContext(tenantId);

    const calcForTenant = new PoasCalculator(tenantDb);
    const reports = await calcForTenant.calculate(tenantId);

    let treatmentMargin = 0;
    let treatmentSpend = 0;
    let holdoutMargin = 0;
    let holdoutSpend = 0;

    for (const r of reports) {
      if (r.campaignId === 'ORGANIC') continue;
      if (r.campaignName.toLowerCase().includes('holdout')) {
        holdoutMargin += r.contributionMargin;
        holdoutSpend += r.spend;
      } else {
        treatmentMargin += r.contributionMargin;
        treatmentSpend += r.spend;
      }
    }

    const treatmentPoas = treatmentSpend > 0 ? treatmentMargin / treatmentSpend : 0;
    const holdoutPoas = holdoutSpend > 0 ? holdoutMargin / holdoutSpend : 0;

    const lift = holdoutPoas === 0 ? 0 : (treatmentPoas - holdoutPoas) / holdoutPoas;

    await tenantDb.saveTenantLift({
      tenant_id: tenantId,
      lift: Math.round(lift * 100) / 100,
      treatment_poas: Math.round(treatmentPoas * 100) / 100,
      holdout_poas: Math.round(holdoutPoas * 100) / 100,
      computed_at: new Date().toISOString(),
    });

    this.logger.info(`Computed lift for tenant ${tenantId}: ${lift.toFixed(2)} (Treatment POAS: ${treatmentPoas.toFixed(2)}, Holdout POAS: ${holdoutPoas.toFixed(2)})`);
  }
}
