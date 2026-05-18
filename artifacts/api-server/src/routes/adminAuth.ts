import { Router, type IRouter, type Request, type Response } from "express";
import {
  ADMIN_COOKIE,
  clearAdminCookie,
  hashPassword,
  readAdminCookie,
  setAdminCookie,
  signAdminToken,
  verifyPassword,
} from "../lib/adminAuth";
import { rateLimit } from "../lib/rateLimit";
import { revokeSession } from "../lib/auth";

const router: IRouter = Router();

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

router.post("/admin/login", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as LoginBody;
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    res.status(400).json({ ok: false, error: "username and password required" });
    return;
  }

  // Per-IP throttle to make brute-forcing unattractive even with a small
  // number of admins. 10 attempts / 5 min is generous for a real human
  // and noise to an attacker.
  const ip = clientIp(req);
  const allowed = await rateLimit(`admin-login:${ip}`, 5 * 60 * 1000, 10);
  if (!allowed) {
    res.status(429).json({ ok: false, error: "too many attempts, try again later" });
    return;
  }

  const expectedUser = process.env["ADMIN_USERNAME"];
  const expectedHash = process.env["ADMIN_PASSWORD_HASH"];
  const secret = process.env["ADMIN_SESSION_SECRET"];

  if (!expectedUser || !expectedHash || !secret) {
    req.log?.error(
      {
        hasUser: Boolean(expectedUser),
        hasHash: Boolean(expectedHash),
        hasSecret: Boolean(secret),
      },
      "admin auth not configured",
    );
    res.status(500).json({ ok: false, error: "admin auth not configured" });
    return;
  }

  // Always run scrypt to keep timing similar between "wrong user" and
  // "wrong password" branches. We still need the username to match.
  const passOk = verifyPassword(password, expectedHash);
  const userOk = username === expectedUser;
  if (!userOk || !passOk) {
    res.status(401).json({ ok: false, error: "invalid credentials" });
    return;
  }

  const token = signAdminToken(expectedUser);
  if (!token) {
    res.status(500).json({ ok: false, error: "admin auth not configured" });
    return;
  }
  setAdminCookie(res, token);
  res.json({ ok: true, username: expectedUser });
});

router.post("/admin/logout", (_req: Request, res: Response) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

router.get("/admin/me", (req: Request, res: Response) => {
  const p = readAdminCookie(req);
  if (!p) {
    res.status(401).json({ ok: false });
    return;
  }
  res.json({ ok: true, username: p.u });
});

// One-shot helper for operators who need to mint a fresh hash from the
// running container. Gated by knowing ADMIN_SESSION_SECRET so it can't
// be hit anonymously. Returns the hash to log/copy by hand.
router.post("/admin/_hash", (req: Request, res: Response) => {
  const secret = process.env["ADMIN_SESSION_SECRET"];
  const provided = req.header("x-admin-secret");
  if (!secret || !provided || provided !== secret) {
    res.status(404).end();
    return;
  }
  const body = (req.body ?? {}) as { password?: unknown };
  const pw = typeof body.password === "string" ? body.password : "";
  if (!pw) {
    res.status(400).json({ error: "password required" });
    return;
  }
  res.json({ hash: hashPassword(pw) });
});

// Admin-initiated session revocation — immediately invalidates the target
// session so the user is logged out on their next request, without waiting
// for natural expiry. Useful after a support incident or account takeover.
router.post("/admin/sessions/:sid/revoke", async (req: Request, res: Response) => {
  const p = readAdminCookie(req);
  if (!p) {
    res.status(401).json({ ok: false, error: "admin auth required" });
    return;
  }
  const { sid } = req.params as { sid: string };
  if (!sid) {
    res.status(400).json({ ok: false, error: "sid required" });
    return;
  }
  await revokeSession(sid);
  res.json({ ok: true });
});

// Re-export for ops debugging / sanity checks.
export const ADMIN_COOKIE_NAME = ADMIN_COOKIE;
export default router;
