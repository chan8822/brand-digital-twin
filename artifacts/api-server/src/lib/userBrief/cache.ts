/**
 * Two-layer cache for UserBrief.
 *
 * 1. Per-request cache: a Map attached to a single Express `req`.
 *    Multiple tool handlers / route helpers in the same request reuse
 *    the same brief without round-tripping the DB.
 *
 * 2. Per-process short-TTL cache: a small in-memory Map keyed by
 *    userId+include-set. Survives across requests so a follow-up turn
 *    in the same chat doesn't re-fetch. Invalidated explicitly on
 *    profile/preferences/order/subscription writes.
 */

import type { UserBrief, BriefSection, GetUserBriefOptions } from "./types";

interface CacheEntry {
  brief: UserBrief;
  expiresAt: number;
}

const PROCESS_CACHE = new Map<string, CacheEntry>();
const PROCESS_TTL_MS = 30_000;

function sectionKey(include: BriefSection[] | undefined): string {
  if (!include) return "*";
  return [...include].sort().join(",");
}

export function processCacheKey(
  userId: string,
  opts: GetUserBriefOptions | undefined,
): string {
  return `${userId}|${sectionKey(opts?.include)}|${opts?.timezone ?? ""}`;
}

export function getProcessCached(
  userId: string,
  opts: GetUserBriefOptions | undefined,
): UserBrief | null {
  if (opts?.refresh) return null;
  const key = processCacheKey(userId, opts);
  const hit = PROCESS_CACHE.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    PROCESS_CACHE.delete(key);
    return null;
  }
  return hit.brief;
}

export function setProcessCached(
  userId: string,
  opts: GetUserBriefOptions | undefined,
  brief: UserBrief,
): void {
  const key = processCacheKey(userId, opts);
  PROCESS_CACHE.set(key, { brief, expiresAt: Date.now() + PROCESS_TTL_MS });
}

/**
 * Drop every cached brief for a user. Call from any write path that
 * mutates data feeding the brief (preferences, profile, orders,
 * subscriptions, loyalty, premium).
 */
export function invalidateUserBrief(userId: string): void {
  for (const key of PROCESS_CACHE.keys()) {
    if (key.startsWith(`${userId}|`)) PROCESS_CACHE.delete(key);
  }
}

/** Test-only — wipe the entire process cache. */
export function _resetUserBriefCacheForTests(): void {
  PROCESS_CACHE.clear();
}

/* -------- request-scoped cache -------- */

const REQUEST_CACHE_KEY = Symbol.for("tanmatra.userBriefCache");

interface ReqWithCache {
  [REQUEST_CACHE_KEY]?: Map<string, Promise<UserBrief>>;
}

export function getRequestCache(
  req: object | null | undefined,
): Map<string, Promise<UserBrief>> | null {
  if (!req) return null;
  const r = req as ReqWithCache;
  if (!r[REQUEST_CACHE_KEY]) r[REQUEST_CACHE_KEY] = new Map();
  return r[REQUEST_CACHE_KEY]!;
}
