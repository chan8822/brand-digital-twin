/**
 * @fileoverview End-to-end tests for Legal Consent flows (ToS, DPA, Privacy Policy, Versioning).
 */

import 'jasmine';
import * as http from 'http';
import {config} from '../../../config';
import {startServer, resetRateLimiters} from '../../../server';
import {SupabaseClient} from '../../../supabase_client';
import {login, signup, verifyEmail} from '../../../user_auth';

describe('Legal Consent E2E Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9982;
  const baseUrl = `http://localhost:${PORT}`;
  const jwtSecret = config.auth.jwtSecret;

  beforeAll(async () => {
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    server = startServer(PORT, db);
  });

  beforeEach(() => {
    resetRateLimiters();
    // Default to empty active version
    config.legal.activeVersion = '';
  });

  afterAll((done) => {
    config.legal.activeVersion = '';
    server.close(done);
  });

  function getJson(path: string, headers?: Record<string, string>): Promise<{status: number | undefined; body: any}> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(`${baseUrl}${path}`);
      http.get({
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : undefined,
        path: parsed.pathname + parsed.search,
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

  function postJson(path: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<{status: number | undefined; body: any}> {
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

  describe('R2: Legal Terms and Consent Compliance', () => {
    let accessToken: string;

    beforeEach(async () => {
      const email = 'consent@example.com';
      const pw = 'Password123!';
      const orgName = 'ConsentOrg';

      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        const orgs = await db.getUserOrgs(existingUser.user_id);
        for (const o of orgs) {
          await db.deleteOrg(o.org_id);
          await db.hardDeleteTenantData(o.org_id);
        }
        await db.deleteUser(existingUser.user_id);
      }

      const { user, verificationToken } = await signup(db, email, pw, orgName, jwtSecret, true);
      await verifyEmail(db, verificationToken, jwtSecret);

      if (user) {
        // Reset legal history for user to ensure fresh consent checks
        await db.resetUserLegalConsents(user.user_id);
      }

      const loginRes = await login(db, email, pw, jwtSecret);
      accessToken = loginRes.accessToken;
    });

    it('1. ToS/Privacy Policy Static Content Route', async () => {
      const tos = await getJson('/api/v1/legal/tos');
      expect(tos.status).toBe(200);
      expect(tos.body.data.title).toBe('Terms of Service');
      expect(tos.body.data.content).toBeDefined();

      const privacy = await getJson('/api/v1/legal/privacy');
      expect(privacy.status).toBe(200);
      expect(privacy.body.data.title).toBe('Privacy Policy');
      expect(privacy.body.data.content).toBeDefined();

      const dpa = await getJson('/api/v1/legal/dpa');
      expect(dpa.status).toBe(200);
      expect(dpa.body.data.title).toBe('Data Processing Addendum');
      expect(dpa.body.data.content).toBeDefined();
    });

    it('2. Require Re-acceptance of Terms', async () => {
      // Set legal active version to v1.1
      config.legal.activeVersion = 'v1.1';

      // Attempt to access /me
      const meRes = await getJson('/api/v1/me', { 'Authorization': `Bearer ${accessToken}` });
      expect(meRes.status).toBe(403);
      expect(meRes.body.error.code).toBe('POLICY_REACCEPTANCE_REQUIRED');
      expect(meRes.body.error.message).toContain('accept the updated terms and conditions');
    });

    it('3. Acceptance Submission Log', async () => {
      // Set legal active version to v1.1
      config.legal.activeVersion = 'v1.1';

      // Log accept
      const acceptRes = await postJson('/api/v1/legal/accept', { 'version': 'v1.1' }, { 'Authorization': `Bearer ${accessToken}` });
      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.status).toBe('accepted');
      expect(acceptRes.body.data.version).toBe('v1.1');
    });

    it('4. Resumed Tenant Pipeline', async () => {
      config.legal.activeVersion = 'v1.1';

      // Accept new version
      await postJson('/api/v1/legal/accept', { 'version': 'v1.1' }, { 'Authorization': `Bearer ${accessToken}` });

      // Call /me now should succeed
      const meRes = await getJson('/api/v1/me', { 'Authorization': `Bearer ${accessToken}` });
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.email).toBe('consent@example.com');
    });

    it('5. No Acceptance Exemptions', async () => {
      // 1. User accepts v1.0 initially
      config.legal.activeVersion = 'v1.0';
      await postJson('/api/v1/legal/accept', { 'version': 'v1.0' }, { 'Authorization': `Bearer ${accessToken}` });

      // Succeeds under v1.0
      let meRes = await getJson('/api/v1/me', { 'Authorization': `Bearer ${accessToken}` });
      expect(meRes.status).toBe(200);

      // 2. Bump version to v1.1
      config.legal.activeVersion = 'v1.1';

      // Fails now even though user accepted v1.0 earlier
      meRes = await getJson('/api/v1/me', { 'Authorization': `Bearer ${accessToken}` });
      expect(meRes.status).toBe(403);
      expect(meRes.body.error.code).toBe('POLICY_REACCEPTANCE_REQUIRED');
    });
  });
});
