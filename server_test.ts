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
import {GoogleAdsAdapter} from './google_ads_adapter';

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

  function requestRaw(
    path: string,
    method: 'GET' | 'POST',
    headers?: Record<string, string>,
  ): Promise<{statusCode?: number; headers: http.IncomingHttpHeaders; body: string}> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: PORT,
          path,
          method,
          headers,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk.toString();
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body,
            });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
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
    // Seed campaign, spend, orders, and touchpoints to trigger profitability analysis
    await db.saveCampaign({
      campaign_id: 'nike-summer-1',
      platform: 'google',
      name: 'Nike Summer Campaign',
      objective: 'sales',
      status: 'ENABLED',
      surface: 'google_search_network',
      tenant_id: 'test-tenant',
      source_system: 'google',
      source_id: 'nike-summer-1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });

    await db.saveSpendFact({
      campaign_id: 'nike-summer-1',
      platform: 'google',
      day: new Date().toISOString().split('T')[0],
      amount: 60.0,
      currency: 'USD',
      tenant_id: 'test-tenant',
      source_system: 'google',
      ingested_at: new Date().toISOString(),
    });

    await db.saveOrder({
      order_id: 'nike-o1',
      customer_id: 'nike-cust-1',
      account_id: null,
      channel: 'b2c_web',
      surface: 'shopify',
      placed_at: '2026-06-03T12:00:00Z',
      currency: 'USD',
      gross_revenue: 100,
      total_discounts: 10,
      total_tax: 5,
      shipping_charged: 5,
      status: 'PAID',
      tenant_id: 'test-tenant',
      source_system: 'shopify',
      source_id: 'nike-o1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });

    await db.saveOrderLine({
      order_line_id: 'nike-li1',
      order_id: 'nike-o1',
      variant_id: 'v1',
      sku: 'PRODUCT-NIKE-A',
      qty: 1,
      unit_price: 90,
      line_discount: 0,
      unit_cost: 40,
      tenant_id: 'test-tenant',
      source_system: 'shopify',
      source_id: 'nike-li1',
      source_version: '1.0',
      ingested_at: new Date().toISOString(),
    });

    await db.saveTouchpoint({
      touchpoint_id: 'nike-tp1',
      customer_id: 'nike-cust-1',
      campaign_id: 'nike-summer-1',
      order_id: null,
      occurred_at: '2026-06-03T11:00:00Z',
      type: 'click',
      tenant_id: 'test-tenant',
      source_system: 'google',
      ingested_at: new Date().toISOString(),
    });

    const res = await getJson('/api/v1/recommendations');
    expect(res.status).toBe('success');
    expect(res.data.recommendations).toBeDefined();
    expect(res.data.recommendations.length).toBeGreaterThan(0);
    expect(res.data.recommendations[0].campaignId).toBe('nike-summer-1');
    expect(res.data.recommendations[0].dominantCause).toBe('CPC_TOO_HIGH');
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

  describe('OAuth Connect Flow API Integration', () => {
    it('should redirect GET /api/v1/connect/google to Google OAuth URL (302) with signed state', async () => {
      const res = await requestRaw('/api/v1/connect/google', 'GET', {
        Authorization: `Bearer ${testToken}`,
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBeDefined();
      const location = res.headers.location!;
      expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(location).toContain(`client_id=${config.platforms.googleAds.clientId}`);
      expect(location).toContain('state=');
    });

    it('should reject GET /api/v1/connect/google with 401 if unauthenticated', async () => {
      const res = await requestRaw('/api/v1/connect/google', 'GET');
      expect(res.statusCode).toBe(401);
    });

    it('should successfully handle callback GET /api/v1/connect/callback/google with valid signed state and code', async () => {
      // 1. Get redirect state by requesting connection
      const connectRes = await requestRaw('/api/v1/connect/google', 'GET', {
        Authorization: `Bearer ${testToken}`,
      });
      const location = connectRes.headers.location!;
      const urlObj = new URL(location);
      const stateParam = urlObj.searchParams.get('state')!;

      // 2. Fire callback with code and signed state
      const callbackRes = await requestRaw(
        `/api/v1/connect/callback/google?code=auth_code_999&state=${stateParam}`,
        'GET',
      );
      expect(callbackRes.statusCode).toBe(200);
      const data = JSON.parse(callbackRes.body) as any;
      expect(data.status).toBe('success');
      expect(data.data.message).toContain('google connected successfully');

      // 3. Verify credentials exist in database
      const creds = await db.getCredentials('test-tenant');
      expect(creds.some((c) => c.platform === 'google' && c.refresh_token === 'mock-refresh-token-google')).toBeTrue();
    });

    it('should reject callback with invalid state token (400)', async () => {
      const callbackRes = await requestRaw(
        '/api/v1/connect/callback/google?code=auth_code_999&state=invalid_state_signature',
        'GET',
      );
      expect(callbackRes.statusCode).toBe(400);
      const data = JSON.parse(callbackRes.body) as any;
      expect(data.status).toBe('error');
      expect(data.error.code).toBe('OAUTH_CALLBACK_FAILED');
    });
  });

  describe('Profit Readiness API Integration', () => {
    it('should reject GET /api/v1/profit-readiness with 401 if unauthenticated', async () => {
      const res = await requestRaw('/api/v1/profit-readiness', 'GET');
      expect(res.statusCode).toBe(401);
    });

    it('should return correct profit readiness metrics and status for authorized tenant', async () => {
      const readinessTenant = 'readiness-tenant';
      const readinessToken = signJwt(
        {
          userId: 'test-user-readiness',
          orgId: readinessTenant,
          role: 'media_buyer',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        config.auth.jwtSecret,
      );

      // 1. Populate credentials for shopify & google
      await db.saveCredential({
        tenant_id: readinessTenant,
        platform: 'shopify',
        credential_key: 'oauth_token',
        encrypted_value: 'val',
        refresh_token: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      });
      await db.saveCredential({
        tenant_id: readinessTenant,
        platform: 'google',
        credential_key: 'oauth_token',
        encrypted_value: 'val',
        refresh_token: null,
        expires_at: null,
        updated_at: new Date().toISOString(),
      });

      // 2. Populate variants: 2 variants, 1 has cogs (50% coverage)
      await db.saveVariant({
        variant_id: 'v-nike-1',
        sku: 'sku-nike-1',
        title: 'Nike Air Max 1',
        price: 150,
        cost: 60,
        tenant_id: readinessTenant,
        ingested_at: new Date().toISOString(),
      });
      await db.saveVariant({
        variant_id: 'v-nike-2',
        sku: 'sku-nike-2',
        title: 'Nike Air Max 2',
        price: 160,
        cost: null, // missing cogs
        tenant_id: readinessTenant,
        ingested_at: new Date().toISOString(),
      });

      // 3. Make the API request
      const res = await getJson('/api/v1/profit-readiness', {
        Authorization: `Bearer ${readinessToken}`,
      });
      expect(res.status).toBe('success');
      expect(res.data.score).toBe(40); // 15 (shopify) + 15 (google) + 10 (50% COGS) = 40
      expect(res.data.factors.cogsCoverage).toBe(50);
      expect(res.data.status).toBe('directional_only');
    });
  });

  describe('User Authentication API Integration', () => {
    it('should signup, verify, request password reset, confirm it, and login with new password', async () => {
      const email = 'srv_reset@example.com';
      const pw = 'OldPassword123!';
      const newPw = 'NewPassword789!';
      const org = 'Srv Org';

      // 1. Signup
      const signupRes = await postJson('/api/v1/auth/signup', {
        email,
        password: pw,
        orgName: org,
      });
      expect(signupRes.status).toBe('success');
      expect(signupRes.data.userId).toBeDefined();
      const verificationToken = signupRes.data.verificationToken;
      expect(verificationToken).toBeDefined();

      // 2. Verify
      const verifyRes = await postJson('/api/v1/auth/verify', {
        token: verificationToken,
      });
      expect(verifyRes.status).toBe('success');

      // 3. Request reset
      const resetRes = await postJson('/api/v1/auth/reset', {
        email,
      });
      expect(resetRes.status).toBe('success');
      const resetToken = resetRes.data.resetToken;
      expect(resetToken).toBeDefined();

      // 4. Confirm reset
      const confirmRes = await postJson('/api/v1/auth/reset/confirm', {
        token: resetToken,
        newPassword: newPw,
      });
      expect(confirmRes.status).toBe('success');

      // 5. Try login with old password -> should fail
      const loginFailRes = await postJson('/api/v1/auth/login', {
        email,
        password: pw,
      });
      expect(loginFailRes.error).toContain('Invalid credentials');

      // 6. Login with new password -> should succeed
      const loginSuccessRes = await postJson('/api/v1/auth/login', {
        email,
        password: newPw,
      });
      expect(loginSuccessRes.status).toBe('success');
      expect(loginSuccessRes.data.accessToken).toBeDefined();
      expect(loginSuccessRes.data.refreshToken).toBeDefined();
    });

    it('should return error if password reset requested for non-existent email', async () => {
      const res = await postJson('/api/v1/auth/reset', {
        email: 'ghost@example.com',
      });
      expect(res.error).toBeDefined();
    });

    it('should return error if reset confirmation has invalid token', async () => {
      const res = await postJson('/api/v1/auth/reset/confirm', {
        token: 'invalid_token',
        newPassword: 'SomePassword123!',
      });
      expect(res.error).toBeDefined();
    });

    describe('API Wiring and Launch Gaps', () => {
      it('should retrieve integration states for tenant', async () => {
        const res = await getJson('/api/v1/integrations');
        expect(res.status).toBe('success');
        expect(res.data.integrations).toBeDefined();
        expect(Array.isArray(res.data.integrations)).toBe(true);
      });

      it('should redirect to Google OAuth consent screen when redirect token is valid', async () => {
        const res = await requestRaw(
          `/api/v1/connect/google?t=${encodeURIComponent(testToken)}`,
          'GET',
        );
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain('accounts.google.com');
      });

      it('should fail OAuth connect redirection with 401 when t token is invalid', async () => {
        const res = await requestRaw('/api/v1/connect/google?t=invalid-token', 'GET');
        expect(res.statusCode).toBe(401);
      });

      it('should run diagnostic sweep and return rich findings', async () => {
        const res = await getJson('/api/v1/sweep');
        expect(res.status).toBe('success');
        expect(res.data.sweep).toBeDefined();
        expect(Array.isArray(res.data.sweep)).toBe(true);
      });

      it('should get and set autonomy trust tier settings correctly', async () => {
        // GET should return default OBSERVE
        const getRes = await getJson('/api/v1/autonomy');
        expect(getRes.status).toBe('success');
        expect(getRes.data.tier).toBe('OBSERVE');

        // Seed earned tiers to allow elevation to AUTONOMOUS (level 3)
        const ops = ['read', 'update_budget', 'pause', 'activate', 'scale_budget'];
        for (const op of ops) {
          await db.saveTrustTier('test-tenant', op, 3);
        }

        // POST should update tier successfully as admin
        const adminToken = signJwt(
          {
            userId: 'admin-user',
            orgId: 'test-tenant',
            role: 'admin',
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          config.auth.jwtSecret,
        );
        const setRes = await postJson(
          '/api/v1/autonomy',
          { tier: 'AUTONOMOUS' },
          { Authorization: `Bearer ${adminToken}` },
        );
        expect(setRes.status).toBe('success');
        expect(setRes.data.tier).toBe('AUTONOMOUS');

        // Verify updated tier with GET
        const verifyRes = await getJson('/api/v1/autonomy');
        expect(verifyRes.data.tier).toBe('AUTONOMOUS');

        // Non-admin POST to elevate autonomy to C_SUITE should return 403
        const userToken = signJwt(
          {
            userId: 'user-user',
            orgId: 'test-tenant',
            role: 'user',
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          config.auth.jwtSecret,
        );
        const forbiddenRes = await postJson(
          '/api/v1/autonomy',
          { tier: 'C_SUITE' },
          { Authorization: `Bearer ${userToken}` },
        );
        expect(forbiddenRes.error).toBeDefined();
        expect(forbiddenRes.error.code).toBe('FORBIDDEN');
      });

      it('should return metrics and spans on GET /metrics', async () => {
        const res = await getJson('/metrics');
        expect(res.status).toBe('success');
        expect(res.data.metrics).toBeDefined();
        expect(res.data.spans).toBeDefined();
        expect(res.data.alerts).toBeDefined();
        expect(Array.isArray(res.data.metrics)).toBe(true);
        expect(Array.isArray(res.data.spans)).toBe(true);
        expect(Array.isArray(res.data.alerts)).toBe(true);
      });

      it('should successfully execute campaign action and manually rollback (reverse) it', async () => {
        const executeSpy = spyOn(GoogleAdsAdapter.prototype, 'execute').and.callThrough();
        const rollbackSpy = spyOn(GoogleAdsAdapter.prototype, 'rollback').and.callThrough();

        await db.saveCampaign({
          campaign_id: 'nike-rollback-1',
          platform: 'google',
          name: 'Nike Rollback Test Campaign',
          objective: 'sales',
          status: 'ENABLED',
          surface: 'google_search_network',
          tenant_id: 'test-tenant',
          source_system: 'google',
          source_id: 'nike-rollback-1',
          source_version: '1.0',
          ingested_at: new Date().toISOString(),
        });

        const actionRequest = {
          idempotencyKey: 'action-rollback-test',
          op: 'pause_campaign',
          entity: 'campaign',
          targetId: 'nike-rollback-1',
          payload: {
            verifyMetrics: {
              preExecutionROAS: 2.5,
              postExecutionROAS: 2.6,
            },
          },
        };

        const executeRes = await postJson(
          '/api/v1/actions',
          {actionRequest, context: validContextTemplate},
          {Authorization: `Bearer ${testToken}`},
        );

        expect(executeRes.status).toBe('success');
        expect(executeRes.data.status).toBe('executed');
        expect(executeSpy).toHaveBeenCalled();

        const reverseRes = await postJson(
          `/api/v1/actions/action-rollback-test/reverse`,
          { reason: 'Test manual override' },
          { Authorization: `Bearer ${testToken}` },
        );

        expect(reverseRes.status).toBe('success');
        expect(reverseRes.data.status).toBe('reversed');
        expect(rollbackSpy).toHaveBeenCalled();

        const events = await db.getGovernanceEvents('test-tenant');
        const rollbackEvents = events.filter((e) => e.action_id === 'action-rollback-test' && e.status === 'rolled_back');
        expect(rollbackEvents.length).toBe(1);
        expect(rollbackEvents[0].actor).toBe('human:admin');
      });
    });

    describe('Auth Ticket Authentication (A2.5)', () => {
      it('should generate a ticket, use it to query integrations, and reject reuse/replay', async () => {
        // 1. Generate a single-use ticket
        const ticketRes = await getJson('/api/v1/auth/ticket');
        expect(ticketRes.status).toBe('success');
        expect(ticketRes.data.ticket).toBeDefined();
        const ticket = ticketRes.data.ticket;

        // 2. Query integrations with the ticket instead of Bearer token
        const queryRes = await getJson(`/api/v1/integrations?ticket=${ticket}`, {} as any);
        expect(queryRes.status).toBe('success');
        expect(queryRes.data.integrations).toBeDefined();

        // 3. Attempt to reuse the ticket (replay) -> should return 401 Unauthorized
        const replayRes = await getJson(`/api/v1/integrations?ticket=${ticket}`, {} as any);
        expect(replayRes.error).toBeDefined();
        expect(replayRes.error.code).toBe('UNAUTHORIZED');
        expect(replayRes.error.message).toContain('already been used');
      });

      it('should reject requests with an expired ticket', async () => {
        const expiredTicket = signJwt(
          {
            userId: 'test-user',
            orgId: 'test-tenant',
            role: 'media_buyer',
            purpose: 'auth_ticket',
            exp: Math.floor(Date.now() / 1000) - 10, // expired 10s ago
          },
          config.auth.jwtSecret,
        );

        const res = await getJson(`/api/v1/integrations?ticket=${expiredTicket}`, {} as any);
        expect(res.error).toBeDefined();
        expect(res.error.code).toBe('UNAUTHORIZED');
        expect(res.error.message).toContain('expired');
      });
    });

    describe('Readiness Probe Diagnostics (B3.3)', () => {
      it('should return status ready when database is available', async () => {
        const res = await getJson('/ready', {} as any);
        expect(res.status).toBe('success');
        expect(res.data.status).toBe('ready');
      });

      it('should return 503 DATABASE_UNREACHABLE when database ping fails', async () => {
        spyOn(db, 'ping').and.rejectWith(new Error('Connection timeout'));
        const res = await getJson('/ready', {} as any);
        expect(res.error).toBeDefined();
        expect(res.error.code).toBe('DATABASE_UNREACHABLE');
        expect(res.error.message).toContain('Connection timeout');
      });
    });

    describe('Durable Error Reporting Integration (P1.2a)', () => {
      it('should record unhandled dispatch errors in error_events database table', async () => {
        db.resetLocalMockDb();

        const token = signJwt(
          {
            userId: 'user@example.com',
            orgId: 'tenant-abc',
            role: 'media_buyer',
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          config.auth.jwtSecret,
        );

        const originalVersion = config.legal.activeVersion;
        config.legal.activeVersion = 'v1_test';

        spyOn(SupabaseClient.prototype, 'getLatestLegalAcceptance').and.throwError('Unexpected Database Crash');

        const response = await requestRaw('/api/v1/integrations', 'GET', {
          'Authorization': `Bearer ${token}`,
        });

        config.legal.activeVersion = originalVersion;

        expect(response.statusCode).toBe(500);

        const errors = await db.getErrorEvents('tenant-abc');
        expect(errors.length).toBe(1);
        expect(errors[0].severity).toBe('critical');
        expect(errors[0].source).toBe('http_server_dispatch');
        expect(errors[0].message).toContain('Unexpected Database Crash');
        expect(errors[0].context.url).toBe('/api/v1/integrations');
        expect(errors[0].context.method).toBe('GET');
      });
    });

    describe('Billing & Suggest-An-Amount (C2)', () => {
      beforeEach(() => {
        db.resetLocalMockDb();
      });

      it('should return default trial subscription on first GET', async () => {
        const res = await getJson('/api/v1/billing/subscription');
        expect(res.status).toBe('success');
        expect(res.data.status).toBe('trial');
        expect(res.data.orgId).toBe('test-tenant');
        expect(res.data.trialDay).toBe(5);
        expect(res.data.trialLengthDays).toBe(14);
      });

      it('should transition to pending_review on suggest amount submission', async () => {
        const body = { amount: 799, note: 'Valuable insights' };
        const headers = { Authorization: `Bearer ${testToken}` };
        const res = await postJson('/api/v1/billing/suggest', body, headers);
        
        expect(res.status).toBe('success');
        expect(res.data.status).toBe('pending_review');
        expect(res.data.amount).toBe(799);
        expect(res.data.note).toBe('Valuable insights');

        // Verify next GET returns the pending_review state
        const getRes = await getJson('/api/v1/billing/subscription');
        expect(getRes.status).toBe('success');
        expect(getRes.data.status).toBe('pending_review');
        expect(getRes.data.amount).toBe(799);
      });

      it('should reject invalid amount values on suggest', async () => {
        const body = { amount: -50 };
        const headers = { Authorization: `Bearer ${testToken}` };
        const res = await postJson('/api/v1/billing/suggest', body, headers);
        
        expect(res.status).toBe('error');
        expect(res.error).toBeDefined();

        const stringBody = { amount: 'not-a-number' };
        const res2 = await postJson('/api/v1/billing/suggest', stringBody, headers);
        expect(res2.status).toBe('error');
      });
    });
  });
});

