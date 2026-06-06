/**
 * @fileoverview End-to-end tests for Readiness probe, Health Check, recommendations, risks and RLS tenant separation.
 */

import 'jasmine';
import * as http from 'http';
import {config} from '../../../config';
import {startServer, resetRateLimiters} from '../../../server';
import {SupabaseClient} from '../../../supabase_client';
import {login, signup, verifyEmail} from '../../../user_auth';

describe('Ready & Health Check E2E Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9983;
  const baseUrl = `http://localhost:${PORT}`;
  const jwtSecret = config.auth.jwtSecret;

  beforeAll(async () => {
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    server = startServer(PORT, db);
  });

  beforeEach(() => {
    resetRateLimiters();
    db.resetLocalMockDb();
  });

  afterAll((done) => {
    server.close(done);
  });

  interface HealthResponseBody {
    data: {
      status?: string;
      pulse?: {
        overallScore: number;
        activeAlerts: number;
        recentWins: number;
        uptimePct: number;
      };
      clientsCount?: number;
      recommendations?: unknown[];
      risks?: unknown[];
    };
  }

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

  describe('R3: Readiness, Health and Tenant Isolation', () => {
    let tenantAToken: string;
    let tenantBToken: string;
    let tenantAOrgId: string;
    let tenantBOrgId: string;

    beforeEach(async () => {
      // 1. Setup Tenant A
      const emailA = 'tenantA@example.com';
      const pwA = 'Password123!';
      const orgNameA = 'TenantAOrg';

      let userA = await db.getUserByEmail(emailA);
      if (!userA) {
        const signupResA = await signup(db, emailA, pwA, orgNameA, jwtSecret, true);
        await verifyEmail(db, signupResA.verificationToken, jwtSecret);
        userA = signupResA.user;
      }

      const loginA = await login(db, emailA, pwA, jwtSecret);
      tenantAToken = loginA.accessToken;
      const orgsA = await db.getUserOrgs(userA.user_id);
      tenantAOrgId = orgsA[0].org_id;

      // Clean existing client profile for Tenant A
      await db.hardDeleteTenantData(tenantAOrgId);

      // Seed client profile for Tenant A
      await db.saveClient({
        clientId: 'cli-a-1',
        orgId: tenantAOrgId,
        name: 'Client A1',
        mrr: 1500,
        marginTarget: 0.35,
        healthScore: 88,
        churnRisk: 0.05,
        tenantId: tenantAOrgId,
      });

      // 2. Setup Tenant B
      const emailB = 'tenantB@example.com';
      const pwB = 'Password123!';
      const orgNameB = 'TenantBOrg';

      let userB = await db.getUserByEmail(emailB);
      if (!userB) {
        const signupResB = await signup(db, emailB, pwB, orgNameB, jwtSecret, true);
        await verifyEmail(db, signupResB.verificationToken, jwtSecret);
        userB = signupResB.user;
      }

      const loginB = await login(db, emailB, pwB, jwtSecret);
      tenantBToken = loginB.accessToken;
      const orgsB = await db.getUserOrgs(userB.user_id);
      tenantBOrgId = orgsB[0].org_id;

      // Clean existing client profile for Tenant B
      await db.hardDeleteTenantData(tenantBOrgId);

      // Seed client profile for Tenant B
      await db.saveClient({
        clientId: 'cli-b-1',
        orgId: tenantBOrgId,
        name: 'Client B1',
        mrr: 2000,
        marginTarget: 0.40,
        healthScore: 92,
        churnRisk: 0.02,
        tenantId: tenantBOrgId,
      });
    });

    it('1. Readiness Probe Check', async () => {
      const res = await getJson('/ready');
      expect(res.status).toBe(200);
      const body = res.body as HealthResponseBody;
      expect(body.data.status).toBe('ready');

      const res2 = await getJson('/readyz');
      expect(res2.status).toBe(200);
      const body2 = res2.body as HealthResponseBody;
      expect(body2.data.status).toBe('ready');
    });

    it('2. Health Pulse Check', async () => {
      const res = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tenantAToken}` });
      expect(res.status).toBe(200);
      const body = res.body as HealthResponseBody;
      expect(body.data.status).toBe('healthy');
      expect(body.data.pulse?.overallScore).toBe(78);
      expect(body.data.clientsCount).toBe(1);
    });

    it('3. Recommendations Engine Logic', async () => {
      // Recommendations for Tenant A
      const res = await getJson('/api/v1/recommendations', { 'Authorization': `Bearer ${tenantAToken}` });
      expect(res.status).toBe(200);
      const body = res.body as HealthResponseBody;
      expect(body.data.recommendations).toBeDefined();
      expect(Array.isArray(body.data.recommendations)).toBeTrue();
    });

    it('4. Risks and Anomalies Detection', async () => {
      // Risks for Tenant A
      const res = await getJson('/api/v1/risks', { 'Authorization': `Bearer ${tenantAToken}` });
      expect(res.status).toBe(200);
      const body = res.body as HealthResponseBody;
      expect(body.data.risks).toBeDefined();
      expect(Array.isArray(body.data.risks)).toBeTrue();
    });

    it('5. No Tenant Cross-Talk (Separation)', async () => {
      // Tenant A health check returns 1 client (Client A1)
      const resA = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tenantAToken}` });
      expect(resA.status).toBe(200);
      const bodyA = resA.body as HealthResponseBody;
      expect(bodyA.data.clientsCount).toBe(1);

      // Tenant B health check returns 1 client (Client B1)
      const resB = await getJson('/api/v1/health', { 'Authorization': `Bearer ${tenantBToken}` });
      expect(resB.status).toBe(200);
      const bodyB = resB.body as HealthResponseBody;
      expect(bodyB.data.clientsCount).toBe(1);

      // Verify DB level isolation as well
      const dbA = db.clone();
      dbA.setTenantContext(tenantAOrgId);
      const clientsA = await dbA.getClients(tenantAOrgId);
      expect(clientsA.length).toBe(1);
      expect(clientsA[0].name).toBe('Client A1');

      const dbB = db.clone();
      dbB.setTenantContext(tenantBOrgId);
      const clientsB = await dbB.getClients(tenantBOrgId);
      expect(clientsB.length).toBe(1);
      expect(clientsB[0].name).toBe('Client B1');
    });
  });
});
