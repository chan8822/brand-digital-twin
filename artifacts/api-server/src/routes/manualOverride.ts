/**
 * Task #7 — Manual Mode bulkhead.
 *
 * The clinical override path (`POST /api/delivery/dispatch/override`)
 * is mounted as its OWN top-level router on the Express app, BEFORE the
 * monolithic `/api` aggregate router. The reason is request-path
 * isolation: every middleware on the aggregate router (rate-limit
 * stores, large-body parsers per sub-prefix, audit interceptors, etc.)
 * adds latency variance that the override SLO cannot tolerate.
 *
 * What this router does NOT carry:
 *   - the rest of /api/delivery/* sibling routes
 *   - any feature-flag / experiment middleware
 *   - any non-essential body parsers (the request body is <200 bytes;
 *     the global json default already parsed it)
 *
 * What it MUST keep:
 *   - cookie-parser + auth (mounted at app level, runs before any
 *     router) — we do not bypass authentication. The handler still
 *     calls `resolveOps()` to enforce the ops scope.
 *   - the global error handler (last `app.use` in app.ts).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { overrideAssignment } from "../lib/dispatch";
import { isOpsRequest } from "../lib/adminGate";

const overrideRouter: IRouter = Router();

const overrideBody = z.object({
  orderId: z.number().int().positive(),
  riderId: z.number().int().positive(),
  notes: z.string().max(256).optional(),
});

function resolveOps(req: Request): boolean {
  return isOpsRequest(req).allowed;
}

overrideRouter.post(
  "/api/delivery/dispatch/override",
  async (req: Request, res: Response) => {
    if (!resolveOps(req)) {
      res.status(403).json({ error: "ops scope required" });
      return;
    }
    const parsed = overrideBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const operatorId = req.user?.id ?? "ops_token";
    const out = await overrideAssignment({
      orderId: parsed.data.orderId,
      riderId: parsed.data.riderId,
      operatorId,
      notes: parsed.data.notes,
    });
    if (!out.ok) {
      // lock_busy → 503 (retryable); business conflicts → 409.
      const status = out.code === "lock_busy" ? 503 : 409;
      res.status(status).json(out);
      return;
    }
    res.json(out);
  },
);

export default overrideRouter;
