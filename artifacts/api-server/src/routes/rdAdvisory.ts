import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  db,
  rdAppointmentsTable,
  rdMessagesTable,
  rdProgressLogsTable,
  rdLabUploadsTable,
  rdUsersTable,
  rdAvailabilityTable,
} from "@workspace/db";

const router: IRouter = Router();

/**
 * Server-side source of truth for RD pricing. The client may mirror this in
 * `rdBookingData.ts` for display, but the server NEVER trusts a
 * client-provided price — it computes price from rdSlug + kind here.
 */
const RD_PRICING: Record<string, Record<string, number>> = {
  "rd-anjali-nair": {
    intro_15m: 0,
    follow_up_30m: 120000,
    follow_up_45m: 180000,
  },
  "rd-vikram-sethi": {
    intro_15m: 0,
    follow_up_30m: 100000,
    follow_up_45m: 150000,
  },
  "rd-kavya-menon": {
    intro_15m: 0,
    follow_up_30m: 90000,
    follow_up_45m: 135000,
  },
};
function priceFor(rdSlug: string, kind: string): number | null {
  return RD_PRICING[rdSlug]?.[kind] ?? null;
}

/**
 * Static fallback office hours. Used when no `rd_availability` rows exist
 * for an RD. Same shape as the client's rdBookingData (kept in sync by
 * convention; client copy is for UX only — server is the source of truth).
 *
 * dayOfWeek: 0=Sun..6=Sat. Strings "HH:MM" 24h, IST.
 */
const STATIC_HOURS: Record<string, Record<number, Array<[string, string]>>> = {
  "rd-anjali-nair": {
    1: [["09:00", "12:00"], ["15:00", "18:00"]],
    2: [["09:00", "12:00"], ["15:00", "18:00"]],
    3: [["09:00", "12:00"]],
    4: [["09:00", "12:00"], ["15:00", "18:00"]],
    5: [["09:00", "13:00"]],
  },
  "rd-vikram-sethi": {
    1: [["07:00", "10:00"], ["18:00", "21:00"]],
    2: [["07:00", "10:00"], ["18:00", "21:00"]],
    3: [["07:00", "10:00"], ["18:00", "21:00"]],
    4: [["07:00", "10:00"]],
    6: [["08:00", "12:00"]],
  },
  "rd-kavya-menon": {
    1: [["10:00", "13:00"], ["16:00", "19:00"]],
    3: [["10:00", "13:00"], ["16:00", "19:00"]],
    5: [["10:00", "13:00"], ["16:00", "19:00"]],
    6: [["10:00", "14:00"]],
  },
};
function hmsToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
type Window = { dayOfWeek: number; startMinute: number; endMinute: number };

const IST_TZ = "Asia/Kolkata";
const IST_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TZ,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DOW_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
/** Decompose a Date into IST {year,month,day,dow,minutes-of-day}. */
function istParts(d: Date): {
  y: number; m: number; day: number; dow: number; min: number;
} {
  const parts = IST_PARTS.formatToParts(d);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    y: Number(map["year"]),
    m: Number(map["month"]),
    day: Number(map["day"]),
    dow: DOW_MAP[map["weekday"] ?? "Sun"] ?? 0,
    min: Number(map["hour"]) * 60 + Number(map["minute"]),
  };
}
/** Convert IST wall-clock {y,m,d,minutes} to a UTC Date. */
function istToUtc(y: number, m: number, day: number, min: number): Date {
  // IST is UTC+5:30, no DST.
  return new Date(Date.UTC(y, m - 1, day, 0, min - 330));
}

/**
 * Resolve an RD's office-hour windows. Prefers rows in `rd_availability`;
 * falls back to STATIC_HOURS. Returns an empty array for unknown RDs.
 */
async function loadHours(rdSlug: string): Promise<Window[]> {
  const rows = await db
    .select()
    .from(rdAvailabilityTable)
    .where(eq(rdAvailabilityTable.rdSlug, rdSlug));
  if (rows.length > 0) {
    return rows.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    }));
  }
  const fallback = STATIC_HOURS[rdSlug];
  if (!fallback) return [];
  const out: Window[] = [];
  for (const [dowStr, ranges] of Object.entries(fallback)) {
    const dow = Number(dowStr);
    for (const [s, e] of ranges) {
      out.push({
        dayOfWeek: dow,
        startMinute: hmsToMin(s),
        endMinute: hmsToMin(e),
      });
    }
  }
  return out;
}

/**
 * True iff [start, end) lies entirely inside one of the RD's allowed
 * office-hour windows. Both bounds use the local day-of-week of `start`
 * for window matching.
 */
function isInsideWindow(
  start: Date,
  end: Date,
  windows: Window[],
): boolean {
  // All RD office hours are expressed in IST; convert both bounds via the
  // canonical Asia/Kolkata timezone so that booking validation is stable
  // regardless of the server's local TZ.
  const s = istParts(start);
  const e = istParts(end);
  if (s.y !== e.y || s.m !== e.m || s.day !== e.day) return false;
  if (e.min <= s.min) return false;
  return windows.some(
    (w) =>
      w.dayOfWeek === s.dow && s.min >= w.startMinute && e.min <= w.endMinute,
  );
}

// --- Mock payment processor (replace with Stripe/Razorpay webhook) ---
const PAYMENTS_SECRET =
  process.env["PAYMENTS_WEBHOOK_SECRET"] ?? process.env["SESSION_SECRET"] ?? "";
function signPayment(apptId: number, userId: string, amountPaise: number): string {
  return createHmac("sha256", PAYMENTS_SECRET)
    .update(`${apptId}|${userId}|${amountPaise}`)
    .digest("hex");
}
/**
 * In production this would be triggered by a verified Stripe/Razorpay
 * webhook. For this codebase we synthesise the same call server-internally
 * after an appointment is created — the client never has authority to flip
 * payment status.
 */
async function settlePayment(
  apptId: number,
  userId: string,
  amountPaise: number,
): Promise<void> {
  const sig = signPayment(apptId, userId, amountPaise);
  await markPaidWithSignature(apptId, userId, amountPaise, sig);
}
async function markPaidWithSignature(
  apptId: number,
  userId: string,
  amountPaise: number,
  signature: string,
): Promise<boolean> {
  if (!PAYMENTS_SECRET) return false;
  const expected = signPayment(apptId, userId, amountPaise);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  await db
    .update(rdAppointmentsTable)
    .set({ paymentStatus: "paid" })
    .where(
      and(
        eq(rdAppointmentsTable.id, apptId),
        eq(rdAppointmentsTable.userId, userId),
        eq(rdAppointmentsTable.pricePaise, amountPaise),
        eq(rdAppointmentsTable.paymentStatus, "pending"),
      ),
    );
  return true;
}

/**
 * Verify the signed-in user is mapped to `rdSlug` in `rd_users`. Returns true
 * iff authorised; otherwise sends 403 and returns false.
 */
async function requireRdRole(
  req: Request,
  res: Response,
  rdSlug: string,
): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  const rows = await db
    .select({ id: rdUsersTable.id })
    .from(rdUsersTable)
    .where(
      and(
        eq(rdUsersTable.userId, req.user.id),
        eq(rdUsersTable.rdSlug, rdSlug),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    res.status(403).json({ error: "not authorised for this RD" });
    return false;
  }
  return true;
}

function requireAuth(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return req.user.id;
}

const KIND = z.enum(["intro_15m", "follow_up_30m", "follow_up_45m"]);
const KIND_DURATION_MIN: Record<z.infer<typeof KIND>, number> = {
  intro_15m: 15,
  follow_up_30m: 30,
  follow_up_45m: 45,
};
const RD_SLUG_RE = /^rd-[a-z0-9-]{2,48}$/;

/**
 * Stable 31-bit hash of an RD slug, for use with pg_advisory_xact_lock.
 * Ensures concurrent bookings against the same RD serialize at the DB.
 */
function rdSlugLockKey(rdSlug: string): number {
  let h = 0;
  for (let i = 0; i < rdSlug.length; i++) {
    h = (h * 31 + rdSlug.charCodeAt(i)) | 0;
  }
  // pg int4 range, drop sign
  return h & 0x7fffffff;
}

const bookSchema = z.object({
  rdSlug: z.string().regex(RD_SLUG_RE),
  kind: KIND,
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  userQuestion: z.string().trim().max(2000).optional(),
});

const messageSchema = z.object({
  rdSlug: z.string().regex(RD_SLUG_RE),
  body: z.string().trim().min(1).max(4000),
  /** Send "rd" only from the RD console; defaults to "user". */
  asRole: z.enum(["user", "rd"]).optional(),
  /** When asRole=rd, identify the user thread to write into. */
  threadUserId: z.string().optional(),
});

const progressSchema = z.object({
  weightKg: z.number().min(20).max(400).nullable().optional(),
  energyScore: z.number().int().min(1).max(5).nullable().optional(),
  adherenceScore: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
});

const labSchema = z.object({
  fileUrl: z.string().url().max(2000),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().min(1).max(64),
  sizeBytes: z.number().int().min(0).max(50_000_000).optional(),
  sharedWithRdSlug: z.string().regex(RD_SLUG_RE).optional(),
  note: z.string().trim().max(500).optional(),
});

const rdNotesSchema = z.object({
  rdNotes: z.string().trim().max(4000),
  joinUrl: z.string().url().max(2000).optional().nullable(),
});

// --- Directory ---
// Server-side RD directory. Returns the canonical list of bookable RDs
// with bio, languages, specialties, pricing, and office hours. Frontend
// may render its own static metadata (avatar/copy) keyed by `slug`, but
// the source of truth for who is bookable lives here.
const RD_DIRECTORY: Array<{
  slug: string;
  name: string;
  title: string;
  credentials: string[];
  bio: string;
  yearsExperience: number;
  languages: string[];
  specialties: string[];
  bookable: boolean;
  pricing: { intro_15m: number; follow_up_30m: number; follow_up_45m: number };
}> = [
  {
    slug: "rd-anjali-nair",
    name: "Anjali Nair",
    title: "Lead Registered Dietitian",
    credentials: ["RD (India)", "MSc Clinical Nutrition", "CDE"],
    bio: "Anjali leads our metabolic health desk and has spent the last decade tightening glycaemic control for adults with Type 2 diabetes, PCOS, and dyslipidaemia.",
    yearsExperience: 12,
    languages: ["English", "Hindi", "Malayalam"],
    specialties: ["Type 2 diabetes", "PCOS", "Cardiometabolic", "Cholesterol"],
    bookable: true,
    pricing: { intro_15m: 0, follow_up_30m: 120000, follow_up_45m: 180000 },
  },
  {
    slug: "rd-vikram-sethi",
    name: "Vikram Sethi",
    title: "Performance Dietitian",
    credentials: ["RD", "ISAK Level 2", "CISSN"],
    bio: "Vikram works with athletes and recreational lifters on body recomposition, periodised fuelling, and protein distribution that fits Indian household kitchens.",
    yearsExperience: 9,
    languages: ["English", "Hindi", "Punjabi"],
    specialties: ["Sports nutrition", "Lean muscle", "Body recomposition"],
    bookable: true,
    pricing: { intro_15m: 0, follow_up_30m: 100000, follow_up_45m: 150000 },
  },
  {
    slug: "rd-kavya-menon",
    name: "Kavya Menon",
    title: "Family & Gut-Health Dietitian",
    credentials: ["RD", "MSc Nutrition & Dietetics", "Monash FODMAP-trained"],
    bio: "Kavya plans meals for whole households — from school lunchboxes to senior renal-friendly trays — and runs our IBS / FODMAP elimination protocols.",
    yearsExperience: 8,
    languages: ["English", "Hindi", "Tamil", "Malayalam"],
    specialties: [
      "Family nutrition",
      "Paediatric",
      "Gut health / IBS",
      "Senior wellness",
    ],
    bookable: true,
    pricing: { intro_15m: 0, follow_up_30m: 90000, follow_up_45m: 135000 },
  },
];

router.get("/rd/directory", async (_req: Request, res: Response) => {
  // Attach office hours from the canonical loadHours() resolver so the
  // directory always reflects rd_availability overrides if present.
  const out = await Promise.all(
    RD_DIRECTORY.map(async (rd) => ({
      ...rd,
      hours: await loadHours(rd.slug),
    })),
  );
  res.json({ rds: out });
});

// --- Appointments ---

router.get("/rd/appointments", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db
    .select()
    .from(rdAppointmentsTable)
    .where(eq(rdAppointmentsTable.userId, userId))
    .orderBy(desc(rdAppointmentsTable.startAt));
  res.json({ appointments: rows });
});

router.get("/rd/availability", async (req: Request, res: Response) => {
  const rdSlug = String(req.query["rdSlug"] ?? "");
  if (!RD_SLUG_RE.test(rdSlug)) {
    res.status(400).json({ error: "invalid rdSlug" });
    return;
  }
  const horizon = new Date();
  const rows = await db
    .select({
      startAt: rdAppointmentsTable.startAt,
      endAt: rdAppointmentsTable.endAt,
    })
    .from(rdAppointmentsTable)
    .where(
      and(
        eq(rdAppointmentsTable.rdSlug, rdSlug),
        gte(rdAppointmentsTable.startAt, horizon),
        sql`${rdAppointmentsTable.status} <> 'cancelled'`,
      ),
    );
  const windows = await loadHours(rdSlug);
  res.json({
    taken: rows.map((r) => ({
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
    })),
    hours: windows,
  });
});

/**
 * Server-side slot generation: enumerates open slots in the next N days
 * from canonical office hours (DB or static fallback) minus already-taken
 * appointments. Clients should prefer this over local generation.
 */
router.get("/rd/slots", async (req: Request, res: Response) => {
  const rdSlug = String(req.query["rdSlug"] ?? "");
  const kindStr = String(req.query["kind"] ?? "");
  if (!RD_SLUG_RE.test(rdSlug) || !KIND.safeParse(kindStr).success) {
    res.status(400).json({ error: "invalid rdSlug or kind" });
    return;
  }
  const kind = kindStr as z.infer<typeof KIND>;
  const durationMin = KIND_DURATION_MIN[kind];
  const daysAhead = Math.min(
    30,
    Math.max(1, Number(req.query["daysAhead"] ?? 14)),
  );
  const now = new Date();
  const horizon = new Date(now.getTime() + daysAhead * 86_400_000);
  const [windows, taken] = await Promise.all([
    loadHours(rdSlug),
    db
      .select({
        startAt: rdAppointmentsTable.startAt,
        endAt: rdAppointmentsTable.endAt,
      })
      .from(rdAppointmentsTable)
      .where(
        and(
          eq(rdAppointmentsTable.rdSlug, rdSlug),
          gte(rdAppointmentsTable.startAt, now),
          sql`${rdAppointmentsTable.status} <> 'cancelled'`,
        ),
      ),
  ]);
  const minStart = new Date(now.getTime() + 60 * 60 * 1000);
  const slots: Array<{ startAt: string; endAt: string }> = [];
  // Walk forward by IST calendar days, not server-local days, so that the
  // window-of-the-week matching is stable.
  const todayIst = istParts(now);
  for (let i = 0; i < daysAhead; i++) {
    const probe = new Date(
      Date.UTC(todayIst.y, todayIst.m - 1, todayIst.day + i, 12, 0, 0),
    );
    const p = istParts(probe);
    for (const w of windows.filter((x) => x.dayOfWeek === p.dow)) {
      let cursor = w.startMinute;
      while (cursor + durationMin <= w.endMinute) {
        const s = istToUtc(p.y, p.m, p.day, cursor);
        const e = new Date(s.getTime() + durationMin * 60_000);
        if (s >= minStart && e <= horizon) {
          const conflict = taken.some((t) => s < t.endAt && e > t.startAt);
          if (!conflict) {
            slots.push({
              startAt: s.toISOString(),
              endAt: e.toISOString(),
            });
          }
        }
        cursor += durationMin;
      }
    }
  }
  res.json({ slots });
});

router.post("/rd/appointments", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const { rdSlug, kind, startAt, endAt, userQuestion } = parsed.data;
  // Server-authoritative price — client cannot influence cost.
  const pricePaise = priceFor(rdSlug, kind);
  if (pricePaise == null) {
    res.status(400).json({ error: "unknown rdSlug or kind" });
    return;
  }
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (!(end > start) || start < new Date(Date.now() - 60_000)) {
    res.status(400).json({ error: "invalid time range" });
    return;
  }
  const expectedMin = KIND_DURATION_MIN[kind];
  const actualMin = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (actualMin !== expectedMin) {
    res.status(400).json({ error: "duration does not match session kind" });
    return;
  }
  // Enforce the slot lies inside the RD's canonical office hours.
  const windows = await loadHours(rdSlug);
  if (windows.length === 0 || !isInsideWindow(start, end, windows)) {
    res.status(400).json({ error: "slot outside RD availability" });
    return;
  }
  // Serialize concurrent bookings for the same RD via a transactional advisory
  // lock, then check overlap and insert atomically.
  try {
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${rdSlugLockKey(rdSlug)})`);
      const overlap = await tx
        .select({ id: rdAppointmentsTable.id })
        .from(rdAppointmentsTable)
        .where(
          and(
            eq(rdAppointmentsTable.rdSlug, rdSlug),
            sql`${rdAppointmentsTable.status} <> 'cancelled'`,
            sql`${rdAppointmentsTable.startAt} < ${end.toISOString()}`,
            sql`${rdAppointmentsTable.endAt} > ${start.toISOString()}`,
          ),
        )
        .limit(1);
      if (overlap.length > 0) {
        throw new Error("SLOT_TAKEN");
      }
      const [inserted] = await tx
        .insert(rdAppointmentsTable)
        .values({
          userId,
          rdSlug,
          kind,
          startAt: start,
          endAt: end,
          pricePaise,
          paymentStatus: pricePaise === 0 ? "free" : "pending",
          userQuestion: userQuestion ?? null,
          status: "scheduled",
        })
        .returning();
      return inserted;
    });
    req.log.info({ apptId: row?.id, rdSlug, userId }, "rd appointment booked");
    // For paid kinds: settle via the internal HMAC-signed webhook path.
    // The client cannot trigger this — only server code holding
    // PAYMENTS_WEBHOOK_SECRET can produce a valid signature. Replace
    // settlePayment() with your real Stripe/Razorpay handoff in prod.
    let finalRow = row;
    if (row && pricePaise > 0) {
      await settlePayment(row.id, userId, pricePaise);
      const [refreshed] = await db
        .select()
        .from(rdAppointmentsTable)
        .where(eq(rdAppointmentsTable.id, row.id))
        .limit(1);
      finalRow = refreshed ?? row;
    }
    res.status(201).json({ appointment: finalRow });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      res.status(409).json({ error: "slot already booked" });
      return;
    }
    throw err;
  }
});

/**
 * Verified payment webhook. The body must include {apptId, userId,
 * amountPaise} and the X-Webhook-Signature header must be a valid HMAC
 * over `${apptId}|${userId}|${amountPaise}` keyed by
 * PAYMENTS_WEBHOOK_SECRET. There is NO client-authoritative path to flip
 * payment status — this is the only entry point.
 */
const webhookSchema = z.object({
  apptId: z.number().int().positive(),
  userId: z.string().min(1),
  amountPaise: z.number().int().min(0),
});
router.post("/rd/payments/webhook", async (req: Request, res: Response) => {
  const sig = String(req.header("x-webhook-signature") ?? "");
  if (!sig) {
    res.status(401).json({ error: "missing signature" });
    return;
  }
  const parsed = webhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const { apptId, userId, amountPaise } = parsed.data;
  const ok = await markPaidWithSignature(apptId, userId, amountPaise, sig);
  if (!ok) {
    res.status(403).json({ error: "invalid signature" });
    return;
  }
  req.log.info({ apptId, userId }, "rd payment webhook settled");
  res.json({ ok: true });
});

router.post(
  "/rd/appointments/:id/cancel",
  async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const [row] = await db
      .update(rdAppointmentsTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(rdAppointmentsTable.id, id),
          eq(rdAppointmentsTable.userId, userId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ appointment: row });
  },
);

// --- RD console ---
// All console routes require the signed-in user to be mapped to `rdSlug` in
// `rd_users`. Use POST /rd/console/claim to bind your account to an RD slug.

router.get("/rd/console/me", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db
    .select({ rdSlug: rdUsersTable.rdSlug })
    .from(rdUsersTable)
    .where(eq(rdUsersTable.userId, userId))
    .limit(1);
  res.json({ rdSlug: rows[0]?.rdSlug ?? null });
});

const claimSchema = z.object({
  rdSlug: z.string().regex(RD_SLUG_RE),
  adminToken: z.string().min(1),
});
router.post("/rd/console/claim", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  // Privileged provisioning: requires an out-of-band admin token from env.
  // This is the only way to bind an account to an RD seat. If the env var is
  // not set, the endpoint is disabled.
  const expected = process.env["RD_ADMIN_TOKEN"];
  if (!expected) {
    res.status(503).json({ error: "RD provisioning disabled" });
    return;
  }
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  if (parsed.data.adminToken !== expected) {
    res.status(403).json({ error: "invalid admin token" });
    return;
  }
  const { rdSlug } = parsed.data;
  if (priceFor(rdSlug, "intro_15m") == null) {
    res.status(400).json({ error: "unknown rdSlug" });
    return;
  }
  const existing = await db
    .select({ userId: rdUsersTable.userId })
    .from(rdUsersTable)
    .where(eq(rdUsersTable.rdSlug, rdSlug))
    .limit(1);
  if (existing.length > 0) {
    if (existing[0]?.userId === userId) {
      res.json({ rdSlug });
      return;
    }
    res.status(409).json({ error: "rdSlug already claimed" });
    return;
  }
  try {
    await db.insert(rdUsersTable).values({ userId, rdSlug });
  } catch {
    res.status(409).json({ error: "rdSlug already claimed" });
    return;
  }
  req.log.info({ userId, rdSlug }, "rd role claimed");
  res.status(201).json({ rdSlug });
});

router.get("/rd/console/appointments", async (req: Request, res: Response) => {
  const rdSlug = String(req.query["rdSlug"] ?? "");
  if (!RD_SLUG_RE.test(rdSlug)) {
    res.status(400).json({ error: "invalid rdSlug" });
    return;
  }
  if (!(await requireRdRole(req, res, rdSlug))) return;
  const rows = await db
    .select()
    .from(rdAppointmentsTable)
    .where(eq(rdAppointmentsTable.rdSlug, rdSlug))
    .orderBy(desc(rdAppointmentsTable.startAt));
  res.json({ appointments: rows });
});

router.get("/rd/console/user/:userId", async (req: Request, res: Response) => {
  const rdSlug = String(req.query["rdSlug"] ?? "");
  if (!RD_SLUG_RE.test(rdSlug)) {
    res.status(400).json({ error: "invalid rdSlug" });
    return;
  }
  if (!(await requireRdRole(req, res, rdSlug))) return;
  const targetUserId = String(req.params["userId"] ?? "");
  if (!targetUserId) {
    res.status(400).json({ error: "missing userId" });
    return;
  }
  // The user must have an existing booking with this RD for the console to
  // surface their record. Prevents IDOR by guessing user UUIDs.
  const link = await db
    .select({ id: rdAppointmentsTable.id })
    .from(rdAppointmentsTable)
    .where(
      and(
        eq(rdAppointmentsTable.userId, targetUserId),
        eq(rdAppointmentsTable.rdSlug, rdSlug),
      ),
    )
    .limit(1);
  if (link.length === 0) {
    res.status(404).json({ error: "no relationship with this user" });
    return;
  }
  const [appointments, messages, progress, labs] = await Promise.all([
    db
      .select()
      .from(rdAppointmentsTable)
      .where(
        and(
          eq(rdAppointmentsTable.userId, targetUserId),
          eq(rdAppointmentsTable.rdSlug, rdSlug),
        ),
      )
      .orderBy(desc(rdAppointmentsTable.startAt)),
    db
      .select()
      .from(rdMessagesTable)
      .where(
        and(
          eq(rdMessagesTable.userId, targetUserId),
          eq(rdMessagesTable.rdSlug, rdSlug),
        ),
      )
      .orderBy(rdMessagesTable.createdAt),
    db
      .select()
      .from(rdProgressLogsTable)
      .where(eq(rdProgressLogsTable.userId, targetUserId))
      .orderBy(desc(rdProgressLogsTable.loggedAt))
      .limit(60),
    db
      .select()
      .from(rdLabUploadsTable)
      .where(
        and(
          eq(rdLabUploadsTable.userId, targetUserId),
          // PRIVACY: only show labs the user explicitly shared with this RD.
          // Unshared (NULL) labs are private to the user.
          eq(rdLabUploadsTable.sharedWithRdSlug, rdSlug),
        ),
      )
      .orderBy(desc(rdLabUploadsTable.createdAt)),
  ]);
  res.json({ appointments, messages, progress, labs });
});

router.patch(
  "/rd/console/appointments/:id/notes",
  async (req: Request, res: Response) => {
    const id = Number(req.params["id"]);
    const rdSlug = String(req.query["rdSlug"] ?? "");
    if (!Number.isInteger(id) || !RD_SLUG_RE.test(rdSlug)) {
      res.status(400).json({ error: "invalid id or rdSlug" });
      return;
    }
    if (!(await requireRdRole(req, res, rdSlug))) return;
    const parsed = rdNotesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const update: Record<string, unknown> = { rdNotes: parsed.data.rdNotes };
    if (parsed.data.joinUrl !== undefined) {
      update["joinUrl"] = parsed.data.joinUrl;
    }
    const [row] = await db
      .update(rdAppointmentsTable)
      .set(update)
      .where(
        and(
          eq(rdAppointmentsTable.id, id),
          eq(rdAppointmentsTable.rdSlug, rdSlug),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ appointment: row });
  },
);

// --- Messaging ---

router.get("/rd/messages", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rdSlug = String(req.query["rdSlug"] ?? "");
  if (!RD_SLUG_RE.test(rdSlug)) {
    res.status(400).json({ error: "invalid rdSlug" });
    return;
  }
  const rows = await db
    .select()
    .from(rdMessagesTable)
    .where(
      and(eq(rdMessagesTable.userId, userId), eq(rdMessagesTable.rdSlug, rdSlug)),
    )
    .orderBy(rdMessagesTable.createdAt);
  res.json({ messages: rows });
});

router.post("/rd/messages", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const senderRole = parsed.data.asRole ?? "user";
  // Users can only post to their own thread; threadUserId is only respected
  // for RD-console messages (asRole=rd) AND requires the caller to be the
  // claimed RD for that slug.
  let targetUserId: string;
  if (senderRole === "rd") {
    if (!parsed.data.threadUserId) {
      res.status(400).json({ error: "threadUserId required for asRole=rd" });
      return;
    }
    if (!(await requireRdRole(req, res, parsed.data.rdSlug))) return;
    // The RD may only message users who have an existing appointment
    // (any status) with them. Prevents RDs from cold-DMing arbitrary users.
    const link = await db
      .select({ id: rdAppointmentsTable.id })
      .from(rdAppointmentsTable)
      .where(
        and(
          eq(rdAppointmentsTable.userId, parsed.data.threadUserId),
          eq(rdAppointmentsTable.rdSlug, parsed.data.rdSlug),
        ),
      )
      .limit(1);
    if (link.length === 0) {
      res.status(403).json({ error: "no relationship with this user" });
      return;
    }
    targetUserId = parsed.data.threadUserId;
  } else {
    // Symmetric guard for user→RD: only users with at least one
    // appointment (any status) with the RD may post messages. Prevents
    // unsolicited inbound DMs to RDs from arbitrary signed-in users.
    const link = await db
      .select({ id: rdAppointmentsTable.id })
      .from(rdAppointmentsTable)
      .where(
        and(
          eq(rdAppointmentsTable.userId, userId),
          eq(rdAppointmentsTable.rdSlug, parsed.data.rdSlug),
        ),
      )
      .limit(1);
    if (link.length === 0) {
      res.status(403).json({ error: "book a session to start messaging" });
      return;
    }
    targetUserId = userId;
  }
  const [row] = await db
    .insert(rdMessagesTable)
    .values({
      userId: targetUserId,
      rdSlug: parsed.data.rdSlug,
      senderRole,
      body: parsed.data.body,
    })
    .returning();
  res.status(201).json({ message: row });
});

// --- Progress logs ---

router.get("/rd/progress", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db
    .select()
    .from(rdProgressLogsTable)
    .where(eq(rdProgressLogsTable.userId, userId))
    .orderBy(desc(rdProgressLogsTable.loggedAt))
    .limit(60);
  res.json({ logs: rows });
});

router.post("/rd/progress", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = progressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const d = parsed.data;
  if (
    d.weightKg == null &&
    d.energyScore == null &&
    d.adherenceScore == null &&
    !d.note
  ) {
    res.status(400).json({ error: "log at least one field" });
    return;
  }
  const [row] = await db
    .insert(rdProgressLogsTable)
    .values({
      userId,
      weightKg: d.weightKg != null ? String(d.weightKg) : null,
      energyScore: d.energyScore ?? null,
      adherenceScore: d.adherenceScore ?? null,
      note: d.note ?? null,
    })
    .returning();
  res.status(201).json({ log: row });
});

// --- Lab uploads (URL + metadata only; client uploads file via App Storage) ---

router.get("/rd/labs", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const rows = await db
    .select()
    .from(rdLabUploadsTable)
    .where(eq(rdLabUploadsTable.userId, userId))
    .orderBy(desc(rdLabUploadsTable.createdAt));
  res.json({ labs: rows });
});

router.post("/rd/labs", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = labSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const [row] = await db
    .insert(rdLabUploadsTable)
    .values({
      userId,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes ?? null,
      sharedWithRdSlug: parsed.data.sharedWithRdSlug ?? null,
      note: parsed.data.note ?? null,
    })
    .returning();
  res.status(201).json({ lab: row });
});

router.delete("/rd/labs/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [row] = await db
    .delete(rdLabUploadsTable)
    .where(
      and(eq(rdLabUploadsTable.id, id), eq(rdLabUploadsTable.userId, userId)),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ lab: row });
});

export default router;
