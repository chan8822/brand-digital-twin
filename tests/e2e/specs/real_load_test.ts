/**
 * @fileoverview P1.7 Real Load Tests driving the server over HTTP.
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

describe('P1.7 Production Load & Scale Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9987;
  const baseUrl = `http://localhost:${PORT}`;
  let jwtSecret: string;

  beforeAll(async () => {
    config.rateLimit.maxRequests = 50000; // Allow high traffic for load test
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

  function getJson(
    path: string,
    headers?: Record<string, string>,
  ): Promise<{status: number | undefined; body: any}> {
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
  ): Promise<{status: number | undefined; body: any}> {
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

  it('Scenario 1: High concurrent tenants on /sweep & /recommendations', async () => {
    const N = 20; // 20 concurrent tenants
    const tenants: Array<{orgId: string; token: string}> = [];

    // 1. Bootstrap N tenants
    for (let i = 1; i <= N; i++) {
      const email = `loadtenant${i}@example.com`;
      const pw = 'Password123!';
      const orgName = `LoadOrg${i}`;
      
      const signupRes = await signup(db, email, pw, orgName, jwtSecret, true);
      await verifyEmail(db, signupRes.verificationToken, jwtSecret);
      
      const loginRes = await login(db, email, pw, jwtSecret);
      const orgs = await db.getUserOrgs(signupRes.user.user_id);
      const orgId = orgs[0].org_id;

      // Seed campaign for this tenant to make sweep/recommendations do work
      await db.saveCampaign({
        campaign_id: `camp-load-${i}`,
        platform: 'google',
        name: `Load Campaign ${i}`,
        objective: 'sales',
        status: 'ENABLED',
        surface: 'google_search_network',
        tenant_id: orgId,
        source_system: 'google',
        source_id: `camp-load-${i}`,
        source_version: '1.0',
        ingested_at: new Date().toISOString(),
      });

      tenants.push({orgId, token: loginRes.accessToken});
    }

    // 2. Fire concurrent /sweep and /recommendations requests
    const sweepPromises = tenants.map(t => 
      getJson('/api/v1/sweep', {Authorization: `Bearer ${t.token}`})
    );
    const recPromises = tenants.map(t => 
      getJson('/api/v1/recommendations', {Authorization: `Bearer ${t.token}`})
    );

    const start = performance.now();
    const sweepResults = await Promise.all(sweepPromises);
    const recResults = await Promise.all(recPromises);
    const duration = performance.now() - start;

    // 3. Asserts
    for (const r of sweepResults) {
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('success');
      expect(r.body.data.sweep).toBeDefined();
    }
    for (const r of recResults) {
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('success');
      expect(r.body.data.recommendations).toBeDefined();
    }

    const avgLatency = duration / (N * 2);
    console.log(`[LOAD_TEST] Concurrent Sweep+Rec Avg Latency for ${N} tenants: ${avgLatency.toFixed(1)}ms`);
    // Assert p95 or average is within budget (5000ms)
    expect(avgLatency).toBeLessThan(5000);

    // 4. Verify P1.2 Metrics
    const metricsRes = await getJson('/metrics');
    expect(metricsRes.status).toBe(200);
    const metrics = metricsRes.body.data.metrics as any[];
    const spans = metricsRes.body.data.spans as any[];

    expect(metrics.length).toBeGreaterThan(0);
    expect(spans.length).toBeGreaterThan(0);
    
    // Check for alerts
    const alerts = metricsRes.body.data.alerts as string[];
    console.log(`[LOAD_TEST] Active alerts during run:`, alerts);
  });

  it('Scenario 2: EventSource (SSE) Fan-out with N concurrent clients', (done) => {
    const N = 30; // 30 concurrent SSE connections
    const tokens: string[] = [];
    const clients: http.ClientRequest[] = [];
    let connectedCount = 0;
    let eventsReceived = 0;

    // 1. Generate N tokens
    for (let i = 1; i <= N; i++) {
      const token = signJwt(
        {
          userId: `user-sse-${i}`,
          orgId: 'test-tenant',
          role: 'media_buyer',
        },
        jwtSecret,
        3600 * 1000,
      );
      tokens.push(token);
    }

    // 2. Connect N clients
    for (let i = 0; i < N; i++) {
      const clientReq = http.get(`${baseUrl}/api/v1/stream?token=${tokens[i]}`, (sseRes) => {
        expect(sseRes.statusCode).toBe(200);
        
        sseRes.on('data', (chunk) => {
          const raw = chunk.toString();
          if (raw.includes('"type":"connected"')) {
            connectedCount++;
            if (connectedCount === N) {
              // All connected, trigger event
              triggerEvent();
            }
          } else if (raw.includes('"type":"phase_update"')) {
            eventsReceived++;
            if (eventsReceived === N) {
              // All received the event, clean up and finish
              cleanup();
            }
          }
        });
      });
      clientReq.on('error', (err) => {
        fail(`Client ${i} failed: ${err.message}`);
        done();
      });
      clients.push(clientReq);
    }

    function triggerEvent() {
      // Emit a mock event on eventBus, which should fan out to all clients
      eventBus.emitPhaseUpdate('test-tenant', 'load-action-key', 'PLAN', 'COMPLETE', {cost: 0});
    }

    function cleanup() {
      for (const client of clients) {
        client.destroy();
      }
      expect(connectedCount).toBe(N);
      expect(eventsReceived).toBe(N);
      done();
    }
  });
});
