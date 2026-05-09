import { db, rateLimitsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Postgres-backed sliding-window rate limiter. Survives process restarts
 * and is shared across replicas. Keys should embed the action + scope
 * (e.g. `auth:otp:ip:1.2.3.4`).
 *
 * Returns `true` if the request is allowed, `false` if it exceeded `max`
 * within the trailing `windowMs`.
 */
export async function rateLimit(
  key: string,
  windowMs: number,
  max: number,
): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(Date.now() + windowMs);

  const inserted = await db
    .insert(rateLimitsTable)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimitsTable.key,
      set: {
        count: sql`case
          when ${rateLimitsTable.resetAt} < ${now} then 1
          else ${rateLimitsTable.count} + 1
        end`,
        resetAt: sql`case
          when ${rateLimitsTable.resetAt} < ${now} then ${resetAt}
          else ${rateLimitsTable.resetAt}
        end`,
      },
    })
    .returning({ count: rateLimitsTable.count });

  const current = inserted[0]?.count ?? 1;
  return current <= max;
}

/**
 * Best-effort cleanup of expired rows. Call periodically from a cron or
 * scheduler; safe to call concurrently.
 */
export async function purgeExpiredRateLimits(): Promise<void> {
  await db
    .delete(rateLimitsTable)
    .where(sql`${rateLimitsTable.resetAt} < now()`);
}

export { eq };
