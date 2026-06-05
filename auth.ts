/**
 * @fileoverview Native lightweight JWT authentication and authorization helpers.
 */

// taze: require from //third_party/javascript/typings/node

import * as crypto from "crypto";
import * as http from "http";
import * as url from "url";
import { AuthError } from "./errors";

export interface DecodedJwt {
  userId: string;
  orgId: string;
  role: string;
  exp: number;
  purpose?: string;
}

/**
 * Verifies a JWT signature using native crypto HS256 algorithm and parses the payload.
 */
export function verifyJwt(token: string, secret: string): DecodedJwt {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthError("Invalid token format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    // Verify algorithm in header
    const headerStr = Buffer.from(headerB64, "base64url").toString("utf8");
    const header = JSON.parse(headerStr) as { alg?: string };
    if (header.alg !== "HS256") {
      throw new AuthError("Unsupported token algorithm");
    }

    // Re-verify the HMAC HS256 signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    const a = Buffer.from(signatureB64);
    const b = Buffer.from(expectedSignature);
    if (
      a.length !== b.length ||
      !crypto.timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
    ) {
      throw new AuthError("Invalid token signature");
    }

    // Decode and parse payload
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadStr) as DecodedJwt;

    // Check expiration (required claim)
    if (!payload.exp) {
      throw new AuthError("Missing exp claim in token");
    }
    if (payload.exp * 1000 < Date.now()) {
      throw new AuthError("Token has expired");
    }

    return payload;
  } catch (err: any) {
    if (err instanceof AuthError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new AuthError(`Token verification failed: ${msg}`);
  }
}

/**
 * Extracts and verifies the JWT from Authorization header.
 */
export function authMiddleware(
  req: http.IncomingMessage,
  secret: string,
): DecodedJwt {
  let token = '';
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthError('Authorization header must use Bearer scheme');
    }
    token = authHeader.substring(7).trim();
  } else {
    // Fallback to query parameter token (e.g. for EventSource SSE)
    const parsedUrl = url.parse(req.url || '', true);
    const queryToken = parsedUrl.query['token'];
    if (typeof queryToken === 'string' && queryToken.trim() !== '') {
      token = queryToken.trim();
    }
  }

  if (!token) {
    throw new AuthError('Missing authorization credentials');
  }

  return verifyJwt(token, secret);
}

/**
 * Signs a JWT payload using native crypto HS256 algorithm.
 */
export function signJwt(
  payload: Omit<DecodedJwt, 'exp'>,
  secret: string,
  expiresInMs: number,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');

  const fullPayload: DecodedJwt = {
    ...payload,
    exp: Math.floor((Date.now() + expiresInMs) / 1000),
  };
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}
