import { db, ordersTable, nutritionLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDishById, type DishData } from "@workspace/menu-catalog";
import { logger } from "./logger";

const VEG_CATEGORIES = new Set<DishData["category"]>([
  "salads",
  "soups",
  "bowls",
]);

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Insert one nutrition_logs row per delivered order line. Idempotent via
 * dedupe_key — calling twice for the same line is a no-op.
 */
export async function autoLogDeliveredOrder(orderId: number): Promise<number> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  if (!order || !order.userId) return 0;
  const day = dayStr(order.scheduledFor ?? order.createdAt ?? new Date());
  const rows: Array<typeof nutritionLogsTable.$inferInsert> = [];
  for (let i = 0; i < (order.items ?? []).length; i++) {
    const it = order.items[i];
    const dish = getDishById(Number(it.id));
    if (!dish) continue;
    const qty = Math.max(1, Number(it.qty ?? 1));
    const m = dish.macros;
    const isVeg = dish.isVeg && VEG_CATEGORIES.has(dish.category);
    rows.push({
      userId: order.userId,
      loggedFor: day,
      source: "auto_order",
      label: `${dish.name}${qty > 1 ? ` ×${qty}` : ""}`,
      calories: Math.round(m.calories * qty),
      proteinGrams: Math.round(m.protein * qty),
      carbsGrams: Math.round(m.carbs * qty),
      fatGrams: Math.round(m.fat * qty),
      fiberGrams: Math.round(m.fiber * qty),
      vegServings: isVeg ? qty : 0,
      orderId,
      dedupeKey: `order:${orderId}:${i}`,
    });
  }
  if (rows.length === 0) return 0;
  await db
    .insert(nutritionLogsTable)
    .values(rows)
    .onConflictDoNothing({ target: [nutritionLogsTable.userId, nutritionLogsTable.dedupeKey] });
  logger.info({ orderId, lines: rows.length }, "wellness auto-logged delivered order");
  // Keep streaks fresh after delivered orders so the dashboard reflects them
  // without requiring the user to perform another action.
  try {
    const { recomputeStreaks } = await import("../routes/wellness");
    await recomputeStreaks(order.userId);
  } catch (err) {
    logger.error({ err, userId: order.userId }, "wellness streak recompute failed");
  }
  return rows.length;
}
