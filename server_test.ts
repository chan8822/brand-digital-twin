/**
 * @fileoverview Integration tests for Native HTTP and SSE Server.
 */

// taze: require from //third_party/javascript/typings/node

import * as crypto from 'crypto';
import * as http from 'http';
import * as url from 'url';
import {config} from './config';
import {eventBus} from './event_bus';
import {resetRateLimiters, startServer} from './server';
import {SupabaseClient} from './supabase_client';

function signJwt(payload: any, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}


describe('Native HTTP & SSE Server Integration Test', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9988;
  const baseUrl = `http://localhost:${PORT}`;

  const testToken = signJwt(
    {
      userId: 'test-user',
      orgId: 'test-tenant',
      role: 'media_buyer',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    config.auth.jwtSecret,
  );

  const validContextTemplate = {
    tenant: {
      tenantId: 'test-tenant',
      name: 'Nike Agency',
      policy: {
        maxDailyDollarsRisk: 1000,
        confidenceThreshold: 80,
        escalationRole: 'cmo',
      },
      shadowMode: false,
    },
    role: {name: 'media_buyer', permissions: []},
  };

  beforeAll(async () => {
    db = new SupabaseClient();
    // Pre-populate mock database structures for testing
    await db.saveClient({
      clientId: 'client-nike',
      orgId: 'org-nike',
      name: 'Nike Marketing',
      mrr: 15000,
      marginTarget: 0.4,
      healthScore: 92,
      churnRisk: 0.1,
      tenantId: 'test-tenant',
    });
    await db.saveApproval({
      approvalId: 'app-1',
      orgId: 'org-nike',
      entityType: 'budget_shift',
      entityId: 'campaign-nike-1',
      requestedBy: 'analyst_agent',
      assignedTo: 'cmo',
      status: 'pending',
      tenantId: 'test-tenant',
      createdAt: Date.now(),
    });
    await db.saveTrustTier('test-tenant', 'pause', 3);

    server = startServer(PORT, db);
  });

  beforeEach(() => {
    resetRateLimiters();
    eventBus.cleanup();
  });

  afterAll((done) => {
    server.close(done);
  });

  function getJsonFromUrl(urlStr: string, headers?: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsed = url.parse(urlStr);
      http
        .get(
          {
            hostname: parsed.hostname,
            port: parsed.port ? Number(parsed.port) : undefined,
            path: parsed.path,
            headers: headers || {Authorization: `Bearer ${testToken}`},
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk.toString();
            });
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(data);
              }
            });
          },
        )
        .on('error', reject);
    });
  }

  function getJson(path: string, headers?: Record<string, string>): Promise<any> {
    return getJsonFromUrl(`${baseUrl}${path}`, headers);
  }

  function postJson(path: string, body: any, headers?: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      const req = http.request(
        {
          hostname: 'localhost',
          port: PORT,
          path: path,
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
            data += chunk.toString();
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          });
        },
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  it('should return healthy status on GET /api/v1/health', async () => {
    const res = await getJson('/api/v1/health');
    expect(res.status).toBe('success');
    expect(res.data.status).toBe('healthy');
    expect(res.data.pulse.overallScore).toBe(78);
    expect(res.data.clientsCount).toBeGreaterThan(0);
  });

  it('should return recommendations list on GET /api/v1/recommendations', async () => {
    // Generate some test brand signals to cause recommendations
    await db.saveBrandSignal({
      signalId: 'sig-1',
      tenantId: 'test-tenant',
      source: 'sentiment',
      type: 'low_performance_roi',
      severity: 'high',
      message: 'ROI dropped under threshold',
      payload: {campaignId: 'nike-summer-1'},
      timestamp: Date.now(),
    });

    const res = await getJson('/api/v1/recommendations');
    expect(res.status).toBe('success');
    expect(res.data.recommendations).toBeDefined();
    expect(res.data.recommendations.length).toBeGreaterThan(0);
    expect(res.data.recommendations[0].type).toBe('pause_campaign');
  });

  it('should retrieve approvals list on GET /api/v1/approvals', async () => {
    const res = await getJson('/api/v1/approvals');
    expect(res.status).toBe('success');
    expect(res.data.approvals).toBeDefined();
    expect(res.data.approvals.length).toBeGreaterThan(0);
    expect(res.data.approvals[0].approvalId).toBe('app-1');
  });

  it('should execute campaign actions and trigger SSE stream updates', (done) => {
    const token = signJwt(
      {
        userId: 'test-user',
        orgId: 'test-tenant',
        role: 'media_buyer',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      config.auth.jwtSecret,
    );

    const actionRequest = {
      idempotencyKey: 'action-test-sse',
      op: 'pause_campaign',
      entity: 'campaign',
      targetId: 'nike-summer-1',
      payload: {
        verifyMetrics: {
          preExecutionROAS: 2.5,
          postExecutionROAS: 2.6, // no anomaly
        },
      },
    };

    const context = validContextTemplate;

    const eventsReceived: any[] = [];
    const clientReq = http.get(`${baseUrl}/api/v1/stream?token=${token}`, (sseRes) => {
      sseRes.on('data', (chunk) => {
        const raw = chunk.toString();
        // SSE formatting could concatenate frames
        const frames = raw.split('\n\n');
        for (const frame of frames) {
          if (frame.startsWith('data: ')) {
            const data = JSON.parse(frame.replace('data: ', '')) as any;
            eventsReceived.push(data);

            if (
              data.type === 'phase_update' &&
              data.phase === 'AUDIT' &&
              data.status === 'COMPLETE'
            ) {
              // Ensure we received preceding phase events (PLAN, DECIDE, EXECUTE, VERIFY, AUDIT)
              const phases = eventsReceived.map((e) => e.phase);
              expect(phases).toContain('PLAN');
              expect(phases).toContain('DECIDE');
              expect(phases).toContain('EXECUTE');
              expect(phases).toContain('VERIFY');
              expect(phases).toContain('AUDIT');

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

    // Make the POST action call after a tiny timeout to ensure SSE is connected
    setTimeout(async () => {
      const res = await postJson(
        '/api/v1/actions',
        {actionRequest, context},
        {Authorization: `Bearer ${token}`},
      );
      expect(res.status).toBe('success');
      expect(res.data.status).toBe('executed');
    }, 100);
  });

  it('should securely persist compliance governance events in the database when executing an action', async () => {
    const actionRequest = {
      idempotencyKey: 'action-compliance-log-test',
      op: 'pause_campaign',
      entity: 'campaign',
      targetId: 'nike-summer-1',
      payload: {
        verifyMetrics: {
          preExecutionROAS: 2.5,
          postExecutionROAS: 2.6,
        },
      },
    };

    const res = await postJson(
      '/api/v1/actions',
      {actionRequest, context: validContextTemplate},
      {Authorization: `Bearer ${testToken}`},
    );

    expect(res.status).toBe('success');
    expect(res.data.status).toBe('executed');

    // Retrieve governance activities from db to verify persistence
    const events = await db.getGovernanceEvents('test-tenant');
    const actionEvents = events.filter((e) => e.action_id === 'action-compliance-log-test');

    // We expect events for plan, decide, etc.
    expect(actionEvents.length).toBeGreaterThan(0);
    const statuses = actionEvents.map((e) => e.status);
    expect(statuses).toContain('auto_execute');
  });

  it('should reject requests with missing token (401)', async () => {
    const res = await postJson('/api/v1/actions', {
      actionRequest: {
        idempotencyKey: 'missing-token',
        op: 'pause',
        entity: 'campaign',
        targetId: 'nike-summer-1',
      },
      context: validContextTemplate,
    });

    expect(res.status).toBe('error');
    expect(res.error.code).toBe('UNAUTHORIZED');
    expect(res.error.message).toContain('Missing authorization credentials');
  });

  it('should reject requests with invalid/expired token (401)', async () => {
    // Generate expired token
    const token = signJwt(
      {
        userId: 'test-user',
        orgId: 'test-tenant',
        role: 'media_buyer',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      },
      config.auth.jwtSecret,
    );

    const res = await postJson(
      '/api/v1/actions',
      {
        actionRequest: {
          idempotencyKey: 'expired-token',
          op: 'pause',
          entity: 'campaign',
          targetId: 'nike-summer-1',
        },
        context: validContextTemplate,
      },
      {Authorization: `Bearer ${token}`},
    );

    expect(res.status).toBe('error');
    expect(res.error.code).toBe('UNAUTHORIZED');
    expect(res.error.message).toContain('Token has expired');
  });

  it('should reject requests with tenant mismatch (400)', async () => {
    const token = signJwt(
      {
        userId: 'test-user',
        orgId: 'org-adidas', // Mismatched tenant org
        role: 'media_buyer',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      config.auth.jwtSecret,
    );

    const res = await postJson(
      '/api/v1/actions',
      {
        actionRequest: {
          idempotencyKey: 'mismatch-tenant',
          op: 'pause',
          entity: 'campaign',
          targetId: 'nike-summer-1',
        },
        context: {
          ...validContextTemplate,
          tenant: {
            ...validContextTemplate.tenant,
            tenantId: 'test-tenant', // Expected 'test-tenant'
          },
        },
      },
      {Authorization: `Bearer ${token}`},
    );

    expect(res.status).toBe('error');
    expect(res.error.code).toBe('VALIDATION_ERROR');
    expect(res.error.message).toContain('Tenant ID mismatch');
  });

  it('should reject invalid payload structure (400)', async () => {
    const token = signJwt(
      {
        userId: 'test-user',
        orgId: 'test-tenant',
        role: 'media_buyer',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      config.auth.jwtSecret,
    );

    const res = await postJson(
      '/api/v1/actions',
      {
        actionRequest: {
          idempotencyKey: 'invalid-payload',
          op: 'invalid_op', // Invalid op
          entity: 'campaign',
          targetId: 'nike-summer-1',
        },
        context: validContextTemplate,
      },
      {Authorization: `Bearer ${token}`},
    );

    expect(res.status).toBe('error');
    expect(res.error.code).toBe('VALIDATION_ERROR');
    expect(res.error.message).toContain('Invalid or missing op');
  });

  it('should reject request once token limit is exceeded (429)', async () => {
    resetRateLimiters();
    // Override rate limiting settings in global config
    const originalMax = config.rateLimit.maxRequests;
    const originalRefill = config.rateLimit.refillRatePerSec;
    config.rateLimit.maxRequests = 2;
    config.rateLimit.refillRatePerSec = 0; // Don't refill during this test

    const testDb = new SupabaseClient();
    const tempPort = 9989;
    const tempServer = startServer(tempPort, testDb);
    const tempUrl = `http://localhost:${tempPort}`;

    try {
      // First request -> succeeds
      const res1 = await getJsonFromUrl(`${tempUrl}/api/v1/health`);
      expect(res1.status).toBe('success');

      // Second request -> succeeds
      const res2 = await getJsonFromUrl(`${tempUrl}/api/v1/health`);
      expect(res2.status).toBe('success');

      // Third request -> fails with 429
      const res3 = await getJsonFromUrl(`${tempUrl}/api/v1/health`);
      expect(res3.status).toBe('error');
      expect(res3.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(res3.error.message).toContain('Rate limit exceeded');
    } finally {
      // Restore configurations and close temporary server
      config.rateLimit.maxRequests = originalMax;
      config.rateLimit.refillRatePerSec = originalRefill;
      await new Promise<void>((resolve) => tempServer.close(() => resolve()));
    }
  });

  it('should support end-to-end queue and approval resumption loop', async () => {
    // 1. Submit an action that exceeds the maximum daily dollars risk limit to queue it
    const actionPayload = {
      actionRequest: {
        idempotencyKey: 'resumption-test-key',
        op: 'update_budget',
        entity: 'campaign',
        targetId: '888', // campaign 888 has budget 500
        payload: {
          budget: 3000, // projected cost = 2500 > maxDailyDollarsRisk (1000)
        },
      },
      context: validContextTemplate,
    };

    const res1 = await postJson('/api/v1/actions', actionPayload, {
      Authorization: `Bearer ${testToken}`,
    });

    expect(res1.status).toBe('success');
    expect(res1.data.status).toBe('queued');

    // 2. Fetch approvals to verify the approval request is registered
    const approvalsRes = await getJson('/api/v1/approvals', {
      Authorization: `Bearer ${testToken}`,
    });
    expect(approvalsRes.status).toBe('success');
    const registeredApprovals = approvalsRes.data.approvals;
    const approval = registeredApprovals.find(
      (a: any) => a.approvalId === 'app_resumption-test-key',
    );
    expect(approval).toBeDefined();
    expect(approval.status).toBe('pending');
    expect(approval.assignedTo).toBe('cmo');

    // 3. Make token for cmo role to sign off the request
    const cmoToken = signJwt(
      {
        userId: 'test-cmo',
        orgId: 'test-tenant',
        role: 'cmo',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      config.auth.jwtSecret,
    );

    // 4. Submit approval resolution (POST /api/v1/approvals/app_resumption-test-key/approve)
    const approveRes = await postJson(
      `/api/v1/approvals/app_resumption-test-key/approve`,
      {},
      {Authorization: `Bearer ${cmoToken}`},
    );

    expect(approveRes.error ? approveRes.error.message : approveRes.status).toBe('success');
    expect(approveRes.data.status).toBe('executed');

    // 5. Verify the approval is marked approved in DB
    const finalApprovalsRes = await getJson('/api/v1/approvals', {
      Authorization: `Bearer ${testToken}`,
    });
    const finalApprovals = finalApprovalsRes.data.approvals;
    const finalApproval = finalApprovals.find(
      (a: any) => a.approvalId === 'app_resumption-test-key',
    );
    expect(finalApproval.status).toBe('approved');
    expect(finalApproval.completedAt).toBeGreaterThan(0);
  });
});
