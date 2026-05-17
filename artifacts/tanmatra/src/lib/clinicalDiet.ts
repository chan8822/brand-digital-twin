// Task #10 — Clinical terminology, allergen confirm-block & patient context.
//
// EHR-aligned diet orders and a tiny clinical-mode store that the Menu, Cart
// and Checkout surfaces consult to (a) replace marketing copy with hospital
// vocabulary, (b) filter dishes by the patient's diet order, and (c) gate
// confirm-order on diet/allergen conflicts.
//
// Out of scope (intentionally): server-side enforcement (already handled by
// the finalize gate in task #3), the override-with-RD-signature flow (task
// #7), persistent patient roster (task #14 deferred), localization.

import { useEffect, useSyncExternalStore } from "react";
import type { DishData } from "@workspace/menu-catalog";
import type { PastOrder } from "./ordersContext";
import { CLINICAL_STAGES, statusToClinicalStage } from "./clinicalLifecycle";

export type DietOrderId =
  | "regular"
  | "npo"
  | "clear_liquid"
  | "full_liquid"
  | "soft"
  | "low_sodium"
  | "renal"
  | "diabetic_carb"
  | "cardiac"
  | "neutropenic";

export interface DietOrder {
  id: DietOrderId;
  label: string;
  short: string;
  description: string;
}

export const DIET_ORDERS: DietOrder[] = [
  {
    id: "regular",
    label: "Regular",
    short: "Regular",
    description: "No restrictions — full menu.",
  },
  {
    id: "npo",
    label: "NPO (Nil Per Os)",
    short: "NPO",
    description: "Nothing by mouth. No items may be ordered.",
  },
  {
    id: "clear_liquid",
    label: "Clear Liquid",
    short: "Clear Liquid",
    description: "Transparent fluids only — beverages.",
  },
  {
    id: "full_liquid",
    label: "Full Liquid",
    short: "Full Liquid",
    description: "Liquids and strained soups, no solids.",
  },
  {
    id: "soft",
    label: "Soft",
    short: "Soft",
    description: "Easy-to-chew items: soups, bowls, breakfast, salads.",
  },
  {
    id: "low_sodium",
    label: "Low Sodium",
    short: "Low Na",
    description: "Avoid high-sodium and high-fat dishes (≤18g fat).",
  },
  {
    id: "renal",
    label: "Renal",
    short: "Renal",
    description: "Lower-protein, lower-fat picks for impaired renal function.",
  },
  {
    id: "diabetic_carb",
    label: "Diabetic-Consistent Carbohydrate",
    short: "Diabetic-CCHO",
    description: "Low glycaemic index, sugar ≤10g per serving.",
  },
  {
    id: "cardiac",
    label: "Cardiac",
    short: "Cardiac",
    description: "Heart-healthy: low-to-moderate fat, low sugar, low GI.",
  },
  {
    id: "neutropenic",
    label: "Neutropenic",
    short: "Neutropenic",
    description: "Cooked items only — no raw salads.",
  },
];

export const DIET_ORDER_BY_ID = new Map(DIET_ORDERS.map((d) => [d.id, d]));

// Replace the consumer "Lifestyle" tabs with EHR vocabulary when clinical
// mode is on. The semantic mapping is intentionally loose — the underlying
// matchesLifestyle() heuristic doesn't change, only the label the clinician
// sees on the chip. (A separate engineering follow-up is tracked to add
// proper sodium/potassium/protein attributes to DishData.)
export const LIFESTYLE_EHR_LABEL: Record<string, string> = {
  "heart-healthy": "Cardiac",
  "diabetes-management": "Diabetic-CCHO",
  "silver-vitality": "Soft",
  "fitness-gains": "High Protein",
  "junior-explorers": "Paediatric",
};

// ---------------------------------------------------------------------------
// dish ↔ diet-order compatibility (client-side advisory; the server's
// finalize gate is the authoritative patient-safety boundary)
// ---------------------------------------------------------------------------

export interface DietOrderConflict {
  dietOrderId: DietOrderId;
  dietOrderLabel: string;
  reason: string;
}

export function dishMatchesDietOrder(
  dish: DishData,
  dietOrderId: DietOrderId,
): DietOrderConflict | null {
  const order = DIET_ORDER_BY_ID.get(dietOrderId);
  if (!order) return null;
  const sugar = parseFloat(dish.sugarPerServing) || 0;
  const cat = dish.category;
  const violation = (reason: string): DietOrderConflict => ({
    dietOrderId,
    dietOrderLabel: order.label,
    reason,
  });
  switch (dietOrderId) {
    case "regular":
      return null;
    case "npo":
      return violation("NPO ordered — no items may be served.");
    case "clear_liquid":
      return cat === "beverages"
        ? null
        : violation("Clear-liquid diet — beverages only.");
    case "full_liquid":
      return cat === "beverages" || cat === "soups"
        ? null
        : violation("Full-liquid diet — beverages and strained soups only.");
    case "soft": {
      const softCats = new Set(["soups", "bowls", "breakfast", "salads"]);
      return softCats.has(cat)
        ? null
        : violation("Soft diet — choose soups, bowls, breakfast or salads.");
    }
    case "low_sodium":
      return dish.macros.fat > 18 || sugar > 12
        ? violation("Exceeds low-sodium guard (high-fat or high-sugar).")
        : null;
    case "renal":
      return dish.macros.protein > 22 || dish.macros.fat > 18
        ? violation("Renal diet — exceeds protein or fat caps.")
        : null;
    case "diabetic_carb":
      return dish.glycaemicIndex === "high" || sugar > 10
        ? violation("Diabetic-CCHO — high GI or sugar > 10g.")
        : null;
    case "cardiac":
      return dish.glycaemicIndex === "high" ||
        dish.macros.fat > 18 ||
        sugar > 12
        ? violation("Cardiac diet — exceeds fat, sugar or GI guard.")
        : null;
    case "neutropenic":
      return cat === "salads"
        ? violation("Neutropenic diet — raw salads not permitted.")
        : null;
  }
}

// ---------------------------------------------------------------------------
// clinical-mode store (vanilla, useSyncExternalStore-friendly, SSR-safe)
//
// Persisted in localStorage so a clinician's diet-order picker survives a
// reload mid-session. The store is intentionally global rather than React
// context-based so non-React modules (e.g. cart-conflict helpers) can read
// the active diet order without prop-drilling.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "tanmatra:clinical-mode:v1";

export interface PatientContext {
  name: string;
  mrn: string;
  // The patient's room/bed string is non-essential for the strip itself but
  // useful in dispatch / nurse-tablet contexts; kept here so a single shape
  // survives localStorage round-trips.
  room?: string;
}

export interface ClinicalModeState {
  enabled: boolean;
  dietOrderId: DietOrderId;
  patient: PatientContext;
}

const DEFAULT_PATIENT: PatientContext = {
  name: "Demo Patient",
  mrn: "MRN-000042",
  room: "Ward 3 · Bed 12",
};

const DEFAULT_STATE: ClinicalModeState = {
  enabled: false,
  dietOrderId: "regular",
  patient: DEFAULT_PATIENT,
};

function loadState(): ClinicalModeState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ClinicalModeState>;
    return {
      enabled: Boolean(parsed.enabled),
      dietOrderId:
        parsed.dietOrderId && DIET_ORDER_BY_ID.has(parsed.dietOrderId)
          ? parsed.dietOrderId
          : "regular",
      patient: {
        ...DEFAULT_PATIENT,
        ...(parsed.patient ?? {}),
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

let currentState: ClinicalModeState = loadState();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
  } catch {
    /* quota / private mode — strip silently degrades to in-memory only */
  }
}

function notify() {
  for (const fn of listeners) fn();
}

function setState(patch: Partial<ClinicalModeState>) {
  currentState = { ...currentState, ...patch };
  persist();
  notify();
}

export const clinicalModeStore = {
  get: (): ClinicalModeState => currentState,
  enable() {
    if (currentState.enabled) return;
    setState({ enabled: true });
  },
  disable() {
    if (!currentState.enabled) return;
    setState({ enabled: false });
  },
  setDietOrder(id: DietOrderId) {
    if (!DIET_ORDER_BY_ID.has(id)) return;
    if (currentState.dietOrderId === id) return;
    setState({ dietOrderId: id });
  },
  setPatient(patient: PatientContext) {
    setState({ patient });
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useClinicalMode(): ClinicalModeState {
  return useSyncExternalStore(
    clinicalModeStore.subscribe,
    clinicalModeStore.get,
    () => DEFAULT_STATE,
  );
}

// Auto-enable clinical mode for the lifetime of the /clinical page (and
// keep it on after the user navigates away — the strip itself exposes an
// "Exit clinical mode" affordance).
export function useEnableClinicalMode() {
  useEffect(() => {
    clinicalModeStore.enable();
  }, []);
}

// ---------------------------------------------------------------------------
// derived patient-context helpers (read-only — the PatientContextStrip on
// the ordering screens is a display surface; editing happens elsewhere)
// ---------------------------------------------------------------------------

export interface MedicalAlert {
  id: string;
  /** Short, ALL-CAPS code for chip rendering (e.g. "NPO", "ALLERGY"). */
  code: string;
  /** Plain-language detail. */
  detail: string;
  severity: "high" | "medium" | "low";
}

/**
 * Build the patient's active medical-alerts list. Allergens map to severity
 * "high" (anaphylactic risk model), and the active diet order contributes a
 * second flag whenever it carries operational impact (NPO, neutropenic,
 * insulin-dependent diabetic-CCHO).
 */
export function buildMedicalAlerts(
  allergens: string[] | undefined | null,
  dietOrderId: DietOrderId,
): MedicalAlert[] {
  const out: MedicalAlert[] = [];
  for (const a of allergens ?? []) {
    out.push({
      id: `allergy:${a}`,
      code: "ALLERGY",
      detail: a.charAt(0).toUpperCase() + a.slice(1),
      severity: "high",
    });
  }
  switch (dietOrderId) {
    case "npo":
      out.push({
        id: "npo",
        code: "NPO",
        detail: "Nil per os — no oral intake permitted.",
        severity: "high",
      });
      break;
    case "diabetic_carb":
      out.push({
        id: "insulin",
        code: "INSULIN-DEP",
        detail: "Insulin-dependent — keep CHO consistent meal-to-meal.",
        severity: "medium",
      });
      break;
    case "neutropenic":
      out.push({
        id: "neutropenic",
        code: "NEUTROPENIC",
        detail: "Immunocompromised — cooked items only, no raw produce.",
        severity: "high",
      });
      break;
    case "renal":
      out.push({
        id: "renal",
        code: "RENAL",
        detail: "Impaired renal function — protein and fat caps apply.",
        severity: "medium",
      });
      break;
    default:
      break;
  }
  return out.slice(0, 3);
}

/**
 * Marketing → EHR category label override. Used by Dish detail and Cart
 * line items in clinical mode so a diner facing screen does not show
 * consumer copy like "Power Bowls" or "Comfort" while a clinician is
 * verifying a tray.
 */
export const CATEGORY_EHR_LABEL: Record<string, string> = {
  bowls: "Composite plate",
  mains: "Main course",
  thalis: "Composite plate",
  sides: "Side dish",
  beverages: "Beverage",
  desserts: "Dessert",
  soups: "Soup",
  salads: "Salad",
  breakfast: "Breakfast",
};

export function clinicalCategoryLabel(
  category: string,
  fallback: string,
): string {
  return CATEGORY_EHR_LABEL[category] ?? fallback;
}

/**
 * Structured server safety-block payload (mirrored from
 * /orders/finalize 422 → `blocked` rows). Decoupled from the server
 * type to keep the client free of api-server imports.
 */
export interface ServerSafetyConflict {
  dishId: number;
  dishName: string;
  reasons: Array<{ code: string; detail?: string }>;
}

export function parseSafetyBlock(
  errorMessage: string,
): { conflicts: ServerSafetyConflict[]; primaryCode: string | null } | null {
  // Error messages from loyaltyApi take the shape `${status}: ${body}`.
  const idx = errorMessage.indexOf(":");
  if (idx < 0) return null;
  const body = errorMessage.slice(idx + 1).trim();
  if (!body.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(body) as {
      blocked?: Array<{
        dishId?: number;
        dishName?: string;
        reasons?: Array<{ code?: string; detail?: string }>;
      }>;
      code?: string;
    };
    if (!Array.isArray(parsed.blocked)) return null;
    return {
      primaryCode: typeof parsed.code === "string" ? parsed.code : null,
      conflicts: parsed.blocked.map((b) => ({
        dishId: typeof b.dishId === "number" ? b.dishId : -1,
        dishName: typeof b.dishName === "string" ? b.dishName : "Unknown dish",
        reasons: Array.isArray(b.reasons)
          ? b.reasons.map((r) => ({
              code: typeof r.code === "string" ? r.code : "safety_block",
              detail: typeof r.detail === "string" ? r.detail : undefined,
            }))
          : [],
      })),
    };
  } catch {
    return null;
  }
}

export interface RecentMeal {
  orderId: string;
  /** Display string, e.g. "Tue 12:40" — short and tabular. */
  whenLabel: string;
  /** Sort key. */
  whenIso: string;
  /** Clinical lifecycle stage label, e.g. "Patient Received". */
  stageLabel: string;
  /** First 1–2 dish names of the order. */
  itemSummary: string;
}

/**
 * Pull the patient's three most recent meals with the timestamp and clinical
 * stage required by the patient-context strip spec. Cancelled orders are
 * excluded — they didn't reach the patient.
 */
export function buildRecentMeals(orders: PastOrder[]): RecentMeal[] {
  const stageByKey = new Map(CLINICAL_STAGES.map((s) => [s.key, s.label]));
  return orders
    .filter((o) => o.status !== "cancelled")
    .slice(0, 3)
    .map((o) => {
      const when = new Date(o.placedAt);
      const whenLabel = when.toLocaleString([], {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      const stage = statusToClinicalStage(o.status, !!o.verifiedByName);
      const stageLabel = stageByKey.get(stage) ?? stage;
      const itemSummary = o.items
        .slice(0, 2)
        .map((i) => i.name)
        .join(" + ");
      return {
        orderId: o.orderId,
        whenLabel,
        whenIso: o.placedAt,
        stageLabel,
        itemSummary: itemSummary || "—",
      };
    });
}
