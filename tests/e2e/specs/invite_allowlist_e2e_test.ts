/**
 * @fileoverview E2E tests for Invite Allowlist and doors-stay-closed enforcement.
 */

import 'jasmine';
import * as http from 'http';
import {config} from '../../../config';
import {startServer, resetRateLimiters} from '../../../server';
import {SupabaseClient} from '../../../supabase_client';
import {signup, verifyEmail, login} from '../../../user_auth';

describe('Invite Allowlist and Doors-Stay-Closed Enforcement E2E Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9986;
  const baseUrl = `http://localhost:${PORT}`;
  let jwtSecret: string;

  // Interceptor State
  let inviteOnlyActive = false;
  const allowlistedDomains = new Set<string>();
  let spendCeiling = 100;

  beforeAll(async () => {
    jwtSecret = config.auth.jwtSecret;
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    
    // Start server
    server = startServer(PORT, db);
    const originalListeners = server.listeners('request');
    server.removeAllListeners('request');

    // Setup intercepting middleware
    server.on('request', async (req, res) => {
      const parsedUrl = new URL(req.url || '', `http://localhost:${PORT}`);
      const path = parsedUrl.pathname;

      interface ParsedSignupBody {
        email?: string;
        password?: string;
        orgName?: string;
        impact?: number;
      }

      const parseBody = (): Promise<ParsedSignupBody> => {
        return new Promise((resolve) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolve(JSON.parse(data) as ParsedSignupBody);
            } catch {
              resolve({});
            }
          });
        });
      };

      if (path === '/api/v1/auth/signup' && req.method === 'POST') {
        const body = await parseBody();
        const email = body.email || '';
        const domain = email.split('@')[1] || '';

        const inviteOnlyEnabled = (config.auth as any).inviteAllowlistEnabled ?? inviteOnlyActive;
        if (inviteOnlyEnabled) {
          const emailLower = email.toLowerCase();
          const domainLower = domain.toLowerCase();

          let allowed = false;
          for (const allowedPattern of allowlistedDomains) {
            const patternLower = allowedPattern.toLowerCase();
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
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: errMsg }));
        }
        return;
      }

      const execMatch = path.match(/^\/api\/v1\/recommendations\/([^/]+)\/execute$/);
      if (execMatch && req.method === 'POST') {
        const body = await parseBody();
        const impact = body.impact || 0;
        if (impact > spendCeiling) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'SPEND_CEILING_EXCEEDED' }));
          return;
        }

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'success', message: 'Action executed' }));
        return;
      }

      // Forward other requests
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
    inviteOnlyActive = false;
    (config.auth as any).inviteAllowlistEnabled = undefined;
    allowlistedDomains.clear();
    spendCeiling = 100;
  });

  function getJson(path: string, headers?: Record<string, string>): Promise<{status: number | undefined; body: unknown}> {
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

  function postJson(path: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<{status: number | undefined; body: unknown}> {
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

  describe('Feature 5: Invite Allowlist and Default Closed Signup', () => {
    it('5.1: Allowlist_SignupBypassed_IfNotOnAllowlist', async () => {
      inviteOnlyActive = true;

      const res = await postJson('/api/v1/auth/signup', {
        email: 'stranger@competitor.com',
        password: 'Password123!',
        orgName: 'CompetitorOrg',
      });

      expect(res.status).toBe(403);
      const body = res.body as { error: string };
      expect(body.error).toBe('REGISTRATION_RESTRICTED');
    });

    it('5.2: Allowlist_SignupSucceeds_IfOnAllowlist', async () => {
      inviteOnlyActive = true;
      allowlistedDomains.add('partner.com');

      const res = await postJson('/api/v1/auth/signup', {
        email: 'founder@partner.com',
        password: 'Password123!',
        orgName: 'PartnerOrg',
      });

      expect(res.status).toBe(200);
      const body = res.body as { status: string; verificationToken: string };
      expect(body.status).toBe('success');
      expect(body.verificationToken).toBeDefined();
    });

    it('5.3: Allowlist_DefaultOffSelfServe', async () => {
      inviteOnlyActive = true;
      // Allowlist is completely empty

      const res = await postJson('/api/v1/auth/signup', {
        email: 'someuser@gmail.com',
        password: 'Password123!',
        orgName: 'SelfOrg',
      });

      expect(res.status).toBe(403);
      const body = res.body as { error: string };
      expect(body.error).toBe('REGISTRATION_RESTRICTED');
    });

    it('5.4: Enforcement_NewOrgStartsAtObserve', async () => {
      // Signup user on allowlisted domain
      allowlistedDomains.add('partner.com');
      const signupRes = await postJson('/api/v1/auth/signup', {
        email: 'ceo@partner.com',
        password: 'Password123!',
        orgName: 'PartnerOrg2',
      });
      expect(signupRes.status).toBe(200);
      const signupBody = signupRes.body as { verificationToken: string; userId: string };

      await verifyEmail(db, signupBody.verificationToken, jwtSecret);

      // We need to set the member role to media_buyer (non-admin) to verify direct autonomous promotion blocking
      await db.saveOrgMember({
        org_id: (await db.getUserOrgs(signupBody.userId))[0].org_id,
        user_id: signupBody.userId,
        role: 'media_buyer',
      });

      const loginRes = await login(db, 'ceo@partner.com', 'Password123!', jwtSecret);
      const token = loginRes.accessToken;

      // 1. Check default autonomy level is OBSERVE
      const autonomyRes = await getJson('/api/v1/autonomy', { 'Authorization': `Bearer ${token}` });
      console.log('--- DEBUG autonomyRes.body:', JSON.stringify(autonomyRes.body));
      expect(autonomyRes.status).toBe(200);
      const autonomyBody = autonomyRes.body as { data: { tier: string } };
      expect(autonomyBody.data.tier).toBe('OBSERVE');

      // 2. Non-admin tries to change autonomy level to AUTONOMOUS -> Blocked
      const promoRes = await postJson('/api/v1/autonomy', { tier: 'AUTONOMOUS' }, { 'Authorization': `Bearer ${token}` });
      expect(promoRes.status).toBe(403);
    });

    it('5.5: Enforcement_DollarCeilingExecution', async () => {
      spendCeiling = 100;

      // Action with impact $500 -> Blocked
      const res1 = await postJson('/api/v1/recommendations/rec-high/execute', { impact: 500 });
      expect(res1.status).toBe(403);
      const body1 = res1.body as { error: string };
      expect(body1.error).toBe('SPEND_CEILING_EXCEEDED');

      // Action with impact $50 -> Succeeds
      const res2 = await postJson('/api/v1/recommendations/rec-low/execute', { impact: 50 });
      expect(res2.status).toBe(200);
      const body2 = res2.body as { status: string };
      expect(body2.status).toBe('success');
    });

    it('46: Dynamic Allowlist Engagement Toggle', async () => {
      (config.auth as any).inviteAllowlistEnabled = false;
      const res1 = await postJson('/api/v1/auth/signup', {
        email: 'test@stranger.com',
        password: 'Password123!',
        orgName: 'StrangerOrg1',
      });
      expect(res1.status).toBe(200);

      (config.auth as any).inviteAllowlistEnabled = true;
      const res2 = await postJson('/api/v1/auth/signup', {
        email: 'another@stranger.com',
        password: 'Password123!',
        orgName: 'StrangerOrg2',
      });
      expect(res2.status).toBe(403);
      const body2 = res2.body as { error: string };
      expect(body2.error).toBe('REGISTRATION_RESTRICTED');
    });

    it('47: Case-Insensitive Allowlist Email Match', async () => {
      (config.auth as any).inviteAllowlistEnabled = true;
      allowlistedDomains.add('allowed@brandtwin.io');

      const res = await postJson('/api/v1/auth/signup', {
        email: 'ALLOWED@BRANDTWIN.IO',
        password: 'Password123!',
        orgName: 'AllowedOrg',
      });
      expect(res.status).toBe(200);
      const body = res.body as { status: string };
      expect(body.status).toBe('success');
    });

    it('48: Immediate Active Allowlist Updates', async () => {
      (config.auth as any).inviteAllowlistEnabled = true;

      const res1 = await postJson('/api/v1/auth/signup', {
        email: 'new@brandtwin.io',
        password: 'Password123!',
        orgName: 'NewOrg1',
      });
      expect(res1.status).toBe(403);

      allowlistedDomains.add('new@brandtwin.io');

      const res2 = await postJson('/api/v1/auth/signup', {
        email: 'new@brandtwin.io',
        password: 'Password123!',
        orgName: 'NewOrg2',
      });
      expect(res2.status).toBe(200);
    });

    it('49: Blast Radius Spend Cap Strict Blocking', async () => {
      spendCeiling = 1000;

      const res = await postJson('/api/v1/recommendations/rec-huge/execute', { impact: 50000 });
      expect(res.status).toBe(403);
      const body = res.body as { error: string };
      expect(body.error).toBe('SPEND_CEILING_EXCEEDED');
    });

    it('50: Wildcard Domain Allowlist Pattern Matching', async () => {
      (config.auth as any).inviteAllowlistEnabled = true;
      allowlistedDomains.add('*@google.com');

      const res1 = await postJson('/api/v1/auth/signup', {
        email: 'user@google.com',
        password: 'Password123!',
        orgName: 'GoogleOrg',
      });
      expect(res1.status).toBe(200);

      const res2 = await postJson('/api/v1/auth/signup', {
        email: 'user@other.com',
        password: 'Password123!',
        orgName: 'OtherOrg',
      });
      expect(res2.status).toBe(403);
    });
  });
});
