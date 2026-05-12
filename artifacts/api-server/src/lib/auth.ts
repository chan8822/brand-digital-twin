import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, type DrizzleDb, sessionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface SessionData {
  user: AuthUser;
  /** ISO timestamp the session was created. */
  createdAt?: number;
  /** Optional label for debugging (e.g. "phone-otp"). */
  kind?: "web" | "mobile" | "phone-otp";
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

/**
 * Look up a session row.
 *
 * Task #7 bulkhead: callers on the manual-override critical path
 * pass the carve-out `overrideDb` so the lookup never queues on the
 * saturated main connection pool. All other callers default to the
 * main `db`. Both readers see the same `sessions` table — Postgres
 * is the source of truth, and the carve-out pool is just a separate
 * set of connections.
 */
export async function getSession(
  sid: string,
  dbInstance: DrizzleDb = db,
): Promise<SessionData | null> {
  const [row] = await dbInstance
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    // Use the same pool the read came in on so we don't leak the
    // override critical path back onto the main pool just to clean
    // up an expired session row.
    if (row) await deleteSession(sid, dbInstance);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(
  sid: string,
  dbInstance: DrizzleDb = db,
): Promise<void> {
  await dbInstance.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(
  res: Response,
  sid?: string,
): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}

/**
 * Sweep sessions whose expiry has passed. Without this, abandoned
 * sessions (user never returns) accumulate in `sessionsTable` forever.
 * Safe to call concurrently from multiple replicas.
 */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessionsTable).where(sql`${sessionsTable.expire} < now()`);
}
