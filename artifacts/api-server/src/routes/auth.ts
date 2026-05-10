import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  AuthUser,
  PhoneSendOtpBody,
  PhoneSendOtpResponse,
  PhoneVerifyOtpBody,
  PhoneVerifyOtpResponse,
  LogoutResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import {
  clearSession,
  createSession,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
} from "../lib/auth";
import { normalisePhone, sendSmsOtp, verifySmsOtp } from "../lib/sms";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Cookies are `secure` by default — only opt out when explicitly
// running on plain HTTP (local dev). Production / staging / preview
// envs are HTTPS-only, so a typo in NODE_ENV (e.g. "prod") cannot
// silently downgrade the cookie to be sent over HTTP.
const isInsecureLocalDev = process.env["INSECURE_DEV_COOKIE"] === "1";

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: !isInsecureLocalDev,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

// --- Rate limiting (per-IP and per-phone) — see lib/rateLimit.ts -----------

import { rateLimit } from "../lib/rateLimit";

function clientIp(req: Request): string {
  // Relies on `app.set("trust proxy", 1)` so req.ip parses XFF correctly.
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

// --- Routes -----------------------------------------------------------------

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.post(
  "/auth/phone/send-otp",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PhoneSendOtpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid phone" });
      return;
    }
    const num = normalisePhone(parsed.data.countryCode, parsed.data.phone);
    if (!num) {
      res.status(400).json({ error: "invalid phone" });
      return;
    }

    if (!(await rateLimit(`auth:otp:ip:${clientIp(req)}`, 60 * 60_000, 20))) {
      res.status(429).json({ error: "too many requests" });
      return;
    }
    if (!(await rateLimit(`auth:otp:ph:${num.e164}`, 60 * 60_000, 5))) {
      res.status(429).json({ error: "too many requests" });
      return;
    }

    const result = await sendSmsOtp(num);
    if (!result.ok) {
      res.status(502).json({ error: result.error ?? "send failed" });
      return;
    }
    logger.info({ e164: num.e164 }, "auth.phone.otp_sent");
    res.json(
      PhoneSendOtpResponse.parse({
        ok: true,
        ...(result.devCode ? { devCode: result.devCode } : {}),
      }),
    );
  },
);

router.post(
  "/auth/phone/verify-otp",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PhoneVerifyOtpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid input" });
      return;
    }
    const num = normalisePhone(parsed.data.countryCode, parsed.data.phone);
    if (!num) {
      res.status(400).json({ error: "invalid phone" });
      return;
    }

    if (!(await rateLimit(`auth:verify:ip:${clientIp(req)}`, 60 * 60_000, 30))) {
      res.status(429).json({ error: "too many requests" });
      return;
    }
    // Per-phone throttle so a leaked IP can't grind 30 attempts at one
    // number's 6-digit code (Twilio Verify also throttles, but defence
    // in depth is cheap).
    if (!(await rateLimit(`auth:verify:ph:${num.e164}`, 15 * 60_000, 6))) {
      res.status(429).json({ error: "too many requests" });
      return;
    }

    const result = await verifySmsOtp(num, parsed.data.code);
    if (!result.ok) {
      // Always return a single canonical message so attackers can't
      // distinguish "phone not enrolled" from "wrong code". The detailed
      // reason is already logged inside verifySmsOtp.
      res.status(401).json({ error: "incorrect code" });
      return;
    }

    // Upsert the user by their verified phone. We let the DB generate the
    // user id on first sign-in (gen_random_uuid()).
    const now = new Date();
    const [user] = await db
      .insert(usersTable)
      .values({
        phoneE164: num.e164,
        phoneVerifiedAt: now,
      })
      .onConflictDoUpdate({
        target: usersTable.phoneE164,
        set: {
          phoneVerifiedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    if (!user) {
      logger.error({ e164: num.e164 }, "auth.phone.upsert_failed");
      res.status(500).json({ error: "could not create session" });
      return;
    }

    const authUser = AuthUser.parse({
      id: user.id,
      phoneE164: user.phoneE164,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    });

    const sid = await createSession({
      user: authUser,
      kind: "phone-otp",
      createdAt: Date.now(),
    });
    setSessionCookie(res, sid);

    logger.info(
      { userId: user.id, e164: num.e164 },
      "auth.phone.session_created",
    );

    res.json(
      PhoneVerifyOtpResponse.parse({ ok: true, user: authUser }),
    );
  },
);

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json(LogoutResponse.parse({ success: true }));
});

// Legacy GET /logout — kept so any existing `<a href="/api/logout">` links
// continue to work. Clears the session and redirects to the home page.
router.get("/logout", async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/");
});

// Legacy GET /login — the OIDC redirect is gone; bounce the browser to the
// in-app login screen. Preserves a `returnTo` query if provided.
router.get("/login", (req: Request, res: Response): void => {
  const returnToRaw = req.query.returnTo;
  const next =
    typeof returnToRaw === "string" &&
    returnToRaw.startsWith("/") &&
    !returnToRaw.startsWith("//")
      ? returnToRaw
      : "/";
  res.redirect(`/login?next=${encodeURIComponent(next)}`);
});

export default router;
