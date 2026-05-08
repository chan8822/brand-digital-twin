import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  rdApplicationsTable,
  rdWhatsappOptinsTable,
  rdWizardEventsTable,
  rdUsersTable,
  type RdApplicationStatus,
} from "@workspace/db";
import {
  normalisePhone,
  sendWhatsappOtp,
  verifyWhatsappOtp,
} from "../lib/whatsapp";
import { notifyOpsOfApplication } from "../lib/rdPartnersNotify";
import { sendRdWelcomePacket } from "../lib/rdPartnersWelcome";

const router: IRouter = Router();

// ---------- auth helpers (mirrors ops.ts / supportTickets.ts) ----------

function isOpsRequest(req: Request): boolean {
  const adminToken = process.env["RD_ADMIN_TOKEN"];
  const headerToken = req.header("x-admin-token");
  if (adminToken && headerToken && headerToken === adminToken) return true;
  const allow = (process.env["OPS_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return req.isAuthenticated() && allow.includes(req.user.id);
}

function requireOps(req: Request, res: Response): boolean {
  if (isOpsRequest(req)) return true;
  res.status(403).json({ error: "ops scope required" });
  return false;
}

function clientIp(req: Request): string {
  // We deliberately do NOT trust `x-forwarded-for` here: the app does not
  // set `trust proxy` and the header is fully attacker-controlled. Falling
  // back to the socket address means our rate-limit keys are at minimum
  // tied to the connection that hit the API, not a string the client picks.
  return req.socket?.remoteAddress ?? req.ip ?? "0.0.0.0";
}

// ---------- OTP verification proofs (server-authoritative) ----------
//
// `verify-otp` records (sessionId, e164) -> expiresAt; `applications`
// requires the pair to be present and unexpired before persisting a
// "verified" WhatsApp opt-in. Without this the server has no proof the
// client ever completed the OTP step.

const OTP_PROOF_TTL_MS = 30 * 60_000;
const otpProofs = new Map<string, number>();
function proofKey(sessionId: string, e164: string): string {
  return `${sessionId}::${e164}`;
}
function recordOtpProof(sessionId: string, e164: string): void {
  otpProofs.set(proofKey(sessionId, e164), Date.now() + OTP_PROOF_TTL_MS);
}
function consumeOtpProof(sessionId: string, e164: string): boolean {
  const k = proofKey(sessionId, e164);
  const exp = otpProofs.get(k);
  if (!exp) return false;
  otpProofs.delete(k);
  if (exp < Date.now()) return false;
  return true;
}

// ---------- in-memory rate limiters ----------
// (sliding-window, single-process — adequate for a low-volume wizard)

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();
function rateLimit(
  key: string,
  windowMs: number,
  max: number,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count >= max) {
    return { ok: false, retryAfterMs: b.resetAt - now };
  }
  b.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

// ---------- shared zod schemas ----------

const phoneSchema = z.object({
  countryCode: z.string().min(1).max(8),
  phone: z.string().min(6).max(20),
});

const applicationSchema = z.object({
  path: z.enum(["partner", "advisory", "both"]),
  fullName: z.string().min(2).max(200),
  email: z.email().max(200),
  credentials: z.string().min(1).max(200),
  registrationBody: z.string().max(120).optional().nullable(),
  registrationNumber: z.string().max(80).optional().nullable(),
  yearsExperience: z.number().int().min(0).max(80),
  specializations: z.array(z.string().min(1).max(80)).max(20).default([]),
  cityRegion: z.string().min(2).max(200),
  languages: z.array(z.string().min(1).max(40)).max(20).default([]),
  practiceSetting: z.enum([
    "solo",
    "clinic",
    "hospital",
    "corporate",
    "academia",
    "online-only",
    "other",
  ]),
  clientVolumeBucket: z
    .enum(["lt10", "10_50", "50_200", "gt200"])
    .optional()
    .nullable(),
  interests: z.array(z.string().min(1).max(80)).max(20).default([]),
  bio: z.string().max(2000).optional().nullable(),
  whatsapp: phoneSchema.optional(),
  whatsappOptIn: z.boolean().default(false),
  notifyPref: z.enum(["daily", "weekly", "critical"]).default("weekly"),
  /** Wizard session id, used to stitch funnel events. */
  sessionId: z.string().min(8).max(64),
});

// ---------- public: events ----------

const eventSchema = z.object({
  sessionId: z.string().min(8).max(64),
  eventName: z.string().min(1).max(64),
  step: z.number().int().min(0).max(20).optional(),
  applicationId: z.number().int().positive().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

router.post("/rd-partners/events", async (req: Request, res: Response) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const ip = clientIp(req);
  const rl = rateLimit(`rdp:event:${ip}`, 60_000, 60);
  if (!rl.ok) {
    res.status(429).json({ error: "rate limited" });
    return;
  }
  await db.insert(rdWizardEventsTable).values({
    sessionId: parsed.data.sessionId,
    eventName: parsed.data.eventName,
    step: parsed.data.step ?? null,
    applicationId: parsed.data.applicationId ?? null,
    extra: parsed.data.extra ?? null,
  });
  res.json({ ok: true });
});

// ---------- public: WhatsApp OTP ----------

router.post(
  "/rd-partners/whatsapp/send-otp",
  async (req: Request, res: Response) => {
    const parsed = phoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid phone" });
      return;
    }
    const num = normalisePhone(parsed.data.countryCode, parsed.data.phone);
    if (!num) {
      res.status(400).json({ error: "invalid phone" });
      return;
    }
    const ipRl = rateLimit(`rdp:otp:ip:${clientIp(req)}`, 60 * 60_000, 10);
    const phRl = rateLimit(`rdp:otp:ph:${num.e164}`, 60 * 60_000, 3);
    if (!ipRl.ok || !phRl.ok) {
      res.status(429).json({
        error: "too many OTP requests, please wait",
        retryAfterMs: Math.max(ipRl.retryAfterMs, phRl.retryAfterMs),
      });
      return;
    }
    const result = await sendWhatsappOtp(num);
    if (!result.ok) {
      res
        .status(502)
        .json({ error: result.error ?? "failed to send OTP" });
      return;
    }
    req.log.info(
      { e164: num.e164, mock: result.devCode != null },
      "rdp.otp.sent",
    );
    res.json({ ok: true, devCode: result.devCode });
  },
);

const verifyBody = phoneSchema.extend({
  code: z.string().min(4).max(10),
  sessionId: z.string().min(8).max(64),
});

router.post(
  "/rd-partners/whatsapp/verify-otp",
  async (req: Request, res: Response) => {
    const parsed = verifyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const num = normalisePhone(parsed.data.countryCode, parsed.data.phone);
    if (!num) {
      res.status(400).json({ error: "invalid phone" });
      return;
    }
    const rl = rateLimit(`rdp:vfy:${num.e164}`, 15 * 60_000, 6);
    if (!rl.ok) {
      res.status(429).json({ error: "too many attempts" });
      return;
    }
    const result = await verifyWhatsappOtp(num, parsed.data.code);
    if (!result.ok) {
      res.status(400).json({ error: result.error ?? "invalid code" });
      return;
    }
    recordOtpProof(parsed.data.sessionId, num.e164);
    res.json({ ok: true, e164: num.e164 });
  },
);

// ---------- public: submit application ----------

router.post(
  "/rd-partners/applications",
  async (req: Request, res: Response) => {
    const parsed = applicationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid payload",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    const ip = clientIp(req);
    const rl = rateLimit(`rdp:submit:${ip}`, 24 * 60 * 60_000, 5);
    if (!rl.ok) {
      res.status(429).json({ error: "submission limit reached" });
      return;
    }

    const d = parsed.data;
    let whatsappVerifiedAt: Date | null = null;
    let normalisedCC: string | null = null;
    let normalisedPhone: string | null = null;
    if (d.whatsapp) {
      const num = normalisePhone(d.whatsapp.countryCode, d.whatsapp.phone);
      if (!num) {
        res.status(400).json({ error: "invalid whatsapp phone" });
        return;
      }
      normalisedCC = num.countryCode;
      normalisedPhone = num.phone;
      // Server-authoritative: the wizard must have completed
      // /verify-otp in this session for this exact number. Without
      // that proof we drop the opt-in silently — the application row
      // still persists so ops can follow up by email.
      if (d.whatsappOptIn) {
        if (consumeOtpProof(d.sessionId, num.e164)) {
          whatsappVerifiedAt = new Date();
        } else {
          d.whatsappOptIn = false;
        }
      }
    }

    let appRow;
    try {
      const inserted = await db
        .insert(rdApplicationsTable)
        .values({
          path: d.path,
          fullName: d.fullName,
          email: d.email.toLowerCase(),
          credentials: d.credentials,
          registrationBody: d.registrationBody ?? null,
          registrationNumber: d.registrationNumber ?? null,
          yearsExperience: d.yearsExperience,
          specializations: d.specializations,
          cityRegion: d.cityRegion,
          languages: d.languages,
          practiceSetting: d.practiceSetting,
          clientVolumeBucket: d.clientVolumeBucket ?? null,
          interests: d.interests,
          bio: d.bio ?? null,
          whatsappCountryCode: normalisedCC,
          whatsappPhone: normalisedPhone,
          whatsappVerifiedAt,
          whatsappOptIn: d.whatsappOptIn,
          notifyPref: d.notifyPref,
          submitClientIp: ip,
          submitUserAgent: (req.header("user-agent") ?? "").slice(0, 400),
        })
        .returning();
      appRow = inserted[0]!;
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("uq_rd_app_email")) {
        res
          .status(409)
          .json({ error: "An application with this email already exists." });
        return;
      }
      throw err;
    }

    if (d.whatsappOptIn && normalisedCC && normalisedPhone) {
      await db
        .insert(rdWhatsappOptinsTable)
        .values({
          countryCode: normalisedCC,
          phone: normalisedPhone,
          sourceApplicationId: appRow.id,
          notifyPref: d.notifyPref,
        })
        .onConflictDoUpdate({
          target: [
            rdWhatsappOptinsTable.countryCode,
            rdWhatsappOptinsTable.phone,
          ],
          set: {
            notifyPref: d.notifyPref,
            optedOutAt: null,
            sourceApplicationId: appRow.id,
            verifiedAt: new Date(),
          },
        });
    }

    await db.insert(rdWizardEventsTable).values({
      sessionId: d.sessionId,
      eventName: "application_submitted",
      step: 5,
      applicationId: appRow.id,
      extra: { path: d.path },
    });

    const notify = await notifyOpsOfApplication(appRow);
    req.log.info(
      { applicationId: appRow.id, path: d.path, notify },
      "rd_partners.application.created",
    );

    res.status(200).json({ application: appRow, notify });
  },
);

// ---------- public: optional account hookup ----------

router.post(
  "/rd-partners/applications/:id/create-account",
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "sign in to attach account" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const rows = await db
      .select()
      .from(rdApplicationsTable)
      .where(eq(rdApplicationsTable.id, id))
      .limit(1);
    const app = rows[0];
    if (!app) {
      res.status(404).json({ error: "not found" });
      return;
    }
    // Light-touch verification: the signed-in user's email must match
    // the application email. RD-seat provisioning still requires the
    // existing /rd/console/claim flow (admin token).
    const userEmail = (req.user.email ?? "").toLowerCase();
    if (!userEmail || userEmail !== app.email) {
      res.status(403).json({ error: "email mismatch with application" });
      return;
    }
    // Idempotent: if a row is already linked we just echo the slug.
    if (app.linkedUserId === req.user.id && app.linkedRdSlug) {
      res.json({
        ok: true,
        linkedUserId: app.linkedUserId,
        rdSlug: app.linkedRdSlug,
        provisioned: false,
      });
      return;
    }

    // Every applicant — partner, advisory, or both — gets an
    // `rd_users` row + slug on attach so they can sign straight into
    // the RD console on approval.
    let provisionedSlug: string | null = app.linkedRdSlug ?? null;
    if (!provisionedSlug) {
      provisionedSlug = await provisionRdSlug(req.user.id, app.fullName);
    } else {
      // Make sure the rd_users row actually exists for the slug we
      // recorded — admins may have wiped it.
      const existing = await db
        .select({ id: rdUsersTable.id })
        .from(rdUsersTable)
        .where(
          and(
            eq(rdUsersTable.userId, req.user.id),
            eq(rdUsersTable.rdSlug, provisionedSlug),
          ),
        )
        .limit(1);
      if (existing.length === 0) {
        await db
          .insert(rdUsersTable)
          .values({ userId: req.user.id, rdSlug: provisionedSlug });
      }
    }

    await db
      .update(rdApplicationsTable)
      .set({
        linkedUserId: req.user.id,
        ...(provisionedSlug ? { linkedRdSlug: provisionedSlug } : {}),
      })
      .where(eq(rdApplicationsTable.id, id));
    res.json({
      ok: true,
      linkedUserId: req.user.id,
      rdSlug: provisionedSlug,
      provisioned: Boolean(provisionedSlug && !app.linkedRdSlug),
    });
  },
);

// Generate an `[a-z0-9-]` slug from the applicant's full name. Falls
// back to suffixing a counter when the natural slug is taken.
function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "rd"
  );
}

async function provisionRdSlug(
  userId: string,
  fullName: string,
): Promise<string> {
  // If this user already has an rd_users row, reuse it instead of
  // colliding on the unique (user_id) constraint.
  const existing = await db
    .select({ rdSlug: rdUsersTable.rdSlug })
    .from(rdUsersTable)
    .where(eq(rdUsersTable.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0].rdSlug;

  const base = slugifyName(fullName);
  for (let i = 0; i < 25; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db
      .select({ id: rdUsersTable.id })
      .from(rdUsersTable)
      .where(eq(rdUsersTable.rdSlug, candidate))
      .limit(1);
    if (taken.length === 0) {
      await db
        .insert(rdUsersTable)
        .values({ userId, rdSlug: candidate });
      return candidate;
    }
  }
  // Extremely unlikely — fall back to a random suffix.
  const suffix = Math.random().toString(36).slice(2, 8);
  const candidate = `${base}-${suffix}`;
  await db.insert(rdUsersTable).values({ userId, rdSlug: candidate });
  return candidate;
}

// ---------- admin ----------

router.get(
  "/admin/rd-applications",
  async (req: Request, res: Response) => {
    if (!requireOps(req, res)) return;
    const status = String(req.query["status"] ?? "all");
    const limit = Math.min(
      Math.max(parseInt(String(req.query["limit"] ?? "50"), 10) || 50, 1),
      200,
    );
    const where =
      status === "all"
        ? undefined
        : eq(
            rdApplicationsTable.status,
            status as RdApplicationStatus,
          );
    const rows = await db
      .select()
      .from(rdApplicationsTable)
      .where(where ?? sql`true`)
      .orderBy(desc(rdApplicationsTable.createdAt))
      .limit(limit);
    const counts = await db
      .select({
        status: rdApplicationsTable.status,
        n: sql<number>`count(*)::int`,
      })
      .from(rdApplicationsTable)
      .groupBy(rdApplicationsTable.status);
    res.json({ rows, counts });
  },
);

const adminPatchBody = z.object({
  status: z
    .enum(["new", "contacted", "approved", "rejected"])
    .optional(),
  adminNotes: z.string().max(4000).optional(),
  /** When approving, optionally provision the RD seat in one shot. */
  provisionRdSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/i)
    .max(64)
    .optional(),
});

router.patch(
  "/admin/rd-applications/:id",
  async (req: Request, res: Response) => {
    if (!requireOps(req, res)) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const parsed = adminPatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const d = parsed.data;
    const updates: Record<string, unknown> = {};
    if (d.status) {
      updates["status"] = d.status;
      updates["reviewedAt"] = new Date();
      updates["reviewedBy"] =
        req.user?.id ?? req.header("x-admin-token") ?? "ops";
    }
    if (d.adminNotes !== undefined) updates["adminNotes"] = d.adminNotes;

    // Snapshot the row pre-update so we can detect *first-time*
    // transitions (e.g. status moving to approved, slug being assigned
    // for the first time). This prevents duplicate welcome packets on
    // repeated PATCHes that just edit notes.
    const priorRow = (
      await db
        .select({
          status: rdApplicationsTable.status,
          linkedUserId: rdApplicationsTable.linkedUserId,
          linkedRdSlug: rdApplicationsTable.linkedRdSlug,
        })
        .from(rdApplicationsTable)
        .where(eq(rdApplicationsTable.id, id))
        .limit(1)
    )[0];

    if (d.provisionRdSlug && d.status === "approved") {
      // Reserve the slug in rd_users, attached to the linked user when
      // available. If the slug is already claimed by *another* user we
      // bail out with 409 and don't change application status.
      const linkedUser = priorRow?.linkedUserId;
      if (!linkedUser) {
        res.status(400).json({
          error:
            "applicant has not attached an account yet — cannot provision RD seat",
        });
        return;
      }
      const existing = await db
        .select({ userId: rdUsersTable.userId })
        .from(rdUsersTable)
        .where(eq(rdUsersTable.rdSlug, d.provisionRdSlug))
        .limit(1);
      if (existing[0] && existing[0].userId !== linkedUser) {
        res.status(409).json({ error: "rdSlug already claimed" });
        return;
      }
      if (!existing[0]) {
        await db
          .insert(rdUsersTable)
          .values({ userId: linkedUser, rdSlug: d.provisionRdSlug });
      }
      updates["linkedRdSlug"] = d.provisionRdSlug;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "no changes" });
      return;
    }

    const updated = await db
      .update(rdApplicationsTable)
      .set(updates)
      .where(eq(rdApplicationsTable.id, id))
      .returning();
    if (!updated[0]) {
      res.status(404).json({ error: "not found" });
      return;
    }
    req.log.info(
      { applicationId: id, updates, by: req.user?.id ?? "token" },
      "rd_partners.application.updated",
    );

    // On the *first* approval + slug provisioning, send the welcome
    // packet (WhatsApp template to the verified opt-in number, if any,
    // plus a welcome email to the application email). We gate on the
    // pre-update snapshot so that repeated PATCHes (e.g. ops editing
    // notes after approval) don't re-send onboarding messages.
    // Failures are logged but do not fail the admin write — the row
    // update is the source of truth, the packet is best-effort.
    let welcome: Awaited<
      ReturnType<typeof sendRdWelcomePacket>
    > | null = null;
    const isFirstApproval =
      d.status === "approved" &&
      !!d.provisionRdSlug &&
      (priorRow?.status !== "approved" ||
        priorRow?.linkedRdSlug !== d.provisionRdSlug);
    if (isFirstApproval) {
      try {
        welcome = await sendRdWelcomePacket(updated[0], d.provisionRdSlug!);
      } catch (err) {
        req.log.error(
          { err: (err as Error).message, applicationId: id },
          "rd_partners.welcome_packet.failed",
        );
      }
    }

    res.json({ ok: true, row: updated[0], welcome });
  },
);

export default router;
