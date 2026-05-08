import { logger } from "./logger";
import { sendMail } from "./mail";
import type { RdApplication } from "@workspace/db";

/**
 * Notify ops that a new RD partner application was submitted.
 *
 * Sends a plain-text + HTML email summary to `RD_OPS_INBOX_EMAIL` via
 * the shared `sendMail` helper. If no SMTP transport is configured the
 * helper still logs a structured `rd_partners.application.submitted`
 * line that ops piping can route.
 */
export interface RdNotifyResult {
  delivered: boolean;
  to: string | null;
  channel: "log" | "email";
}

function formatBody(app: RdApplication): { text: string; html: string } {
  const lines = [
    `New RD ${app.path} application — #${app.id}`,
    ``,
    `Name: ${app.fullName}`,
    `Email: ${app.email}`,
    `Credentials: ${app.credentials}`,
    `Years of experience: ${app.yearsExperience}`,
    `City / region: ${app.cityRegion}`,
    `Practice setting: ${app.practiceSetting}`,
    `Specializations: ${(app.specializations ?? []).join(", ") || "—"}`,
    `Languages: ${(app.languages ?? []).join(", ") || "—"}`,
    `Interests: ${(app.interests ?? []).join(", ") || "—"}`,
    `WhatsApp: ${
      app.whatsappPhone
        ? `${app.whatsappCountryCode}${app.whatsappPhone}${
            app.whatsappVerifiedAt ? " (verified)" : " (unverified)"
          }`
        : "Not provided"
    }`,
    ``,
    `Open in admin: /admin/rd-applications`,
  ];
  const text = lines.join("\n");
  const html = `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap">${text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</pre>`;
  return { text, html };
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
  if (!to) return { delivered: false, to, channel: "log" };
  try {
    const { text, html } = formatBody(app);
    const result = await sendMail({
      to,
      subject: `[RD partners] New ${app.path} application — ${app.fullName} (#${app.id})`,
      text,
      html,
    });
    return {
      delivered: result.delivered,
      to,
      channel: result.delivered ? "email" : "log",
    };
  } catch (err) {
    logger.error(
      { err: (err as Error).message, applicationId: app.id, to },
      "rd_partners.application.notify_failed",
    );
    return { delivered: false, to, channel: "log" };
  }
}
