import { logger } from "./logger";
import { sendMail } from "./mail";
import { normalisePhone, sendWhatsappMessage } from "./whatsapp";
import type { RdApplication } from "@workspace/db";

/**
 * Welcome packet sent when ops approves an RD application + provisions
 * a slug. Delivers a short WhatsApp message (when a verified opt-in
 * number is on file) and an HTML email with the console URL, payout
 * policy, and a "claim your seat" link.
 *
 * Templates are versioned via env so ops can ship copy changes without
 * a code deploy:
 *
 *   RD_WELCOME_TEMPLATE_VERSION       — string identifier logged with
 *                                       every send (defaults to "v1").
 *   RD_CONSOLE_URL                    — base URL of the RD console.
 *   RD_PAYOUT_POLICY_URL              — link to the payout policy doc.
 *   RD_WELCOME_EMAIL_SUBJECT          — overrides the email subject.
 *   RD_WELCOME_EMAIL_BODY             — overrides the email body
 *                                       (text). Supports the same
 *                                       `{{var}}` placeholders as the
 *                                       defaults below.
 *   RD_WELCOME_WHATSAPP_BODY          — overrides the WhatsApp body.
 *
 * Placeholders supported in overrides:
 *   {{name}} {{slug}} {{consoleUrl}} {{claimUrl}} {{payoutUrl}}
 */

const DEFAULT_VERSION = "v1";

const DEFAULT_EMAIL_SUBJECT =
  "Welcome to Tanmatra — your RD console is ready";

const DEFAULT_EMAIL_BODY = [
  "Hi {{name}},",
  "",
  "Your Tanmatra RD partner application has been approved. Your",
  "console handle is `{{slug}}`.",
  "",
  "1. Claim your seat: {{claimUrl}}",
  "2. Sign in to your console: {{consoleUrl}}",
  "3. Review the payout policy: {{payoutUrl}}",
  "",
  "If you run into any trouble signing in, just reply to this email",
  "and the partner ops team will help.",
  "",
  "— Tanmatra partner ops",
].join("\n");

const DEFAULT_WHATSAPP_BODY = [
  "Hi {{name}}, welcome to Tanmatra!",
  "",
  "Your RD console handle is *{{slug}}*.",
  "Claim your seat: {{claimUrl}}",
  "Console: {{consoleUrl}}",
  "Payout policy: {{payoutUrl}}",
].join("\n");

interface TemplateVars {
  name: string;
  slug: string;
  consoleUrl: string;
  claimUrl: string;
  payoutUrl: string;
}

function render(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = (vars as unknown as Record<string, string | undefined>)[key];
    return v ?? "";
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildVars(app: RdApplication, slug: string): TemplateVars {
  const consoleBase = (
    process.env["RD_CONSOLE_URL"] ?? "https://tanmatra.app/rd"
  ).replace(/\/$/, "");
  const payoutUrl =
    process.env["RD_PAYOUT_POLICY_URL"] ?? `${consoleBase}/payout-policy`;
  const claimUrl = `${consoleBase}/claim?slug=${encodeURIComponent(slug)}`;
  return {
    name: app.fullName,
    slug,
    consoleUrl: `${consoleBase}/${encodeURIComponent(slug)}`,
    claimUrl,
    payoutUrl,
  };
}

export interface RdWelcomeChannelResult {
  attempted: boolean;
  delivered: boolean;
  reason?: string;
}

export interface RdWelcomePacketResult {
  templateVersion: string;
  email: RdWelcomeChannelResult;
  whatsapp: RdWelcomeChannelResult;
}

export async function sendRdWelcomePacket(
  app: RdApplication,
  slug: string,
): Promise<RdWelcomePacketResult> {
  const templateVersion =
    process.env["RD_WELCOME_TEMPLATE_VERSION"] ?? DEFAULT_VERSION;
  const vars = buildVars(app, slug);

  const emailSubject = render(
    process.env["RD_WELCOME_EMAIL_SUBJECT"] ?? DEFAULT_EMAIL_SUBJECT,
    vars,
  );
  const emailText = render(
    process.env["RD_WELCOME_EMAIL_BODY"] ?? DEFAULT_EMAIL_BODY,
    vars,
  );
  const emailHtml = `<pre style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;white-space:pre-wrap;line-height:1.55">${escapeHtml(
    emailText,
  )}</pre>`;

  let emailRes: RdWelcomeChannelResult;
  try {
    const r = await sendMail({
      to: app.email,
      subject: emailSubject,
      text: emailText,
      html: emailHtml,
    });
    emailRes = {
      attempted: true,
      delivered: r.delivered,
      ...(r.reason ? { reason: r.reason } : {}),
    };
  } catch (err) {
    emailRes = {
      attempted: true,
      delivered: false,
      reason: (err as Error).message,
    };
  }

  let whatsappRes: RdWelcomeChannelResult = {
    attempted: false,
    delivered: false,
    reason: "no verified opt-in",
  };
  if (
    app.whatsappOptIn &&
    app.whatsappVerifiedAt &&
    app.whatsappCountryCode &&
    app.whatsappPhone
  ) {
    const num = normalisePhone(app.whatsappCountryCode, app.whatsappPhone);
    if (num) {
      const waBody = render(
        process.env["RD_WELCOME_WHATSAPP_BODY"] ?? DEFAULT_WHATSAPP_BODY,
        vars,
      );
      try {
        const r = await sendWhatsappMessage(num, waBody);
        whatsappRes = {
          attempted: true,
          delivered: r.ok,
          ...(r.error ? { reason: r.error } : {}),
        };
      } catch (err) {
        whatsappRes = {
          attempted: true,
          delivered: false,
          reason: (err as Error).message,
        };
      }
    } else {
      whatsappRes = {
        attempted: false,
        delivered: false,
        reason: "phone failed normalisation",
      };
    }
  }

  logger.info(
    {
      applicationId: app.id,
      slug,
      templateVersion,
      email: emailRes,
      whatsapp: whatsappRes,
    },
    "rd_partners.welcome_packet.sent",
  );

  return { templateVersion, email: emailRes, whatsapp: whatsappRes };
}
