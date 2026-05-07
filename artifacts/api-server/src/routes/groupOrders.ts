import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  groupOrdersTable,
  type GroupOrderLine,
} from "@workspace/db";

const MAX_LINES_PER_GROUP = 50;

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): { id: string; name: string } | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  const u = req.user as { id: string; firstName?: string | null; email?: string | null };
  const name = u.firstName ?? (u.email ? u.email.split("@")[0]! : "Friend");
  return { id: u.id, name };
}

function generateGroupCode(): string {
  // 6 hex chars, easy to share verbally
  return randomBytes(3).toString("hex").toUpperCase();
}

const createSchema = z.object({
  hostName: z.string().min(1).max(64).optional(),
});

router.post("/group-orders", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const hostName = parsed.data.hostName ?? auth.name;
  let code = "";
  let attempts = 0;
  let inserted: typeof groupOrdersTable.$inferSelect | undefined;
  while (attempts < 5 && !inserted) {
    code = generateGroupCode();
    const rows = await db
      .insert(groupOrdersTable)
      .values({
        code,
        hostUserId: auth.id,
        hostName,
        status: "open",
        items: [],
        participants: [{ id: auth.id, name: hostName }],
      })
      .onConflictDoNothing({ target: groupOrdersTable.code })
      .returning();
    inserted = rows[0];
    attempts++;
  }
  if (!inserted) {
    res.status(500).json({ error: "could not allocate group code" });
    return;
  }
  res.json({ group: inserted });
});

router.get("/group-orders/:code", async (req: Request, res: Response) => {
  const code = String(req.params.code ?? "").toUpperCase();
  const [row] = await db
    .select()
    .from(groupOrdersTable)
    .where(eq(groupOrdersTable.code, code));
  if (!row) {
    res.status(404).json({ error: "group not found" });
    return;
  }
  res.json({ group: row });
});

const itemSchema = z.object({
  dishId: z.number().int().positive(),
  name: z.string().min(1).max(128),
  image: z.string().max(512),
  unitPrice: z.number().int().nonnegative(),
  quantity: z.number().int().positive().max(20),
  customizations: z.array(z.string().max(64)).max(10).default([]),
});

router.post("/group-orders/:code/items", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const code = String(req.params.code ?? "").toUpperCase();
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  // Serialize concurrent reads/writes to the same group's items array.
  // Without this lock, two simultaneous adds would each read the array,
  // append in memory, and the second update would overwrite the first.
  try {
    const out = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"group:" + code}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(groupOrdersTable)
        .where(eq(groupOrdersTable.code, code));
      if (!existing) {
        return { error: "not_found" as const };
      }
      if (existing.status !== "open") {
        return { error: "closed" as const };
      }
      if ((existing.items?.length ?? 0) >= MAX_LINES_PER_GROUP) {
        return { error: "full" as const };
      }
      const line: GroupOrderLine = {
        lineId: `gline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        dishId: parsed.data.dishId,
        name: parsed.data.name,
        image: parsed.data.image,
        unitPrice: parsed.data.unitPrice,
        quantity: parsed.data.quantity,
        customizations: parsed.data.customizations,
        addedBy: auth.id,
        addedByName: auth.name,
      };
      const items = [...(existing.items ?? []), line];
      const participants = existing.participants ?? [];
      const hasParticipant = participants.some((p) => p.id === auth.id);
      const nextParticipants = hasParticipant
        ? participants
        : [...participants, { id: auth.id, name: auth.name }];
      const [updated] = await tx
        .update(groupOrdersTable)
        .set({ items, participants: nextParticipants })
        .where(eq(groupOrdersTable.code, code))
        .returning();
      return { group: updated };
    });
    if ("error" in out) {
      const status =
        out.error === "not_found" ? 404 : out.error === "closed" ? 409 : 422;
      const msg =
        out.error === "not_found"
          ? "group not found"
          : out.error === "closed"
            ? "group is closed"
            : "group is full";
      res.status(status).json({ error: msg });
      return;
    }
    res.json({ group: out.group });
  } catch (err) {
    req.log.error({ err }, "group add item failed");
    res.status(500).json({ error: "could not add item" });
  }
});

router.post(
  "/group-orders/:code/remove-line",
  async (req: Request, res: Response) => {
    const auth = requireAuth(req, res);
    if (!auth) return;
    const code = String(req.params.code ?? "").toUpperCase();
    const lineId = String((req.body as { lineId?: string })?.lineId ?? "");
    if (!lineId) {
      res.status(400).json({ error: "lineId required" });
      return;
    }
    const [existing] = await db
      .select()
      .from(groupOrdersTable)
      .where(eq(groupOrdersTable.code, code));
    if (!existing) {
      res.status(404).json({ error: "group not found" });
      return;
    }
    if (existing.status !== "open") {
      res.status(409).json({ error: "group is closed" });
      return;
    }
    const items = (existing.items ?? []).filter((it) => {
      if (it.lineId !== lineId) return true;
      // host can remove anything; others can only remove their own lines
      if (auth.id === existing.hostUserId) return false;
      return it.addedBy !== auth.id;
    });
    const [updated] = await db
      .update(groupOrdersTable)
      .set({ items })
      .where(eq(groupOrdersTable.code, code))
      .returning();
    res.json({ group: updated });
  },
);

router.post("/group-orders/:code/close", async (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const code = String(req.params.code ?? "").toUpperCase();
  const [existing] = await db
    .select()
    .from(groupOrdersTable)
    .where(eq(groupOrdersTable.code, code));
  if (!existing) {
    res.status(404).json({ error: "group not found" });
    return;
  }
  if (existing.hostUserId !== auth.id) {
    res.status(403).json({ error: "only host can close" });
    return;
  }
  const [updated] = await db
    .update(groupOrdersTable)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(groupOrdersTable.code, code))
    .returning();
  res.json({ group: updated });
});

export default router;
