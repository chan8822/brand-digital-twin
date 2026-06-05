/**
 * @fileoverview Concurrency tests for Job Claiming to verify race condition safety.
 */

import 'jasmine';
import * as http from 'http';
import {config} from '../../config';
import {startServer} from '../../server';
import {SupabaseClient, PendingJobEntry} from '../../supabase_client';
import {login, signup, verifyEmail} from '../../user_auth';

describe('Job Claiming Concurrency Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9986;
  const jwtSecret = config.auth.jwtSecret;

  let tenantToken: string;
  let tenantOrgId: string;

  beforeAll(async () => {
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    server = startServer(PORT, db);

    // Setup Tenant context
    const email = 'concurrencyworker@example.com';
    const pw = 'Pw123!';
    const { user, verificationToken } = await signup(db, email, pw, 'ConcurrencyOrg', jwtSecret, true);
    await verifyEmail(db, verificationToken, jwtSecret);
    const loginRes = await login(db, email, pw, jwtSecret);
    tenantToken = loginRes.accessToken;
    const orgs = await db.getUserOrgs(user.user_id);
    tenantOrgId = orgs[0].org_id;
  });

  afterAll((done) => {
    server.close(done);
  });

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

  it('Verify exactly one parallel worker claims the job and the rest get 409 conflict', async () => {
    const jobId = 'concurrency-job-1';
    await db.deletePendingJob(jobId);

    // Create a pending job
    const job: PendingJobEntry = {
      job_id: jobId,
      tenant_id: tenantOrgId,
      type: 'poas_daily',
      action_id: null,
      run_at: new Date(Date.now() - 5000).toISOString(),
      payload: null,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    await db.savePendingJob(job);

    // Spawn 10 concurrent requests
    const claimPromises = Array.from({ length: 10 }).map((_, index) => {
      const workerId = `worker-${index}`;
      return postJson(
        '/api/v1/jobs/claim',
        { 'jobId': jobId, 'workerId': workerId, 'leaseDurationMs': 10000 },
        { 'Authorization': `Bearer ${tenantToken}` }
      );
    });

    const results = await Promise.all(claimPromises);

    const successfulClaims = results.filter(r => r.status === 200);
    const conflictedClaims = results.filter(r => r.status === 409);

    expect(successfulClaims.length).toBe(1);
    expect(conflictedClaims.length).toBe(9);

    // Verify DB state
    const jobs = await db.getPendingJobs(tenantOrgId);
    const updatedJob = jobs.find(j => j.job_id === jobId);
    expect(updatedJob).toBeDefined();
    expect(updatedJob!.status).toBe('processing');
    expect(updatedJob!.locked_by).not.toBeNull();
  });
});
