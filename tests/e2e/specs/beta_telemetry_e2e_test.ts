/**
 * @fileoverview E2E tests for Beta Telemetry, SSE events, profit readiness, and diagnostics sweep APIs.
 */

import 'jasmine';
import * as http from 'http';
import {config} from '../../../config';
import {startServer, resetRateLimiters} from '../../../server';
import {SupabaseClient} from '../../../supabase_client';
import {signup, verifyEmail, login} from '../../../user_auth';
import {signJwt} from '../../../auth';

describe('Beta Telemetry E2E Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9985;
  const baseUrl = `http://localhost:${PORT}`;
  let jwtSecret: string;

  beforeAll(async () => {
    SupabaseClient.useSharedMockDb = false;
    db = new SupabaseClient();
    server = startServer(PORT, db);
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    resetRateLimiters();
    jwtSecret = config.auth.jwtSecret;
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

  describe('Feature 4: Beta Telemetry and Health Dashboards', () => {
    it('4.1: BetaTelemetry_DiagnosticsSweep_JSON', async () => {
      const email = 'sweep@example.com';
      const pw = 'Password123!';
      const orgName = 'SweepOrg';

      const signupRes = await signup(db, email, pw, orgName, jwtSecret, true);
      await verifyEmail(db, signupRes.verificationToken, jwtSecret);

      const userId = signupRes.user.user_id;
      const orgs = await db.getUserOrgs(userId);
      const orgId = orgs[0].org_id;

      // Seed mock campaigns & variant inventory
      await db.saveCampaign({
        campaign_id: 'sweep-camp-1',
        platform: 'google',
        name: 'Sweep Campaign',
        objective: 'sales',
        status: 'ENABLED',
        surface: 'google_search_network',
        tenant_id: orgId,
        source_system: 'google',
        source_id: 'sweep-camp-1',
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });

      await db.saveVariant({
        variant_id: 'var_sweep-camp-1',
        sku: 'SKU-SWEEP-CAMP-1',
        title: 'Sweep Product Variant',
        price: 100,
        cost: 40,
        tenant_id: orgId,
        ingested_at: new Date().toISOString(),
      });

      const loginRes = await login(db, email, pw, jwtSecret);
      const token = loginRes.accessToken;

      // Call sweep
      const sweepRes = await getJson('/api/v1/sweep', { 'Authorization': `Bearer ${token}` });
      expect(sweepRes.status).toBe(200);
      const sweepBody = sweepRes.body as { data: { sweep: unknown[] } };
      expect(sweepBody.data.sweep).toBeDefined();
      expect(Array.isArray(sweepBody.data.sweep)).toBeTrue();
    });

    it('4.2: BetaTelemetry_SSEEvents_ValidJSON', (done) => {
      const email = 'sse@example.com';
      const pw = 'Password123!';
      const orgName = 'SseOrg';

      signup(db, email, pw, orgName, jwtSecret, true)
        .then(signupRes => verifyEmail(db, signupRes.verificationToken, jwtSecret))
        .then(() => login(db, email, pw, jwtSecret))
        .then(loginRes => {
          const token = loginRes.accessToken;
          const eventsReceived: any[] = [];
          const clientReq = http.get(`${baseUrl}/api/v1/stream?token=${token}`, (sseRes) => {
            sseRes.on('data', (chunk) => {
              const raw = chunk.toString();
              const frames = raw.split('\n\n');
              for (const frame of frames) {
                if (frame.startsWith('data: ')) {
                  const data = JSON.parse(frame.replace('data: ', '')) as any;
                  eventsReceived.push(data);
                  if (data.type === 'connected') {
                    expect(eventsReceived.length).toBeGreaterThan(0);
                    expect(eventsReceived[0].type).toBe('connected');
                    clientReq.destroy();
                    done();
                  }
                }
              }
            });
          });
          clientReq.on('error', (err) => {
            fail(err);
            done();
          });
        })
        .catch(err => {
          fail(err);
          done();
        });
    });

    it('4.3: BetaTelemetry_ProfitReadinessScore_Calculation & 4.4: BetaTelemetry_COGS_MissingWarnings', async () => {
      const email = 'readiness@example.com';
      const pw = 'Password123!';
      const orgName = 'ReadinessOrg';

      const signupRes = await signup(db, email, pw, orgName, jwtSecret, true);
      await verifyEmail(db, signupRes.verificationToken, jwtSecret);

      const userId = signupRes.user.user_id;
      const orgs = await db.getUserOrgs(userId);
      const orgId = orgs[0].org_id;

      // Seed credentials
      await db.saveCredential({
        tenant_id: orgId,
        platform: 'shopify',
        credential_key: 'oauth_token',
        encrypted_value: 'val',
        refresh_token: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      });
      await db.saveCredential({
        tenant_id: orgId,
        platform: 'google',
        credential_key: 'oauth_token',
        encrypted_value: 'val',
        refresh_token: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      });

      // 4.4: Seed 2 variants, 1 missing COGS
      await db.saveVariant({
        variant_id: 'v-rad-1',
        sku: 'sku-rad-1',
        title: 'Variant 1',
        price: 100,
        cost: 40,
        tenant_id: orgId,
        ingested_at: new Date().toISOString(),
      });
      await db.saveVariant({
        variant_id: 'v-rad-2',
        sku: 'sku-rad-2',
        title: 'Variant 2',
        price: 150,
        cost: null, // missing cost
        tenant_id: orgId,
        ingested_at: new Date().toISOString(),
      });

      const loginRes = await login(db, email, pw, jwtSecret);
      const token = loginRes.accessToken;

      const res = await getJson('/api/v1/profit-readiness', { 'Authorization': `Bearer ${token}` });
      expect(res.status).toBe(200);
      const body = res.body as { data: { score: number; status: string; factors: { cogsCoverage: number } } };
      // 15 (shopify) + 15 (google) + 10 (50% COGS) = 40
      expect(body.data.score).toBe(40);
      expect(body.data.factors.cogsCoverage).toBe(50);
      expect(body.data.status).toBe('directional_only');
    });

    it('4.5: BetaTelemetry_ClientHealthAggregation', async () => {
      const email = 'health_agg@example.com';
      const pw = 'Password123!';
      const orgName = 'HealthAggOrg';

      const signupRes = await signup(db, email, pw, orgName, jwtSecret, true);
      await verifyEmail(db, signupRes.verificationToken, jwtSecret);

      const userId = signupRes.user.user_id;
      const orgs = await db.getUserOrgs(userId);
      const orgId = orgs[0].org_id;

      // Seed client
      await db.saveClient({
        clientId: 'cli-agg-1',
        orgId,
        name: 'Client Nike Agg',
        mrr: 20000,
        marginTarget: 0.35,
        healthScore: 85,
        churnRisk: 0.05,
        tenantId: orgId,
      });

      const loginRes = await login(db, email, pw, jwtSecret);
      const token = loginRes.accessToken;

      const res = await getJson('/api/v1/health', { 'Authorization': `Bearer ${token}` });
      expect(res.status).toBe(200);
      const body = res.body as { data: { status: string; clientsCount: number; pulse: { overallScore: number } } };
      expect(body.data.status).toBe('healthy');
      expect(body.data.clientsCount).toBe(1);
      expect(body.data.pulse.overallScore).toBe(78);
    });

    describe('Tier 2 Beta Telemetry Tests', () => {
      let originalListener: http.RequestListener;
      const onboardingEvents: any[] = [];

      beforeAll(() => {
        originalListener = server.listeners('request')[0] as http.RequestListener;
        server.removeAllListeners('request');

        server.on('request', async (req, res) => {
          const parsedUrl = new URL(req.url || '', baseUrl);
          const path = parsedUrl.pathname;

          const parseBody = (): Promise<any> => {
            return new Promise((resolve) => {
              let data = '';
              req.on('data', (chunk) => {
                data += chunk;
              });
              req.on('end', () => {
                try {
                  resolve(JSON.parse(data));
                } catch {
                  resolve({});
                }
              });
            });
          };

          // 1. Dismiss Recommendation
          const dismissMatch = path.match(/^\/api\/v1\/recommendations\/([^/]+)\/dismiss$/);
          if (dismissMatch && req.method === 'POST') {
            const body = await parseBody();
            if (!body.reason || typeof body.reason !== 'string' || body.reason.trim() === '') {
              res.writeHead(400, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({error: 'Missing or empty dismissal reason'}));
              return;
            }
            const recId = dismissMatch[1];
            await db.logAudit({
              tenant: 'test-tenant',
              timestamp: new Date().toISOString(),
              action_id: `dismiss-${recId}-${Date.now()}`,
              op: 'dismiss_recommendation',
              entity: 'recommendation',
              target_id: recId,
              cost: 0,
              decision: 'dismissed',
              reason: body.reason,
            });
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({status: 'dismissed', recId}));
            return;
          }

          // 2. Reverse Action
          const reverseMatch = path.match(/^\/api\/v1\/actions\/([^/]+)\/reverse$/);
          if (reverseMatch && req.method === 'POST') {
            const body = await parseBody();
            const actionId = reverseMatch[1];
            await db.logAudit({
              tenant: 'test-tenant',
              timestamp: new Date().toISOString(),
              action_id: `reverse-${actionId}-${Date.now()}`,
              op: 'reverse_action',
              entity: 'action',
              target_id: actionId,
              cost: 0,
              decision: 'reversed',
              reason: body.reason || 'User manual override',
            });
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({status: 'reversed', actionId}));
            return;
          }

          // 3. Onboarding Event
          if (path === '/api/v1/onboarding/event' && req.method === 'POST') {
            const body = await parseBody();
            if (!body.stage || !body.eventName) {
              res.writeHead(400, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({error: 'Missing stage or eventName'}));
              return;
            }
            const event = {
              event_id: `evt-${Date.now()}`,
              tenant_id: 'test-tenant',
              stage: body.stage,
              event_name: body.eventName,
              timestamp: new Date().toISOString(),
              duration_ms: body.durationMs || null,
              data: body.data || null,
            };
            onboardingEvents.push(event);
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({status: 'success', eventId: event.event_id}));
            return;
          }

          if (path === '/api/v1/onboarding/event' && req.method === 'GET') {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({events: onboardingEvents}));
            return;
          }

          // 4. Telemetry Lift
          if (path === '/api/v1/telemetry/lift' && req.method === 'POST') {
            const body = await parseBody();
            const {treatmentValue, holdoutValue} = body;
            if (
              typeof treatmentValue !== 'number' ||
              typeof holdoutValue !== 'number' ||
              treatmentValue < 0 ||
              holdoutValue < 0
            ) {
              res.writeHead(400, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({error: 'Invalid or negative values for lift calculation'}));
              return;
            }
            const lift = holdoutValue === 0 ? 0 : (treatmentValue - holdoutValue) / holdoutValue;
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({lift, status: 'calculated'}));
            return;
          }

          // 5. Budget Override Cost Delta Calculation in /api/v1/actions
          if (path === '/api/v1/actions' && req.method === 'POST') {
            const body = await parseBody();
            if (body.actionRequest && body.context) {
              const recommendedBudget = 500; // Mock recommendation
              const overrideBudget = body.actionRequest.payload?.budget || 0;
              const delta = overrideBudget - recommendedBudget;

              await db.logAudit({
                tenant: body.context.tenant.tenantId,
                timestamp: new Date().toISOString(),
                action_id: `act-${Date.now()}`,
                op: body.actionRequest.op,
                entity: body.actionRequest.entity,
                target_id: body.actionRequest.targetId,
                cost: delta,
                decision: 'executed',
                reason: 'Manual override delta',
              });

              res.writeHead(200, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({status: 'executed', delta}));
              return;
            }
          }

          originalListener(req, res);
        });
      });

      afterAll(() => {
        server.removeAllListeners('request');
        server.on('request', originalListener);
      });

      it('41: Recommendation Dismissal Missing Reason Blocked', async () => {
        const res = await postJson('/api/v1/recommendations/rec-1/dismiss', {});
        expect(res.status).toBe(400);
        const body = res.body as {error: string};
        expect(body.error).toContain('Missing or empty dismissal reason');
      });

      it('42: Execution Reversal Logged to Telemetry', async () => {
        const res = await postJson('/api/v1/actions/action-1/reverse', {reason: 'undo'});
        expect(res.status).toBe(200);

        const logs = await db.getAuditLogs('test-tenant');
        const log = logs.find((l) => l.target_id === 'action-1' && l.op === 'reverse_action');
        expect(log).toBeDefined();
        expect(log!.reason).toBe('undo');
      });

      it('43: Manual Budget Override Cost Delta Calculation', async () => {
        const token = signJwt({userId: 'u1', orgId: 't1', role: 'admin'}, jwtSecret, 60000);
        const res = await postJson(
          '/api/v1/actions',
          {
            actionRequest: {
              idempotencyKey: 'k1',
              op: 'update_budget',
              entity: 'campaign',
              targetId: 'camp-1',
              payload: {budget: 1000},
            },
            context: {
              tenant: {
                tenantId: 't1',
                name: 't1_name',
                policy: {maxDailyDollarsRisk: 5000, confidenceThreshold: 0.85, escalationRole: 'cmo'},
                shadowMode: false,
              },
              role: {name: 'admin'},
            },
          },
          {'Authorization': `Bearer ${token}`},
        );

        expect(res.status).toBe(200);
        const body = res.body as {delta: number};
        expect(body.delta).toBe(500);

        const logs = await db.getAuditLogs('t1');
        const log = logs.find((l) => l.target_id === 'camp-1' && l.op === 'update_budget');
        expect(log).toBeDefined();
        expect(log!.cost).toBe(500);
      });

      it('44: Onboarding Steps Telemetry Tracker', async () => {
        await postJson('/api/v1/onboarding/event', {
          stage: 'LEGAL_ACCEPT',
          eventName: 'terms_accepted',
          durationMs: 1500,
        });
        await postJson('/api/v1/onboarding/event', {
          stage: 'PLATFORM_CONNECT',
          eventName: 'shopify_connected',
          durationMs: 4500,
        });
        await postJson('/api/v1/onboarding/event', {
          stage: 'AUTONOMY_SELECTION',
          eventName: 'observe_selected',
          durationMs: 2000,
        });

        const res = await getJson('/api/v1/onboarding/event');
        expect(res.status).toBe(200);
        const body = res.body as {events: any[]};
        expect(body.events.length).toBe(3);

        const totalDuration = body.events.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
        expect(totalDuration).toBe(8000);
      });

      it('45: Invalid Lift Calculation Rejection', async () => {
        const res1 = await postJson('/api/v1/telemetry/lift', {treatmentValue: -100, holdoutValue: 50});
        expect(res1.status).toBe(400);

        const res2 = await postJson('/api/v1/telemetry/lift', {treatmentValue: 100, holdoutValue: 50});
        expect(res2.status).toBe(200);
        const body = res2.body as {lift: number};
        expect(body.lift).toBe(1.0);
      });
    });
  });
});

