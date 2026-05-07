import { Router, type IRouter, type Request, type Response } from "express";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { db, ordersTable, ridersTable, deliveryEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const apiKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];
const baseURL = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
if (!apiKey || !baseURL) {
  throw new Error(
    "AI_INTEGRATIONS_GEMINI_API_KEY and AI_INTEGRATIONS_GEMINI_BASE_URL must be set",
  );
}

const google = createGoogleGenerativeAI({ apiKey, baseURL });
const model = google("gemini-2.5-flash");

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

// Static allergen table — representative subset of artifacts/tanmatra/src/lib/menuData.ts
const DISH_ALLERGENS: Record<string, { name: string; allergens: string[] }> = {
  "activated-charcoal-smoothie": { name: "Activated Charcoal Smoothie", allergens: ["Dairy", "Tree Nuts"] },
  "aglio-olio-veg": { name: "Aglio Olio - Veg", allergens: ["Dairy", "Gluten"] },
  "aglio-olio-chicken": { name: "Aglio Olio - Chicken", allergens: ["Dairy", "Gluten"] },
  "aglio-olio-prawns": { name: "Aglio Olio - Prawns", allergens: ["Dairy", "Gluten", "Shellfish"] },
  "signature-quinoa-salad": { name: "Signature Quinoa Salad", allergens: [] },
  "tomato-basil-soup": { name: "Tomato Basil Soup", allergens: [] },
  "power-house-smoothie": { name: "Power House Smoothie", allergens: ["Dairy", "Peanuts", "Tree Nuts"] },
  "peri-peri-paneer-fiesta-rice-bowl": { name: "Peri Peri Paneer Fiesta Rice Bowl", allergens: ["Dairy"] },
  "moong-dal-chilla-with-curd": { name: "Moong Dal Chilla with Curd", allergens: ["Dairy"] },
  "quinoa-khichdi": { name: "Quinoa Khichdi", allergens: [] },
  "falafal-pita-pockets-with-hummus": { name: "Falafal Pita Pockets with Hummus", allergens: ["Gluten"] },
  "pesto-pasta-veg": { name: "Pesto Pasta (Veg)", allergens: ["Gluten"] },
};

const STATIC_INVENTORY: Record<string, boolean> = {
  "activated charcoal smoothie": true,
  "aglio olio - veg": true,
  "aglio olio - chicken": true,
  "aglio olio - prawns": true,
  "signature quinoa salad": true,
  "tomato basil soup": true,
  "power house smoothie": true,
  "peri peri paneer fiesta rice bowl": true,
  "moong dal chilla with curd": true,
  "quinoa khichdi": true,
  "falafal pita pockets with hummus": true,
  "pesto pasta (veg)": true,
};

function lookupDishAllergens(dish: string): { name: string; allergens: string[] } | null {
  const key = dish.toLowerCase().trim();
  if (DISH_ALLERGENS[key]) return DISH_ALLERGENS[key];
  for (const v of Object.values(DISH_ALLERGENS)) {
    if (v.name.toLowerCase() === key) return v;
  }
  for (const v of Object.values(DISH_ALLERGENS)) {
    if (v.name.toLowerCase().includes(key) || key.includes(v.name.toLowerCase())) return v;
  }
  return null;
}

const tools = {
  get_order_status: tool({
    description: "Look up the current status and timeline of a customer order by id. Read-only.",
    inputSchema: z.object({ orderId: z.number().int().positive() }),
    execute: async ({ orderId }) => {
      const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
      if (!order) return { success: false as const, error: "Order not found" };
      const events = await db
        .select()
        .from(deliveryEventsTable)
        .where(eq(deliveryEventsTable.orderId, orderId))
        .orderBy(desc(deliveryEventsTable.createdAt))
        .limit(10);
      return {
        success: true as const,
        order: { id: order.id, status: order.status, total: order.totalPaise },
        events,
      };
    },
  }),
  list_active_riders: tool({
    description: "List currently online delivery riders (max 10). Read-only.",
    inputSchema: z.object({}),
    execute: async () => {
      const riders = await db
        .select()
        .from(ridersTable)
        .where(eq(ridersTable.status, "online"))
        .limit(10);
      return { success: true as const, riders };
    },
  }),
  check_inventory: tool({
    description: "Check whether a menu item is available right now. Read-only.",
    inputSchema: z.object({ itemName: z.string() }),
    execute: async ({ itemName }) => {
      const key = itemName.toLowerCase().trim();
      return { success: true as const, itemName, available: STATIC_INVENTORY[key] ?? true };
    },
  }),
  get_dish_allergens: tool({
    description:
      "Return the official allergen list for a dish by slug or name. Read-only. The agent MUST append a shared-kitchen disclaimer when responding.",
    inputSchema: z.object({ dish: z.string() }),
    execute: async ({ dish }) => {
      const found = lookupDishAllergens(dish);
      if (!found) {
        return {
          success: false as const,
          error: "Dish not found in allergen index. Refuse and escalate — do not guess allergens.",
        };
      }
      return {
        success: true as const,
        dish: found.name,
        allergens: found.allergens,
        disclaimer:
          "Shared-kitchen environment. Cross-contamination with fish, dairy, soy, peanuts, tree nuts, sesame, and gluten cannot be ruled out. For severe allergies, the agent must instruct the customer to call care before ordering.",
      };
    },
  }),
};

interface ChatTurn { role: "user" | "agent"; text: string }
interface ChatBody { message: string; history?: ChatTurn[] }

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
    const messages: ModelMessage[] = [
      ...((body.history ?? []).map((m): ModelMessage => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }))),
      { role: "user", content: message },
    ];

    const result = await generateText({
      model,
      system: SYSTEM_INSTRUCTION,
      messages,
      tools,
      stopWhen: stepCountIs(4),
    });

    const toolCalls: Array<{ name: string; args?: unknown; result?: unknown }> = [];
    for (const step of result.steps) {
      for (const tc of step.toolCalls) {
        const matchingResult = step.toolResults.find((r) => r.toolCallId === tc.toolCallId);
        toolCalls.push({
          name: tc.toolName,
          args: tc.input,
          result: matchingResult ? (matchingResult as unknown as { output: unknown }).output : undefined,
        });
      }
    }

    const text = result.text || "I'm not sure how to help with that.";
    const escalated = /escalate|human|specialist|care team/i.test(text);

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
