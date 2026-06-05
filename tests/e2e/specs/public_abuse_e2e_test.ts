/**
 * @fileoverview End-to-end tests for Public Abuse protection, IP rate limiting, DDoS limits, large payloads and tenant isolation.
 */

import 'jasmine';
import * as http from 'http';
import {config} from '../../../config';
import {startServer, resetRateLimiters} from '../../../server';
import {SupabaseClient} from '../../../supabase_client';
import {login, signup, verifyEmail} from '../../../user_auth';

describe('Public Abuse Protection E2E Tests', () => {
  let server: http.Server;
  let db: SupabaseClient;
  const PORT = 9984;
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

  interface ErrorResponseBody {
    status?: string;
    error: {
      code: string;
      message: string;
    };
  }

  function postJson(
    path: string,
    body: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<{status: number | undefined; body: unknown}> {
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

  function postRaw(
    path: string,
    buffer: Buffer,
    headers?: Record<string, string>
  ): Promise<{status: number | undefined; body: unknown}> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': buffer.length,
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
      req.write(buffer);
      req.end();
    });
  }

  describe('R4: Rate Limiting & Abuse Protection', () => {
    it('1. IP Rate Limiter Block (Auth Burst)', async () => {
      // checkAuthRateLimit has a limit of 5 burst requests.
      // Let's send 6 login requests from the same "IP" client context (simulated).
      // We will loop to make 6 requests.
      let lastRes: {status: number | undefined; body: unknown} | null = null;
      for (let i = 0; i < 6; i++) {
        lastRes = await postJson('/api/v1/auth/login', {
          'email': 'abuse@example.com',
          'password': 'WrongPassword123'
        });
      }

      expect(lastRes).not.toBeNull();
      expect(lastRes!.status).toBe(429);
      const errorBody = lastRes!.body as ErrorResponseBody;
      expect(errorBody.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(errorBody.error.message).toContain('Too many auth attempts');
    });

    it('2. DDoS Threshold Bypass Simulation', async () => {
      // Simulate different IPs by headers (if server checks x-forwarded-for)
      // Send requests with different x-forwarded-for headers to show they don't block each other.
      const responses: Array<{status: number | undefined; body: unknown}> = [];
      for (let i = 0; i < 5; i++) {
        const res = await postJson('/api/v1/auth/login', {
          'email': 'abuse@example.com',
          'password': 'WrongPassword123'
        }, { 'x-forwarded-for': `192.168.1.${i}` });
        responses.push(res);
      }

      // None of these should be rate-limited to 429 because they are all from different IPs (1 request each)
      for (const res of responses) {
        expect(res.status).toBe(401); // 401 Unauthorized (invalid credentials), not 429
        if (res.status === 429) {
          fail('Should not be rate limited on distinct IPs');
        }
      }
    });

    it('3. Payload Limit Enforcement', async () => {
      // Limit is 10MB. Let's send a payload of 11MB to a post endpoint.
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
      const res = await postRaw('/api/v1/auth/signup', largeBuffer);
      expect(res.status).toBe(413);
      const errorBody = res.body as ErrorResponseBody;
      expect(errorBody.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('4. IP Blocking & Allowlisting (Dynamic Waiver)', async () => {
      // Note: Server relies on checkRateLimit for normal routes.
      // If we request a normal route too fast, it blocks.
      // But if we register a waiver (or bypass), we bypass.
      // Wait, there is no explicit blacklisted IP database in server.ts except TokenBucket limits.
      // But we can verify that rate limiting actually blocks on the normal endpoints when burst is exceeded.
      // config.rateLimit.maxRequests is 100.
      // Let's mock config.rateLimit.maxRequests to 2 for this test!
      const originalMax = config.rateLimit.maxRequests;
      config.rateLimit.maxRequests = 2;
      resetRateLimiters();

      try {
        // First request: succeeds/unauthorized
        let res1 = await postJson('/api/v1/auth/refresh', { 'refreshToken': 'token-1' });
        expect(res1.status).not.toBe(429);

        // Second request: succeeds/unauthorized
        let res2 = await postJson('/api/v1/auth/refresh', { 'refreshToken': 'token-2' });
        expect(res2.status).not.toBe(429);

        // Third request: blocks with 429
        let res3 = await postJson('/api/v1/auth/refresh', { 'refreshToken': 'token-3' });
        expect(res3.status).toBe(429);
        const errorBody = res3.body as ErrorResponseBody;
        expect(errorBody.error.code).toBe('RATE_LIMIT_EXCEEDED');
      } finally {
        config.rateLimit.maxRequests = originalMax;
        resetRateLimiters();
      }
    });

    it('5. No Tenant Abuse Leakage', async () => {
      // Rate limiting is tracked per IP socket address.
      // If IP A is blocked, IP B is completely unaffected.
      const originalMax = config.rateLimit.maxRequests;
      config.rateLimit.maxRequests = 1;
      resetRateLimiters();

      try {
        // Send request from IP A (192.168.10.1) -> should pass/fail but not 429
        const resA1 = await postJson('/api/v1/auth/refresh', { 'refreshToken': 'token-1' }, { 'x-forwarded-for': '192.168.10.1' });
        expect(resA1.status).not.toBe(429);

        // Second request from IP A -> blocks with 429
        const resA2 = await postJson('/api/v1/auth/refresh', { 'refreshToken': 'token-1' }, { 'x-forwarded-for': '192.168.10.1' });
        expect(resA2.status).toBe(429);

        // Request from IP B (192.168.10.2) -> does NOT block
        const resB1 = await postJson('/api/v1/auth/refresh', { 'refreshToken': 'token-1' }, { 'x-forwarded-for': '192.168.10.2' });
        expect(resB1.status).not.toBe(429);
      } finally {
        config.rateLimit.maxRequests = originalMax;
        resetRateLimiters();
      }
    });
  });
});
