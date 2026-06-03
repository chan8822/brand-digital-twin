/**
 * @fileoverview Native lightweight JWT authentication and authorization helpers.
 */

// taze: require from //third_party/javascript/typings/node

import * as crypto from "crypto";
import * as http from "http";
import { AuthError } from "./errors";

export interface DecodedJwt {
  userId: string;
  orgId: string;
  role: string;
  exp: number;
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
    // Re-verify the HMAC HS256 signature
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    if (signatureB64 !== expectedSignature) {
      throw new AuthError("Invalid token signature");
    }

    // Decode and parse payload
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadStr) as DecodedJwt;

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new AuthError("Token has expired");
    }

    return payload;
  } catch (err: any) {
    if (err instanceof AuthError) {
      throw err;
    }
    throw new AuthError(`Token verification failed: ${err.message}`);
  }
}

/**
 * Extracts and verifies the JWT from Authorization header.
 */
export function authMiddleware(req: http.IncomingMessage, secret: string): DecodedJwt {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    throw new AuthError("Missing authorization header");
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new AuthError("Authorization header must use Bearer scheme");
  }

  const token = authHeader.substring(7).trim();
  return verifyJwt(token, secret);
}
