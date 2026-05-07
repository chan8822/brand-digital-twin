import { Router, type IRouter, type Request, type Response } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { db, ordersTable, ridersTable, deliveryEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

const SYSTEM_INSTRUCTION = `You are the Tanmatra Support Agent for a clinical-grade nutrition delivery platform.

YOUR SCOPE — you MAY help with:
- Order status and delivery tracking (use get_order_status)
- Rider availability questions (use list_active_riders)
- Menu availability (use check_inventory)
- Allergen lookups by dish (use get_dish_allergens) — but ONLY return verbatim what the tool says, then add the mandatory safety disclaimer below.

OUT OF SCOPE — you MUST refuse, politely, and route to human support:
- Modifying an order in any way (changing items, sauces, sides, sizes, customizations)
- Cancelling an order
- Requesting a refund
- Medical, dietary, or clinical advice

When refusing, respond with EXACTLY this format:
"I can't make changes to existing orders from this chat. I'll connect you with our care team — please tap Call Support, or reply 'human' and I'll escalate this conversation."

ALLERGEN SAFETY RULES — non-negotiable:
- Never claim a dish "is safe" for any allergy. Cross-contamination in shared kitchens cannot be ruled out from a chat.
- After listing allergens from get_dish_allergens, you MUST append: "Our kitchen handles fish, dairy, soy, peanuts, tree nuts, sesame, and gluten in a shared space — if you have a severe allergy please call our care team before ordering."
- If the user asks about an allergen that requires a clinical judgement (severity, anaphylaxis, cross-contamination details), refuse and escalate.

GENERAL RULES:
- Never invent order IDs, ETAs, rider names, prices, or ingredients. If a tool didn't return it, you don't know it.
- Be concise and warm. If unsure, escalate.`;

// Static allergen table — kept in sync with artifacts/tanmatra/src/lib/menuData.ts
const DISH_ALLERGENS: Record<string, { name: string; allergens: string[] }> = {
  "grilled-salmon": { name: "Grilled Atlantic Salmon", allergens: ["Fish"] },
  "power-bowl": { name: "Performance Power Bowl", allergens: ["Sesame"] },
  "keto-ribeye": { name: "Keto Prime Ribeye", allergens: ["Dairy"] },
  "miso-cod": { name: "Miso Glazed Black Cod", allergens: ["Fish", "Soy", "Sesame"] },
  "smoothie-bowl": { name: "Superfood Smoothie Bowl", allergens: ["Tree Nuts"] },
  "mediterranean-salad": { name: "Mediterranean Grain Salad", allergens: ["Dairy"] },
  "kung-pao-tofu": { name: "Kung Pao Tofu", allergens: ["Peanuts", "Soy", "Gluten"] },
  "steamed-bass": { name: "Cantonese Steamed Sea Bass", allergens: ["Fish", "Soy"] },
  "dark-chocolate-mousse": { name: "Dark Chocolate Avocado Mousse", allergens: [] },
  "vegan-protein-wrap": { name: "Tempeh Multigrain Wrap", allergens: ["Soy", "Gluten", "Sesame"] },
};

const tools: any = [
  {
    functionDeclarations: [
      {
        name: "get_order_status",
        description: "Look up the current status and timeline of a customer order by id. Read-only.",
        parameters: {
          type: "object",
          properties: { orderId: { type: "number", description: "Numeric order id" } },
          required: ["orderId"],
        },
      },
      {
        name: "list_active_riders",
        description: "List currently online delivery riders (max 10). Read-only.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "check_inventory",
        description: "Check whether a menu item is available right now. Read-only.",
        parameters: {
          type: "object",
          properties: { itemName: { type: "string" } },
          required: ["itemName"],
        },
      },
      {
        name: "get_dish_allergens",
        description:
          "Return the official allergen list for a dish by slug or name. Read-only. The agent MUST append a shared-kitchen disclaimer when responding.",
        parameters: {
          type: "object",
          properties: {
            dish: {
              type: "string",
              description: "Dish slug (e.g., 'grilled-salmon') or display name",
            },
          },
          required: ["dish"],
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
  "kung pao tofu": true,
  "cantonese steamed sea bass": true,
  "dark chocolate avocado mousse": true,
  "tempeh multigrain wrap": true,
};

function lookupDishAllergens(dish: string): { name: string; allergens: string[] } | null {
  const key = dish.toLowerCase().trim();
  if (DISH_ALLERGENS[key]) return DISH_ALLERGENS[key];
  for (const v of Object.values(DISH_ALLERGENS)) {
    if (v.name.toLowerCase() === key) return v;
  }
  // Loose match: pick the first dish whose name contains the query
  for (const v of Object.values(DISH_ALLERGENS)) {
    if (v.name.toLowerCase().includes(key) || key.includes(v.name.toLowerCase())) return v;
  }
  return null;
}

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
    if (name === "get_dish_allergens") {
      const found = lookupDishAllergens(String(args.dish ?? ""));
      if (!found) {
        return {
          success: false,
          error:
            "Dish not found in allergen index. Refuse and escalate — do not guess allergens.",
        };
      }
      return {
        success: true,
        dish: found.name,
        allergens: found.allergens,
        disclaimer:
          "Shared-kitchen environment. Cross-contamination with fish, dairy, soy, peanuts, tree nuts, sesame, and gluten cannot be ruled out. For severe allergies, the agent must instruct the customer to call care before ordering.",
      };
    }
    return { success: false, error: `Unknown tool ${name}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

interface ChatTurn { role: "user" | "agent"; text: string }
interface ChatBody { message: string; history?: ChatTurn[] }

// Hard guardrail: detect modify / cancel / refund intents and short-circuit the LLM.
const REFUSAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(cancel|cancell?ation)\b/i, reason: "cancel" },
  { re: /\b(refund|money back|chargeback)\b/i, reason: "refund" },
  { re: /\b(change|modify|update|swap|switch|replace|add to|remove from)\b.*\b(order|sauce|item|side|dish|meal|protein|topping)\b/i, reason: "modify" },
  { re: /\b(sauce|protein|topping|side)\b.*\b(to|instead|swap|change)\b/i, reason: "modify" },
];

const HARD_REFUSAL_TEXT =
  "I can't make changes to existing orders from this chat. I'll connect you with our care team — please tap Call Support, or reply 'human' and I'll escalate this conversation.";

const SEVERE_ALLERGY_PATTERNS = [
  /\banaphyla/i,
  /\bsevere(ly)? allerg/i,
  /\b(epi.?pen|epinephrine)\b/i,
  /\bdeadly allerg/i,
  /\blife.?threat/i,
];

router.post("/support-agent/chat", async (req: Request, res: Response) => {
  const body = req.body as ChatBody;
  if (!body?.message || typeof body.message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }

  const message = body.message.trim();

  // 1) Hard refuse modify / cancel / refund intents.
  const refusalMatch = REFUSAL_PATTERNS.find((p) => p.re.test(message));
  if (refusalMatch) {
    res.json({
      text: HARD_REFUSAL_TEXT,
      toolCalls: [],
      escalated: true,
      refusalReason: refusalMatch.reason,
    });
    return;
  }

  // 2) Severe-allergy escalation.
  if (SEVERE_ALLERGY_PATTERNS.some((re) => re.test(message))) {
    res.json({
      text:
        "Severe allergy concerns are handled by our care team — never by chat. Please tap Call Support before placing or modifying any order. I'm escalating this conversation now.",
      toolCalls: [],
      escalated: true,
      refusalReason: "severe_allergy",
    });
    return;
  }

  try {
    const contents = [
      ...((body.history ?? []).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }))),
      { role: "user", parts: [{ text: message }] },
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
    if (/escalate|human|specialist|team|care team/i.test(text)) escalated = true;

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
