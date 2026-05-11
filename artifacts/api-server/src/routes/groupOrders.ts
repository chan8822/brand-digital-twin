import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  groupOrdersTable,
  type GroupOrderLine,
} from "@workspace/db";
import { resolveDishById } from "../lib/menuResolver";
import { rateLimit } from "../lib/rateLimit";

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

// Group codes are 6 hex chars (~16M space). Without throttling, an
// attacker can enumerate the entire space in minutes and harvest the
// participants list (names) from every active group. Limit lookups to
// 30/min/IP — generous for a real invitee opening an invite link, far
// below what a brute-force needs. Anonymous lookup is preserved so
// invitees can preview a group before signing in.
router.get("/group-orders/:code", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  const allowed = await rateLimit(`group-order:lookup:ip:${ip}`, 60_000, 30);
  if (!allowed) {
    res.status(429).json({ error: "too many lookups" });
    return;
  }
  const codeRaw = String(req.params.code ?? "").toUpperCase();
  // Reject anything that isn't the canonical 6-hex shape before hitting
  // the DB so the rate limiter is the only meaningful work for garbage.
  if (!/^[0-9A-F]{6}$/.test(codeRaw)) {
    res.status(404).json({ error: "group not found" });
    return;
  }
  const [row] = await db
    .select()
    .from(groupOrdersTable)
    .where(eq(groupOrdersTable.code, codeRaw));
  if (!row) {
    res.status(404).json({ error: "group not found" });
    return;
  }
  res.json({ group: row });
});

// Server-canonical item schema. Name/image/unitPrice are looked up from
// the menu catalog so a participant cannot tamper with what other
// members see (or what the host sees at checkout preview).
const itemSchema = z.object({
  dishId: z.number().int().positive(),
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
  // Resolve canonical dish from catalog. Reject unknown/unavailable dishes
  // here so we never persist tampered or stale lines.
  const dish = await resolveDishById(parsed.data.dishId);
  if (!dish) {
    res.status(404).json({ error: "dish not found" });
    return;
  }
  if (!dish.isAvailable) {
    res.status(409).json({ error: "dish unavailable" });
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
        dishId: dish.id,
        name: dish.name,
        image: dish.image,
        unitPrice: dish.price,
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
  // Take the same per-group advisory lock as add-item so an in-flight
  // add cannot land between our read and the status flip. Whatever the
  // close response contains is therefore the final, authoritative item
  // list — the host can't lose lines added milliseconds before close.
  try {
    const out = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"group:" + code}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(groupOrdersTable)
        .where(eq(groupOrdersTable.code, code));
      if (!existing) return { error: "not_found" as const };
      if (existing.hostUserId !== auth.id) {
        return { error: "forbidden" as const };
      }
      if (existing.status === "closed") {
        return { group: existing };
      }
      const [updated] = await tx
        .update(groupOrdersTable)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(groupOrdersTable.code, code))
        .returning();
      return { group: updated };
    });
    if ("error" in out) {
      const status = out.error === "not_found" ? 404 : 403;
      const message =
        out.error === "not_found" ? "group not found" : "only host can close";
      res.status(status).json({ error: message });
      return;
    }
    res.json({ group: out.group });
  } catch (err) {
    req.log.error({ err }, "group close failed");
    res.status(500).json({ error: "close failed" });
  }
});

export default router;
