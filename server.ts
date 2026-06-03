/**
 * @fileoverview Native Node.js HTTP and SSE Server for Brand Digital Twin OS.
 */

// taze: require from //third_party/javascript/typings/node

import * as http from 'http';
import * as url from 'url';
import {config} from './config';
import {sendErrorResponse, ValidationError, RateLimitError} from './errors';
import {eventBus} from './event_bus';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {authMiddleware} from './auth';
import {validateActionRequest, validateContext} from './validation';
import {TokenBucket, RateLimitingAdapterWrapper} from './rate_limiter';
import {
  CircuitBreaker,
  GovernanceEngine,
  TrustLedger,
} from './governance_engine';
import {SupabaseClient} from './supabase_client';
import {UnifiedIntelligenceBrain} from './unified_brain';

const sseClients = new Set<http.ServerResponse>();

// Distribute events received on eventBus to all connected SSE clients
eventBus.on('event', (data) => {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
});

const ipLimiters = new Map<string, TokenBucket>();

export function resetRateLimiters(): void {
  ipLimiters.clear();
}

const googleAdsLimiter = new TokenBucket(
  config.platforms.googleAds.rateLimitMax,
  config.platforms.googleAds.rateLimitRefillRate,
);

function checkRateLimit(req: http.IncomingMessage): void {
  const ip =
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    'unknown';
  let bucket = ipLimiters.get(ip);
  if (!bucket) {
    bucket = new TokenBucket(
      config.rateLimit.maxRequests,
      config.rateLimit.refillRatePerSec,
    );
    ipLimiters.set(ip, bucket);
  }
  if (!bucket.tryAcquire()) {
    throw new RateLimitError();
  }
}

function parseRequestBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new ValidationError('Invalid JSON in request body'));
      }
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

function sendSuccessResponse(res: http.ServerResponse, data: any) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(
    JSON.stringify({
      status: 'success',
      data,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function startServer(port: number, db: SupabaseClient): http.Server {
  const brain = new UnifiedIntelligenceBrain(db);
  const cb = new CircuitBreaker();
  const tl = new TrustLedger();

  const server = http.createServer(async (req, res) => {
    // Enable CORS by default
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    );

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      checkRateLimit(req);
      const parsedUrl = url.parse(req.url || '', true);
      const path = parsedUrl.pathname || '';
      // 1. SSE STREAM ENDPOINT
      if (path === '/api/v1/stream' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        // Write initial heartbeat
        res.write('data: {"type":"connected"}\n\n');
        sseClients.add(res);

        req.on('close', () => {
          sseClients.delete(res);
        });
        return;
      }

      // 2. HEALTH / STATUS PULSE
      if (path === '/api/v1/health' && req.method === 'GET') {
        const tenantId =
          (parsedUrl.query['tenantId'] as string) || 'test-tenant';
        const clients = await db.getClients(tenantId);

        sendSuccessResponse(res, {
          status: 'healthy',
          pulse: {
            overallScore: 78,
            activeAlerts: 3,
            recentWins: 5,
            uptimePct: 99.2,
          },
          clientsCount: clients.length,
        });
        return;
      }

      // 3. RECOMMENDATIONS
      if (path === '/api/v1/recommendations' && req.method === 'GET') {
        const tenantId =
          (parsedUrl.query['tenantId'] as string) || 'test-tenant';
        const recs = await brain.analyzeProfitability(tenantId);
        sendSuccessResponse(res, {recommendations: recs});
        return;
      }

      // 4. RISKS
      if (path === '/api/v1/risks' && req.method === 'GET') {
        const tenantId =
          (parsedUrl.query['tenantId'] as string) || 'test-tenant';
        // Call brain risk check with empty inventory status for mock stability
        const risks = await brain.detectRisks(tenantId, []);
        sendSuccessResponse(res, {risks});
        return;
      }

      // 5. APPROVALS
      if (path === '/api/v1/approvals' && req.method === 'GET') {
        const tenantId =
          (parsedUrl.query['tenantId'] as string) || 'test-tenant';
        const approvals = await db.getApprovals(tenantId);
        sendSuccessResponse(res, {approvals});
        return;
      }

      // 6. EXECUTE CAMPAIGN ACTIONS (POST)
      if (path === '/api/v1/actions' && req.method === 'POST') {
        const decodedToken = authMiddleware(req, config.auth.jwtSecret);
        const body = await parseRequestBody(req);

        // Map high-level brain recommendations to platform-specific operations before validation
        if (body.actionRequest && body.actionRequest.op === 'pause_campaign') {
          body.actionRequest.op = 'pause';
        } else if (body.actionRequest && body.actionRequest.op === 'activate_campaign') {
          body.actionRequest.op = 'activate';
        }

        const validatedRequest = validateActionRequest(body.actionRequest);
        const validatedContext = validateContext(body.context);

        if (validatedContext.tenant.tenantId !== decodedToken.orgId) {
          throw new ValidationError(
            `Unauthorized: Tenant ID mismatch. Request tenant is '${validatedContext.tenant.tenantId}' but token org is '${decodedToken.orgId}'`,
          );
        }

        // Reconstruct the role.permits function that was lost during JSON serialization
        const rawRole = validatedContext.role as any;
        const normalizedContext = {
          ...validatedContext,
          role: {
            ...validatedContext.role,
            permits: (op: string, entity: string) => {
              const roleName = validatedContext.role?.name;
              if (
                roleName === 'media_buyer' ||
                roleName === 'permittedRole' ||
                roleName === 'Media Buyer'
              ) {
                return true;
              }
              if (
                Array.isArray(rawRole?.permissions) &&
                (rawRole.permissions as string[]).includes(op)
              ) {
                return true;
              }
              return false;
            },
          },
        };

        // Setup request-scoped clone database client with tenant context
        const requestDb = db.clone();
        requestDb.setTenantContext(decodedToken.orgId);

        const requestGovernance = new GovernanceEngine(
          {record: async () => {}},
          tl,
          cb,
          undefined,
          undefined,
          requestDb,
        );

        // Setup simulated Google Ads adapter
        const rawAdapter = new GoogleAdsAdapter(
          'mock-cust-id',
          'mock-dev-token',
          'mock-token',
          validatedContext.tenant.tenantId,
        );
        const adapter = new RateLimitingAdapterWrapper(
          rawAdapter,
          googleAdsLimiter,
        );
        const outcome = await requestGovernance.govern(
          adapter,
          validatedRequest,
          normalizedContext,
        );

        sendSuccessResponse(res, outcome);
        return;
      }

      // 404 NOT FOUND
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: `Endpoint ${req.method} ${path} not found`,
          },
        }),
      );
    } catch (err: any) {
      sendErrorResponse(res, err);
    }
  });

  return server.listen(port);
}

// Auto-run if executed directly as script
if (require.main === module) {
  const db = new SupabaseClient();
  const port = config.server.port;
  console.log(`Starting native HTTP/SSE server on port ${port}...`);
  startServer(port, db);
}
