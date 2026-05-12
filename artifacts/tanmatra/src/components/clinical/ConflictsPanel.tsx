import { useNavigate } from "react-router";
import { AlertTriangle, X, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cartContext";
import { usePreferences } from "@/lib/preferencesContext";
import { getDishById } from "@/lib/menuData";
import { evaluateDishForPreferences, findSmartSwap } from "@/lib/preferencesMatch";
import { dishMatchesDietOrder, useClinicalMode } from "@/lib/clinicalDiet";

interface ConflictRow {
  lineId: string;
  dishName: string;
  reason: string;
  severity: "allergen" | "diet";
  swapSlug: string | null;
  swapName: string | null;
}

/**
 * ConflictsPanel — single-screen patient-safety panel rendered above Cart and
 * Checkout. Lists every offending line with its allergen / diet-order reason
 * and inline Remove + Replace actions, so the user never has to leave the
 * current screen to clear a block. Server-side rejection messages from
 * /orders/finalize are accepted via the optional `serverMessage` prop and
 * rendered using the same visual treatment.
 *
 * The panel is the *only* path off a confirm-block — there is no UI bypass
 * for the disabled Confirm button.
 */
export default function ConflictsPanel({
  serverMessage,
  panelId,
}: {
  serverMessage?: string | null;
  panelId?: string;
}) {
  const navigate = useNavigate();
  const { items, removeItem } = useCart();
  const { preferences } = usePreferences();
  const { enabled: clinicalMode, dietOrderId } = useClinicalMode();

  const rows: ConflictRow[] = [];
  for (const it of items) {
    const dish = getDishById(it.dishId);
    if (!dish) continue;
    if (preferences) {
      const m = evaluateDishForPreferences(dish, preferences);
      if (m.matchedAllergens.length > 0) {
        const swap = findSmartSwap(dish, preferences);
        rows.push({
          lineId: it.lineId,
          dishName: dish.name,
          reason: `Contains ${m.matchedAllergens.join(", ")}`,
          severity: "allergen",
          swapSlug: swap?.slug ?? null,
          swapName: swap?.name ?? null,
        });
        continue; // allergen takes precedence over diet-order in row display
      }
    }
    if (clinicalMode) {
      const c = dishMatchesDietOrder(dish, dietOrderId);
      if (c) {
        const swap = preferences ? findSmartSwap(dish, preferences) : null;
        rows.push({
          lineId: it.lineId,
          dishName: dish.name,
          reason: c.reason,
          severity: "diet",
          swapSlug: swap?.slug ?? null,
          swapName: swap?.name ?? null,
        });
      }
    }
  }

  if (rows.length === 0 && !serverMessage) return null;

  return (
    <div
      id={panelId}
      role="alert"
      aria-live="assertive"
      className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 space-y-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold text-red-300">
            Order blocked — patient safety
          </p>
          <p className="text-sm text-red-200 leading-snug">
            {serverMessage ??
              `${rows.length} item${rows.length === 1 ? "" : "s"} conflict with the patient's allergens or active diet order. Remove or replace to continue — there is no manual override on this screen.`}
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.lineId}
              className="flex flex-wrap items-center gap-2 rounded-md bg-red-500/5 border border-red-500/30 px-2.5 py-1.5"
            >
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                  r.severity === "allergen"
                    ? "bg-red-500/20 text-red-200 border-red-500/40"
                    : "bg-orange-500/20 text-orange-200 border-orange-500/40"
                }`}
              >
                {r.severity === "allergen" ? "Allergen" : "Diet order"}
              </span>
              <span className="text-[12px] text-white font-semibold min-w-0 truncate">
                {r.dishName}
              </span>
              <span className="text-[11px] text-red-200 min-w-0 flex-1">
                {r.reason}
              </span>
              <div className="flex items-center gap-1 shrink-0 ml-auto">
                {r.swapSlug && r.swapName && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/dish/${r.swapSlug}`)}
                    className="h-7 px-2 text-[10px] uppercase tracking-[0.1em] border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10"
                  >
                    <ArrowRightLeft className="w-3 h-3 mr-1" aria-hidden />
                    Replace with {r.swapName}
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => removeItem(r.lineId)}
                  className="h-7 px-2 text-[10px] uppercase tracking-[0.1em] bg-red-500/80 text-white hover:bg-red-500"
                >
                  <X className="w-3 h-3 mr-1" aria-hidden />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
