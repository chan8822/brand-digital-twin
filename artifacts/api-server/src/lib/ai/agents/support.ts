import { z } from "zod/v4";
import { eq, desc } from "drizzle-orm";
import {
  db,
  ordersTable,
  ridersTable,
  deliveryEventsTable,
} from "@workspace/db";
import { definePrompt } from "../prompts";
import { defineTool } from "../tools";
import { registerAgent } from "../agentRegistry";
import {
  briefToPromptMarkdown,
  type UserBrief,
} from "../../userBrief";

const DISH_ALLERGENS: Record<string, { name: string; allergens: string[] }> = {
  "activated-charcoal-smoothie": {
    name: "Activated Charcoal Smoothie",
    allergens: ["Dairy", "Tree Nuts"],
  },
  "aglio-olio-veg": { name: "Aglio Olio - Veg", allergens: ["Dairy", "Gluten"] },
  "aglio-olio-chicken": {
    name: "Aglio Olio - Chicken",
    allergens: ["Dairy", "Gluten"],
  },
  "aglio-olio-prawns": {
    name: "Aglio Olio - Prawns",
    allergens: ["Dairy", "Gluten", "Shellfish"],
  },
  "signature-quinoa-salad": {
    name: "Signature Quinoa Salad",
    allergens: [],
  },
  "tomato-basil-soup": { name: "Tomato Basil Soup", allergens: [] },
  "power-house-smoothie": {
    name: "Power House Smoothie",
    allergens: ["Dairy", "Peanuts", "Tree Nuts"],
  },
  "peri-peri-paneer-fiesta-rice-bowl": {
    name: "Peri Peri Paneer Fiesta Rice Bowl",
    allergens: ["Dairy"],
  },
  "moong-dal-chilla-with-curd": {
    name: "Moong Dal Chilla with Curd",
    allergens: ["Dairy"],
  },
  "quinoa-khichdi": { name: "Quinoa Khichdi", allergens: [] },
  "falafal-pita-pockets-with-hummus": {
    name: "Falafal Pita Pockets with Hummus",
    allergens: ["Gluten"],
  },
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

function lookupDishAllergens(
  dish: string,
): { name: string; allergens: string[] } | null {
  const key = dish.toLowerCase().trim();
  if (DISH_ALLERGENS[key]) return DISH_ALLERGENS[key];
  for (const v of Object.values(DISH_ALLERGENS)) {
    if (v.name.toLowerCase() === key) return v;
  }
  for (const v of Object.values(DISH_ALLERGENS)) {
    if (
      v.name.toLowerCase().includes(key) ||
      key.includes(v.name.toLowerCase())
    )
      return v;
  }
  return null;
}

interface SupportPromptContext {
  brief?: UserBrief | null;
}

const SUPPORT_PROMPT = definePrompt<SupportPromptContext>({
  name: "support-agent",
  version: "v3",
  build: (ctx) => {
    const briefBlock =
      ctx?.brief != null
        ? `\n\n${briefToPromptMarkdown(ctx.brief)}\n\nUse the user context above only as background — never read it back verbatim and never repeat any field that isn't relevant to the current question.`
        : "";
    return `You are the Tanmatra Support Agent for a clinical-grade nutrition delivery platform.

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
- Be concise and warm. If unsure, escalate.${briefBlock}`;
  },
});

const supportTools = [
  defineTool({
    name: "get_order_status",
    description:
      "Look up the current status and timeline of a customer order by id. Read-only.",
    inputSchema: z.object({ orderId: z.number().int().positive() }),
    authScope: "user",
    handler: async ({ orderId }, ctx) => {
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .limit(1);
      if (!order) return { success: false as const, error: "Order not found" };
      // Object-level access control: a non-ops caller may only read their own
      // order. Ops scope (e.g. internal Ops Agent) may read any order.
      if (!ctx.isOps && order.userId !== ctx.userId) {
        return {
          success: false as const,
          error: "Order not found",
        };
      }
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
  defineTool({
    name: "list_active_riders",
    description: "List currently online delivery riders (max 10). Read-only.",
    inputSchema: z.object({}),
    authScope: "public",
    handler: async () => {
      const riders = await db
        .select()
        .from(ridersTable)
        .where(eq(ridersTable.status, "online"))
        .limit(10);
      return { success: true as const, riders };
    },
  }),
  defineTool({
    name: "check_inventory",
    description:
      "Check whether a menu item is available right now. Read-only.",
    inputSchema: z.object({ itemName: z.string() }),
    authScope: "public",
    handler: async ({ itemName }) => {
      const key = itemName.toLowerCase().trim();
      return {
        success: true as const,
        itemName,
        available: STATIC_INVENTORY[key] ?? true,
      };
    },
  }),
  defineTool({
    name: "get_dish_allergens",
    description:
      "Return the official allergen list for a dish by slug or name. Read-only. The agent MUST append a shared-kitchen disclaimer when responding.",
    inputSchema: z.object({ dish: z.string() }),
    authScope: "public",
    handler: async ({ dish }) => {
      const found = lookupDishAllergens(dish);
      if (!found) {
        return {
          success: false as const,
          error:
            "Dish not found in allergen index. Refuse and escalate — do not guess allergens.",
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
];

const REFUSAL_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(cancel|cancell?ation)\b/i, reason: "cancel" },
  { re: /\b(refund|money back|chargeback)\b/i, reason: "refund" },
  {
    re: /\b(change|modify|update|swap|switch|replace|add to|remove from)\b.*\b(order|sauce|item|side|dish|meal|protein|topping)\b/i,
    reason: "modify",
  },
  {
    re: /\b(sauce|protein|topping|side)\b.*\b(to|instead|swap|change)\b/i,
    reason: "modify",
  },
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

const SEVERE_ALLERGY_TEXT =
  "Severe allergy concerns are handled by our care team — never by chat. Please tap Call Support before placing or modifying any order. I'm escalating this conversation now.";

registerAgent<SupportPromptContext>({
  name: "support",
  description: "Customer support agent (read-only menu, orders, riders).",
  defaultModel: "gemini-2.5-flash",
  maxSteps: 4,
  systemPrompt: SUPPORT_PROMPT,
  tools: supportTools,
  preflight: (msg: string) => {
    const m = REFUSAL_PATTERNS.find((p) => p.re.test(msg));
    if (m) return { refusal: { text: HARD_REFUSAL_TEXT, reason: m.reason } };
    if (SEVERE_ALLERGY_PATTERNS.some((re) => re.test(msg))) {
      return {
        refusal: { text: SEVERE_ALLERGY_TEXT, reason: "severe_allergy" },
      };
    }
    return null;
  },
  detectEscalation: (text: string) =>
    /escalate|human|specialist|care team/i.test(text),
});
