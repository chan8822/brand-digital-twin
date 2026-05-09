import type { Request, Response, NextFunction } from "express";

/**
 * Express middleware: rejects with 401 if `req.user` is not populated by
 * `authMiddleware`. Use as a route-level guard:
 *
 *   router.get("/me", requireAuth, (req, res) => { … req.user.id … });
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/**
 * Helper-style guard for handlers that prefer early-return over middleware
 * composition. Returns the userId, or `null` after sending a 401.
 */
export function requireAuthUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return req.user.id;
}
