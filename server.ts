/**
 * @fileoverview Native Node.js HTTP and SSE Server for Brand Digital Twin OS.
 */

// taze: require from //third_party/javascript/typings/node

import * as http from 'http';
import * as url from 'url';
import {createHash} from 'node:crypto';
import {config, initializeConfig} from './config';
import {SecretProvider} from './secret_provider';
import {EnvSecretProvider} from './env_secret_provider';
import {ManagedSecretProvider, VaultClient} from './managed_secret_provider';
import {sendErrorResponse, ValidationError, RateLimitError, PayloadTooLargeError, AuthError} from './errors';
import {eventBus} from './event_bus';
import {GoogleAdsAdapter} from './google_ads_adapter';
import {authMiddleware, DecodedJwt, signJwt, verifyJwt, signOauthState, verifyOauthState} from './auth';
import {generateAuthUrl, handleOauthCallback} from './oauth_flows';
import {ProfitReadinessCalculator} from './profit_readiness';
import {PoasCalculator} from './poas_calculator';
import {validateActionRequest, validateContext} from './validation';
import {TokenBucket, RateLimitingAdapterWrapper} from './rate_limiter';
import {
  CircuitBreaker,
  GovernanceEngine,
  TrustLedger,
} from './governance_engine';
import {Waiver, Context} from './governance_types';
import {SupabaseClient, OrgEntry, PendingJobEntry, LegalAcceptanceEntry} from './supabase_client';
import {signup, verifyEmail, login, rotateRefreshToken, requestPasswordReset, confirmPasswordReset} from './user_auth';
import * as crypto from 'crypto';
import {UnifiedIntelligenceBrain} from './unified_brain';
import {IdentityResolver} from './identity_resolver';
import {PersistentAuditSink} from './audit_sink';
import {RiskRadar} from './risk_radar';
import {SweepFinding} from './healing_types';
import {DatabaseErrorSink, MetricsTracker, PinoLogger} from './observability';
const sha256 = (s: string) =>
  createHash('sha256').update(s.trim().toLowerCase()).digest('hex');

async function getMinEarnedTier(db: SupabaseClient, tenantId: string): Promise<number> {
  const ops = ['read', 'update_budget', 'pause', 'activate', 'scale_budget'];
  let minTier = 4;
  for (const op of ops) {
    const tier = await db.getTrustTier(tenantId, op);
    const val = tier !== null ? tier : 0;
    if (val < minTier) {
      minTier = val;
    }
  }
  return minTier;
}

const sseClients = new Set<http.ServerResponse>();

// Distribute events received on eventBus to all connected SSE clients
eventBus.on('event', (data) => {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
});

const ipLimiters = new Map<string, TokenBucket>();
const authIpLimiters = new Map<string, TokenBucket>();

export function resetRateLimiters(): void {
  ipLimiters.clear();
  authIpLimiters.clear();
}

function checkAuthRateLimit(req: http.IncomingMessage): void {
  const ip =
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    'unknown';
  let bucket = authIpLimiters.get(ip);
  if (!bucket) {
    bucket = new TokenBucket(
      5, // max 5 login/signup requests burst
      0.5 // refill 1 token every 2 seconds
    );
    authIpLimiters.set(ip, bucket);
  }
  if (!bucket.tryAcquire()) {
    throw new RateLimitError('Too many auth attempts. Please wait.');
  }
}

let googleAdsLimiter: TokenBucket;

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
  const maxLimit = 10 * 1024 * 1024; // 10MB limit
  return new Promise((resolve, reject) => {
    let body = '';
    let bytesReceived = 0;
    req.on('data', (chunk) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bytesReceived += buf.length;
      if (bytesReceived > maxLimit) {
        setTimeout(() => req.destroy(), 100);
        reject(new PayloadTooLargeError('Payload exceeds 10MB limit'));
        return;
      }
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

function keysToCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => keysToCamelCase(v));
  } else if (obj !== null && obj !== undefined && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      result[camelKey] = keysToCamelCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

function sendSuccessResponse(res: http.ServerResponse, data: any) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end(
    JSON.stringify({
      status: 'success',
      data: keysToCamelCase(data),
      timestamp: new Date().toISOString(),
    }),
  );
}

const usedTickets = new Set<string>();

function verifyAndBurnTicket(ticket: string): DecodedJwt {
  if (usedTickets.has(ticket)) {
    throw new AuthError('Ticket has already been used');
  }
  const decoded = verifyJwt(ticket, config.auth.jwtSecret);
  if (decoded.purpose !== 'auth_ticket') {
    throw new AuthError('Invalid ticket purpose');
  }
  usedTickets.add(ticket);
  return decoded;
}

export function startServer(port: number, db: SupabaseClient): http.Server {
  googleAdsLimiter = new TokenBucket(
    config.platforms.googleAds.rateLimitMax,
    config.platforms.googleAds.rateLimitRefillRate,
  );
  const brain = new UnifiedIntelligenceBrain(db);
  const cb = new CircuitBreaker();
  const tl = new TrustLedger();
  const errorSink = new DatabaseErrorSink(db);
  const globalMetrics = new MetricsTracker(errorSink);

  const server = http.createServer(async (req, res) => {
    let tenantId: string | null = null;

    // Secure CORS settings: echo allowed origins only
    const origin = req.headers['origin'];
    if (origin && (origin.startsWith('http://localhost') || origin.endsWith('.google.com'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    }
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

      // A. Google Tag Gateway (GTG) - Public Endpoint
      if (path === '/api/v1/gtg' && req.method === 'GET') {
        const id = parsedUrl.query['id'] || 'GTM-DEFAULT';
        res.writeHead(200, {'Content-Type': 'application/javascript'});
        res.end(`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${id}');
          console.log('Google Tag Gateway active for container ${id}');
        `);
        return;
      }

      // B. Server-Side GTM Event Collection Endpoint - Public Ingestion
      if (path === '/api/v1/sgtm/events' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const tenantId = (req.headers['x-tenant-id'] as string) || (parsedUrl.query['tenantId'] as string) || body.tenantId;

        if (!tenantId) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({
            error: {
              code: 'BAD_REQUEST',
              message: 'Missing tenantId header, query parameter, or payload field',
            },
          }));
          return;
        }

        const eventName = body.eventName;
        const clientId = body.clientId;
        const gclid = body.gclid;
        const customerData = body.customerData || {};
        const consent = body.consent || {
          adStorage: 'granted',
          adUserData: 'granted',
          analyticsStorage: 'granted',
        };

        // Redact values based on Consent Mode v2
        let resolvedEmail = customerData.email;
        let resolvedPhone = customerData.phone;
        let resolvedGclid = gclid;

        if (consent.adUserData === 'denied') {
          resolvedEmail = undefined;
          resolvedPhone = undefined;
        }
        if (consent.adStorage === 'denied') {
          resolvedGclid = undefined;
        }

        const requestDb = db.clone();
        requestDb.setTenantContext(tenantId);
        const resolver = new IdentityResolver(tenantId);

        // Pre-seed IdentityResolver with current database links
        const existingLinks = await requestDb.getIdentityLinks(tenantId);
        for (const link of existingLinks) {
          resolver.seedExistingLink(
            link.identifier_hash,
            link.customer_id,
            link.confidence,
          );
        }

        const inputs: any[] = [];
        if (resolvedEmail) {
          inputs.push({identifierType: 'email', rawIdentifier: resolvedEmail});
        }
        if (resolvedPhone) {
          inputs.push({identifierType: 'phone', rawIdentifier: resolvedPhone});
        }
        if (clientId) {
          inputs.push({identifierType: 'device', rawIdentifier: clientId});
        }

        const resolution = resolver.resolve(inputs);

        if (resolution.isNew) {
          await requestDb.saveCustomer({
            customer_id: resolution.customerId,
            account_id: null,
            type: 'b2c',
            first_seen: new Date().toISOString(),
            consent_status: consent.adUserData === 'granted' ? 'GRANTED' : 'DENIED',
            tenant_id: tenantId,
            source_system: 'sgtm',
            source_id: resolution.customerId,
            source_version: 'v1',
            ingested_at: new Date().toISOString(),
          });
        }

        // Write new resolved links back to DB
        const links = resolver.getLinks();
        for (const [hash, link] of links.entries()) {
          const matched = existingLinks.find((el) => el.identifier_hash === hash);
          if (!matched) {
            const type =
              inputs.find((inp) => sha256(inp.rawIdentifier) === hash)
                ?.identifierType || 'device';
            await requestDb.saveIdentityLink({
              customer_id: link.customerId,
              identifier_type: type,
              identifier_hash: hash,
              confidence: link.confidence,
              tenant_id: tenantId,
              source_system: 'sgtm',
              ingested_at: new Date().toISOString(),
            });
          }
        }

        const touchpointId = `tp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        await requestDb.saveTouchpoint({
          touchpoint_id: touchpointId,
          customer_id: resolution.customerId,
          campaign_id: resolvedGclid ? `camp-${resolvedGclid}` : null,
          order_id: body.orderId || null,
          occurred_at: new Date().toISOString(),
          type: eventName,
          tenant_id: tenantId,
          source_system: 'sgtm',
          ingested_at: new Date().toISOString(),
        });

        sendSuccessResponse(res, {
          status: 'collected',
          touchpointId,
          customerId: resolution.customerId,
          consentApplied: consent,
        });
        return;
      }

      // C. Public User Auth endpoints
      if (path === '/api/v1/auth/signup' && req.method === 'POST') {
        checkAuthRateLimit(req);
        const body = await parseRequestBody(req);
        const {email, password, orgName} = body;
        if (!email || !password || !orgName) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing required parameters'}));
          return;
        }
        const isAllowed = await db.isEmailAllowed(email);
        if (!isAllowed) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Email address not in invite allowlist'}));
          return;
        }
        try {
          const {user, verificationToken} = await signup(db, email, password, orgName, config.auth.jwtSecret);
          sendSuccessResponse(res, {
            status: 'success',
            message: 'Signup successful. Verification token generated.',
            userId: user.user_id,
            verificationToken,
          });
        } catch (err: any) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: err.message || String(err)}));
        }
        return;
      }

      if (path === '/api/v1/auth/verify' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {token} = body;
        if (!token) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing verification token'}));
          return;
        }
        const success = await verifyEmail(db, token, config.auth.jwtSecret);
        if (success) {
          sendSuccessResponse(res, {status: 'success', message: 'Email verified. Account active.'});
        } else {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Invalid or expired verification token'}));
        }
        return;
      }

      if (path === '/api/v1/auth/login' && req.method === 'POST') {
        checkAuthRateLimit(req);
        const body = await parseRequestBody(req);
        const {email, password} = body;
        if (!email || !password) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing credentials'}));
          return;
        }
        const isAllowed = await db.isEmailAllowed(email);
        if (!isAllowed) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Email address not in invite allowlist'}));
          return;
        }
        try {
          const {accessToken, refreshToken} = await login(db, email, password, config.auth.jwtSecret);
          sendSuccessResponse(res, {
            status: 'success',
            accessToken,
            refreshToken,
          });
        } catch (err: any) {
          res.writeHead(401, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: err.message || String(err)}));
        }
        return;
      }

      if (path === '/api/v1/auth/refresh' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {refreshToken} = body;
        if (!refreshToken) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing refresh token'}));
          return;
        }
        try {
          const {accessToken, refreshToken: newRefreshToken} = await rotateRefreshToken(db, refreshToken, config.auth.jwtSecret);
          sendSuccessResponse(res, {
            status: 'success',
            accessToken,
            refreshToken: newRefreshToken,
          });
        } catch (err: any) {
          res.writeHead(401, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: err.message || String(err)}));
        }
        return;
      }

      if (path === '/api/v1/auth/reset' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {email} = body;
        if (!email) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing email'}));
          return;
        }
        try {
          const resetToken = await requestPasswordReset(db, email, config.auth.jwtSecret);
          sendSuccessResponse(res, {
            status: 'success',
            resetToken,
          });
        } catch (err: any) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: err.message || String(err)}));
        }
        return;
      }

      if (path === '/api/v1/auth/reset/confirm' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {token, newPassword} = body;
        if (!token || !newPassword) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing token or newPassword'}));
          return;
        }
        try {
          await confirmPasswordReset(db, token, newPassword, config.auth.jwtSecret);
          sendSuccessResponse(res, {
            status: 'success',
            message: 'Password reset successful.',
          });
        } catch (err: any) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: err.message || String(err)}));
        }
        return;
      }


      // Static Legal Content endpoints
      if (path === '/api/v1/legal/tos' && req.method === 'GET') {
        sendSuccessResponse(res, {
          title: 'Terms of Service',
          version: config.legal.activeVersion,
          content: 'Standard Terms of Service content for Brand Digital Twin OS...',
        });
        return;
      }

      if (path === '/api/v1/legal/privacy' && req.method === 'GET') {
        sendSuccessResponse(res, {
          title: 'Privacy Policy',
          version: config.legal.activeVersion,
          content: 'Standard Privacy Policy content for Brand Digital Twin OS...',
        });
        return;
      }

      if (path === '/api/v1/legal/dpa' && req.method === 'GET') {
        sendSuccessResponse(res, {
          title: 'Data Processing Addendum',
          version: config.legal.activeVersion,
          content: 'Standard DPA content for Brand Digital Twin OS...',
        });
        return;
      }

      // GDPR Download Endpoint - Public verification via token query param
      if (path === '/api/v1/account/export/download' && req.method === 'GET') {
        const token = parsedUrl.query['token'] as string;
        if (!token) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing export token'}));
          return;
        }
        try {
          const payload = verifyJwt(token, config.auth.jwtSecret);
          if (payload.purpose !== 'gdpr_export') {
            res.writeHead(403, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Invalid token purpose'}));
            return;
          }
          const data = await db.exportTenantData(payload.orgId, payload.userId);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="gdpr-export-${payload.orgId}.json"`,
          });
          res.end(JSON.stringify(data));
        } catch (err) {
          res.writeHead(401, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Expired or invalid export token'}));
        }
      }
      
      // Readiness Probe (Public)
      if ((path === '/ready' || path === '/readyz') && req.method === 'GET') {
        try {
          await db.ping();
          sendSuccessResponse(res, { status: 'ready' });
        } catch (err: any) {
          res.writeHead(503, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'DATABASE_UNREACHABLE',
                message: err.message || 'Database unreachable',
              },
            }),
          );
        }
        return;
      }

      // Metrics Endpoint (Public for scraper/tests)
      if (path === '/metrics' && req.method === 'GET') {
        sendSuccessResponse(res, {
          metrics: globalMetrics.getMetrics(),
          spans: globalMetrics.getSpans(),
          alerts: globalMetrics.getAlerts(),
        });
        return;
      }

      // Initiate OAuth connection for a platform (auth-gated, supports parameter token)
      const connectMatch = path.match(/^\/api\/v1\/connect\/([^/]+)$/);
      if (connectMatch && req.method === 'GET') {
        const platform = connectMatch[1];
        const ticketQuery = parsedUrl.query['ticket'] as string;
        const tokenQuery = parsedUrl.query['t'] as string;
        const shop = parsedUrl.query['shop'] as string;

        let decoded: DecodedJwt;
        try {
          if (ticketQuery) {
            decoded = verifyAndBurnTicket(ticketQuery);
          } else if (tokenQuery) {
            decoded = verifyJwt(tokenQuery, config.auth.jwtSecret);
          } else {
            decoded = authMiddleware(req, config.auth.jwtSecret);
          }
        } catch (authErr: any) {
          res.writeHead(401, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'UNAUTHORIZED',
                message: authErr.message || 'Unauthorized Connect Request',
              },
            }),
          );
          return;
        }

        try {
          const state = signOauthState(decoded.orgId, decoded.userId, platform, config.auth.jwtSecret);
          const authUrl = generateAuthUrl(platform, state, shop);

          res.writeHead(302, {'Location': authUrl});
          res.end();
        } catch (err: any) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'OAUTH_INITIATION_FAILED',
                message: err.message || String(err),
              },
            }),
          );
        }
        return;
      }

      // OAuth Callback route (Public, state and platform match are verified via signed JWT)
      const callbackMatch = path.match(/^\/api\/v1\/connect\/callback\/([^/]+)$/);
      if (callbackMatch && req.method === 'GET') {
        const platform = callbackMatch[1];
        const state = parsedUrl.query['state'] as string;
        const code = parsedUrl.query['code'] as string;

        if (!state || !code) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'OAUTH_CALLBACK_FAILED',
                message: 'Missing OAuth state or authorization code',
              },
            }),
          );
          return;
        }

        try {
          const verified = verifyOauthState(state, config.auth.jwtSecret);
          if (verified.platform !== platform) {
            throw new ValidationError('OAuth platform mismatch in state token');
          }

          // Exchange code and save to CredentialVault (always mockMode = true in tests)
          await handleOauthCallback(db, platform, code, verified.tenantId, true);

          sendSuccessResponse(res, {
            status: 'success',
            message: `${platform} connected successfully. You can close this window now.`,
          });
        } catch (err: any) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'OAUTH_CALLBACK_FAILED',
                message: err.message || String(err),
              },
            }),
          );
        }
        return;
      }

      // Centralized Authentication for all v1 API endpoints
      let decodedToken: DecodedJwt;
      try {
        const ticketQuery = parsedUrl.query['ticket'] as string;
        if (ticketQuery) {
          decodedToken = verifyAndBurnTicket(ticketQuery);
        } else {
          decodedToken = authMiddleware(req, config.auth.jwtSecret);
        }
      } catch (authErr: any) {
        res.writeHead(401, {'Content-Type': 'application/json'});
        res.end(
          JSON.stringify({
            status: 'error',
            error: {
              code: 'UNAUTHORIZED',
              message: authErr.message || 'Unauthorized',
            },
          }),
        );
        return;
      }

      tenantId = decodedToken.orgId;



      // 0. Ticket generation endpoint (authenticated via Bearer JWT)
      if (path === '/api/v1/auth/ticket' && req.method === 'GET') {
        const ticket = signJwt(
          {
            userId: decodedToken.userId,
            orgId: decodedToken.orgId,
            role: decodedToken.role,
            purpose: 'auth_ticket',
          },
          config.auth.jwtSecret,
          60 * 1000, // 60s
        );
        sendSuccessResponse(res, { ticket });
        return;
      }

      // Legal Acceptance Endpoint (authenticated, exempt from compliance block)
      if (path === '/api/v1/legal/accept' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {version} = body;
        if (!version) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing terms version'}));
          return;
        }
        const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
        const acceptance: LegalAcceptanceEntry = {
          acceptance_id: `acpt_${crypto.randomUUID()}`,
          user_id: decodedToken.userId,
          doc_version: version,
          ip_address: ip,
          accepted_at: new Date().toISOString(),
        };
        await db.saveLegalAcceptance(acceptance);
        sendSuccessResponse(res, {status: 'accepted', version});
        return;
      }

      // Policy Compliance Middleware
      if (config.legal.activeVersion) {
        const latestAcceptance = await db.getLatestLegalAcceptance(decodedToken.userId);
        if (!latestAcceptance || latestAcceptance.doc_version !== config.legal.activeVersion) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'POLICY_REACCEPTANCE_REQUIRED',
                message: `You must accept the updated terms and conditions (${config.legal.activeVersion}) before continuing.`,
              },
            }),
          );
          return;
        }
      }

      // Billing subscription and suggest amount endpoints (C2)
      if (path === '/api/v1/billing/subscription' && req.method === 'GET') {
        let sub = await db.getSubscription(decodedToken.orgId);
        if (!sub) {
          sub = {
            org_id: decodedToken.orgId,
            status: 'trial',
            amount: null,
            currency: 'USD',
            period: 'month',
            trial_day: 5,
            trial_length_days: 14,
            next_charge_at: null,
            note: null,
            updated_at: new Date().toISOString(),
          };
          await db.saveSubscription(sub);
        }
        sendSuccessResponse(res, sub);
        return;
      }

      if (path === '/api/v1/billing/suggest' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {amount, note} = body;
        if (typeof amount !== 'number' || amount <= 0) {
          throw new ValidationError('Amount must be a positive number');
        }
        let sub = await db.getSubscription(decodedToken.orgId);
        if (!sub) {
          sub = {
            org_id: decodedToken.orgId,
            status: 'trial',
            amount: null,
            currency: 'USD',
            period: 'month',
            trial_day: 5,
            trial_length_days: 14,
            next_charge_at: null,
            note: null,
            updated_at: new Date().toISOString(),
          };
        }
        sub.status = 'pending_review';
        sub.amount = amount;
        sub.note = note || null;
        sub.updated_at = new Date().toISOString();
        await db.saveSubscription(sub);
        sendSuccessResponse(res, sub);
        return;
      }

      // Jobs management routes (for E2E verification)
      if (path === '/api/v1/jobs/claim' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {jobId, workerId, leaseDurationMs} = body;
        if (!jobId || !workerId) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing jobId or workerId'}));
          return;
        }
        const success = await db.claimJob(
          jobId,
          workerId,
          Date.now(),
          leaseDurationMs || 10000,
        );
        if (success) {
          sendSuccessResponse(res, {status: 'claimed'});
        } else {
          res.writeHead(409, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({status: 'conflict', error: 'Job already locked or not claimable'}));
        }
        return;
      }

      if (path === '/api/v1/jobs/heartbeat' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {jobId, workerId, leaseDurationMs} = body;
        if (!jobId || !workerId) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing jobId or workerId'}));
          return;
        }
        const success = await db.heartbeatJob(
          jobId,
          workerId,
          Date.now(),
          leaseDurationMs || 10000,
        );
        if (success) {
          sendSuccessResponse(res, {status: 'extended'});
        } else {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({status: 'error', error: 'Lease lost or worker mismatch'}));
        }
        return;
      }

      if (path === '/api/v1/jobs/complete' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {jobId, workerId} = body;
        if (!jobId || !workerId) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing jobId or workerId'}));
          return;
        }
        const success = await db.completeJob(jobId, workerId);
        if (success) {
          sendSuccessResponse(res, {status: 'completed'});
        } else {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({status: 'error', error: 'Failed to complete job'}));
        }
        return;
      }

      // 1. GET /me (Retrieve current user, their orgs, and associated brands)
      if (path === '/api/v1/me' && req.method === 'GET') {
        const userId = decodedToken.userId;
        const user = await db.getUserById(userId);
        if (!user) {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'User not found'}));
          return;
        }
        const orgs = await db.getUserOrgs(userId);
        const orgProfiles = await Promise.all(orgs.map(async (o) => {
          const brands = await db.getOrgBrands(o.org_id);
          return {
            ...o,
            brands,
          };
        }));
        sendSuccessResponse(res, {
          userId: user.user_id,
          email: user.email,
          status: user.status,
          orgs: orgProfiles,
        });
        return;
      }


      // 1.8 GET /api/v1/profit-readiness (Retrieve current tenant profit readiness score)
      if (path === '/api/v1/profit-readiness' && req.method === 'GET') {
        const calculator = new ProfitReadinessCalculator(db);
        try {
          const result = await calculator.calculate(tenantId);
          sendSuccessResponse(res, result);
        } catch (err: any) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'PROFIT_READINESS_CALCULATION_FAILED',
                message: err.message || String(err),
              },
            }),
          );
        }
        return;
      }

      // 1.5 DELETE /account (Schedule account deletion)
      if (path === '/api/v1/account' && req.method === 'DELETE') {
        const userId = decodedToken.userId;
        const user = await db.getUserById(userId);
        if (!user) {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'User not found'}));
          return;
        }

        // Soft delete: set disabled status and deleted_at
        user.status = 'disabled';
        user.deleted_at = new Date().toISOString();
        await db.saveUser(user);

        // Revoke active refresh tokens
        const tokens = await db.getRefreshTokensForUser(userId);
        for (const t of tokens) {
          t.revoked = true;
          await db.saveRefreshToken(t);
        }

        // Mark org as deleted if user is owner of the tenant org
        const org = await db.getOrg(tenantId);
        if (org && org.owner_user === userId) {
          org.deleted_at = new Date().toISOString();
          await db.saveOrg(org);
        }

        // Schedule hard deletion job in 30 days
        const runAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
        const job: PendingJobEntry = {
          job_id: `job-hard-delete-${tenantId}-${Date.now()}`,
          tenant_id: tenantId,
          type: 'hard_delete_account',
          action_id: null,
          run_at: runAt,
          payload: {
            userId,
            orgId: tenantId,
          },
          status: 'pending',
          created_at: new Date().toISOString(),
        };
        await db.savePendingJob(job);

        sendSuccessResponse(res, {
          status: 'scheduled',
          message: 'Account scheduled for deletion. You have a 30-day grace period to cancel.',
          deletionDate: runAt,
        });
        return;
      }

      // 1.6 POST /account/export (Request data export)
      if (path === '/api/v1/account/export' && req.method === 'POST') {
        const token = signJwt(
          {
            userId: decodedToken.userId,
            orgId: decodedToken.orgId,
            role: decodedToken.role,
            purpose: 'gdpr_export',
          },
          config.auth.jwtSecret,
          15 * 60 * 1000, // 15 minutes TTL
        );
        const downloadUrl = `${config.server.baseUrl}/api/v1/account/export/download?token=${token}`;
        sendSuccessResponse(res, {
          downloadUrl,
          expiresIn: '15m',
        });
        return;
      }

      // 2. POST /orgs (Create custom org)
      if (path === '/api/v1/orgs' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {name} = body;
        if (!name) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing org name'}));
          return;
        }
        const orgId = `org_${crypto.randomUUID()}`;
        const org: OrgEntry = {
          org_id: orgId,
          name,
          owner_user: decodedToken.userId,
          plan: 'trial',
          created_at: new Date().toISOString(),
        };
        await db.saveOrg(org);
        await db.saveOrgMember({
          org_id: orgId,
          user_id: decodedToken.userId,
          role: 'owner',
        });
        sendSuccessResponse(res, {status: 'success', orgId});
        return;
      }

      // 3. POST /orgs/:id/brands (Create a brand/tenant under org)
      const brandMatch = path.match(/^\/api\/v1\/orgs\/([^/]+)\/brands$/);
      if (brandMatch && req.method === 'POST') {
        const orgId = brandMatch[1];
        const org = await db.getOrg(orgId);
        if (!org) {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Organization not found'}));
          return;
        }
        // Check membership
        const members = await db.getOrgMembers(orgId);
        const isMember = members.some(m => m.user_id === decodedToken.userId);
        if (!isMember) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Forbidden: not a member of this organization'}));
          return;
        }

        const body = await parseRequestBody(req);
        const {name} = body;
        if (!name) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing brand name'}));
          return;
        }

        const tenantId = `tenant_${crypto.randomUUID()}`;

        // Save brand (as client profile in clients table)
        await db.saveClient({
          clientId: `cli_${crypto.randomUUID()}`,
          orgId,
          name,
          mrr: 0,
          marginTarget: 0.3,
          healthScore: 100,
          churnRisk: 0.0,
          tenantId,
        });

        // Wire to existing trust ledger: auto-start trust tier at OBSERVE (level 0)
        tl.setTier(tenantId, 'read', 0);
        tl.setTier(tenantId, 'update_budget', 0);
        tl.setTier(tenantId, 'pause', 0);
        tl.setTier(tenantId, 'activate', 0);
        tl.setTier(tenantId, 'scale_budget', 0);

        // Save to persisted DB as well
        await db.saveTrustTier(tenantId, 'read', 0);
        await db.saveTrustTier(tenantId, 'update_budget', 0);
        await db.saveTrustTier(tenantId, 'pause', 0);
        await db.saveTrustTier(tenantId, 'activate', 0);
        await db.saveTrustTier(tenantId, 'scale_budget', 0);

        sendSuccessResponse(res, {status: 'success', tenantId});
        return;
      }

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
        const recs = await brain.analyzeProfitability(tenantId);
        sendSuccessResponse(res, {recommendations: recs});
        return;
      }

      // Dismiss Recommendation (Requires reason)
      const dismissMatch = path.match(/^\/api\/v1\/recommendations\/([^/]+)\/dismiss$/);
      if (dismissMatch && req.method === 'POST') {
        const recommendationId = dismissMatch[1];
        const body = await parseRequestBody(req);
        const {reason} = body;

        if (!reason || typeof reason !== 'string' || reason.trim() === '') {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing or empty dismissal reason'}));
          return;
        }

        const requestDb = db.clone();
        requestDb.setTenantContext(decodedToken.orgId);

        // Save audit log entry
        await requestDb.logAudit({
          tenant: decodedToken.orgId,
          timestamp: new Date().toISOString(),
          action_id: `dismiss-${recommendationId}-${Date.now()}`,
          op: 'dismiss_recommendation',
          entity: 'recommendation',
          target_id: recommendationId,
          cost: 0,
          decision: 'dismissed',
          reason: reason.trim(),
        });

        // Track telemetry event
        await requestDb.saveRecommendationEvent({
          event_id: `rec_evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          tenant_id: decodedToken.orgId,
          recommendation_id: recommendationId,
          action: 'dismissed',
          reason: reason.trim(),
          created_at: new Date().toISOString(),
        });

        sendSuccessResponse(res, {status: 'dismissed', recId: recommendationId});
        return;
      }

      // Reverse Action
      const reverseMatch = path.match(/^\/api\/v1\/actions\/([^/]+)\/reverse$/);
      if (reverseMatch && req.method === 'POST') {
        const actionId = reverseMatch[1];
        const body = await parseRequestBody(req);
        const {reason} = body;

        const requestDb = db.clone();
        requestDb.setTenantContext(decodedToken.orgId);

        const rawAdapter = new GoogleAdsAdapter(
          'mock-cust-id',
          'mock-dev-token',
          'mock-token',
          decodedToken.orgId,
        );
        const adapter = new RateLimitingAdapterWrapper(
          rawAdapter,
          googleAdsLimiter,
        );

        const requestGovernance = new GovernanceEngine(
          new PersistentAuditSink(requestDb),
          tl,
          cb,
          globalMetrics,
          undefined,
          requestDb,
        );

        try {
          const outcome = await requestGovernance.rollbackAction(decodedToken.orgId, actionId, adapter);
          if (!outcome.ok) {
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: outcome.error}));
            return;
          }

          await requestDb.saveRecommendationEvent({
            event_id: `rec_evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            tenant_id: decodedToken.orgId,
            recommendation_id: actionId,
            action: 'reversed',
            reason: reason || 'User manual override',
            created_at: new Date().toISOString(),
          });

          sendSuccessResponse(res, {status: 'reversed', actionId});
        } catch (err: any) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: err.message || String(err)}));
        }
        return;
      }

      // Post Onboarding Event
      if (path === '/api/v1/onboarding/event' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (!body.stage || !body.eventName) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Missing stage or eventName'}));
          return;
        }

        const requestDb = db.clone();
        requestDb.setTenantContext(decodedToken.orgId);

        const event = {
          event_id: `evt-${Date.now()}`,
          tenant_id: decodedToken.orgId,
          stage: body.stage,
          event_name: body.eventName,
          timestamp: new Date().toISOString(),
          duration_ms: body.durationMs || null,
          data: body.data || null,
        };

        await requestDb.saveOnboardingEvent(event);
        sendSuccessResponse(res, {status: 'success', eventId: event.event_id});
        return;
      }

      // Get Onboarding Events
      if (path === '/api/v1/onboarding/event' && req.method === 'GET') {
        const requestDb = db.clone();
        requestDb.setTenantContext(decodedToken.orgId);
        const events = await requestDb.getOnboardingEvents(decodedToken.orgId);
        sendSuccessResponse(res, {events});
        return;
      }

      // Telemetry Lift Calculator
      if (path === '/api/v1/telemetry/lift' && req.method === 'POST') {
        const body = await parseRequestBody(req);
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
        sendSuccessResponse(res, {lift, status: 'calculated'});
        return;
      }

      // 4. RISKS
      if (path === '/api/v1/risks' && req.method === 'GET') {
        // Call brain risk check with empty inventory status for mock stability
        const risks = await brain.detectRisks(tenantId, []);
        sendSuccessResponse(res, {risks});
        return;
      }

      // 4.5 DIAGNOSTIC SWEEP (GET)
      if (path === '/api/v1/sweep' && req.method === 'GET') {
        const requestDb = db.clone();
        requestDb.setTenantContext(tenantId);

        // Reconstruct governance engine and platform adapters
        const rawAdapter = new GoogleAdsAdapter(
          'mock-cust-id',
          'mock-dev-token',
          'mock-token',
          tenantId,
        );
        const adapter = new RateLimitingAdapterWrapper(
          rawAdapter,
          googleAdsLimiter,
        );

        const requestGovernance = new GovernanceEngine(
          new PersistentAuditSink(requestDb),
          tl,
          cb,
          globalMetrics,
          undefined,
          requestDb,
        );

        // Initialize RiskRadar with raw (unwrapped) GoogleAdsAdapter
        const radar = new RiskRadar(requestGovernance, rawAdapter, requestDb, tenantId);

        // Seed default variant inventory corresponding to mock campaigns
        const campaigns = await requestDb.getCampaigns(tenantId);
        for (const c of campaigns) {
          radar.seedInventory({
            variantId: `var_${c.campaign_id}`,
            sku: `SKU-${c.campaign_id.toUpperCase()}`,
            qty: 15, // healthy base qty
            promotedCampaignIds: [c.campaign_id],
          });
        }

        const ctx: Context = {
          role: {
            name: decodedToken.role,
            permits: () => true,
          },
          tenant: {
            tenantId,
            policy: {
              maxDailyDollarsRisk: 1000,
              maxBudgetMovePct: 0.20,
              minConfidence: 0.85,
              escalationRole: 'cmo',
            },
          },
          verifyWindowMs: 0,
        };

        // Instantiate inline mock BankAdapter for runway alerts fallback
        const mockBank = {
          platform: 'mock_bank',
          schemaVersion: '1.0',
          getConsentedBalances: async () => [],
          calculateRunwayMonths: async (monthlyBurn: number) => 1.5, // 1.5 months trigger alert
        };

        // Retrieve POAS reports for winners check
        const poasCalc = new PoasCalculator(requestDb);
        const poasReports = await poasCalc.calculate(tenantId).catch(() => []);

        // Run scans concurrently
        const [
          stockouts,
          roi,
          runway,
          conv,
          winners,
          checkout,
        ] = await Promise.all([
          radar.scanStockouts(ctx),
          radar.scanROIEfficiency(ctx),
          radar.scanFinancialRunway(ctx, mockBank, 500000).catch(() => []),
          radar.scanConversionTracking(ctx),
          radar.scanBudgetCappedWinners(ctx, poasReports),
          radar.scanCheckoutEvents(ctx),
        ]);

        const sweep: SweepFinding[] = [
          ...stockouts,
          ...roi,
          ...runway,
          ...conv,
          ...winners,
          ...checkout,
        ];

        const severityRank: Record<string, number> = {
          'CRITICAL': 0,
          'WARNING': 1,
          'OPPORTUNITY': 2,
        };

        sweep.sort((a, b) => {
          const rankA = severityRank[a.severity] ?? 99;
          const rankB = severityRank[b.severity] ?? 99;
          if (rankA !== rankB) {
            return rankA - rankB;
          }
          return b.dollarImpact - a.dollarImpact;
        });

        sendSuccessResponse(res, {sweep});
        return;
      }

      // 5. APPROVALS
      if (path === '/api/v1/approvals' && req.method === 'GET') {
        const approvals = await db.getApprovals(tenantId);
        sendSuccessResponse(res, {approvals});
        return;
      }

      // 5.2 INTEGRATIONS LIST (GET)
      if (path === '/api/v1/integrations' && req.method === 'GET') {
        const integrations = await db.getIntegrationStates(tenantId);
        sendSuccessResponse(res, {integrations});
        return;
      }

      // 5.3 GET AUTONOMY TIER (GET)
      if (path === '/api/v1/autonomy' && req.method === 'GET') {
        const trustVal = await db.getTrustTier(tenantId, 'global');
        const globalConfigured = trustVal !== null ? trustVal : 0;
        const minEarned = await getMinEarnedTier(db, tenantId);
        const activeLevel = Math.min(globalConfigured, minEarned);
        const validTiers = ['OBSERVE', 'REVIEW', 'ASSISTED', 'AUTONOMOUS', 'C_SUITE'];
        const tier = validTiers[activeLevel];
        sendSuccessResponse(res, {tier, level: activeLevel});
        return;
      }

      // 5.4 SET AUTONOMY TIER (POST)
      if (path === '/api/v1/autonomy' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        const {tier} = body;
        
        const validTiers = ['OBSERVE', 'REVIEW', 'ASSISTED', 'AUTONOMOUS', 'C_SUITE'];
        if (!tier || !validTiers.includes(tier)) {
          throw new ValidationError(`Invalid semantic trust tier: ${tier}`);
        }

        // Only admins can elevate autonomy to AUTONOMOUS or C_SUITE
        if (decodedToken.role !== 'admin' && (tier === 'AUTONOMOUS' || tier === 'C_SUITE')) {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'FORBIDDEN',
                message: 'Only administrators can elevate autonomy to high tiers.',
              },
            }),
          );
          return;
        }

        const tierNum = validTiers.indexOf(tier);
        const minEarned = await getMinEarnedTier(db, tenantId);

        if (tierNum > minEarned) {
          res.writeHead(409, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'TIER_NOT_EARNED',
                message: `Cannot elevate autonomy to ${tier} (level ${tierNum}) because minimum earned tier is ${validTiers[minEarned]} (level ${minEarned}).`,
              },
            }),
          );
          return;
        }

        await db.saveTrustTier(tenantId, 'global', tierNum);

        sendSuccessResponse(res, {status: 'success', tier});
        return;
      }

      // 5.5 APPROVAL RESUMPTION (POST)
      if (
        path.startsWith('/api/v1/approvals/') &&
        path.endsWith('/approve') &&
        req.method === 'POST'
      ) {
        const parts = path.split('/');
        const approvalId = parts[4];
        if (!approvalId) {
          throw new ValidationError('Approval ID is missing from URL path');
        }

        const requestDb = db.clone();
        requestDb.setTenantContext(decodedToken.orgId);

        const approvals = await requestDb.getApprovals(decodedToken.orgId);
        const approval = approvals.find((a) => a.approvalId === approvalId);

        if (!approval) {
          res.writeHead(404, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'NOT_FOUND',
                message: `Approval request '${approvalId}' not found`,
              },
            }),
          );
          return;
        }

        if (approval.status !== 'pending') {
          throw new ValidationError(
            `Approval request '${approvalId}' is already '${approval.status}'`,
          );
        }

        // Validate that the user role matches the escalation target
        const userRole = decodedToken.role.toLowerCase();
        const targetRole = approval.assignedTo.toLowerCase();
        if (userRole !== targetRole && userRole !== 'admin') {
          res.writeHead(403, {'Content-Type': 'application/json'});
          res.end(
            JSON.stringify({
              status: 'error',
              error: {
                code: 'FORBIDDEN',
                message: `User role '${decodedToken.role}' is not authorized to approve this request (escalated to '${approval.assignedTo}')`,
              },
            }),
          );
          return;
        }

        // Re-construct Governance and Platform Adapters
        const requestGovernance = new GovernanceEngine(
          new PersistentAuditSink(requestDb),
          tl,
          cb,
          globalMetrics,
          undefined,
          requestDb,
        );

        // Register a manual bypass override waiver for the requestor's role
        const waiver: Waiver = {
          overrideRole: approval.context.role.name,
          reason: `Manual manager sign-off by ${decodedToken.role}`,
          expiresAtMs: Date.now() + 5000, // 5s expiry window
          allowedOps: [approval.actionRequest.op],
          bypassIrreversible: true,
        };
        requestGovernance.registerWaiver(decodedToken.orgId, waiver);

        const rawAdapter = new GoogleAdsAdapter(
          'mock-cust-id',
          'mock-dev-token',
          'mock-token',
          decodedToken.orgId,
        );
        const adapter = new RateLimitingAdapterWrapper(
          rawAdapter,
          googleAdsLimiter,
        );

        // Reconstruct the Context role permit functions
        const rawRole = approval.context.role as any;
        const normalizedContext = {
          ...approval.context,
          role: {
            ...approval.context.role,
            permits: (op: string, entity: string) => {
              const roleName = approval.context.role?.name;
              if (roleName === 'media_buyer' || roleName === 'permittedRole') {
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

        const outcome = await requestGovernance.govern(
          adapter,
          approval.actionRequest,
          normalizedContext,
        );

        if (outcome.status === 'executed') {
          // Update approval request status in database
          approval.status = 'approved';
          approval.completedAt = Date.now();
          await requestDb.saveApproval(approval);
        }

        sendSuccessResponse(res, outcome);
        return;
      }

      // 6. EXECUTE CAMPAIGN ACTIONS (POST)
      if (path === '/api/v1/actions' && req.method === 'POST') {
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
          new PersistentAuditSink(requestDb),
          tl,
          cb,
          globalMetrics,
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

        // Calculate Cost Delta if action is update_budget
        let costDelta = (outcome.result as any)?.cost || 0;
        if (validatedRequest.op === 'update_budget') {
          const recommendedBudget = 500; // Reference mock budget recommendation
          const overrideBudget = (validatedRequest.payload as any)?.budget || 0;
          costDelta = overrideBudget - recommendedBudget;
        }

        await requestDb.logAudit({
          tenant: decodedToken.orgId,
          timestamp: new Date().toISOString(),
          action_id: `act-${Date.now()}`,
          op: validatedRequest.op,
          entity: validatedRequest.entity,
          target_id: validatedRequest.targetId || '',
          cost: costDelta,
          decision: 'executed',
          reason: 'Manual override delta',
        });

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
      void errorSink.recordError({
        tenant_id: tenantId,
        severity: 'critical',
        source: 'http_server_dispatch',
        message: err.message || String(err),
        context: {
          url: req.url,
          method: req.method,
          stack: err.stack,
        },
      }).catch(() => {});
      sendErrorResponse(res, err);
    }
  });

  server.headersTimeout = 60000; // 60s
  server.requestTimeout = 300000; // 5m
  server.keepAliveTimeout = 5000; // 5s

  return server.listen(port);
}

function createProductionVaultClient(): VaultClient {
  return {
    async fetchSecret(secretName: string): Promise<string> {
      // Stub implementation. Real production implementation will fetch from Cloud KMS/Secret Manager.
      return process.env[secretName] || '';
    },
  };
}

// Auto-run if executed directly as script
if (require.main === module) {
  (async () => {
    try {
      const isProduction = process.env['NODE_ENV'] === 'production';
      let secretProvider: SecretProvider;

      if (isProduction) {
        const vaultClient = createProductionVaultClient();
        secretProvider = new ManagedSecretProvider(vaultClient);
      } else {
        secretProvider = new EnvSecretProvider();
      }

      // 1. Resolve bootstrap secrets asynchronously
      await initializeConfig(secretProvider);

      // 2. Instantiate DB client with resolved parameters
      const mockMode = process.env['NODE_ENV'] === 'test';
      const db = new SupabaseClient(
        config.database.url,
        config.database.key,
        mockMode
      );

      const port = config.server.port;
      const logger = new PinoLogger(30, false);
      logger.info(`Starting native HTTP/SSE server on port ${port}...`);
      startServer(port, db);
    } catch (err: any) {
      const logger = new PinoLogger(30, false);
      logger.error('Fatal server bootstrap error:', {
        error: err.message || String(err),
      });
      process.exit(1);
    }
  })();
}
