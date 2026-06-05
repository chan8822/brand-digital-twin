import 'jasmine';
import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';
import {config} from './config';
import {startServer, resetRateLimiters} from './server';
import {SupabaseClient} from './supabase_client';
import {signup, login, verifyEmail} from './user_auth';
import {PoasScheduler} from './poas_scheduler';
import {signJwt} from './auth';

describe('GDPR & Legal Compliance Systems Integration Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  let scheduler: PoasScheduler;
  const PORT = 9977;
  const baseUrl = `http://localhost:${PORT}`;
  const jwtSecret = config.auth.jwtSecret;

  beforeAll(async () => {
    // Disable shared mock database for isolation
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    scheduler = new PoasScheduler(db, 1000); // 1s poll interval

    // Start server
    server = startServer(PORT, db);
  });

  beforeEach(() => {
    resetRateLimiters();
  });

  afterAll((done) => {
    server.close(done);
  });

  // Helpers
  function getJson(path: string, headers?: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsed = url.parse(`${baseUrl}${path}`);
      http.get({
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : undefined,
        path: parsed.path,
        headers: headers || {},
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
      }).on('error', reject);
    });
  }

  function postJson(path: string, body: any, headers?: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request({
        hostname: 'localhost',
        port: PORT,
        path: path,
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

  function deleteReq(path: string, headers?: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: PORT,
        path: path,
        method: 'DELETE',
        headers: headers || {},
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
      req.end();
    });
  }

  describe('R2: Registration Consent & Terms Enforcement', () => {
    it('should reject signup if terms are not accepted', async () => {
      const originalVersion = config.legal.activeVersion;
      config.legal.activeVersion = 'v1.0';
      try {
        await expectAsync(
          signup(db, 'consent1@example.com', 'Pw123!', 'OrgConsent1', jwtSecret, false, 'v1.0')
        ).toBeRejectedWithError(Error, /Terms and conditions must be accepted to register/);
      } finally {
        config.legal.activeVersion = originalVersion;
      }
    });

    it('should reject signup if accepted terms version does not match activeVersion', async () => {
      // Set active legal version
      const originalVersion = config.legal.activeVersion;
      config.legal.activeVersion = 'v2.0';

      try {
        await expectAsync(
          signup(db, 'consent2@example.com', 'Pw123!', 'OrgConsent2', jwtSecret, true, 'v1.0')
        ).toBeRejectedWithError(Error, /You must accept the active terms version/);
      } finally {
        config.legal.activeVersion = originalVersion;
      }
    });

    it('should succeed signup when terms and activeVersion are aligned, and save acceptance record', async () => {
      const originalVersion = config.legal.activeVersion;
      config.legal.activeVersion = 'v1.5';

      try {
        const { user } = await signup(db, 'consent3@example.com', 'Pw123!', 'OrgConsent3', jwtSecret, true, 'v1.5');
        expect(user).toBeDefined();

        const latestAcceptance = await db.getLatestLegalAcceptance(user.user_id);
        expect(latestAcceptance).toBeDefined();
        expect(latestAcceptance?.doc_version).toBe('v1.5');
      } finally {
        config.legal.activeVersion = originalVersion;
      }
    });
  });

  describe('Policy Compliance Route Blocking (Middleware)', () => {
    it('should block authenticated API routes if user has not accepted the current terms version', async () => {
      const originalVersion = config.legal.activeVersion;
      config.legal.activeVersion = 'v2.0';

      try {
        // Sign up with an older version (bypass constraint via DB directly, or set activeVersion afterwards)
        config.legal.activeVersion = 'v1.0';
        const { user, verificationToken } = await signup(db, 'block@example.com', 'Pw123!', 'BlockOrg', jwtSecret, true, 'v1.0');
        await verifyEmail(db, verificationToken, jwtSecret);

        // Get login token
        const { accessToken } = await login(db, 'block@example.com', 'Pw123!', jwtSecret);

        // Update active version to require re-acceptance
        config.legal.activeVersion = 'v2.0';

        // Call authenticated GET /me
        const res = await getJson('/api/v1/me', { Authorization: `Bearer ${accessToken}` });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('POLICY_REACCEPTANCE_REQUIRED');

        // Verify public legal endpoints are STILL accessible
        const tosRes = await getJson('/api/v1/legal/tos');
        expect(tosRes.status).toBe(200);
        expect(tosRes.body.data.content).toContain('Terms of Service');

        // Verify acceptance endpoint works even when blocked by compliance
        const acceptRes = await postJson('/api/v1/legal/accept', { version: 'v2.0' }, { Authorization: `Bearer ${accessToken}` });
        expect(acceptRes.status).toBe(200);
        expect(acceptRes.body.data.status).toBe('accepted');

        // Route should now be unblocked
        const okRes = await getJson('/api/v1/me', { Authorization: `Bearer ${accessToken}` });
        expect(okRes.status).toBe(200);
        expect(okRes.body.data.userId).toBe(user.user_id);
      } finally {
        config.legal.activeVersion = originalVersion;
      }
    });
  });

  describe('R1: Data Rights (GDPR Export and Deletion)', () => {
    let accessToken: string;
    let userId: string;
    let orgId: string;

    beforeEach(async () => {
      const email = 'gdpr@example.com';
      const pw = 'Pw123!';
      const orgName = 'GdprOrg';

      let user = await db.getUserByEmail(email);
      if (!user) {
        const signupRes = await signup(db, email, pw, orgName, jwtSecret, true, config.legal.activeVersion || 'v1.0');
        user = signupRes.user;
        await verifyEmail(db, signupRes.verificationToken, jwtSecret);
      }

      const loginRes = await login(db, email, pw, jwtSecret);
      accessToken = loginRes.accessToken;
      userId = user.user_id;
      const userOrgs = await db.getUserOrgs(userId);
      orgId = userOrgs[0].org_id;

      // Clean existing data for this tenant to ensure fresh test execution
      await db.hardDeleteTenantData(orgId);

      // Insert mock tenant data to verify export and deletion
      await db.saveCampaign({
        campaign_id: 'c-gdpr-1',
        platform: 'google',
        name: 'GDPR Campaign',
        objective: 'leads',
        status: 'ENABLED',
        surface: 'google_search_network',
        tenant_id: orgId,
        source_system: 'google',
        source_id: 'c-gdpr-1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });

      await db.saveBrandSignal({
        signalId: 's-gdpr-1',
        tenantId: orgId,
        source: 'ads',
        type: 'low_performance_roi',
        severity: 'high',
        message: 'GDPR Low ROI',
        payload: {},
        timestamp: Date.now(),
      });
    });

    it('should request GDPR export, receive short-lived token URL, download, and verify export content', async () => {
      const exportReq = await postJson('/api/v1/account/export', {}, { Authorization: `Bearer ${accessToken}` });
      expect(exportReq.status).toBe(200);
      const { downloadUrl } = exportReq.body.data;
      expect(downloadUrl).toContain('/api/v1/account/export/download?token=');

      // Request download using URL
      const relativeUrl = downloadUrl.replace(config.server.baseUrl, '');
      const downloadRes = await getJson(relativeUrl);
      expect(downloadRes.status).toBe(200);

      const data = downloadRes.body.data || downloadRes.body;
      expect(data.user.user_id).toBe(userId);
      expect(data.campaigns.length).toBe(1);
      expect(data.campaigns[0].campaign_id).toBe('c-gdpr-1');
      expect(data.brandSignals.length).toBe(1);
      expect(data.brandSignals[0].signalId).toBe('s-gdpr-1');
    });

    it('should reject GDPR download with invalid or expired token', async () => {
      // 1. Invalid signature token
      const badRes = await getJson('/api/v1/account/export/download?token=invalid_token_xyz');
      expect(badRes.status).toBe(401);

      // 2. Token with wrong purpose
      const wrongPurposeToken = signJwt({
        userId,
        orgId,
        role: 'media_buyer',
        purpose: 'normal_auth',
      }, config.auth.jwtSecret, 15 * 60 * 1000);
      const wrongRes = await getJson(`/api/v1/account/export/download?token=${wrongPurposeToken}`);
      expect(wrongRes.status).toBe(403);
    });

    it('should schedule soft delete on DELETE /account, revoke refresh tokens, and run scheduler for permanent hard deletion', async () => {
      // Request delete
      const delRes = await deleteReq('/api/v1/account', { Authorization: `Bearer ${accessToken}` });
      expect(delRes.status).toBe(200);
      expect(delRes.body.data.status).toBe('scheduled');

      // Verify User is soft-deleted
      const user = await db.getUserById(userId);
      expect(user?.status).toBe('disabled');
      expect(user?.deleted_at).toBeDefined();

      // Verify Org is soft-deleted
      const org = await db.getOrg(orgId);
      expect(org?.deleted_at).toBeDefined();

      // Verify Refresh Tokens are revoked
      const tokens = await db.getRefreshTokensForUser(userId);
      expect(tokens.every(t => t.revoked)).toBeTrue();

      // Verify hard delete job is pending in job queue
      const pendingJobs = await db.getPendingJobs(orgId);
      const deleteJob = pendingJobs.find(j => j.type === 'hard_delete_account');
      expect(deleteJob).toBeDefined();
      expect(deleteJob?.payload?.userId).toBe(userId);

      // Force-run poas_scheduler to execute the hard_delete_account job immediately
      // Modify job run_at to be in the past so claimNextOverdueJob claims it
      if (deleteJob) {
        deleteJob.run_at = new Date(Date.now() - 1000).toISOString();
        await db.savePendingJob(deleteJob);
      }

      await scheduler.pollAndExecute();

      // Verify permanent deletion from DB
      const deletedUser = await db.getUserById(userId);
      expect(deletedUser).toBeNull();

      const deletedOrg = await db.getOrg(orgId);
      expect(deletedOrg).toBeNull();

      const campaigns = await db.getCampaigns(orgId);
      expect(campaigns.length).toBe(0);

      const signals = await db.getBrandSignals(orgId);
      expect(signals.length).toBe(0);
    });
  });
});
