import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "../lib/rateLimit";

function clientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * Express middleware factory that applies the Postgres-backed rate limiter.
 *
 * @param scope   Logical action name embedded in the key (e.g. "public:menu")
 * @param max     Maximum allowed requests within the window
 * @param windowMs  Window duration in milliseconds
 */
export function rateLimitMiddleware(scope: string, max: number, windowMs: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = `${scope}:ip:${clientIp(req)}`;
      const allowed = await rateLimit(key, windowMs, max);
      if (!allowed) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }
    } catch (err) {
      // If the rate-limit check itself fails (DB down, etc.), log and allow
      // through — a broken rate limiter should not take down the API.
      req.log?.warn({ err, scope }, "rate limit check failed, allowing request");
    }
    next();
  };
}

// Pre-built limiters for the key endpoint categories.
// 1 min = 60_000 ms

/** Public catalog browsing — generous for real users, still blocks scrapers. */
export const publicMenuRateLimit = rateLimitMiddleware("public:menu", 120, 60_000);

/** Order creation and status — stricter to prevent order-spam. */
export const orderRateLimit = rateLimitMiddleware("orders", 30, 60_000);

/** AI / agent endpoints — GPU-backed, expensive. */
export const aiRateLimit = rateLimitMiddleware("ai:agent", 20, 60_000);

/** Dish rationale AI — called on menu scroll, batched but still limited. */
export const rationaleRateLimit = rateLimitMiddleware("ai:rationale", 40, 60_000);

/** Payment initiation — very tight to block synthetic order fraud. */
export const paymentRateLimit = rateLimitMiddleware("payments", 10, 60_000);

/** Admin moderation actions — prevents enumeration via compromised token. */
export const adminModerationRateLimit = rateLimitMiddleware("admin:moderation", 60, 60_000);

/** User address mutations — prevents address enumeration/abuse. */
export const addressRateLimit = rateLimitMiddleware("user:addresses", 30, 60_000);
