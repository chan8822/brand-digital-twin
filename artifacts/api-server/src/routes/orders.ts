import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  deliveryEventsTable,
  ordersTable,
  rdUsersTable,
  teamProfilesTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { emitDeliveryEvent } from "../lib/realtime";

const router: IRouter = Router();

const cancelBody = z.object({
  reason: z.string().min(1).max(120),
  priority: z.enum(["stat", "routine"]).default("routine"),
});

/**
 * Returns true iff the signed-in user has a row in `rd_users` for any RD
 * slug — i.e. they are an authenticated clinician (Registered Dietitian).
 * Clinicians are allowed to cancel patient orders on the patient's behalf
 * (STAT cancel from RdConsole). For non-clinician callers we fall back to
 * "patient owns the order" auth.
 */
async function isClinician(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: rdUsersTable.id })
    .from(rdUsersTable)
    .where(eq(rdUsersTable.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Best-effort lookup of a human-readable clinician name for the cancelling
 * user. Joins rd_users → team_profiles by slug. Returns null when the
 * caller is not a clinician or has no team profile yet.
 */
async function lookupClinicianName(userId: string): Promise<string | null> {
  const rows = await db
    .select({ name: teamProfilesTable.name, title: teamProfilesTable.title })
    .from(rdUsersTable)
    .innerJoin(teamProfilesTable, eq(teamProfilesTable.slug, rdUsersTable.rdSlug))
    .where(eq(rdUsersTable.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.title ? `${row.name}, ${row.title}` : row.name;
}

const ACTIVE_STATUSES = ["placed", "preparing", "ready", "out_for_delivery"];

/**
 * GET /api/orders/active
 *
 * Server-sourced active patient orders feed. Clinicians (anyone with a row
 * in `rd_users`) see every active order across patients — this is what the
 * RdConsole "Active patient orders" panel renders so STAT cancel is wired
 * to the canonical server list, not a localStorage cache. Non-clinicians
 * only see their own active orders.
 */
router.get("/orders/active", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const callerIsClinician = await isClinician(req.user.id);
  const baseWhere = inArray(ordersTable.status, ACTIVE_STATUSES);
  const where = callerIsClinician
    ? baseWhere
    : and(baseWhere, eq(ordersTable.userId, req.user.id));

  const rows = await db
    .select({
      id: ordersTable.id,
      externalOrderId: ordersTable.externalOrderId,
      status: ordersTable.status,
      totalPaise: ordersTable.totalPaise,
      addressLabel: ordersTable.addressLabel,
      createdAt: ordersTable.createdAt,
      userId: ordersTable.userId,
    })
    .from(ordersTable)
    .where(where)
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);

  res.json({
    callerIsClinician,
    orders: rows.map((r) => ({
      serverOrderId: r.id,
      externalOrderId: r.externalOrderId,
      status: r.status,
      totalPaise: r.totalPaise,
      addressLabel: r.addressLabel,
      createdAt: r.createdAt,
      patientUserId: r.userId,
    })),
  });
});

/**
 * POST /api/orders/:externalOrderId/cancel
 *
 * Cancels an order. Authorisation:
 *
 *   - The signed-in user owns the order (patient cancel), OR
 *   - The signed-in user is a clinician (RD) cancelling on a patient's
 *     behalf from RdConsole.
 *
 * The numeric DB id is never trusted from the client (prevents IDOR). The
 * row is resolved purely from `externalOrderId` and then the caller's
 * authority is checked against the resolved row's owner.
 *
 * Response semantics matter for the optimistic client:
 *
 *   - 200  → resolved + cancelled in the DB and broadcast over the socket.
 *            Client keeps its optimistic update.
 *   - 404  → no DB row matches `externalOrderId`. Client whose order has a
 *            `serverOrderId` treats this as a real failure and rolls back;
 *            client whose order is local-only (no `serverOrderId`) treats
 *            it as acceptable best-effort and keeps the local cancel.
 *   - 403  → caller is neither the order owner nor a clinician. Client
 *            rolls back.
 */
router.post(
  "/orders/:externalOrderId/cancel",
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const externalOrderId = String(req.params.externalOrderId ?? "").trim();
    if (!externalOrderId) {
      res.status(400).json({ error: "missing order id" });
      return;
    }
    const parsed = cancelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const { reason, priority } = parsed.data;

    const rows = await db
      .select({
        id: ordersTable.id,
        userId: ordersTable.userId,
        status: ordersTable.status,
      })
      .from(ordersTable)
      .where(eq(ordersTable.externalOrderId, externalOrderId))
      .limit(1);
    const row = rows[0];

    if (!row) {
      // No DB row for this order. The order may have been client-only
      // (loyalty checkout never persisted to DB). The patient client will
      // accept this 404 as best-effort, but a clinician operating from
      // RdConsole will see it as a real failure and roll back.
      req.log.info(
        { externalOrderId, callerId: req.user.id },
        "cancel requested for unresolved order",
      );
      res
        .status(404)
        .json({ ok: false, cancelled: false, persisted: false, reason: "not_found" });
      return;
    }

    const isOwner = row.userId === req.user.id;
    const callerIsClinician = isOwner ? false : await isClinician(req.user.id);
    if (!isOwner && !callerIsClinician) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const verifiedByName = callerIsClinician
      ? await lookupClinicianName(req.user.id)
      : null;

    await db
      .update(ordersTable)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(ordersTable.id, row.id),
          // Defence in depth: scope the UPDATE to the row we just read so
          // we never accidentally update a different row even if a race
          // changed it.
          eq(ordersTable.externalOrderId, externalOrderId),
        ),
      );
    const meta = {
      reason,
      priority,
      externalOrderId,
      cancelledByUserId: req.user.id,
      cancelledByRole: callerIsClinician ? "clinician" : "patient",
      ...(verifiedByName ? { verifiedByName } : {}),
    } as const;
    await db.insert(deliveryEventsTable).values({
      orderId: row.id,
      event: "order_cancelled",
      meta,
    });
    emitDeliveryEvent(row.id, { event: "order_cancelled", meta });

    req.log.info(
      {
        externalOrderId,
        resolvedId: row.id,
        priority,
        reason,
        cancelledByRole: meta.cancelledByRole,
      },
      "order cancelled",
    );
    res.json({
      ok: true,
      cancelled: true,
      persisted: true,
      priority,
      reason,
      orderId: row.id,
      cancelledByRole: meta.cancelledByRole,
    });
  },
);

export default router;
