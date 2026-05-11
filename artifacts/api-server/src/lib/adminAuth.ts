import crypto from "node:crypto";
import type { Request, Response } from "express";

/**
 * Admin auth — separate from the customer phone-OTP session machinery in
 * `auth.ts`. Stateless, signed cookie so we don't have to write to the
 * sessions table on every admin login. Validation is HMAC-only; we never
 * trust the cookie payload without verifying the signature first.
 *
 * Required env:
 *   ADMIN_USERNAME            — plaintext username (e.g. "admin")
 *   ADMIN_PASSWORD_HASH       — `scrypt$N$r$p$saltHex$hashHex` produced by hashPassword()
 *   ADMIN_SESSION_SECRET      — 32+ bytes of hex/base64 used to sign cookies
 *
 * Cookie:
 *   tanmatra_admin_sid = base64url(payloadJson) "." base64url(hmacSha256)
 *   payload = { u: username, iat: epochMs, exp: epochMs }
 */

export const ADMIN_COOKIE = "tanmatra_admin_sid";
export const ADMIN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isInsecureLocalDev = process.env["INSECURE_DEV_COOKIE"] === "1";

const sameSite = ((): "lax" | "strict" | "none" => {
  const v = (process.env["SESSION_SAMESITE"] ?? "lax").toLowerCase();
  return v === "none" || v === "strict" ? v : "lax";
})();

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify a plaintext password against a stored
 * `scrypt$N$r$p$saltHex$hashHex` string. Returns false on any parse/length
 * mismatch instead of throwing — never leak shape of the stored secret.
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (!password || !stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4]!;
  const hashHex = parts[5]!;
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  return safeEqual(derived, expected);
}

/** Generate a stored hash string for a given password. Use offline. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = crypto.scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

interface AdminPayload {
  u: string;
  iat: number;
  exp: number;
}

function getSecret(): Buffer | null {
  const s = process.env["ADMIN_SESSION_SECRET"];
  if (!s || s.length < 32) return null;
  return Buffer.from(s, "utf8");
}

export function signAdminToken(username: string, ttlMs: number = ADMIN_TTL_MS): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const now = Date.now();
  const payload: AdminPayload = { u: username, iat: now, exp: now + ttlMs };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  return `${payloadB64}.${b64url(mac)}`;
}

export function verifyAdminToken(token: string): AdminPayload | null {
  const secret = getSecret();
  if (!secret || !token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const macB64 = token.slice(dot + 1);
  const expectedMac = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  let givenMac: Buffer;
  try {
    givenMac = b64urlDecode(macB64);
  } catch {
    return null;
  }
  if (!safeEqual(expectedMac, givenMac)) return null;
  let payload: AdminPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as AdminPayload;
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.u !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp < Date.now()
  ) {
    return null;
  }
  return payload;
}

export function setAdminCookie(res: Response, token: string): void {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: !isInsecureLocalDev,
    sameSite,
    path: "/",
    maxAge: ADMIN_TTL_MS,
  });
}

export function clearAdminCookie(res: Response): void {
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
}

export function readAdminCookie(req: Request): AdminPayload | null {
  const raw = req.cookies?.[ADMIN_COOKIE];
  if (!raw || typeof raw !== "string") return null;
  return verifyAdminToken(raw);
}

/**
 * True iff the request carries a valid signed admin session cookie.
 * Used by adminGate.ts to extend ops/catalog scope to password-authed
 * admins without requiring the legacy `x-admin-token` header.
 */
export function hasAdminSession(req: Request): { username: string } | null {
  const p = readAdminCookie(req);
  return p ? { username: p.u } : null;
}
