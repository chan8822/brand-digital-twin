import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import { rateLimit } from "../lib/rateLimit";

const router: IRouter = Router();

// Hard cap on each field to prevent log bloat / abuse. Total body is
// already capped at 100kb by the global jsonDefault parser in app.ts.
const ErrorReportBody = z.object({
  message: z.string().max(500),
  stack: z.string().max(8_000).nullable().optional(),
  componentStack: z.string().max(8_000).nullable().optional(),
  href: z.string().max(2_000).optional(),
});

router.post("/error-report", async (req: Request, res: Response) => {
  // Rate limit per-IP. Front-end ErrorBoundary fires once per crash
  // and a busy day shouldn't approach this. Bots scraping the endpoint
  // get cut off fast.
  const ip = req.ip ?? "unknown";
  const allowed = await rateLimit(`error-report:ip:${ip}`, 60_000, 20);
  if (!allowed) {
    res.status(429).json({ ok: false });
    return;
  }
  const parsed = ErrorReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false });
    return;
  }
  // Strip URL query strings before logging — auth flows occasionally
  // round-trip tokens through the URL (e.g. ?next=…) and we don't want
  // those landing in our log retention.
  const hrefSafe = parsed.data.href ? parsed.data.href.split("?")[0] : null;
  req.log.warn(
    {
      msg: parsed.data.message,
      stack: parsed.data.stack ?? null,
      componentStack: parsed.data.componentStack ?? null,
      href: hrefSafe,
      userId:
        req.isAuthenticated() && req.user
          ? (req.user as { id?: string }).id ?? null
          : null,
    },
    "client.error_boundary",
  );
  res.json({ ok: true });
  void logger;
});

export default router;
