import type { Request, Response } from "express";

/**
 * Send a JSON error response without leaking internal `err.message`
 * (which can include Postgres column names, OpenAI prompt fragments,
 * stack hints, etc.) to the client. Detailed error info is logged
 * via `req.log.error` for operator triage.
 *
 * Pass `expose` for caller-visible domain errors (validation, "not
 * found", "already decided", etc.) — those messages are fine to echo.
 */
export interface SendErrorOpts {
  /** HTTP status. Defaults to 500. */
  status?: number;
  /** Public error message. Defaults to a generic string for 5xx. */
  expose?: string;
  /** Optional log event/context tag. */
  event?: string;
}

export function sendError(
  req: Request,
  res: Response,
  err: unknown,
  opts: SendErrorOpts = {},
): void {
  const status = opts.status ?? 500;
  req.log.error({ err, event: opts.event }, opts.event ?? "request_failed");
  const message =
    opts.expose ??
    (status >= 500 ? "internal error" : "request failed");
  res.status(status).json({ error: message });
}
