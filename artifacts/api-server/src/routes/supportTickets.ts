import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db, supportTicketsTable, ordersTable } from "@workspace/db";
import {
  draftReply,
  getMetrics,
  listRejectedForEval,
  listTickets,
  processNewTicket,
  rejectDraft,
  sendReply,
  triageTicket,
} from "../lib/supportTriage";

const router: IRouter = Router();

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

function userId(req: Request): string | null {
  return req.isAuthenticated() ? (req.user.id ?? null) : null;
}

function sendError(res: Response, err: unknown, log?: (e: unknown) => void): void {
  log?.(err);
  res.status(500).json({ error: "internal error" });
}

const idParam = z.object({ id: z.coerce.number().int().positive() });

const createBody = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
  orderId: z.number().int().positive().optional(),
  channel: z.enum(["web", "chat", "email"]).default("web"),
});

// Customer-facing: create a new support ticket. Triage + draft happen in
// the background so the customer's POST returns quickly.
router.post("/support-tickets", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "login required" });
    return;
  }
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  try {
    // Object-level access control: a customer may only attach an order they
    // own. Otherwise drafted replies could leak another customer's order
    // facts via the AI prompt + citations.
    let linkedOrderId: number | null = null;
    if (parsed.data.orderId !== undefined) {
      const [own] = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.id, parsed.data.orderId),
            eq(ordersTable.userId, req.user.id),
          ),
        )
        .limit(1);
      if (!own) {
        res.status(403).json({ error: "order does not belong to you" });
        return;
      }
      linkedOrderId = own.id;
    }
    const [row] = await db
      .insert(supportTicketsTable)
      .values({
        userId: req.user.id,
        orderId: linkedOrderId,
        subject: parsed.data.subject,
        body: parsed.data.body,
        channel: parsed.data.channel,
        status: "new",
      })
      .returning();
    if (!row) {
      res.status(500).json({ error: "failed to create ticket" });
      return;
    }
    // Fire-and-forget triage + draft so the response is fast.
    void processNewTicket(row.id).catch((err) => {
      req.log.warn({ err, ticketId: row.id }, "background triage failed");
    });
    res.json({ ticket: row });
  } catch (err) {
    sendError(res, err);
  }
});

// Ops inbox: list tickets, with optional filters.
router.get("/support-tickets", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const team = typeof req.query.team === "string" ? req.query.team : undefined;
  const priority =
    typeof req.query.priority === "string" ? req.query.priority : undefined;
  const limit = Number(req.query.limit ?? 100);
  try {
    const tickets = await listTickets({
      status,
      team,
      priority,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    res.json({ tickets });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/support-tickets/metrics", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const days = Math.max(1, Math.min(90, Number(req.query.days ?? 7)));
  try {
    res.json(await getMetrics(days));
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/support-tickets/rejected", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 50)));
  try {
    res.json({ rows: await listRejectedForEval(limit) });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/support-tickets/:id", async (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const sp = idParam.safeParse(req.params);
  if (!sp.success) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, sp.data.id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "ticket not found" });
      return;
    }
    res.json({ ticket: row });
  } catch (err) {
    sendError(res, err);
  }
});

router.post(
  "/support-tickets/:id/triage",
  async (req: Request, res: Response) => {
    if (!requireOps(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    try {
      const ticket = await triageTicket(sp.data.id);
      if (!ticket) {
        res.status(404).json({ error: "ticket not found" });
        return;
      }
      res.json({ ticket });
    } catch (err) {
      sendError(res, err);
    }
  },
);

router.post(
  "/support-tickets/:id/draft",
  async (req: Request, res: Response) => {
    if (!requireOps(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    try {
      const ticket = await draftReply(sp.data.id);
      if (!ticket) {
        res.status(404).json({ error: "ticket not found" });
        return;
      }
      res.json({ ticket });
    } catch (err) {
      sendError(res, err);
    }
  },
);

const sendBody = z.object({
  reply: z.string().min(1).max(8000),
  category: z
    .enum([
      "delivery",
      "refund",
      "modification",
      "allergen",
      "subscription",
      "billing",
      "feedback",
      "other",
    ])
    .optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  team: z.enum(["care", "ops", "kitchen", "rd", "billing"]).optional(),
});

router.post(
  "/support-tickets/:id/send",
  async (req: Request, res: Response) => {
    if (!requireOps(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const bp = sendBody.safeParse(req.body);
    if (!bp.success) {
      res.status(400).json({ error: "reply required" });
      return;
    }
    try {
      const ticket = await sendReply(sp.data.id, bp.data.reply, userId(req), {
        category: bp.data.category ?? null,
        priority: bp.data.priority ?? null,
        team: bp.data.team ?? null,
      });
      if (!ticket) {
        res.status(404).json({ error: "ticket not found" });
        return;
      }
      res.json({ ticket });
    } catch (err) {
      sendError(res, err);
    }
  },
);

const rejectBody = z.object({ reason: z.string().min(1).max(1000) });

router.post(
  "/support-tickets/:id/reject",
  async (req: Request, res: Response) => {
    if (!requireOps(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const bp = rejectBody.safeParse(req.body);
    if (!bp.success) {
      res.status(400).json({ error: "reason required" });
      return;
    }
    try {
      const ticket = await rejectDraft(
        sp.data.id,
        bp.data.reason,
        userId(req),
      );
      if (!ticket) {
        res.status(404).json({ error: "ticket not found" });
        return;
      }
      res.json({ ticket });
    } catch (err) {
      sendError(res, err);
    }
  },
);

export default router;
