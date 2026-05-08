import { logger } from "./logger";
import type { RdApplication } from "@workspace/db";

/**
 * Notify ops that a new RD partner application was submitted.
 *
 * The repo currently ships no SMTP/SendGrid transport — sending real
 * email is intentionally out of scope here and tracked as a follow-up.
 * Until that exists this helper:
 *   1. Logs a structured `rd_partners.application.submitted` line that
 *      ops piping (Loki / pino-collector / etc.) can route.
 *   2. Returns a small descriptor so callers can surface "ops have
 *      been notified" feedback without making another DB call.
 *
 * The recipient is read from `RD_OPS_INBOX_EMAIL` (configurable per
 * deploy) so the wiring point is in place when the transport lands.
 */
export interface RdNotifyResult {
  delivered: boolean;
  to: string | null;
  channel: "log" | "email";
}

export async function notifyOpsOfApplication(
  app: RdApplication,
): Promise<RdNotifyResult> {
  const to = process.env["RD_OPS_INBOX_EMAIL"] ?? null;
  logger.info(
    {
      applicationId: app.id,
      path: app.path,
      name: app.fullName,
      email: app.email,
      city: app.cityRegion,
      specializations: app.specializations,
      to,
    },
    "rd_partners.application.submitted",
  );
  return { delivered: false, to, channel: "log" };
}
