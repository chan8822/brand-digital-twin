import { logger } from "./logger";

/**
 * Thin wrapper around Twilio's Verify API for SMS OTPs. Used by the
 * primary phone-number sign-in flow.
 *
 * When the Twilio env vars are not set (most local-dev installs and CI),
 * the helper switches to a mock mode: it logs the OTP and accepts a fixed
 * code so the login flow can be exercised end-to-end without external
 * credentials.
 *
 * Required env (production):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_VERIFY_SERVICE_SID
 *
 * In mock mode the accepted code is "123456".
 */

const MOCK_CODE = "123456";

export interface PhoneE164 {
  countryCode: string;
  phone: string;
  /** Combined +CCNNNNN form. */
  e164: string;
}

export function normalisePhone(
  countryCodeRaw: string,
  phoneRaw: string,
): PhoneE164 | null {
  const cc = countryCodeRaw.replace(/[^0-9+]/g, "").replace(/^\+?/, "+");
  const ph = phoneRaw.replace(/[^0-9]/g, "");
  if (!/^\+\d{1,4}$/.test(cc)) return null;
  if (ph.length < 6 || ph.length > 15) return null;
  return { countryCode: cc, phone: ph, e164: `${cc}${ph}` };
}

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

interface SendOtpResult {
  ok: boolean;
  /** Present in mock mode so dev UIs can show the code in a notice. */
  devCode?: string;
  error?: string;
}

async function twilioVerifyFetch(
  path: string,
  body: Record<string, string>,
): Promise<{ ok: boolean; status: string | null; raw: unknown }> {
  const sid = process.env["TWILIO_ACCOUNT_SID"]!;
  const token = process.env["TWILIO_AUTH_TOKEN"]!;
  const serviceSid = process.env["TWILIO_VERIFY_SERVICE_SID"]!;
  const url = `https://verify.twilio.com/v2/Services/${serviceSid}${path}`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    valid?: boolean;
  };
  return {
    ok: res.ok,
    status: typeof json.status === "string" ? json.status : null,
    raw: json,
  };
}

export async function sendSmsOtp(number: PhoneE164): Promise<SendOtpResult> {
  if (!hasTwilioCreds()) {
    if (!mockAllowed()) {
      logger.error(
        { e164: number.e164 },
        "sms.otp.no_twilio_creds_in_production",
      );
      return {
        ok: false,
        error: "Phone verification is temporarily unavailable",
      };
    }
    logger.info({ e164: number.e164, code: MOCK_CODE }, "sms.otp.mock_send");
    return { ok: true, devCode: MOCK_CODE };
  }

  try {
    const result = await twilioVerifyFetch("/Verifications", {
      To: number.e164,
      Channel: "sms",
    });
    if (!result.ok) {
      logger.error(
        { e164: number.e164, raw: result.raw },
        "sms.otp.twilio_send_failed",
      );
      return { ok: false, error: "Could not send verification code" };
    }
    logger.info(
      { e164: number.e164, status: result.status },
      "sms.otp.sent",
    );
    return { ok: true };
  } catch (err) {
    logger.error({ err, e164: number.e164 }, "sms.otp.twilio_send_threw");
    return { ok: false, error: "Could not send verification code" };
  }
}

export interface VerifyOtpResult {
  ok: boolean;
  error?: string;
}

export async function verifySmsOtp(
  number: PhoneE164,
  code: string,
): Promise<VerifyOtpResult> {
  if (!hasTwilioCreds()) {
    if (!mockAllowed()) {
      logger.error(
        { e164: number.e164 },
        "sms.otp.no_twilio_creds_in_production",
      );
      return { ok: false, error: "Phone verification is temporarily unavailable" };
    }
    if (code === MOCK_CODE) {
      logger.info({ e164: number.e164 }, "sms.otp.mock_verify_ok");
      return { ok: true };
    }
    logger.info({ e164: number.e164 }, "sms.otp.mock_verify_bad_code");
    return { ok: false, error: "Incorrect code" };
  }

  try {
    const result = await twilioVerifyFetch("/VerificationCheck", {
      To: number.e164,
      Code: code,
    });
    if (!result.ok) {
      logger.error(
        { e164: number.e164, raw: result.raw },
        "sms.otp.twilio_verify_failed",
      );
      return { ok: false, error: "Could not verify code" };
    }
    if (result.status === "approved") {
      logger.info({ e164: number.e164 }, "sms.otp.verified");
      return { ok: true };
    }
    return { ok: false, error: "Incorrect code" };
  } catch (err) {
    logger.error({ err, e164: number.e164 }, "sms.otp.twilio_verify_threw");
    return { ok: false, error: "Could not verify code" };
  }
}
