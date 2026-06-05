import {SupabaseClient, PendingJobEntry} from './supabase_client';
import {PoasCalculator} from './poas_calculator';
import {BrandSignal} from './agency_os_types';
import {PlatformAdapter} from './platform_adapter';
import {GovernanceEngine} from './governance_engine';

export class PoasScheduler {
  private pollingIntervalId: NodeJS.Timeout | null = null;
  private readonly adapters = new Map<string, PlatformAdapter>();
  private engine: GovernanceEngine | null = null;

  constructor(
    private readonly db: SupabaseClient,
    private readonly pollIntervalMs = 5 * 60 * 1000, // 5 minutes default
  ) {}

  registerAdapter(platform: string, adapter: PlatformAdapter) {
    this.adapters.set(platform, adapter);
  }

  registerGovernanceEngine(engine: GovernanceEngine) {
    this.engine = engine;
  }

  // Schedules the daily POAS job for a tenant if none exists
  async registerTenant(tenantId: string) {
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
          await this.executePoasDaily(job.tenant_id);

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

          // Delete old job
          await this.db.deletePendingJob(job.job_id);
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

          // 1. Hard delete all tenant data across all mock DB tables
          await this.db.hardDeleteTenantData(payload.orgId);

          // 2. Anonymize user details/actor tags in audit logs and governance events
          await this.db.anonymizeLogs(payload.orgId);

          // 3. Delete user logins, auth entries
          await this.db.deleteUser(payload.userId);
          await this.db.deleteOrg(payload.orgId);

          // 4. Delete the job itself
          await this.db.deletePendingJob(job.job_id);
        }
      } catch (err) {
        console.error(`Failed executing job ${job.job_id}:`, err);
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
  }
}
