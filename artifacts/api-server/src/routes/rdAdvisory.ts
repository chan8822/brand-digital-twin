import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  rdAppointmentsTable,
  rdMessagesTable,
  rdProgressLogsTable,
  rdLabUploadsTable,
  rdUsersTable,
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
  res.json({
    taken: rows.map((r) => ({
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
    })),
  });
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
          userQuestion: userQuestion ?? null,
          status: "scheduled",
        })
        .returning();
      return inserted;
    });
    req.log.info({ apptId: row?.id, rdSlug, userId }, "rd appointment booked");
    res.status(201).json({ appointment: row });
  } catch (err) {
    if (err instanceof Error && err.message === "SLOT_TAKEN") {
      res.status(409).json({ error: "slot already booked" });
      return;
    }
    throw err;
  }
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

const claimSchema = z.object({ rdSlug: z.string().regex(RD_SLUG_RE) });
router.post("/rd/console/claim", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
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
          sql`(${rdLabUploadsTable.sharedWithRdSlug} = ${rdSlug} OR ${rdLabUploadsTable.sharedWithRdSlug} IS NULL)`,
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
    targetUserId = parsed.data.threadUserId;
  } else {
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
