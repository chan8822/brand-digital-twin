import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const vitalSchema = z.object({
  name: z.enum(["CLS", "FCP", "INP", "LCP", "TTFB"]),
  value: z.number().finite(),
  id: z.string().max(64),
  url: z.string().max(256).optional(),
  ts: z.number().int().optional(),
});

/**
 * POST /vitals — receives Core Web Vitals beacons from the SPA.
 * navigator.sendBeacon sends a text/plain body; we parse it as JSON.
 * Writes are fire-and-forget into structured logs — the Cloud Logging
 * sink or any log aggregator can query them without a dedicated DB table.
 */
router.post("/vitals", (req: Request, res: Response) => {
  let raw = req.body;
  // sendBeacon sends Content-Type: text/plain — body may be a string
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { /* malformed — ignore */ }
  }
  const parsed = vitalSchema.safeParse(raw);
  if (!parsed.success) {
    res.status(204).end();
    return;
  }
  const { name, value, id, url, ts } = parsed.data;
  logger.info({ vital: name, value, id, url, ts }, "web_vital");
  res.status(204).end();
});

export default router;
