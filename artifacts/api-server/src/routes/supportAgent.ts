import { Router, type IRouter, type Request, type Response } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { db, ordersTable, ridersTable, deliveryEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const SYSTEM_INSTRUCTION = `You are the Tanmatra Support Agent for a clinical-grade nutrition delivery platform.
You help customers with:
- Order status and delivery tracking
- Information about the wellness, performance, and clinical meal protocols
- Rider/delivery questions
- Inventory or menu availability questions
Be concise, warm, and professional. If you cannot resolve an issue, suggest escalating to a human (mention "I'll escalate this to our team").
You have access to tools to look up real data — call them when relevant.`;

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_order_status",
        description: "Look up the current status and timeline of a customer order by id.",
        parameters: {
          type: "object",
          properties: { orderId: { type: "number", description: "Numeric order id" } },
          required: ["orderId"],
        },
      },
      {
        name: "list_active_riders",
        description: "List currently online delivery riders (max 10).",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "check_inventory",
        description: "Check whether a menu item is available right now.",
        parameters: {
          type: "object",
          properties: { itemName: { type: "string" } },
          required: ["itemName"],
        },
      },
    ],
  },
];

const STATIC_INVENTORY: Record<string, boolean> = {
  "grilled atlantic salmon": true,
  "performance power bowl": true,
  "keto prime ribeye": true,
  "miso glazed black cod": true,
  "superfood smoothie bowl": true,
  "mediterranean grain salad": false,
};

async function executeTool(name: string, args: Record<string, unknown>) {
  try {
    if (name === "get_order_status") {
      const orderId = Number(args.orderId);
      if (!Number.isFinite(orderId)) return { success: false, error: "Invalid orderId" };
      const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
      if (!order) return { success: false, error: "Order not found" };
      const events = await db
        .select()
        .from(deliveryEventsTable)
        .where(eq(deliveryEventsTable.orderId, orderId))
        .orderBy(desc(deliveryEventsTable.createdAt))
        .limit(10);
      return { success: true, order: { id: order.id, status: order.status, total: order.totalPaise }, events };
    }
    if (name === "list_active_riders") {
      const riders = await db
        .select()
        .from(ridersTable)
        .where(eq(ridersTable.status, "online"))
        .limit(10);
      return { success: true, riders };
    }
    if (name === "check_inventory") {
      const key = String(args.itemName ?? "").toLowerCase().trim();
      const available = STATIC_INVENTORY[key];
      return { success: true, itemName: args.itemName, available: available ?? true };
    }
    return { success: false, error: `Unknown tool ${name}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

interface ChatTurn { role: "user" | "agent"; text: string }
interface ChatBody { message: string; history?: ChatTurn[] }

router.post("/support-agent/chat", async (req: Request, res: Response) => {
  const body = req.body as ChatBody;
  if (!body?.message || typeof body.message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }

  try {
    const contents = [
      ...((body.history ?? []).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }))),
      { role: "user", parts: [{ text: body.message }] },
    ];

    const toolCalls: Array<{ name: string; args?: unknown; result?: unknown }> = [];
    let escalated = false;

    let response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
    });

    for (let iter = 0; iter < 3; iter++) {
      const fnCalls = response.functionCalls ?? [];
      if (fnCalls.length === 0) break;

      const toolResponseParts: Array<{ functionResponse: { name: string; response: Record<string, unknown> } }> = [];
      for (const call of fnCalls) {
        const result = await executeTool(call.name ?? "", (call.args as Record<string, unknown>) ?? {});
        toolCalls.push({ name: call.name ?? "", args: call.args, result });
        toolResponseParts.push({
          functionResponse: { name: call.name ?? "", response: result as Record<string, unknown> },
        });
      }

      contents.push({ role: "model", parts: response.candidates?.[0]?.content?.parts ?? [] } as never);
      contents.push({ role: "user", parts: toolResponseParts } as never);

      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
      });
    }

    const text = response.text ?? "I'm not sure how to help with that.";
    if (/escalate|human|specialist|team/i.test(text)) escalated = true;

    res.json({ text, toolCalls, escalated });
  } catch (err) {
    req.log.error({ err }, "support-agent error");
    res.status(500).json({
      text: "I'm having trouble reaching our systems right now. Please try again in a moment.",
      toolCalls: [],
      escalated: false,
    });
  }
});

export default router;
