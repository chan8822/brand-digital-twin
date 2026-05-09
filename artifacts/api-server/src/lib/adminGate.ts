import type { Request, Response } from "express";
import crypto from "crypto";

/**
 * Constant-time comparison for shared-secret tokens. Both inputs must be
 * the same length to be considered equal; never log either side.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True iff the request carries a valid `x-admin-token` header. */
function hasAdminToken(req: Request): boolean {
  const expected = process.env["RD_ADMIN_TOKEN"];
  if (!expected) return false;
  const got = req.header("x-admin-token");
  if (!got) return false;
  return safeEqual(got, expected);
}

export interface GateResult {
  allowed: boolean;
  operatorId: string | null;
}

/** Ops scope: x-admin-token OR authenticated user in OPS_USER_IDS. */
export function isOpsRequest(req: Request): GateResult {
  if (hasAdminToken(req)) {
    return { allowed: true, operatorId: req.user?.id ?? "admin-token" };
  }
  const allowlist = envList("OPS_USER_IDS");
  if (req.isAuthenticated() && allowlist.includes(req.user.id)) {
    return { allowed: true, operatorId: req.user.id };
  }
  return { allowed: false, operatorId: null };
}

/** Catalog scope: x-admin-token OR user in CATALOG_USER_IDS or OPS_USER_IDS. */
export function isCatalogRequest(req: Request): GateResult {
  if (hasAdminToken(req)) {
    return { allowed: true, operatorId: req.user?.id ?? "admin-token" };
  }
  const allow = [...envList("CATALOG_USER_IDS"), ...envList("OPS_USER_IDS")];
  if (req.isAuthenticated() && allow.includes(req.user.id)) {
    return { allowed: true, operatorId: req.user.id };
  }
  return { allowed: false, operatorId: null };
}

/** Helper: gate a handler with ops scope. Returns operatorId or null (after sending 403). */
export function requireOps(
  req: Request,
  res: Response,
): { operatorId: string | null } | null {
  const r = isOpsRequest(req);
  if (!r.allowed) {
    res.status(403).json({ error: "ops scope required" });
    return null;
  }
  return { operatorId: r.operatorId };
}

/** Helper: gate a handler with catalog scope. */
export function requireCatalog(
  req: Request,
  res: Response,
): { operatorId: string | null } | null {
  const r = isCatalogRequest(req);
  if (!r.allowed) {
    res.status(403).json({ error: "catalog scope required" });
    return null;
  }
  return { operatorId: r.operatorId };
}
