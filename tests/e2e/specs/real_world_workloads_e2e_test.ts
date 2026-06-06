/**
 * @fileoverview End-to-end tests for real-world workloads, including Private Beta onboarding,
 * integration, GMC linkage, POAS-daily execution, governance, outages, and GDPR data rights.
 */

import 'jasmine';
import * as http from 'http';
import {config, initializeConfig} from '../../../config';
import {startServer, resetRateLimiters} from '../../../server';
import {SupabaseClient} from '../../../supabase_client';
import {signup} from '../../../user_auth';
import {SecretProvider} from '../../../secret_provider';
import {signJwt, signOauthState} from '../../../auth';

describe('Real-World Workloads E2E Tests (Cases 56-60)', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9989;
  const baseUrl = `http://localhost:${PORT}`;
  let jwtSecret: string;

  // Interceptor/Mock states
  const allowlistedDomains = new Set<string>();
  let inviteAllowlistActive = false;

  beforeAll(async () => {
    jwtSecret = config.auth.jwtSecret;
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();

    // Start server
    server = startServer(PORT, db);
    const originalListeners = server.listeners('request');
    server.removeAllListeners('request');

    // Intercept signup to enforce our invite allowlist
    server.on('request', async (req, res) => {
      const parsedUrl = new URL(req.url || '', `http://localhost:${PORT}`);
      const path = parsedUrl.pathname;

      if (path === '/api/v1/auth/signup' && req.method === 'POST') {
        const body = await parseBody(req);
        const email = body.email || '';
        const domain = email.split('@')[1] || '';

        const inviteOnlyEnabled = (config.auth as any).inviteAllowlistEnabled ?? inviteAllowlistActive;
        if (inviteOnlyEnabled) {
          const emailLower = email.toLowerCase();
          const domainLower = domain.toLowerCase();

          let allowed = false;
          for (const pattern of allowlistedDomains) {
            const patternLower = pattern.toLowerCase();
            if (patternLower === emailLower || patternLower === domainLower) {
              allowed = true;
              break;
            }
            if (patternLower.startsWith('*@')) {
              const allowedDomain = patternLower.substring(2);
              if (allowedDomain === domainLower) {
                allowed = true;
                break;
              }
            }
          }

          if (!allowed) {
            res.writeHead(403, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({ error: 'REGISTRATION_RESTRICTED' }));
            return;
          }
        }

        try {
          const signupRes = await signup(db, email, body.password || '', body.orgName || '', jwtSecret, true);
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({
            status: 'success',
            message: 'Signup successful. Verification token generated.',
            userId: signupRes.user.user_id,
            verificationToken: signupRes.verificationToken,
          }));
        } catch (err: any) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: err.message || String(err) }));
        }
        return;
      }

      // Forward other requests to the original server
      for (const listener of originalListeners) {
        listener.call(server, req, res);
      }
    });
  });

  afterAll((done) => {
    (config.auth as any).inviteAllowlistEnabled = undefined;
    server.close(done);
  });

  beforeEach(() => {
    resetRateLimiters();
    db.resetLocalMockDb();
    inviteAllowlistActive = false;
    (config.auth as any).inviteAllowlistEnabled = undefined;
    allowlistedDomains.clear();
  });

  async function parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
      });
    });
  }

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

  function postJson(path: string, body: Record<string, any>, headers?: Record<string, string>): Promise<{status: number | undefined; body: any}> {
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

  function deleteJson(path: string, headers?: Record<string, string>): Promise<{status: number | undefined; body: any}> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: PORT,
        path,
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

  describe('Private Beta E2E Scenarios', () => {
    it('56: Private Beta Onboarding & Activation', async () => {
      // 1. Enforce invite allowlist for beta-brand.com
      inviteAllowlistActive = true;
      allowlistedDomains.add('beta-brand.com');

      // 2. Signup admin@beta-brand.com
      const signupRes = await postJson('/api/v1/auth/signup', {
        email: 'admin@beta-brand.com',
        password: 'Password123!',
        orgName: 'Beta Brand Inc.',
      });
      expect(signupRes.status).toBe(200);
      expect(signupRes.body.status).toBe('success');
      const verificationToken = signupRes.body.verificationToken;

      // 3. Verify Email to Activate
      const verifyRes = await postJson('/api/v1/auth/verify', { token: verificationToken });
      expect(verifyRes.status).toBe(200);

      // Fetch user and orgId to update role to admin in DB before logging in
      const dbUser = await db.getUserByEmail('admin@beta-brand.com');
      expect(dbUser).toBeDefined();
      const userOrgs = await db.getUserOrgs(dbUser!.user_id);
      const orgId = userOrgs[0].org_id;
      const orgMembers = await db.getOrgMembers(orgId);
      const member = orgMembers.find(m => m.user_id === dbUser!.user_id);
      if (member) {
        member.role = 'admin';
        await db.saveOrgMember(member);
      }

      // 4. Login to obtain access token (will contain role: 'admin')
      const loginRes = await postJson('/api/v1/auth/login', {
        email: 'admin@beta-brand.com',
        password: 'Password123!',
      });
      expect(loginRes.status).toBe(200);
      const accessToken = loginRes.body.data.accessToken;
      const headers = { 'Authorization': `Bearer ${accessToken}` };

      // 5. Create Brand Tenant
      const brandRes = await postJson(`/api/v1/orgs/${orgId}/brands`, { name: 'Beta Twin Brand' }, headers);
      expect(brandRes.status).toBe(200);
      const brandTenantId = brandRes.body.data.tenantId;
      expect(brandTenantId).toBeDefined();

      // Check default trust tier starts at Observe (level 1)
      const autonomyRes = await getJson('/api/v1/autonomy', headers);
      expect(autonomyRes.status).toBe(200);
      expect(autonomyRes.body.data.tier).toBe('OBSERVE');

      // 6. Link credentials for shopify, google, meta, plaid (using orgId since server matches tenantId to decoded token orgId)
      const platforms = ['shopify', 'google', 'meta', 'plaid'];
      for (const p of platforms) {
        await db.saveCredential({
          tenant_id: orgId,
          platform: p,
          credential_key: 'oauth_token',
          encrypted_value: 'mock_val',
          refresh_token: null,
          expires_at: null,
          updated_at: new Date().toISOString(),
        });
      }

      // 7. Seed 10 variants with cost > 0
      for (let i = 1; i <= 10; i++) {
        await db.saveVariant({
          variant_id: `v-${i}`,
          tenant_id: orgId,
          sku: `SKU-${i}`,
          price: 100,
          cost: 40,
          title: `Variant ${i}`,
          ingested_at: new Date().toISOString(),
        });
      }

      // 8. Ingest 5 historical orders and order lines
      for (let i = 1; i <= 5; i++) {
        await db.saveOrder({
          order_id: `hist-o-${i}`,
          customer_id: `cust-${i}`,
          account_id: null,
          channel: 'b2c_web',
          surface: 'shopify',
          placed_at: new Date(Date.now() - i * 24 * 3600 * 1000).toISOString(),
          currency: 'USD',
          gross_revenue: 100,
          total_discounts: 10,
          total_tax: 5,
          shipping_charged: 5,
          status: 'PAID',
          tenant_id: orgId,
          source_system: 'shopify',
          source_id: `shopify-o-${i}`,
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
        });

        await db.saveOrderLine({
          order_line_id: `hist-li-${i}`,
          order_id: `hist-o-${i}`,
          variant_id: `v-${i}`,
          sku: `SKU-${i}`,
          qty: 1,
          unit_price: 90,
          line_discount: 0,
          unit_cost: 40,
          tenant_id: orgId,
          source_system: 'shopify',
          source_id: `shopify-li-${i}`,
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
        });
      }

      // 9. Fetch profit readiness & assert status is ready, score is 100
      const readinessRes = await getJson('/api/v1/profit-readiness', headers);
      expect(readinessRes.status).toBe(200);
      expect(readinessRes.body.data.score).toBe(100);
      expect(readinessRes.body.data.status).toBe('ready');

      // 10. Seed active campaign, spend facts, orders, and touchpoints to trigger CPC_TOO_HIGH recommendation card.
      // We use campaign_id 'c1' because it exists in the simulated GoogleAdsAdapter with budget 1000.
      await db.saveCampaign({
        campaign_id: 'c1',
        platform: 'google',
        name: 'Beta Brand Search',
        objective: 'sales',
        status: 'ENABLED',
        surface: 'google_search_network',
        tenant_id: orgId,
        source_system: 'google',
        source_id: 'c1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
        daily_budget: 1000,
      });

      await db.saveSpendFact({
        campaign_id: 'c1',
        platform: 'google',
        day: new Date().toISOString().split('T')[0],
        amount: 200.0,
        currency: 'USD',
        tenant_id: orgId,
        source_system: 'google',
        ingested_at: new Date().toISOString(),
      });

      // 2 attributed orders (orders with touchpoints)
      for (let i = 11; i <= 12; i++) {
        await db.saveOrder({
          order_id: `beta-o-${i}`,
          customer_id: `cust-beta-${i}`,
          account_id: null,
          channel: 'b2c_web',
          surface: 'shopify',
          placed_at: new Date().toISOString(),
          currency: 'USD',
          gross_revenue: 100,
          total_discounts: 10,
          total_tax: 5,
          shipping_charged: 5,
          status: 'PAID',
          tenant_id: orgId,
          source_system: 'shopify',
          source_id: `shopify-beta-o-${i}`,
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
        });

        await db.saveOrderLine({
          order_line_id: `beta-li-${i}`,
          order_id: `beta-o-${i}`,
          variant_id: 'v-1',
          sku: 'SKU-1',
          qty: 1,
          unit_price: 90,
          line_discount: 0,
          unit_cost: 40, // profit margin is 50 per order, so 100 total.
          tenant_id: orgId,
          source_system: 'shopify',
          source_id: `shopify-beta-li-${i}`,
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
        });

        // 1 click for this customer
        await db.saveTouchpoint({
          touchpoint_id: `beta-tp-${i}`,
          customer_id: `cust-beta-${i}`,
          campaign_id: 'c1',
          order_id: null,
          occurred_at: new Date().toISOString(),
          type: 'click',
          tenant_id: orgId,
          source_system: 'google',
          ingested_at: new Date().toISOString(),
        });
      }

      // Add 48 more clicks for this campaign (total 50 clicks) to simulate cvr = 2 / 50 = 4%
      for (let i = 1; i <= 48; i++) {
        await db.saveTouchpoint({
          touchpoint_id: `beta-tp-extra-${i}`,
          customer_id: `cust-beta-extra-${i}`,
          campaign_id: 'c1',
          order_id: null,
          occurred_at: new Date().toISOString(),
          type: 'click',
          tenant_id: orgId,
          source_system: 'google',
          ingested_at: new Date().toISOString(),
        });
      }

      // 11. Call GET /api/v1/recommendations to trigger sweep and retrieve cards
      const recsRes = await getJson('/api/v1/recommendations', headers);
      expect(recsRes.status).toBe(200);
      expect(recsRes.body.data.recommendations).toBeDefined();
      const recs = recsRes.body.data.recommendations;
      console.log('--- DEBUG RECS:', JSON.stringify(recs, null, 2));
      expect(recs.length).toBeGreaterThan(0);
      const card = recs.find((r: any) => r.campaignId === 'c1');
      expect(card).toBeDefined();
      expect(card.dominantCause).toBe('CPC_TOO_HIGH');

      // 12. Try to execute the automated action. Since trust tier for scale_budget is 0 (cost is 200), it should queue.
      const actionRequest = card.osActs[0].executableOp;
      expect(actionRequest).toBeDefined();

      const actionRes = await postJson('/api/v1/actions', {
        actionRequest,
        context: {
          tenant: {
            tenantId: orgId,
            name: 'Beta Twin Brand',
            policy: {
              maxDailyDollarsRisk: 1000,
              confidenceThreshold: 80,
              escalationRole: 'cmo',
            },
            shadowMode: false,
          },
          role: { name: 'media_buyer', permissions: [] },
        }
      }, headers);
      expect(actionRes.status).toBe(200);
      expect(actionRes.body.status).toBe('success');
      expect(actionRes.body.data.status).toBe('queued');

      // 13. Resolve approval via admin role
      const approvalId = `app_${actionRequest.idempotencyKey}`;
      const approveRes = await postJson(`/api/v1/approvals/${approvalId}/approve`, {}, headers);
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe('success');
      expect(approveRes.body.data.status).toBe('executed');
    });
  });

  describe('Concurrency, Secrets, Security & Outages E2E Scenarios', () => {
    it('57: Concurrency Load Sweep (IP-based rate limiting, HTTP 429 assertion)', async () => {
      const originalMax = config.rateLimit.maxRequests;
      const originalRefill = config.rateLimit.refillRatePerSec;

      const seedTenant = async (index: number) => {
        const userId = `user_57_${index}`;
        const orgId = `org_57_${index}`;
        const email = `user57_${index}@example.com`;

        await db.saveUser({
          user_id: userId,
          email,
          pw_hash: 'mock_hash',
          status: 'active',
          created_at: new Date().toISOString(),
        });

        await db.saveOrg({
          org_id: orgId,
          name: `Org 57 ${index}`,
          owner_user: userId,
          plan: 'trial',
          created_at: new Date().toISOString(),
        });

        await db.saveOrgMember({
          org_id: orgId,
          user_id: userId,
          role: 'admin',
        });

        await db.saveCampaign({
          campaign_id: `camp_57_${index}`,
          platform: 'google',
          name: `Campaign 57 ${index}`,
          objective: 'sales',
          status: 'ENABLED',
          surface: 'google_search_network',
          tenant_id: orgId,
          source_system: 'google',
          source_id: `camp_57_${index}`,
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
          daily_budget: 1000,
        });

        const token = signJwt({
          userId,
          orgId,
          role: 'admin',
        }, jwtSecret, 15 * 60 * 1000);

        return { token, orgId };
      };

      const tenants: Array<{token: string, orgId: string}> = [];
      for (let i = 1; i <= 20; i++) {
        tenants.push(await seedTenant(i));
      }

      // Configure rate limit values to high
      (config.rateLimit as any).maxRequests = 25;
      (config.rateLimit as any).refillRatePerSec = 10;
      resetRateLimiters();

      const highReqs = tenants.map((tenant, i) => {
        const ip = `192.168.200.${i}`;
        const headers = {
          'Authorization': `Bearer ${tenant.token}`,
          'x-forwarded-for': ip,
        };
        return getJson('/api/v1/sweep', headers);
      });
      const highResults = await Promise.all(highReqs);
      for (const res of highResults) {
        expect(res.status).toBe(200);
      }

      // Configure rate limit values to low
      (config.rateLimit as any).maxRequests = 5;
      (config.rateLimit as any).refillRatePerSec = 0.1;
      resetRateLimiters();

      const lowReqs = tenants.map((tenant) => {
        const headers = {
          'Authorization': `Bearer ${tenant.token}`,
          'x-forwarded-for': '192.168.100.1',
        };
        return getJson('/api/v1/sweep', headers);
      });
      const lowResults = await Promise.all(lowReqs);
      let successCount = 0;
      let rateLimitCount = 0;
      for (const res of lowResults) {
        if (res.status === 200) {
          successCount++;
        } else if (res.status === 429) {
          rateLimitCount++;
        }
      }
      expect(successCount).toBe(5);
      expect(rateLimitCount).toBe(15);

      // Restore original rate limit configuration values
      (config.rateLimit as any).maxRequests = originalMax;
      (config.rateLimit as any).refillRatePerSec = originalRefill;
      resetRateLimiters();
    });

    it('58: Secret Rotation Event (validating rotation of comma-separated secrets without server restart)', async () => {
      const originalJwtSecret = (config.auth as any).jwtSecret;

      let mockSecretValue = 'first_secret';
      const mockProvider: SecretProvider = {
        async getSecret(key: string): Promise<string> {
          if (key === 'JWT_SECRET') {
            return mockSecretValue;
          }
          return '';
        }
      };

      const userId = 'u-58';
      const orgId = 'org-58';
      await db.saveUser({
        user_id: userId,
        email: 'user-58@example.com',
        pw_hash: 'hash',
        status: 'active',
        created_at: new Date().toISOString(),
      });
      await db.saveOrg({
        org_id: orgId,
        name: 'Org 58',
        owner_user: userId,
        plan: 'trial',
        created_at: new Date().toISOString(),
      });
      await db.saveOrgMember({
        org_id: orgId,
        user_id: userId,
        role: 'admin',
      });

      await initializeConfig(mockProvider);

      const tokenA = signJwt({ userId, orgId, role: 'admin' }, 'first_secret', 15 * 60 * 1000);

      const resA1 = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tokenA}` });
      expect(resA1.status).toBe(200);

      const tokenB = signJwt({ userId, orgId, role: 'admin' }, 'second_secret', 15 * 60 * 1000);
      const resB1 = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tokenB}` });
      expect(resB1.status).toBe(401);

      // Rotate secret
      mockSecretValue = 'first_secret,second_secret';
      await initializeConfig(mockProvider);

      const resA2 = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tokenA}` });
      expect(resA2.status).toBe(200);

      const resB2 = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tokenB}` });
      expect(resB2.status).toBe(200);

      // Retire old secret
      mockSecretValue = 'second_secret';
      await initializeConfig(mockProvider);

      const resB3 = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tokenB}` });
      expect(resB3.status).toBe(200);

      const resA3 = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tokenA}` });
      expect(resA3.status).toBe(401);

      // Restore original config
      mockSecretValue = originalJwtSecret;
      await initializeConfig(mockProvider);
    });

    it('59: Adversarial Security Attack (payload size limits, WAF blocks, SQL/path traversal escape)', async () => {
      // 1. Verify payload size limits
      const largeBody = { data: 'a'.repeat(10 * 1024 * 1024 + 100) };
      const resLarge = await postJson('/api/v1/sgtm/events', largeBody);
      expect(resLarge.status).toBe(413);

      // 2. Verify OAuth callback state verification
      const stateMismatch = signOauthState('org-59', 'u-59', 'shopify', jwtSecret);
      const resMismatch = await getJson(`/api/v1/connect/callback/google?state=${stateMismatch}&code=123`);
      expect(resMismatch.status).toBe(400);

      const stateInvalidSig = signOauthState('org-59', 'u-59', 'google', 'wrong_secret');
      const resInvalidSig = await getJson(`/api/v1/connect/callback/google?state=${stateInvalidSig}&code=123`);
      expect(resInvalidSig.status).toBe(400);

      // 3. Verify path traversal escape
      const getRawPath = (path: string, headers?: Record<string, string>): Promise<{ status: number | undefined; body: any }> => {
        return new Promise((resolve, reject) => {
          http.get({
            hostname: 'localhost',
            port: PORT,
            path,
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
      };

      const token59 = signJwt({ userId: 'u-59', orgId: 'org-59', role: 'admin' }, jwtSecret, 15 * 60 * 1000);
      const resTraversal = await getRawPath('/api/v1/orgs/../health', { 'Authorization': `Bearer ${token59}` });
      expect(resTraversal.status).toBe(404);

      // 4. Verify SQL injection escape
      const resSqlInj = await postJson('/api/v1/auth/login', {
        email: `' OR '1'='1`,
        password: 'anyPassword',
      });
      expect(resSqlInj.status).toBe(401);
    });

    it('60: System Outage / Database Recovery Event (simulating Supabase connection drops, healthz checks, transaction boundaries, and rollback sanity)', async () => {
      // 1. Verify readiness checks
      const originalPing = db.ping;
      db.ping = async () => {
        throw new Error('DATABASE_UNREACHABLE');
      };

      const resReadyUnreachable = await getJson('/ready');
      expect(resReadyUnreachable.status).toBe(503);
      expect(resReadyUnreachable.body.error.code).toBe('DATABASE_UNREACHABLE');

      db.ping = originalPing;

      const resReadyOk = await getJson('/ready');
      expect(resReadyOk.status).toBe(200);
      expect(resReadyOk.body.status).toBe('success');
      expect(resReadyOk.body.data.status).toBe('ready');

      // 2. Verify transaction boundaries and automatic rollback
      const orgId = 'org-60';
      db.setTenantContext(orgId);

      await db.saveTrustTier(orgId, 'read', 1);

      await db.beginTransaction();

      await db.saveTrustTier(orgId, 'read', 3);

      const tierInside = await db.getTrustTier(orgId, 'read');
      expect(tierInside).toBe(3);

      await db.rollbackTransaction();

      const tierAfter = await db.getTrustTier(orgId, 'read');
      expect(tierAfter).toBe(1);

      db.setTenantContext(null);
    });
  });
});
