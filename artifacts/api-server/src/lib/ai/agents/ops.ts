import { z } from "zod/v4";
import { eq, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  ridersTable,
  deliveryEventsTable,
  dishAvailabilityTable,
} from "@workspace/db";
import { definePrompt } from "../prompts";
import { defineTool } from "../tools";
import { registerAgent } from "../agentRegistry";
import { recordOpsAction } from "../../opsAudit";
import { emitDeliveryEvent } from "../../realtime";

const REFUND_CONFIRM_THRESHOLD_PAISE = 50_000;
const ALLOWED_ORDER_STATUSES = [
  "placed",
  "preparing",
  "ready",
  "rider_assigned",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

const OPS_PROMPT = definePrompt({
  name: "ops-agent",
  version: "v1",
  build: () =>
    `You are the Tanmatra Ops Agent for kitchen + dispatch staff.

YOUR SCOPE — you MAY help with:
- Marking dishes available / unavailable (use update_item_availability)
- Assigning a specific rider to an order (use assign_rider)
- Updating an order's lifecycle status (use update_order_status)
- Issuing refunds (use refund_order)
- Showing the live order queue (use get_live_queue)

OUT OF SCOPE — refuse politely:
- Anything customer-facing or coaching/medical advice
- Bulk operations spanning many items in a single tool call (do them one
  by one, each with confirmation)
- Editing prices, recipes, or staff records

CONFIRMATION RULES — non-negotiable:
- Destructive actions REQUIRE a two-step flow:
  1. First call the tool WITHOUT \`confirm: true\`. The tool will return
     a summary of what would change.
  2. Echo that summary back to the operator in plain language and ask
     "Confirm? (yes / no)".
  3. ONLY after the operator says yes, call the tool again with
     \`confirm: true\`.
- Destructive = (a) any refund_order, (b) update_order_status to
  "cancelled", (c) update_item_availability with available=false (an "86").
- Non-destructive: get_live_queue, assign_rider, marking an item back to
  available=true, status updates other than cancelled.

GENERAL RULES:
- Never invent IDs, names, prices, rider details. If a tool didn't
  return it, you don't know it.
- Be concise. State the action you took or are about to take.
- If a tool returns an error, surface it to the operator verbatim.
- EVERY tool call MUST include a \`reasoning\` argument: a short sentence
  explaining why you are taking this action. This is persisted to the
  audit log alongside the operator id and parameters.`,
});

const updateAvailability = defineTool({
  name: "update_item_availability",
  description:
    "Mark a menu item as available or unavailable (an '86'). Marking unavailable is destructive and requires a confirm: true second call. ALWAYS provide a `reasoning` string explaining WHY (e.g. operator request, observed shortage).",
  inputSchema: z.object({
    slug: z.string().min(1),
    available: z.boolean(),
    reason: z.string().optional(),
    reasoning: z.string().min(3).describe("Agent's rationale for this action."),
    confirm: z.boolean().optional(),
  }),
  authScope: "ops",
  handler: async ({ slug, available, reason, reasoning, confirm }, ctx) => {
    const isDestructive = available === false;
    if (isDestructive && !confirm) {
      return {
        requiresConfirmation: true as const,
        summary: `Will mark "${slug}" UNAVAILABLE${reason ? ` (reason: ${reason})` : ""}. Call again with confirm: true to apply.`,
      };
    }
    const [before] = await db
      .select()
      .from(dishAvailabilityTable)
      .where(eq(dishAvailabilityTable.slug, slug))
      .limit(1);
    const prior = before ?? { slug, available: true, reason: null };
    await db.transaction(async (tx) => {
      await tx
        .insert(dishAvailabilityTable)
        .values({
          slug,
          available,
          reason: reason ?? null,
          updatedBy: ctx.userId ?? "ops-agent",
        })
        .onConflictDoUpdate({
          target: dishAvailabilityTable.slug,
          set: {
            available,
            reason: reason ?? null,
            updatedBy: ctx.userId ?? "ops-agent",
          },
        });
      await recordOpsAction(
        {
          operatorId: ctx.userId,
          agent: ctx.agent,
          action: "update_item_availability",
          params: { slug, available, reason },
          beforeState: prior,
          afterState: { slug, available, reason: reason ?? null },
          status: "success",
          reasoning,
        },
        tx,
      );
    });
    return {
      success: true as const,
      slug,
      available,
      previous: prior.available,
    };
  },
});

const assignRider = defineTool({
  name: "assign_rider",
  description:
    "Assign a specific rider to an order. Non-destructive but creates a delivery event. ALWAYS provide `reasoning` (e.g. 'closest rider to address', 'operator picked').",
  inputSchema: z.object({
    orderId: z.number().int().positive(),
    riderId: z.number().int().positive(),
    reasoning: z.string().min(3).describe("Agent's rationale for this action."),
  }),
  authScope: "ops",
  handler: async ({ orderId, riderId, reasoning }, ctx) => {
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!order) return { success: false as const, error: "Order not found" };
    const [rider] = await db
      .select()
      .from(ridersTable)
      .where(eq(ridersTable.id, riderId))
      .limit(1);
    if (!rider) return { success: false as const, error: "Rider not found" };
    if (rider.status !== "online") {
      return {
        success: false as const,
        error: `Rider ${rider.name} is ${rider.status}; only online riders can be assigned.`,
      };
    }

    const before = { riderId: order.riderId, status: order.status };
    await db.transaction(async (tx) => {
      await tx
        .update(ordersTable)
        .set({ riderId, status: "rider_assigned" })
        .where(eq(ordersTable.id, orderId));
      // If reassigning, decrement the previous rider's active count first.
      if (
        order.riderId != null &&
        order.riderId !== riderId
      ) {
        await tx
          .update(ridersTable)
          .set({
            activeOrderCount: sql`GREATEST(${ridersTable.activeOrderCount} - 1, 0)`,
          })
          .where(eq(ridersTable.id, order.riderId));
      }
      await tx
        .update(ridersTable)
        .set({ activeOrderCount: sql`${ridersTable.activeOrderCount} + 1` })
        .where(eq(ridersTable.id, riderId));
      await tx.insert(deliveryEventsTable).values({
        orderId,
        riderId,
        event: "rider_assigned",
        meta: {
          strategy: "ops_agent",
          operatorId: ctx.userId,
          riderName: rider.name,
        },
      });
      await recordOpsAction(
        {
          operatorId: ctx.userId,
          agent: ctx.agent,
          action: "assign_rider",
          params: { orderId, riderId },
          beforeState: before,
          afterState: { riderId, status: "rider_assigned" },
          status: "success",
          reasoning,
        },
        tx,
      );
    });
    emitDeliveryEvent(orderId, {
      event: "rider_assigned",
      riderId,
      riderName: rider.name,
    });
    return {
      success: true as const,
      orderId,
      rider: { id: rider.id, name: rider.name },
    };
  },
});

const updateOrderStatus = defineTool({
  name: "update_order_status",
  description:
    "Update an order's status. Setting status to 'cancelled' is destructive and requires confirm: true. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    orderId: z.number().int().positive(),
    status: z.enum(ALLOWED_ORDER_STATUSES),
    reasoning: z.string().min(3).describe("Agent's rationale for this action."),
    confirm: z.boolean().optional(),
  }),
  authScope: "ops",
  handler: async ({ orderId, status, reasoning, confirm }, ctx) => {
    const isDestructive = status === "cancelled";
    if (isDestructive && !confirm) {
      return {
        requiresConfirmation: true as const,
        summary: `Will set order #${orderId} status to CANCELLED. This will not auto-issue a refund. Call again with confirm: true to apply.`,
      };
    }
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!order) return { success: false as const, error: "Order not found" };
    const before = { status: order.status };
    await db.transaction(async (tx) => {
      await tx
        .update(ordersTable)
        .set({ status })
        .where(eq(ordersTable.id, orderId));
      await tx.insert(deliveryEventsTable).values({
        orderId,
        event: `status_${status}`,
        meta: { operatorId: ctx.userId, source: "ops_agent" },
      });
      await recordOpsAction(
        {
          operatorId: ctx.userId,
          agent: ctx.agent,
          action: "update_order_status",
          params: { orderId, status },
          beforeState: before,
          afterState: { status },
          status: "success",
          reasoning,
        },
        tx,
      );
    });
    emitDeliveryEvent(orderId, { event: `status_${status}` });
    return { success: true as const, orderId, status, previous: before.status };
  },
});

const refundOrder = defineTool({
  name: "refund_order",
  description:
    "Issue a refund for an order. ALWAYS destructive — requires a confirm: true second call. Refunds above ₹500 (50000 paise) require explicit confirmation in the agent's reply too.",
  inputSchema: z.object({
    orderId: z.number().int().positive(),
    amountPaise: z.number().int().positive(),
    reason: z.string().min(3),
    reasoning: z.string().min(3).describe("Agent's rationale for this action."),
    confirm: z.boolean().optional(),
  }),
  authScope: "ops",
  handler: async ({ orderId, amountPaise, reason, reasoning, confirm }, ctx) => {
    if (!confirm) {
      const requiresExtra = amountPaise > REFUND_CONFIRM_THRESHOLD_PAISE;
      return {
        requiresConfirmation: true as const,
        summary: `Will refund ₹${(amountPaise / 100).toFixed(2)} on order #${orderId} (reason: ${reason}). ${requiresExtra ? "ABOVE ₹500 — operator must explicitly confirm in their next message before this is issued. " : ""}Call again with confirm: true to apply.`,
      };
    }
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!order) return { success: false as const, error: "Order not found" };
    if (amountPaise > order.totalPaise) {
      return {
        success: false as const,
        error: `Refund amount ${amountPaise} exceeds order total ${order.totalPaise}.`,
      };
    }

    // The actual payment-gateway refund is delegated to the existing
    // payments service in production. For now we record the refund
    // intent against the order + audit log. Status moves to "refunded".
    await db.transaction(async (tx) => {
      await tx
        .update(ordersTable)
        .set({ status: "refunded" })
        .where(eq(ordersTable.id, orderId));
      await tx.insert(deliveryEventsTable).values({
        orderId,
        event: "refund_issued",
        meta: { amountPaise, reason, operatorId: ctx.userId },
      });
      await recordOpsAction(
        {
          operatorId: ctx.userId,
          agent: ctx.agent,
          action: "refund_order",
          params: { orderId, amountPaise, reason },
          beforeState: { status: order.status },
          afterState: { status: "refunded", amountPaise },
          status: "success",
          reasoning,
        },
        tx,
      );
    });
    return {
      success: true as const,
      orderId,
      amountPaise,
      status: "refunded",
    };
  },
});

export async function fetchLiveQueue(opts: {
  statuses?: readonly (typeof ALLOWED_ORDER_STATUSES)[number][];
  limit?: number;
}): Promise<{
  counts: Record<string, number>;
  orders: Array<{
    id: number;
    status: string;
    totalPaise: number;
    riderId: number | null;
    addressLabel: string | null;
    createdAt: Date;
  }>;
}> {
  const filter =
    opts.statuses ?? [
      "placed",
      "preparing",
      "ready",
      "rider_assigned",
      "out_for_delivery",
    ];
  const rows = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      totalPaise: ordersTable.totalPaise,
      riderId: ordersTable.riderId,
      addressLabel: ordersTable.addressLabel,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(inArray(ordersTable.status, [...filter]))
    .orderBy(desc(ordersTable.createdAt))
    .limit(opts.limit ?? 25);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return { counts, orders: rows };
}

const getLiveQueue = defineTool({
  name: "get_live_queue",
  description:
    "Show the live order queue grouped by status. Read-only. Returns up to 25 most-recent open orders.",
  inputSchema: z.object({
    statuses: z
      .array(z.enum(ALLOWED_ORDER_STATUSES))
      .optional()
      .describe("Filter to these statuses; defaults to active (non-delivered, non-cancelled)."),
    limit: z.number().int().positive().max(50).optional(),
    reasoning: z
      .string()
      .min(3)
      .describe("Agent's rationale for inspecting the queue right now."),
  }),
  authScope: "ops",
  handler: async ({ statuses, limit, reasoning }, ctx) => {
    const result = await fetchLiveQueue({ statuses, limit });
    // Read-only, but still audit-logged so every agent action is traceable.
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "get_live_queue",
      params: { statuses: statuses ?? null, limit: limit ?? null },
      beforeState: null,
      afterState: { counts: result.counts, orderCount: result.orders.length },
      status: "success",
      reasoning,
    });
    return { success: true as const, ...result };
  },
});

registerAgent({
  name: "ops",
  description:
    "Operator-facing agent for kitchen + dispatch (inventory 86s, rider assignment, order status, refunds, live queue).",
  defaultModel: "gemini-2.5-flash",
  maxSteps: 6,
  systemPrompt: OPS_PROMPT,
  tools: [
    updateAvailability,
    assignRider,
    updateOrderStatus,
    refundOrder,
    getLiveQueue,
  ],
});
