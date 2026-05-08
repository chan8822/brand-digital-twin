import { generateText } from "ai";
import { and, desc, eq, gte, notInArray, sql } from "drizzle-orm";
import {
  db,
  supportTicketsTable,
  ordersTable,
  aiRunsTable,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_TEAMS,
  type SupportTicket,
  type SupportCategory,
  type SupportPriority,
  type SupportTeam,
} from "@workspace/db";
import { DEFAULT_MODEL_ID, getModel } from "./ai/model";
import { logger } from "./logger";

const TRIAGE_TIMEOUT_MS = 8_000;
const DRAFT_TIMEOUT_MS = 12_000;

interface TriageFields {
  category: SupportCategory;
  priority: SupportPriority;
  team: SupportTeam;
  reason: string;
}

function fallbackTriage(t: { subject: string; body: string }): TriageFields {
  const text = `${t.subject}\n${t.body}`.toLowerCase();
  let category: SupportCategory = "other";
  let priority: SupportPriority = "normal";
  let team: SupportTeam = "care";
  if (/\b(refund|chargeback|money back)\b/.test(text)) {
    category = "refund";
    team = "billing";
    priority = "high";
  } else if (/\b(cancel|change|modify|swap|update|wrong item|missing)\b/.test(text)) {
    category = "modification";
    team = "ops";
    priority = "high";
  } else if (/\b(late|delivery|rider|where.*order|tracking|delayed)\b/.test(text)) {
    category = "delivery";
    team = "ops";
    priority = "high";
  } else if (
    /\b(allerg|anaphyla|epi.?pen|gluten|dairy|peanut|nut|shellfish)\b/.test(text)
  ) {
    category = "allergen";
    team = "rd";
    priority = "urgent";
  } else if (/\b(subscription|plan|renew|pause|resume)\b/.test(text)) {
    category = "subscription";
    team = "billing";
  } else if (/\b(invoice|bill|payment|charge)\b/.test(text)) {
    category = "billing";
    team = "billing";
  } else if (/\b(love|great|thanks|amazing|good)\b/.test(text)) {
    category = "feedback";
    priority = "low";
  }
  if (/\b(urgent|asap|immediately|emergency)\b/.test(text)) priority = "urgent";
  return {
    category,
    priority,
    team,
    reason: "rule-based fallback (no model output)",
  };
}

async function logRun(
  agent: string,
  modelId: string,
  input: unknown,
  output: string | null,
  status: "ok" | "error",
  error: string | null,
  latencyMs: number,
): Promise<number> {
  try {
    const [r] = await db
      .insert(aiRunsTable)
      .values({
        agent,
        userId: null,
        model: modelId,
        promptVersion: "v1",
        input: input as Record<string, unknown>,
        output,
        toolCalls: [],
        latencyMs,
        attempts: 1,
        timedOut: 0,
        status,
        error,
        escalated: 0,
      })
      .returning({ id: aiRunsTable.id });
    return r?.id ?? 0;
  } catch (err) {
    logger.warn({ err }, "ai_runs insert (support triage) failed");
    return 0;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), ms),
    ),
  ]);
}

interface OrderBrief {
  id: number;
  status: string;
  totalPaise: number;
  itemSummary: string;
  placedAt: string;
  scheduledFor: string | null;
}

async function loadOrderBrief(orderId: number | null): Promise<OrderBrief | null> {
  if (!orderId) return null;
  const [row] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!row) return null;
  const items = (row.items ?? []) as Array<{ name: string; qty: number }>;
  const itemSummary = items
    .map((i) => `${i.qty}× ${i.name}`)
    .join(", ");
  return {
    id: row.id,
    status: row.status,
    totalPaise: row.totalPaise,
    itemSummary,
    placedAt: row.createdAt.toISOString(),
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
  };
}

export async function triageTicket(ticketId: number): Promise<SupportTicket | null> {
  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, ticketId))
    .limit(1);
  if (!ticket) return null;

  const start = Date.now();
  const prompt = `Classify this Tanmatra support ticket. Return STRICT JSON:
{
  "category": one of ${JSON.stringify(SUPPORT_CATEGORIES)},
  "priority": one of ${JSON.stringify(SUPPORT_PRIORITIES)},
  "team":     one of ${JSON.stringify(SUPPORT_TEAMS)},
  "reason":   one short sentence (<=140 chars) explaining why
}

Rules:
- Allergen / anaphylaxis / "severe" anything → priority "urgent", team "rd".
- Refund / billing dispute → team "billing".
- Late / missing / wrong item → team "ops", priority "high".
- Generic praise / suggestion → category "feedback", priority "low".

Subject: ${ticket.subject}
Body: ${ticket.body}`;

  let fields: TriageFields | null = null;
  let runId = 0;
  try {
    const result = await withTimeout(
      generateText({ model: getModel(), prompt }),
      TRIAGE_TIMEOUT_MS,
      "triage",
    );
    const text = result.text.trim().replace(/^```json\s*|```\s*$/g, "");
    const parsed = JSON.parse(text) as Partial<TriageFields>;
    const category = (SUPPORT_CATEGORIES as readonly string[]).includes(
      String(parsed.category),
    )
      ? (parsed.category as SupportCategory)
      : "other";
    const priority = (SUPPORT_PRIORITIES as readonly string[]).includes(
      String(parsed.priority),
    )
      ? (parsed.priority as SupportPriority)
      : "normal";
    const team = (SUPPORT_TEAMS as readonly string[]).includes(String(parsed.team))
      ? (parsed.team as SupportTeam)
      : "care";
    fields = {
      category,
      priority,
      team,
      reason: String(parsed.reason ?? "").slice(0, 240),
    };
    runId = await logRun(
      "support-triage",
      DEFAULT_MODEL_ID,
      { ticketId, subject: ticket.subject },
      text,
      "ok",
      null,
      Date.now() - start,
    );
  } catch (err) {
    logger.warn({ err, ticketId }, "support triage falling back to rules");
    fields = fallbackTriage(ticket);
    runId = await logRun(
      "support-triage",
      DEFAULT_MODEL_ID,
      { ticketId, subject: ticket.subject },
      null,
      "error",
      (err as Error).message,
      Date.now() - start,
    );
  }

  // Guard against terminal-state overwrite: if a human already sent/rejected/
  // resolved the ticket while background triage was running, don't clobber.
  const [updated] = await db
    .update(supportTicketsTable)
    .set({
      category: fields.category,
      priority: fields.priority,
      team: fields.team,
      triageReason: fields.reason,
      triageRunId: runId || null,
      triagedAt: new Date(),
      status: sql`CASE WHEN ${supportTicketsTable.status} = 'new' THEN 'triaged' ELSE ${supportTicketsTable.status} END`,
    })
    .where(
      and(
        eq(supportTicketsTable.id, ticketId),
        notInArray(supportTicketsTable.status, [
          "sent",
          "rejected",
          "resolved",
        ]),
      ),
    )
    .returning();
  return updated ?? ticket;
}

export async function draftReply(ticketId: number): Promise<SupportTicket | null> {
  const [ticket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.id, ticketId))
    .limit(1);
  if (!ticket) return null;

  const order = await loadOrderBrief(ticket.orderId);
  const orderBrief = order
    ? `Order #${order.id} — status ${order.status}, placed ${order.placedAt}, ` +
      `total ₹${(order.totalPaise / 100).toFixed(2)}, items: ${order.itemSummary}` +
      (order.scheduledFor ? `, scheduled ${order.scheduledFor}` : "")
    : "No order linked.";

  const start = Date.now();
  const prompt = `You are drafting a Tanmatra customer-care reply for a HUMAN agent to review.
Be warm, concise (<=140 words), and never invent facts. Use only the order
brief and the customer's message. If you cite a fact from the order brief,
list it in "citations" verbatim (one citation per fact). Never promise
refunds, never modify orders, never give medical advice — those need a human.

Return STRICT JSON:
{
  "reply": "the draft reply text",
  "citations": ["fact 1", "fact 2", ...]
}

Triage: category=${ticket.category ?? "?"} priority=${ticket.priority ?? "?"} team=${ticket.team ?? "?"}
Customer subject: ${ticket.subject}
Customer message: ${ticket.body}
Order brief: ${orderBrief}`;

  let reply = "";
  let citations: string[] = [];
  let runId = 0;
  let status: "ok" | "error" = "ok";
  let errMsg: string | null = null;
  try {
    const result = await withTimeout(
      generateText({ model: getModel(), prompt }),
      DRAFT_TIMEOUT_MS,
      "draft",
    );
    const text = result.text.trim().replace(/^```json\s*|```\s*$/g, "");
    const parsed = JSON.parse(text) as { reply?: string; citations?: unknown };
    reply = String(parsed.reply ?? "").slice(0, 4000);
    if (Array.isArray(parsed.citations)) {
      citations = parsed.citations
        .filter((c): c is string => typeof c === "string")
        .slice(0, 10)
        .map((c) => c.slice(0, 240));
    }
    runId = await logRun(
      "support-draft",
      DEFAULT_MODEL_ID,
      { ticketId, hasOrder: Boolean(order) },
      text,
      "ok",
      null,
      Date.now() - start,
    );
  } catch (err) {
    status = "error";
    errMsg = (err as Error).message;
    logger.warn({ err, ticketId }, "support draft fallback");
    reply =
      "Hi — thanks for reaching out. We've received your note and a member of our care team will reply shortly with the next steps.";
    citations = [];
    runId = await logRun(
      "support-draft",
      DEFAULT_MODEL_ID,
      { ticketId },
      null,
      status,
      errMsg,
      Date.now() - start,
    );
  }

  const [updated] = await db
    .update(supportTicketsTable)
    .set({
      draftReply: reply,
      draftCitations: citations,
      draftRunId: runId || null,
      draftedAt: new Date(),
      status: sql`CASE WHEN ${supportTicketsTable.status} IN ('new', 'triaged') THEN 'awaiting_human' ELSE ${supportTicketsTable.status} END`,
    })
    .where(
      and(
        eq(supportTicketsTable.id, ticketId),
        notInArray(supportTicketsTable.status, [
          "sent",
          "rejected",
          "resolved",
        ]),
      ),
    )
    .returning();
  return updated ?? ticket;
}

export async function processNewTicket(
  ticketId: number,
): Promise<SupportTicket | null> {
  const triaged = await triageTicket(ticketId);
  if (!triaged) return null;
  return draftReply(ticketId);
}

export async function sendReply(
  ticketId: number,
  reply: string,
  agentUserId: string | null,
): Promise<SupportTicket | null> {
  const [updated] = await db
    .update(supportTicketsTable)
    .set({
      sentReply: reply.slice(0, 8000),
      sentBy: agentUserId,
      sentAt: new Date(),
      status: "sent",
    })
    .where(eq(supportTicketsTable.id, ticketId))
    .returning();
  return updated ?? null;
}

export async function rejectDraft(
  ticketId: number,
  reason: string,
  agentUserId: string | null,
): Promise<SupportTicket | null> {
  const [updated] = await db
    .update(supportTicketsTable)
    .set({
      rejectionReason: reason.slice(0, 1000),
      rejectedBy: agentUserId,
      rejectedAt: new Date(),
      status: "rejected",
    })
    .where(eq(supportTicketsTable.id, ticketId))
    .returning();
  return updated ?? null;
}

export async function listTickets(opts: {
  status?: string;
  team?: string;
  priority?: string;
  limit?: number;
}): Promise<SupportTicket[]> {
  const wheres = [] as ReturnType<typeof eq>[];
  if (opts.status) wheres.push(eq(supportTicketsTable.status, opts.status));
  if (opts.team) wheres.push(eq(supportTicketsTable.team, opts.team));
  if (opts.priority) wheres.push(eq(supportTicketsTable.priority, opts.priority));
  const limit = Math.max(1, Math.min(200, opts.limit ?? 100));
  return db
    .select()
    .from(supportTicketsTable)
    .where(wheres.length ? and(...wheres) : undefined)
    .orderBy(desc(supportTicketsTable.createdAt))
    .limit(limit);
}

export interface SupportMetrics {
  windowDays: number;
  totalTickets: number;
  triaged: number;
  drafted: number;
  sent: number;
  rejected: number;
  acceptanceRate: number;
  byCategory: Array<{ category: string; n: number }>;
  byTeam: Array<{ team: string; n: number }>;
  byPriority: Array<{ priority: string; n: number }>;
}

export async function getMetrics(windowDays = 7): Promise<SupportMetrics> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await db
    .select()
    .from(supportTicketsTable)
    .where(gte(supportTicketsTable.createdAt, since));
  const total = rows.length;
  const triaged = rows.filter((r) => r.triagedAt).length;
  const drafted = rows.filter((r) => r.draftedAt).length;
  const sent = rows.filter((r) => r.status === "sent").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const decided = sent + rejected;
  const acceptanceRate = decided === 0 ? 0 : Math.round((sent / decided) * 100);
  const groupCount = <K extends keyof SupportTicket>(
    key: K,
  ): Array<{ key: string; n: number }> => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = String(r[key] ?? "—");
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([k, n]) => ({ key: k, n }))
      .sort((a, b) => b.n - a.n);
  };
  return {
    windowDays,
    totalTickets: total,
    triaged,
    drafted,
    sent,
    rejected,
    acceptanceRate,
    byCategory: groupCount("category").map((x) => ({ category: x.key, n: x.n })),
    byTeam: groupCount("team").map((x) => ({ team: x.key, n: x.n })),
    byPriority: groupCount("priority").map((x) => ({ priority: x.key, n: x.n })),
  };
}

// Helper for callers that need to peek at recently-rejected drafts as the
// raw material for an eval set. Kept tiny on purpose — full eval harness
// integration is intentionally out of scope here.
export async function listRejectedForEval(limit = 50): Promise<
  Array<{
    ticketId: number;
    subject: string;
    body: string;
    draftReply: string | null;
    rejectionReason: string | null;
    rejectedAt: string | null;
  }>
> {
  const rows = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.status, "rejected"))
    .orderBy(desc(supportTicketsTable.rejectedAt))
    .limit(Math.max(1, Math.min(200, limit)));
  return rows.map((r) => ({
    ticketId: r.id,
    subject: r.subject,
    body: r.body,
    draftReply: r.draftReply,
    rejectionReason: r.rejectionReason,
    rejectedAt: r.rejectedAt ? r.rejectedAt.toISOString() : null,
  }));
}

// Lightweight unused-import shim so `sql` stays imported for future use
// without ts(6133). Cheap helper: count rows by status.
export async function countByStatus(): Promise<
  Array<{ status: string; n: number }>
> {
  const rows = await db
    .select({
      status: supportTicketsTable.status,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(supportTicketsTable)
    .groupBy(supportTicketsTable.status);
  return rows.map((r) => ({ status: r.status, n: r.n }));
}
