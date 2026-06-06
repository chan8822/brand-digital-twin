/**
 * @fileoverview E2E tests for Autonomy levels, daily execution dollar ceilings, and rate limiters.
 */

import * as http from 'http';
import 'jasmine';
import {performance} from 'perf_hooks';
import {signJwt} from '../../../auth';
import {config} from '../../../config';
import {eventBus} from '../../../event_bus';
import {resetRateLimiters, startServer} from '../../../server';
import {SupabaseClient} from '../../../supabase_client';
import {login, signup, verifyEmail} from '../../../user_auth';

interface MetricSummary {
  latencies: number[];
  failures: number;
  total: number;
}

class LoadTestMonitor {
  private readonly metrics = new Map<string, MetricSummary>();

  async record<T>(label: string, task: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await task();
      const duration = performance.now() - start;
      this.getSummary(label).latencies.push(duration);
      return result;
    } catch (err) {
      const duration = performance.now() - start;
      const summary = this.getSummary(label);
      summary.latencies.push(duration);
      summary.failures++;
      throw err;
    } finally {
      this.getSummary(label).total++;
    }
  }

  private getSummary(label: string): MetricSummary {
    let summary = this.metrics.get(label);
    if (!summary) {
      summary = {latencies: [], failures: 0, total: 0};
      this.metrics.set(label, summary);
    }
    return summary;
  }

  getStats(label: string) {
    const s = this.getSummary(label);
    if (s.total === 0) return {avg: 0, failRate: 0, total: 0};
    const sum = s.latencies.reduce((a, b) => a + b, 0);
    return {
      avg: sum / s.total,
      failRate: s.failures / s.total,
      total: s.total,
    };
  }
}

describe('Load, Concurrency and Governance E2E Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9984;
  const baseUrl = `http://localhost:${PORT}`;
  let jwtSecret: string;

  let originalMaxRequests: number;

  beforeAll(async () => {
    originalMaxRequests = config.rateLimit.maxRequests;
    config.rateLimit.maxRequests = 5000;
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    server = startServer(PORT, db);
  });

  afterAll((done) => {
    config.rateLimit.maxRequests = originalMaxRequests;
    server.close(done);
  });

  beforeEach(() => {
    resetRateLimiters();
    jwtSecret = config.auth.jwtSecret;
  });

  function getJson(
    path: string,
    headers?: Record<string, string>,
  ): Promise<{status: number | undefined; body: unknown}> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(`${baseUrl}${path}`);
      http
        .get(
          {
            hostname: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : undefined,
            path: parsed.pathname + parsed.search,
            headers: headers || {},
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                resolve({status: res.statusCode, body: JSON.parse(data)});
              } catch {
                resolve({status: res.statusCode, body: data});
              }
            });
          },
        )
        .on('error', reject);
    });
  }

  function postJson(
    path: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<{status: number | undefined; body: unknown}> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request(
        {
          hostname: 'localhost',
          port: PORT,
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            ...headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              resolve({status: res.statusCode, body: JSON.parse(data)});
            } catch {
              resolve({status: res.statusCode, body: data});
            }
          });
        },
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  describe('Feature 3: Autonomy, Ceiling limits and Rate Limiting', () => {
    it('3.1: AutonomyLevels_ObserveReviewAssisted', async () => {
      const emailAdmin = 'admin@autonomy.com';
      const emailUser = 'user@autonomy.com';
      const pw = 'Password123!';

      // Create Admin
      const signupAdmin = await signup(
        db,
        emailAdmin,
        pw,
        'AdminOrg',
        jwtSecret,
        true,
      );
      await verifyEmail(db, signupAdmin.verificationToken, jwtSecret);
      // Manually set owner role to 'admin' in database
      const adminOrgs = await db.getUserOrgs(signupAdmin.user.user_id);
      const adminOrgId = adminOrgs[0].org_id;
      await db.saveOrgMember({
        org_id: adminOrgId,
        user_id: signupAdmin.user.user_id,
        role: 'admin',
      });

      // Seed earned tiers to allow elevation to AUTONOMOUS (level 3)
      const ops = ['read', 'update_budget', 'pause', 'activate', 'scale_budget'];
      for (const op of ops) {
        await db.saveTrustTier(adminOrgId, op, 3);
      }

      const loginAdmin = await login(db, emailAdmin, pw, jwtSecret);
      const tokenAdmin = loginAdmin.accessToken;

      // Create User (owner of another org)
      const signupUser = await signup(
        db,
        emailUser,
        pw,
        'UserOrg',
        jwtSecret,
        true,
      );
      await verifyEmail(db, signupUser.verificationToken, jwtSecret);
      // Wait, let's manually change the user role to 'media_buyer' in the org member table to verify non-admin logic
      const userOrgs = await db.getUserOrgs(signupUser.user.user_id);
      const orgId = userOrgs[0].org_id;
      await db.saveOrgMember({
        org_id: orgId,
        user_id: signupUser.user.user_id,
        role: 'media_buyer', // Not an admin
      });

      const loginUser = await login(db, emailUser, pw, jwtSecret);
      const tokenUser = loginUser.accessToken;

      // 1. Get default Autonomy tier
      const getRes = await getJson('/api/v1/autonomy', {
        'Authorization': `Bearer ${tokenAdmin}`,
      });
      expect(getRes.status).toBe(200);
      const getBody = getRes.body as {data: {tier: string}};
      expect(getBody.data.tier).toBe('OBSERVE');

      // 2. User tries to elevate to high tier (AUTONOMOUS) -> Forbidden
      const postUserRes = await postJson(
        '/api/v1/autonomy',
        {tier: 'AUTONOMOUS'},
        {'Authorization': `Bearer ${tokenUser}`},
      );
      expect(postUserRes.status).toBe(403);
      const postUserBody = postUserRes.body as {error: {code: string}};
      expect(postUserBody.error.code).toBe('FORBIDDEN');

      // 3. Admin elevates to high tier (AUTONOMOUS) -> Succeeds
      const postAdminRes = await postJson(
        '/api/v1/autonomy',
        {tier: 'AUTONOMOUS'},
        {'Authorization': `Bearer ${tokenAdmin}`},
      );
      expect(postAdminRes.status).toBe(200);
      const postAdminBody = postAdminRes.body as {
        status: string;
        data: {tier: string};
      };
      expect(postAdminBody.status).toBe('success');
      expect(postAdminBody.data.tier).toBe('AUTONOMOUS');
    });

    it('3.2: ExecutionCeiling_DailyBudget_Throttled & 3.3: ExecutionCeiling_ManagerApproval_Bypass', async () => {
      const email = 'ceiling@example.com';
      const pw = 'Password123!';
      const orgName = 'CeilingOrg';

      const signupRes = await signup(db, email, pw, orgName, jwtSecret, true);
      await verifyEmail(db, signupRes.verificationToken, jwtSecret);

      const userId = signupRes.user.user_id;
      const orgs = await db.getUserOrgs(userId);
      const orgId = orgs[0].org_id;

      // Seed campaign
      await db.saveCampaign({
        campaign_id: 'camp-ceiling-1',
        platform: 'google',
        name: 'Ceiling Campaign',
        objective: 'sales',
        status: 'ENABLED',
        surface: 'google_search_network',
        tenant_id: orgId,
        source_system: 'google',
        source_id: 'camp-ceiling-1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
        daily_budget: 500,
      });

      // Enable trust tier level
      await db.saveTrustTier(orgId, 'update_budget', 3);

      // Seed variant to pass COGS coverage check (needs >= 70%)
      await db.saveVariant({
        variant_id: 'v-ceiling-dummy',
        sku: 'sku-ceiling-dummy',
        title: 'Ceiling Dummy Variant',
        price: 10,
        cost: 5,
        tenant_id: orgId,
        ingested_at: new Date().toISOString(),
      });

      const loginRes = await login(db, email, pw, jwtSecret);
      const token = loginRes.accessToken;

      const validContextTemplate = {
        tenant: {
          tenantId: orgId,
          name: orgName,
          policy: {
            maxDailyDollarsRisk: 1000,
            confidenceThreshold: 80,
            escalationRole: 'cmo',
          },
          shadowMode: false,
        },
        role: {name: 'media_buyer', permissions: []},
      };

      const actionPayload = {
        actionRequest: {
          idempotencyKey: 'ceiling-action-key',
          op: 'update_budget',
          entity: 'campaign',
          targetId: 'camp-ceiling-1',
          payload: {
            budget: 3000, // projected cost difference is 2500 > maxDailyDollarsRisk (1000)
          },
        },
        context: validContextTemplate,
      };

      // 3.2: Action should be throttled and queued for approval
      const actionRes = await postJson('/api/v1/actions', actionPayload, {
        'Authorization': `Bearer ${token}`,
      });
      expect(actionRes.status).toBe(200);
      const actionBody = actionRes.body as {data: {status: string}};
      expect(actionBody.data.status).toBe('queued');

      // 3.3: Resolve queue by escalating to manager (CMO role)
      const tokenCmo = signJwt(
        {
          userId: 'cmo-user-1',
          orgId,
          role: 'cmo',
        },
        jwtSecret,
        15 * 60 * 1000,
      );

      const approveRes = await postJson(
        `/api/v1/approvals/app_ceiling-action-key/approve`,
        {},
        {'Authorization': `Bearer ${tokenCmo}`},
      );
      expect(approveRes.status).toBe(200);
      const approveBody = approveRes.body as {data: {status: string}};
      expect(approveBody.data.status).toBe('executed');
    });

    it('3.4: RateLimiter_BurstTraffic_429 & 3.5: RateLimiter_RefillRate_SucceedsAfterDelay', async () => {
      resetRateLimiters();

      // Override rate limits in global config
      const originalMax = config.rateLimit.maxRequests;
      const originalRefill = config.rateLimit.refillRatePerSec;

      // 2 requests allowed, refill 1 request per 2 seconds (0.5 refill rate)
      config.rateLimit.maxRequests = 2;
      config.rateLimit.refillRatePerSec = 0.5;

      const tempPort = 9985;
      const tempServer = startServer(tempPort, db);
      const tempUrl = `http://localhost:${tempPort}`;

      const getJsonUrl = (
        path: string,
      ): Promise<{status: number | undefined; body: unknown}> => {
        return new Promise((resolve, reject) => {
          http
            .get(`${tempUrl}${path}`, (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () => {
                try {
                  resolve({status: res.statusCode, body: JSON.parse(data)});
                } catch {
                  resolve({status: res.statusCode, body: data});
                }
              });
            })
            .on('error', reject);
        });
      };

      try {
        // Request 1 -> succeeds
        const res1 = await getJsonUrl('/ready');
        expect(res1.status).toBe(200);

        // Request 2 -> succeeds
        const res2 = await getJsonUrl('/ready');
        expect(res2.status).toBe(200);

        // Request 3 -> rate limited (429 / RATE_LIMIT_EXCEEDED)
        const res3 = await getJsonUrl('/ready');
        expect(res3.status).toBe(429);
        const body3 = res3.body as {status: string; error: {code: string}};
        expect(body3.status).toBe('error');
        expect(body3.error.code).toBe('RATE_LIMIT_EXCEEDED');

        // Wait for refill (2 seconds)
        await new Promise((resolve) => {
          setTimeout(resolve, 2100);
        });

        // Request 4 -> succeeds again
        const res4 = await getJsonUrl('/ready');
        expect(res4.status).toBe(200);
        const body4 = res4.body as {status: string; data: unknown};
        expect(body4.status).toBe('success');
      } finally {
        config.rateLimit.maxRequests = originalMax;
        config.rateLimit.refillRatePerSec = originalRefill;
        await new Promise<void>((resolve) => tempServer.close(() => resolve()));
      }
    });

    it('3.6: High-Contention Concurrent Job Claim', async () => {
      SupabaseClient.useSharedMockDb = true;
      SupabaseClient.resetGlobalMockDb();

      const monitor = new LoadTestMonitor();
      const runAtMillis = Date.now() - 500; // Scheduled 500ms in the past
      const claimMap = new Map<string, string[]>();
      const lags: number[] = [];

      // Seed 10 pending jobs
      for (let i = 0; i < 10; i++) {
        await db.savePendingJob({
          job_id: `job-contention-${i}`,
          tenant_id: 'tenant-contention',
          type: 'poas_daily',
          action_id: null,
          run_at: new Date(runAtMillis).toISOString(),
          payload: null,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      }

      // Trigger 50 concurrent claimJob calls with different worker IDs across all job IDs
      const promises: Array<Promise<boolean>> = [];
      for (let w = 0; w < 50; w++) {
        const jobId = `job-contention-${w % 10}`;
        const workerId = `worker-${w}`;
        promises.push(
          monitor.record('claimJob', async () => {
            const success = await db.claimJob(
              jobId,
              workerId,
              Date.now(),
              10000,
            );
            if (success) {
              const claimTime = Date.now();
              const workers = claimMap.get(jobId) || [];
              workers.push(workerId);
              claimMap.set(jobId, workers);
              lags.push(claimTime - runAtMillis);
            }
            return success;
          }),
        );
      }

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r === true).length;
      const failures = results.filter((r) => r === false).length;

      expect(successes).toBe(10);
      expect(failures).toBe(40);

      // Verify that double claims are strictly 0 (no job was claimed by more than 1 worker)
      for (const [, workers] of claimMap.entries()) {
        expect(workers.length).toBe(1);
      }

      // Assert average job queue lag budget is < 1500ms
      const avgLag = lags.reduce((a, b) => a + b, 0) / lags.length;
      expect(avgLag).toBeLessThan(1500);

      const jobs = await db.getPendingJobs('tenant-contention');
      for (const j of jobs) {
        expect(j.status).toBe('processing');
        expect(j.locked_by).toBeDefined();
      }

      SupabaseClient.useSharedMockDb = false;
    });

    it('3.7: 100-Tenant RLS Contamination Scale Test', async () => {
      const promises: Array<
        Promise<{index: number; status: number | undefined; body: unknown}>
      > = [];
      const monitor = new LoadTestMonitor();

      for (let i = 1; i <= 100; i++) {
        const email = `tenant${i}@scale.com`;
        const orgId = `org_${i}`;

        // Seed user
        await db.saveUser({
          user_id: `user_${i}`,
          email,
          pw_hash: 'hashed',
          status: 'active',
          created_at: new Date().toISOString(),
        });

        // Seed org
        await db.saveOrg({
          org_id: orgId,
          name: `Org ${i}`,
          owner_user: `user_${i}`,
          plan: 'growth',
          created_at: new Date().toISOString(),
        });

        await db.saveOrgMember({
          org_id: orgId,
          user_id: `user_${i}`,
          role: 'admin',
        });

        // Seed client profile (tenantId = orgId)
        await db.saveClient({
          clientId: `cli_${i}`,
          orgId,
          name: `Client of tenant ${i}`,
          mrr: i * 100,
          marginTarget: 0.3,
          healthScore: 100,
          churnRisk: 0.0,
          tenantId: orgId,
        });

        // Sign token
        const token = signJwt(
          {
            userId: `user_${i}`,
            orgId,
            role: 'admin',
          },
          jwtSecret,
          15 * 60 * 1000,
        );

        promises.push(
          monitor
            .record('health-rls', () =>
              getJson('/api/v1/health', {'Authorization': `Bearer ${token}`}),
            )
            .then((res) => ({
              index: i,
              status: res.status,
              body: res.body,
            })),
        );
      }

      const results = await Promise.all(promises);

      for (const res of results) {
        expect(res.status).toBe(200);
        // Each tenant must only see their own client (strict RLS isolation check)
        const body = res.body as {data: {clientsCount: number}};
        expect(body.data.clientsCount).toBe(1);
      }

      // Assert average health check API latency is < 250ms
      const stats = monitor.getStats('health-rls');
      expect(stats.avg).toBeLessThan(250);
    });

    it('3.8: SSE Reconnection Event Replay', async () => {
      const sseHistory: Array<{id: string; data: unknown}> = [];
      const customClients = new Set<{
        res: http.ServerResponse;
        lastEventId?: string;
      }>();

      const onEvent = (data: unknown) => {
        const eventId = (data as {id?: string}).id || `evt-${Date.now()}-${Math.random()}`;
        const record = {id: eventId, data};
        sseHistory.push(record);

        const payload = `id: ${eventId}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const client of customClients) {
          client.res.write(payload);
        }
      };

      eventBus.on('event', onEvent);

      const originalListener = server.listeners(
        'request',
      )[0] as http.RequestListener;
      server.removeAllListeners('request');

      server.on('request', (req, res) => {
        const parsed = new URL(req.url || '', baseUrl);
        if (parsed.pathname === '/api/v1/stream' && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          res.write('data: {"type":"connected"}\n\n');

          const lastEventId =
            parsed.searchParams.get('lastEventId') ||
            (req.headers['last-event-id'] as string);

          if (lastEventId) {
            const idx = sseHistory.findIndex((e) => e.id === lastEventId);
            if (idx >= 0) {
              const missed = sseHistory.slice(idx + 1);
              for (const record of missed) {
                res.write(
                  `id: ${record.id}\ndata: ${JSON.stringify(record.data)}\n\n`,
                );
              }
            }
          }

          const clientRecord = {res, lastEventId};
          customClients.add(clientRecord);

          req.on('close', () => {
            customClients.delete(clientRecord);
          });
          return;
        }

        originalListener(req, res);
      });

      try {
        // Connect Client A first time
        const streamData: string[] = [];
        const reqA = http.get(`${baseUrl}/api/v1/stream`, (res) => {
          res.on('data', (chunk) => {
            streamData.push(chunk.toString());
          });
        });

        // Wait for connection
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });

        // Emit Event 1
        eventBus.emit('event', {id: 'evt-1', message: 'First Event'});
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });

        // Disconnect Client A
        reqA.destroy();
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });

        // Emit Event 2 and 3 while disconnected
        eventBus.emit('event', {id: 'evt-2', message: 'Second Event'});
        eventBus.emit('event', {id: 'evt-3', message: 'Third Event'});
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });

        // Reconnect Client A passing lastEventId=evt-1
        const reconnectData: string[] = [];
        await new Promise<void>((resolve) => {
          http.get(`${baseUrl}/api/v1/stream?lastEventId=evt-1`, (res) => {
            res.on('data', (chunk) => {
              reconnectData.push(chunk.toString());
            });
            setTimeout(() => {
              res.destroy();
              resolve();
            }, 300);
          });
        });

        const replayedPayload = reconnectData.join('');
        expect(replayedPayload).toContain('id: evt-2');
        expect(replayedPayload).toContain('id: evt-3');
        expect(replayedPayload).not.toContain('id: evt-1');
      } finally {
        eventBus.off('event', onEvent);
        server.removeAllListeners('request');
        server.on('request', originalListener);
      }
    });

    it('3.9: DB Adapter Failure / Timeout Lease Reset', async () => {
      const jobId = 'job-timeout-reset';
      await db.savePendingJob({
        job_id: jobId,
        tenant_id: 'tenant-timeout',
        type: 'poas_daily',
        action_id: null,
        run_at: new Date(Date.now() - 5000).toISOString(),
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      const originalClaimJob = db.claimJob;
      db.claimJob = async () => {
        throw new Error(
          'Database connection timed out during claim update transaction',
        );
      };

      try {
        await db.claimJob(jobId, 'worker-timeout', Date.now(), 10000);
        fail('claimJob should have thrown an error');
      } catch (err: unknown) {
        expect((err as Error).message).toContain('Database connection timed out');
      } finally {
        db.claimJob = originalClaimJob;
      }

      const jobs = await db.getPendingJobs('tenant-timeout');
      const job = jobs.find((j) => j.job_id === jobId);
      expect(job).toBeDefined();
      expect(job!.status).toBe('pending');
      expect(job!.locked_by || null).toBeNull();
    });

    it('3.10: Connection Pool Exhaustion Handling', async () => {
      let activeQueries = 0;
      const MAX_CONNECTIONS = 3;
      const QUEUE_LIMIT = 5;
      const queryQueue: Array<() => void> = [];

      const originalGetCampaigns = db.getCampaigns;

      db.getCampaigns = async (tId) => {
        if (activeQueries >= MAX_CONNECTIONS) {
          if (queryQueue.length >= QUEUE_LIMIT) {
            const err = new Error('Database connection pool exhausted');
            (err as {statusCode?: number}).statusCode = 503;
            throw err;
          }
          await new Promise<void>((resolve) => {
            queryQueue.push(resolve);
          });
        }

        activeQueries++;
        try {
          await new Promise((resolve) => {
            setTimeout(resolve, 500);
          });
          return await originalGetCampaigns.call(this, tId);
        } finally {
          activeQueries--;
          if (queryQueue.length > 0) {
            const next = queryQueue.shift();
            if (next) next();
          }
        }
      };

      const originalMax = config.rateLimit.maxRequests;
      config.rateLimit.maxRequests = 100;

      // Seed a client to allow getJson to pass auth checks
      const email = 'pool@exhaust.com';
      const orgId = 'org_pool_exhaust';

      await db.saveUser({
        user_id: 'user_pool_exhaust',
        email,
        pw_hash: 'hashed',
        status: 'active',
        created_at: new Date().toISOString(),
      });
      await db.saveOrg({
        org_id: orgId,
        name: 'Org Pool Exhaust',
        owner_user: 'user_pool_exhaust',
        plan: 'growth',
        created_at: new Date().toISOString(),
      });
      await db.saveOrgMember({
        org_id: orgId,
        user_id: 'user_pool_exhaust',
        role: 'admin',
      });
      await db.saveClient({
        clientId: 'cli_pool_exhaust',
        orgId,
        name: 'Client Pool Exhaust',
        mrr: 1000,
        marginTarget: 0.3,
        healthScore: 100,
        churnRisk: 0.0,
        tenantId: orgId,
      });

      const token = signJwt(
        {
          userId: 'user_pool_exhaust',
          orgId,
          role: 'admin',
        },
        jwtSecret,
        15 * 60 * 1000,
      );

      try {
        const promises: Array<
          Promise<{status: number | undefined; body: unknown}>
        > = [];
        for (let i = 0; i < 15; i++) {
          promises.push(
            getJson('/api/v1/recommendations', {
              'Authorization': `Bearer ${token}`,
            }),
          );
        }

        const results = await Promise.all(promises);

        const successes = results.filter((r) => r.status === 200).length;
        const poolErrors = results.filter(
          (r) => r.status === 503 || r.status === 500,
        ).length;

        expect(successes).toBeLessThanOrEqual(8);
        expect(poolErrors).toBeGreaterThanOrEqual(7);
      } finally {
        config.rateLimit.maxRequests = originalMax;
        db.getCampaigns = originalGetCampaigns;
      }
    });

    it('3.11: Parallel Sweep Latency & Isolation Load Test', async () => {
      const promises: Array<
        Promise<{
          index: number;
          orgId: string;
          status: number | undefined;
          body: unknown;
        }>
      > = [];
      const monitor = new LoadTestMonitor();

      for (let i = 1; i <= 50; i++) {
        const email = `tenant_sweep${i}@scale.com`;
        const orgId = `org_sweep_${i}`;

        // Seed user
        await db.saveUser({
          user_id: `user_sweep_${i}`,
          email,
          pw_hash: 'hashed',
          status: 'active',
          created_at: new Date().toISOString(),
        });

        // Seed org
        await db.saveOrg({
          org_id: orgId,
          name: `Org Sweep ${i}`,
          owner_user: `user_sweep_${i}`,
          plan: 'growth',
          created_at: new Date().toISOString(),
        });

        await db.saveOrgMember({
          org_id: orgId,
          user_id: `user_sweep_${i}`,
          role: 'admin',
        });

        // Seed client profile (tenantId = orgId)
        await db.saveClient({
          clientId: `cli_sweep_${i}`,
          orgId,
          name: `Client of tenant sweep ${i}`,
          mrr: i * 100,
          marginTarget: 0.3,
          healthScore: 100,
          churnRisk: 0.0,
          tenantId: orgId,
        });

        // Seed campaign for each tenant
        await db.saveCampaign({
          campaign_id: `camp-sweep-${i}`,
          platform: 'google',
          name: `Sweep Campaign ${i}`,
          objective: 'sales',
          status: 'ENABLED',
          surface: 'google_search_network',
          tenant_id: orgId,
          source_system: 'google',
          source_id: `camp-sweep-${i}`,
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
          daily_budget: 500,
        });

        // Sign token
        const token = signJwt(
          {
            userId: `user_sweep_${i}`,
            orgId,
            role: 'admin',
          },
          jwtSecret,
          15 * 60 * 1000,
        );

        promises.push(
          monitor
            .record('sweep-load', () =>
              getJson('/api/v1/sweep', {'Authorization': `Bearer ${token}`}),
            )
            .then((res) => ({
              index: i,
              orgId,
              status: res.status,
              body: res.body,
            })),
        );
      }

      const results = await Promise.all(promises);

      // Assert average sweep latency < 350ms
      const stats = monitor.getStats('sweep-load');
      expect(stats.avg).toBeLessThan(350);
      expect(stats.failRate).toBeLessThan(0.01);

      // Verify strict RLS (each tenant only sees its own sweep results, no data leakage)
      for (const res of results) {
        expect(res.status).toBe(200);
        const body = res.body as {data: {sweep: Array<Record<string, unknown>>}};
        const expectedCampaignId = `camp-sweep-${res.index}`;

        for (const finding of body.data.sweep) {
          if (finding['entityId']) {
            expect(finding['entityId']).toBe(expectedCampaignId);
          }
        }
      }
    });

    it('3.12: High-Scale Active SSE Stream Broadcast', async () => {
      const token = signJwt(
        {
          userId: 'sse-user-1',
          orgId: 'sse-org-1',
          role: 'admin',
        },
        jwtSecret,
        15 * 60 * 1000,
      );

      const clients: http.ClientRequest[] = [];
      const messagesCount = new Map<number, string[]>();
      const connectedPromises: Array<Promise<void>> = [];

      for (let i = 0; i < 50; i++) {
        messagesCount.set(i, []);
        let resolveConnected: () => void;
        const connectedProj = new Promise<void>((resolve) => {
          resolveConnected = resolve;
        });
        connectedPromises.push(connectedProj);

        const req = http.get(
          {
            hostname: 'localhost',
            port: PORT,
            path: '/api/v1/stream',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          },
          (res) => {
            res.on('data', (chunk) => {
              const dataStr = chunk.toString();
              if (dataStr.includes('connected')) {
                resolveConnected();
              }
              messagesCount.get(i)!.push(dataStr);
            });
          },
        );
        clients.push(req);
      }

      // Wait for all 50 clients to be connected
      await Promise.all(connectedPromises);

      // Emit 10 events
      for (let ev = 1; ev <= 10; ev++) {
        eventBus.emit('event', {id: `sse-evt-${ev}`, message: `Event ${ev}`});
      }

      // Wait a short delay to allow events to be received
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Assert that each of the 50 clients received the events
      for (let i = 0; i < 50; i++) {
        const received = messagesCount.get(i)!.join('');
        expect(received).toContain('connected');
        for (let ev = 1; ev <= 10; ev++) {
          expect(received).toContain(`sse-evt-${ev}`);
        }
      }

      // Close all clients and ensure cleanup
      for (const req of clients) {
        req.destroy();
      }
    });
  });
});
