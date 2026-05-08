/**
 * Prompt-rendering helpers for UserBrief.
 *
 * These accept a full UserBrief, run it through the redaction layer,
 * and return either a compact markdown summary (default) or a JSON
 * code block — both safe to paste into a system prompt.
 */

import { redactBrief, type RedactedBrief } from "./redaction";
import type { UserBrief } from "./types";

function fmtList(xs: string[] | null | undefined, fallback = "none"): string {
  return xs && xs.length > 0 ? xs.join(", ") : fallback;
}

function pricedRupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * Compact markdown rendering. Only includes sections that exist on the
 * brief — null sections are skipped so the prompt stays small.
 */
export function briefToPromptMarkdown(brief: UserBrief): string {
  const r = redactBrief(brief);
  const lines: string[] = ["## User context"];
  const name = r.identity.firstName ? ` (${r.identity.firstName})` : "";
  lines.push(`- user_id: ${r.identity.userId}${name}`);
  lines.push(
    `- time: ${r.context.localDate} ${String(r.context.localHour).padStart(2, "0")}:00 ${r.context.timezone} (${r.context.timeOfDay})`,
  );
  if (r.context.city) lines.push(`- city: ${r.context.city}`);

  if (r.preferences) {
    const p = r.preferences;
    lines.push("");
    lines.push("### Diet & preferences");
    lines.push(`- diet: ${p.dietaryStyle ?? "unset"}, spice: ${p.spiceLevel ?? "unset"}`);
    lines.push(`- allergens: ${fmtList(p.allergens)}`);
    lines.push(`- dislikes: ${fmtList(p.dislikedIngredients)}`);
    lines.push(`- cuisines: ${fmtList(p.cuisines, "no preference")}`);
    lines.push(
      `- goal: ${p.goal ?? "unset"}, activity: ${p.activityLevel ?? "unset"}`,
    );
    if (p.calorieTarget || p.proteinTargetGrams) {
      lines.push(
        `- macro targets: ${p.calorieTarget ?? "?"} kcal, ${p.proteinTargetGrams ?? "?"} g protein`,
      );
    }
  }

  if (r.subscription) {
    const s = r.subscription;
    lines.push("");
    lines.push("### Subscription");
    lines.push(
      `- ${s.status} ${s.cadence} plan, ${s.mealsPerDelivery} meals / delivery, window: ${s.deliveryWindow}`,
    );
    if (s.nextDeliveryAt) lines.push(`- next delivery: ${s.nextDeliveryAt}`);
    lines.push(
      `- price/delivery: ${pricedRupees(s.pricePerDeliveryRupees)}, members: ${s.memberCount}`,
    );
  }

  if (r.premium) {
    lines.push("");
    lines.push("### Premium");
    lines.push(
      r.premium.isPremium
        ? `- premium member, period ends ${r.premium.currentPeriodEndIso}, RD consults left: ${r.premium.rdConsultsRemaining ?? 0}`
        : `- not a premium member`,
    );
  }

  if (r.loyalty) {
    lines.push("");
    lines.push("### Loyalty");
    lines.push(
      `- credit balance: ${pricedRupees(r.loyalty.creditBalanceRupees)}, pending notifications: ${r.loyalty.pendingNotifications}`,
    );
  }

  if (r.recentOrders && r.recentOrders.length > 0) {
    lines.push("");
    lines.push("### Recent orders");
    for (const o of r.recentOrders) {
      lines.push(
        `- #${o.id} (${o.status}, ${o.fulfillmentType}) ${pricedRupees(o.totalRupees)} — ${o.itemCount} items: ${fmtList(o.topItems)} — ${o.placedAtIso}`,
      );
    }
  }

  if (r.wellness) {
    const w = r.wellness;
    lines.push("");
    lines.push("### Wellness today");
    lines.push(
      `- calories ${w.todayCalories}/${w.calorieTarget}, protein ${w.todayProteinGrams}/${w.proteinTargetGrams} g, water ${w.todayWaterMl} ml`,
    );
    lines.push(
      `- streaks: protein ${w.proteinStreakDays}d, veg ${w.vegStreakDays}d`,
    );
  }

  if (r.profile) {
    lines.push("");
    lines.push("### Profile flags");
    lines.push(
      `- birthDate set: ${r.profile.hasBirthDate}, anniversary set: ${r.profile.hasAnniversary}, protein shortfall streak: ${r.profile.proteinShortfallStreak}d`,
    );
  }

  return lines.join("\n");
}

/** JSON code block rendering — useful for agents that prefer structured input. */
export function briefToPromptJson(brief: UserBrief): string {
  const r = redactBrief(brief);
  return ["```json", JSON.stringify(r, null, 2), "```"].join("\n");
}

/** Return the redacted shape directly (no rendering). */
export function briefToRedacted(brief: UserBrief): RedactedBrief {
  return redactBrief(brief);
}
