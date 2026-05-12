import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  AuthUser,
  PhoneSendOtpBody,
  PhoneSendOtpResponse,
  PhoneVerifyOtpBody,
  PhoneVerifyOtpResponse,
  LogoutResponse,
  UpdateProfileInfoBody,
  UpdateProfileInfoResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  createSession,
  getSession,
  getSessionId,
  updateSession,
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

// When the SPA and API live on different origins (e.g. tanmatra.food →
// wellness-foods.run.app), cookies must be issued with SameSite=None so
// the browser includes them on cross-site fetches. SameSite=None *requires*
// Secure, which is already the default in non-dev. Operators set
// SESSION_SAMESITE=none on the cross-origin deployment.
const sessionSameSite = ((): "lax" | "strict" | "none" => {
  const v = (process.env["SESSION_SAMESITE"] ?? "lax").toLowerCase();
  return v === "none" || v === "strict" ? v : "lax";
})();

// Browsers reject SameSite=None cookies that aren't also Secure, which
// would silently break login on the cross-origin deployment. Refuse to
// boot if the operator sets that combination — it's never what they
// meant. (Production never sets INSECURE_DEV_COOKIE, so this only
// catches misconfigured dev/preview environments.)
if (sessionSameSite === "none" && isInsecureLocalDev) {
  throw new Error(
    "SESSION_SAMESITE=none requires Secure cookies; unset INSECURE_DEV_COOKIE.",
  );
}
// In production, "lax" is the right default for same-origin SPA+API
// deployments, but a cross-origin deployment will silently lose its
// session on every cross-site request. Surface the choice loudly so
// ops sees it in boot logs.
if (process.env["NODE_ENV"] === "production") {
  logger.info(
    { sameSite: sessionSameSite },
    "session cookie SameSite policy",
  );
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: !isInsecureLocalDev,
    sameSite: sessionSameSite,
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
    //
    // Attribution semantics: utm_*, signup_source, referral_code are
    // first-touch — set ONLY on initial user creation, never overwritten on
    // subsequent sign-ins. Otherwise a returning user clicking a re-targeted
    // ad would clobber their original acquisition channel, which is the
    // signal we actually want for channel-mix analysis. Consent timestamps,
    // by contrast, ARE updated on every sign-in (so a user who opts in later
    // gets their flag flipped without us needing a separate mutation).
    const now = new Date();
    const attr = parsed.data.attribution;
    const consentUpdates: Record<string, Date | string> = {
      phoneVerifiedAt: now,
      updatedAt: now,
    };
    if (attr?.marketingSmsConsent === true) {
      consentUpdates["marketingSmsConsentAt"] = now;
    }
    if (attr?.dpdpConsent === true) {
      consentUpdates["dpdpConsentAt"] = now;
    }
    if (attr?.tosVersion) {
      consentUpdates["tosAcceptedVersion"] = attr.tosVersion;
    }
    const [user] = await db
      .insert(usersTable)
      .values({
        phoneE164: num.e164,
        phoneVerifiedAt: now,
        signupSource: attr?.signupSource,
        utmSource: attr?.utmSource,
        utmMedium: attr?.utmMedium,
        utmCampaign: attr?.utmCampaign,
        referralCode: attr?.referralCode,
        marketingSmsConsentAt:
          attr?.marketingSmsConsent === true ? now : undefined,
        dpdpConsentAt: attr?.dpdpConsent === true ? now : undefined,
        tosAcceptedVersion: attr?.tosVersion,
      })
      .onConflictDoUpdate({
        target: usersTable.phoneE164,
        set: consentUpdates,
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

// PATCH /auth/profile-info — first name / last name / email capture. Used by
// the post-OTP "what should we call you?" modal AND any future inline edit
// in /account. PATCH semantics: omitted fields stay untouched.
router.patch(
  "/auth/profile-info",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || !req.user) {
      res.status(401).json({ error: "not authenticated" });
      return;
    }
    const parsed = UpdateProfileInfoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid input" });
      return;
    }
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (parsed.data.firstName !== undefined) {
      updates.firstName = parsed.data.firstName;
    }
    if (parsed.data.lastName !== undefined) {
      updates.lastName = parsed.data.lastName;
    }
    if (parsed.data.email !== undefined) {
      updates.email = parsed.data.email.toLowerCase();
    }
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "no fields to update" });
      return;
    }
    try {
      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, req.user.id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "user not found" });
        return;
      }
      const freshUser = AuthUser.parse({
        id: updated.id,
        phoneE164: updated.phoneE164,
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        profileImageUrl: updated.profileImageUrl,
      });
      // Refresh the session blob so subsequent requests in the same session
      // (e.g. /auth/user, headers reading req.user.firstName) see the new
      // values immediately. Without this, a brand-new user would complete
      // the WelcomeModal but the header would still show "no name" until
      // they re-logged in. We re-read the session before writing so we
      // don't clobber other fields the session might carry.
      const sid = getSessionId(req);
      if (sid) {
        const existing = await getSession(sid);
        if (existing) {
          await updateSession(sid, { ...existing, user: freshUser });
        }
      }
      res.json(
        UpdateProfileInfoResponse.parse({
          ok: true,
          user: freshUser,
        }),
      );
    } catch (e) {
      // Most likely cause: unique constraint on email (another account
      // already owns this address). Surface as 409 so the client can show a
      // sensible message instead of a generic 500.
      const msg = String(e instanceof Error ? e.message : e);
      if (msg.includes("unique") || msg.includes("duplicate")) {
        res.status(409).json({ error: "email already in use" });
        return;
      }
      logger.error({ err: msg, userId: req.user.id }, "auth.profile.update_failed");
      res.status(500).json({ error: "could not update profile" });
    }
  },
);

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json(LogoutResponse.parse({ success: true }));
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
