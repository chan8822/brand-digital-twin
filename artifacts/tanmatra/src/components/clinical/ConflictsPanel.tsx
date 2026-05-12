import { useNavigate } from "react-router";
import { AlertTriangle, X, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cartContext";
import { usePreferences } from "@/lib/preferencesContext";
import { useActivePatient } from "@/lib/patientContext";
import { getDishById } from "@/lib/menuData";
import { evaluateDishForPreferences, findSmartSwap } from "@/lib/preferencesMatch";
import {
  dishMatchesDietOrder,
  useClinicalMode,
  type ServerSafetyConflict,
} from "@/lib/clinicalDiet";

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
  serverConflicts,
  panelId,
}: {
  serverMessage?: string | null;
  /** Structured per-item conflicts from the server's 422 safety_block. */
  serverConflicts?: ServerSafetyConflict[] | null;
  panelId?: string;
}) {
  const navigate = useNavigate();
  const { items, removeItem } = useCart();
  // Allergen evaluation reads from the active-patient bridge (today
  // backed by user preferences; swappable for a real roster API in
  // task #14) rather than from preferences directly.
  const patient = useActivePatient();
  const { preferences } = usePreferences();
  const { enabled: clinicalMode } = useClinicalMode();
  const dietOrderId = patient.dietOrderId;

  const rows: ConflictRow[] = [];
  for (const it of items) {
    const dish = getDishById(it.dishId);
    if (!dish) continue;
    if (patient.allergens.length > 0 && preferences) {
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

  // Layer the server's structured 422 rows on top of client-detected
  // conflicts. Server is authoritative — if it flagged a dish the client
  // missed (e.g. preferences just changed on another device) we still
  // show a row so the user has a Remove path. We dedupe by lineId so we
  // don't render the same dish twice when both gates flagged it.
  if (serverConflicts && serverConflicts.length > 0) {
    const flaggedLineIds = new Set(rows.map((r) => r.lineId));
    for (const sc of serverConflicts) {
      const line = items.find((it) => it.dishId === sc.dishId);
      if (!line || flaggedLineIds.has(line.lineId)) continue;
      const codes = sc.reasons.map((r) => r.code);
      const isAllergen = codes.some((c) => /allerg/i.test(c));
      const detail =
        sc.reasons
          .map((r) => r.detail ?? r.code.replace(/_/g, " "))
          .join("; ") || "Server patient-safety gate flagged this item.";
      const dish = getDishById(sc.dishId);
      const swap =
        dish && preferences ? findSmartSwap(dish, preferences) : null;
      rows.push({
        lineId: line.lineId,
        dishName: sc.dishName,
        reason: detail,
        severity: isAllergen ? "allergen" : "diet",
        swapSlug: swap?.slug ?? null,
        swapName: swap?.name ?? null,
      });
    }
  }

  if (rows.length === 0 && !serverMessage) return null;

  return (
    <div
      id={panelId}
      role="alert"
      aria-live="assertive"
      className="rounded-xl border alert-allergen-border alert-allergen-bg px-4 py-3 space-y-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 alert-allergen-text shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] font-semibold alert-allergen-text">
            Order blocked — patient safety
          </p>
          <p className="text-sm alert-allergen-text leading-snug">
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
              className="flex flex-wrap items-center gap-2 rounded-md alert-allergen-bg alert-allergen-border border px-2.5 py-1.5"
            >
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                  r.severity === "allergen"
                    ? "alert-allergen-bg-strong alert-allergen-text alert-allergen-border"
                    : "alert-stat-bg-strong alert-stat-text alert-stat-border"
                }`}
              >
                {r.severity === "allergen" ? "Allergen" : "Diet order"}
              </span>
              <span className="text-[12px] text-white font-semibold min-w-0 truncate">
                {r.dishName}
              </span>
              <span className="text-[11px] alert-allergen-text min-w-0 flex-1">
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
                  className="h-7 px-2 text-[10px] uppercase tracking-[0.1em] alert-allergen-bg-strong alert-allergen-text alert-allergen-border border hover:opacity-80"
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
