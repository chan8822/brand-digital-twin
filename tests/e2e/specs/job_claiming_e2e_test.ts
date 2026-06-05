/**
 * @fileoverview End-to-end tests for Job Claiming distributed locks, leases, heartbeats, and completion.
 */

import 'jasmine';
import * as http from 'http';
import {config} from '../../../config';
import {startServer} from '../../../server';
import {SupabaseClient, PendingJobEntry} from '../../../supabase_client';
import {login, signup, verifyEmail} from '../../../user_auth';

describe('Job Claiming E2E Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9985;
  const jwtSecret = config.auth.jwtSecret;

  let tenantToken: string;
  let tenantOrgId: string;

  beforeAll(async () => {
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    server = startServer(PORT, db);

    // Setup Tenant context
    const email = 'jobworker@example.com';
    const pw = 'Pw123!';
    const { user, verificationToken } = await signup(db, email, pw, 'JobWorkerOrg', jwtSecret, true);
    await verifyEmail(db, verificationToken, jwtSecret);
    const loginRes = await login(db, email, pw, jwtSecret);
    tenantToken = loginRes.accessToken;
    const orgs = await db.getUserOrgs(user.user_id);
    tenantOrgId = orgs[0].org_id;
  });

  afterAll((done) => {
    server.close(done);
  });

  interface JobClaimResponseBody {
    status?: string;
    data?: {
      status?: string;
    };
    error?: string;
  }

  function postJson(
    path: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<{status: number | undefined; body: unknown}> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request({
        hostname: 'localhost',
        port: PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...headers,
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  describe('R5: Job Claiming Concurrency & Heartbeat', () => {
    const jobId = 'job-test-123';

    beforeEach(async () => {
      // Clear out the jobs to clean setup
      await db.deletePendingJob(jobId);

      // Create a pending job
      const job: PendingJobEntry = {
        job_id: jobId,
        tenant_id: tenantOrgId,
        type: 'poas_daily',
        action_id: null,
        run_at: new Date(Date.now() - 5000).toISOString(), // overdue
        payload: null,
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      await db.savePendingJob(job);
    });

    it('1. Acquire Lock for Task', async () => {
      const res = await postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': 'worker-a', 'leaseDurationMs': 5000 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res.status).toBe(200);
      const body = res.body as JobClaimResponseBody;
      expect(body.data?.status).toBe('claimed');

      // Verify status in DB
      const jobs = await db.getPendingJobs(tenantOrgId);
      const job = jobs.find(j => j.job_id === jobId);
      expect(job).toBeDefined();
      expect(job!.status).toBe('processing');
      expect(job!.locked_by).toBe('worker-a');
    });

    it('2. Lease Expiry Lock Reset', async () => {
      // Claim job with tiny lease: 100ms
      const res1 = await postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': 'worker-a', 'leaseDurationMs': 100 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res1.status).toBe(200);

      // Wait 150ms for lease to expire
      await new Promise(r => {
        setTimeout(r, 150);
      });

      // Worker B should now be able to claim it!
      const res2 = await postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': 'worker-b', 'leaseDurationMs': 5000 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res2.status).toBe(200);
      const body2 = res2.body as JobClaimResponseBody;
      expect(body2.data?.status).toBe('claimed');

      const jobs = await db.getPendingJobs(tenantOrgId);
      const job = jobs.find(j => j.job_id === jobId);
      expect(job!.locked_by).toBe('worker-b');
    });

    it('3. Prevent Dual Worker Claims', async () => {
      // Claim job by Worker A
      const res1 = await postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': 'worker-a', 'leaseDurationMs': 5000 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res1.status).toBe(200);

      // Worker B tries to claim it immediately -> should fail/conflict
      const res2 = await postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': 'worker-b', 'leaseDurationMs': 5000 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res2.status).toBe(409);
      const body2 = res2.body as JobClaimResponseBody;
      expect(body2.status).toBe('conflict');

      // Verify owner is still Worker A
      const jobs = await db.getPendingJobs(tenantOrgId);
      const job = jobs.find(j => j.job_id === jobId);
      expect(job!.locked_by).toBe('worker-a');
    });

    it('4. Extend Lease / Heartbeat', async () => {
      // Claim job with lease: 300ms
      const res1 = await postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': 'worker-a', 'leaseDurationMs': 300 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res1.status).toBe(200);

      // Wait 150ms and send heartbeat to extend by another 300ms
      await new Promise(r => {
        setTimeout(r, 150);
      });
      const res2 = await postJson(
        '/api/v1/jobs/heartbeat',
        { 'jobId': jobId, 'workerId': 'worker-a', 'leaseDurationMs': 300 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res2.status).toBe(200);

      // Wait 200ms (total elapsed: 350ms). If heartbeat failed, lease would have expired at 300ms.
      // Since heartbeat extended it to (150 + 300 = 450ms), it should still be locked!
      await new Promise(r => {
        setTimeout(r, 200);
      });

      const res3 = await postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': 'worker-b', 'leaseDurationMs': 1000 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res3.status).toBe(409); // still locked by Worker A!
    });

    it('5. Release Lease on Complete', async () => {
      // Claim job
      const res1 = await postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': 'worker-a', 'leaseDurationMs': 5000 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res1.status).toBe(200);

      // Complete job
      const res2 = await postJson(
        '/api/v1/jobs/complete',
        { 'jobId': jobId, 'workerId': 'worker-a' },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
      expect(res2.status).toBe(200);

      // Verify status in DB
      const jobs = await db.getPendingJobs(tenantOrgId);
      const job = jobs.find(j => j.job_id === jobId);
      expect(job!.status).toBe('completed');
      expect(job!.locked_by).toBeNull();
    });
  });
});
