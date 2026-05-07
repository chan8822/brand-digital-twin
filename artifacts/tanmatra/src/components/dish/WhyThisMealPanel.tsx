import { Sparkles, ShieldAlert } from "lucide-react";
import type { DishData } from "@workspace/menu-catalog";
import type { UserPreferences } from "@/lib/preferencesApi";
import type { DishMatchResult } from "@/lib/preferencesMatch";

interface Props {
  dish: DishData;
  preferences: UserPreferences | null;
  match: DishMatchResult;
}

const GOAL_LABEL: Record<string, string> = {
  lose_weight: "weight-loss",
  gain_muscle: "muscle-gain",
  maintain: "maintenance",
  general_wellness: "general-wellness",
};

function buildNarrative(dish: DishData, prefs: UserPreferences): string {
  const goalLabel = prefs.goal ? GOAL_LABEL[prefs.goal] ?? prefs.goal : null;
  const parts: string[] = [];

  if (goalLabel) {
    if (prefs.goal === "lose_weight" && dish.macros.calories <= 450) {
      parts.push(
        `At ${dish.macros.calories} kcal this fits comfortably inside a ${goalLabel} day.`,
      );
    } else if (prefs.goal === "gain_muscle" && dish.macros.protein >= 22) {
      parts.push(
        `${dish.macros.protein}g of protein lands this in your muscle-gain zone.`,
      );
    } else if (prefs.goal === "general_wellness" && dish.macros.fiber >= 5) {
      parts.push(`${dish.macros.fiber}g fibre and a clean ingredient list make this a steady general-wellness pick.`);
    } else if (prefs.goal === "maintain" && dish.glycaemicIndex === "low") {
      parts.push(`Low glycaemic index keeps blood sugar steady — good for a maintenance day.`);
    } else {
      parts.push(`Picked for your ${goalLabel} profile based on its macro split.`);
    }
  }

  if (prefs.cuisines.length > 0 && prefs.cuisines.includes(dish.kitchen)) {
    parts.push(`${dish.kitchen.charAt(0).toUpperCase()}${dish.kitchen.slice(1)} is on your cuisine shortlist.`);
  }

  if (prefs.dietaryStyle && prefs.dietaryStyle !== "omnivore") {
    if (prefs.dietaryStyle === "vegetarian" && dish.isVeg) {
      parts.push(`Fully vegetarian, no animal protein.`);
    } else if (prefs.dietaryStyle === "keto" && dish.macros.carbs <= 20) {
      parts.push(`At ${dish.macros.carbs}g carbs it stays inside a keto envelope.`);
    }
  }

  if (parts.length === 0) {
    parts.push(
      `Balanced macro split (${dish.macros.protein}P / ${dish.macros.carbs}C / ${dish.macros.fat}F) and a clean ingredient list.`,
    );
  }

  return parts.join(" ");
}

export default function WhyThisMealPanel({ dish, preferences, match }: Props) {
  const hasWarnings = match.warnings.length > 0;
  const hasReasons = match.reasons.length > 0 || preferences != null;

  if (!hasWarnings && !hasReasons) return null;

  if (hasWarnings) {
    return (
      <div className="rounded-xl p-4 border bg-orange-500/5 border-orange-500/30 space-y-2">
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-orange-400">
              Heads up — based on your preferences
            </p>
            <ul className="text-xs text-clinical-zinc leading-relaxed space-y-0.5">
              {match.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!preferences) return null;

  const narrative = buildNarrative(dish, preferences);

  return (
    <div className="rounded-xl p-4 border bg-clinical-sage/5 border-clinical-sage/30 space-y-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-clinical-sage" />
        <p className="text-xs font-medium text-clinical-sage">
          Why this meal for you
        </p>
      </div>
      <p className="text-xs text-clinical-zinc leading-relaxed">{narrative}</p>
      {match.reasons.length > 0 && (
        <ul className="text-xs text-clinical-zinc leading-relaxed space-y-0.5 pl-1">
          {match.reasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
