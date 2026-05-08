import { logger } from "./logger";

/**
 * Thin wrapper around Twilio's Verify API for WhatsApp OTPs. When the
 * Twilio env vars are not set (most local-dev installs and CI), the
 * helper switches to a mock mode: it logs the OTP and accepts a fixed
 * code so the wizard flow can be exercised end-to-end without external
 * credentials.
 *
 * Required env (production):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_VERIFY_SERVICE_SID
 *   TWILIO_WHATSAPP_FROM   (only needed if you fall back to Messages API)
 *
 * In mock mode the accepted code is "123456".
 */

const MOCK_CODE = "123456";

function hasTwilioCreds(): boolean {
  return Boolean(
    process.env["TWILIO_ACCOUNT_SID"] &&
      process.env["TWILIO_AUTH_TOKEN"] &&
      process.env["TWILIO_VERIFY_SERVICE_SID"],
  );
}

/** Mock OTP is only allowed outside production. In production we
 * refuse to send/verify when Twilio creds are missing rather than
 * silently accepting a fixed code that anyone could guess. */
function mockAllowed(): boolean {
  return (process.env["NODE_ENV"] ?? "development") !== "production";
}

export interface WhatsappE164 {
  countryCode: string;
  phone: string;
  /** Combined +CCNNNNN form. */
  e164: string;
}

export function normalisePhone(
  countryCodeRaw: string,
  phoneRaw: string,
): WhatsappE164 | null {
  const cc = countryCodeRaw.replace(/[^0-9+]/g, "").replace(/^\+?/, "+");
  const ph = phoneRaw.replace(/[^0-9]/g, "");
  if (!/^\+\d{1,4}$/.test(cc)) return null;
  if (ph.length < 6 || ph.length > 15) return null;
  return { countryCode: cc, phone: ph, e164: `${cc}${ph}` };
}

interface SendOtpResult {
  ok: boolean;
  /** Present in mock mode so dev UIs can show the code in a notice. */
  devCode?: string;
  error?: string;
}

export async function sendWhatsappOtp(
  number: WhatsappE164,
): Promise<SendOtpResult> {
  if (!hasTwilioCreds()) {
    if (!mockAllowed()) {
      logger.error(
        { e164: number.e164 },
        "whatsapp.otp.no_twilio_creds_in_production",
      );
      return {
        ok: false,
        error: "WhatsApp verification is temporarily unavailable",
      };
    }
    logger.info(
      { e164: number.e164, code: MOCK_CODE },
      "whatsapp.otp.mock_send",
    );
    return { ok: true, devCode: MOCK_CODE };
  }
  const sid = process.env["TWILIO_ACCOUNT_SID"]!;
  const token = process.env["TWILIO_AUTH_TOKEN"]!;
  const service = process.env["TWILIO_VERIFY_SERVICE_SID"]!;
  const url = `https://verify.twilio.com/v2/Services/${service}/Verifications`;
  const body = new URLSearchParams({
    To: number.e164,
    Channel: "whatsapp",
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      const txt = await res.text();
      logger.warn({ status: res.status, txt }, "whatsapp.otp.send_failed");
      return { ok: false, error: `twilio send failed: ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    logger.warn({ err }, "whatsapp.otp.send_error");
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Send a freeform WhatsApp message via Twilio's Messages API. Used for
 * non-OTP transactional messages (e.g. partner welcome packet).
 *
 * Required env (production):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM   (e.g. "whatsapp:+14155238886")
 *
 * In dev / when creds are missing, this logs the message body and
 * returns ok with `mock: true` so callers can still treat the send as
 * delivered for analytics purposes.
 */
export interface SendWhatsappMessageResult {
  ok: boolean;
  mock?: boolean;
  sid?: string;
  error?: string;
}

export async function sendWhatsappMessage(
  number: WhatsappE164,
  body: string,
): Promise<SendWhatsappMessageResult> {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_WHATSAPP_FROM"];
  if (!sid || !token || !from) {
    if (!mockAllowed()) {
      logger.error(
        { e164: number.e164 },
        "whatsapp.message.no_twilio_creds_in_production",
      );
      return { ok: false, error: "WhatsApp messaging is not configured" };
    }
    logger.info(
      { e164: number.e164, body },
      "whatsapp.message.mock_send",
    );
    return { ok: true, mock: true };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({
    To: `whatsapp:${number.e164}`,
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    Body: body,
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!res.ok) {
      const txt = await res.text();
      logger.warn(
        { status: res.status, txt },
        "whatsapp.message.send_failed",
      );
      return { ok: false, error: `twilio send failed: ${res.status}` };
    }
    const json = (await res.json()) as { sid?: string };
    return { ok: true, sid: json.sid };
  } catch (err) {
    logger.warn({ err }, "whatsapp.message.send_error");
    return { ok: false, error: (err as Error).message };
  }
}

interface VerifyOtpResult {
  ok: boolean;
  error?: string;
}

export async function verifyWhatsappOtp(
  number: WhatsappE164,
  code: string,
): Promise<VerifyOtpResult> {
  if (!hasTwilioCreds()) {
    if (!mockAllowed()) {
      return {
        ok: false,
        error: "WhatsApp verification is temporarily unavailable",
      };
    }
    if (code.trim() === MOCK_CODE) return { ok: true };
    return { ok: false, error: "invalid code" };
  }
  const sid = process.env["TWILIO_ACCOUNT_SID"]!;
  const token = process.env["TWILIO_AUTH_TOKEN"]!;
  const service = process.env["TWILIO_VERIFY_SERVICE_SID"]!;
  const url = `https://verify.twilio.com/v2/Services/${service}/VerificationCheck`;
  const body = new URLSearchParams({
    To: number.e164,
    Code: code.trim(),
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      return { ok: false, error: `twilio check failed: ${res.status}` };
    }
    const json = (await res.json()) as { status?: string };
    if (json.status === "approved") return { ok: true };
    return { ok: false, error: "invalid code" };
  } catch (err) {
    logger.warn({ err }, "whatsapp.otp.verify_error");
    return { ok: false, error: (err as Error).message };
  }
}
