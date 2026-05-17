import { useState } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  ChevronDown,
  ClipboardList,
  Stethoscope,
  Utensils,
  X,
} from "lucide-react";
import {
  DIET_ORDER_BY_ID,
  buildMedicalAlerts,
  buildRecentMeals,
  clinicalModeStore,
  useClinicalMode,
} from "@/lib/clinicalDiet";
import { useActivePatient } from "@/lib/patientContext";
import { useOrders } from "@/lib/ordersContext";

/**
 * PatientContextStrip
 *
 * Read-only patient-context band shown above Menu / Cart / Checkout when
 * clinical mode is active. Per task #10 spec it is collapsible, expanded by
 * default, and surfaces:
 *   • patient name + MRN (+ room/bed)
 *   • the active diet order (read-only; editing happens on the clinical
 *     console, NOT on the ordering screens)
 *   • top-3 medical alerts (allergens + diet-derived flags such as NPO,
 *     insulin-dependent, neutropenic, renal)
 *   • last-3 meals with timestamp and clinical stage
 */
export default function PatientContextStrip() {
  const { enabled } = useClinicalMode();
  const patient = useActivePatient();
  const { orders } = useOrders();
  const [open, setOpen] = useState(true);

  if (!enabled) return null;

  const dietOrder = DIET_ORDER_BY_ID.get(patient.dietOrderId);
  const alerts = buildMedicalAlerts(patient.allergens, patient.dietOrderId);
  const recent = buildRecentMeals(orders);

  return (
    <section
      aria-label="Patient context"
      className="rounded-xl border border-clinical-gold/30 bg-clinical-gold/[0.05]"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="patient-context-body"
          className="flex items-center gap-2 min-w-0 text-left -ml-1 px-1 py-0.5 rounded hover:bg-clinical-gold/10 transition-colors"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 text-clinical-zinc transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <Stethoscope className="w-4 h-4 text-clinical-gold shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="text-white font-semibold text-xs truncate block">
              {patient.name}
            </span>
            <span className="text-[10px] text-clinical-zinc tabular-nums truncate block">
              {patient.mrn}
              {patient.room ? ` · ${patient.room}` : ""}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5 text-clinical-gold" aria-hidden />
          <span className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc font-semibold">
            Diet order
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded border border-clinical-gold/40 bg-clinical-gold/10 text-clinical-gold text-[11px] font-semibold"
            aria-live="polite"
          >
            {dietOrder?.label ?? "Regular"}
          </span>
        </div>

        <button
          type="button"
          onClick={() => clinicalModeStore.disable()}
          className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-clinical-zinc hover:text-white"
          aria-label="Exit clinical mode"
        >
          <X className="w-3 h-3" />
          Exit clinical mode
        </button>
      </header>

      {open && (
        <div
          id="patient-context-body"
          className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs"
        >
          <div className="rounded-md border alert-allergen-border alert-allergen-bg px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-[0.14em] font-semibold alert-allergen-text flex items-center gap-1">
              <AlertCircle className="w-3 h-3" aria-hidden />
              Active medical alerts
            </p>
            {alerts.length === 0 ? (
              <p className="text-[11px] text-clinical-zinc mt-1">
                None on file.{" "}
                <Link to="/preferences" className="text-clinical-gold hover:underline">
                  Update Medical ID
                </Link>
              </p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {alerts.map((a) => (
                  <li
                    key={a.id}
                    title={a.detail}
                    className={`text-[10px] px-1.5 py-0.5 rounded border tabular-nums font-semibold ${
                      a.severity === "high"
                        ? "alert-allergen-bg alert-allergen-text alert-allergen-border"
                        : "bg-clinical-gold/10 text-clinical-gold border-clinical-gold/40"
                    }`}
                  >
                    <span className="uppercase tracking-[0.08em]">{a.code}</span>
                    <span className="ml-1 font-normal">{a.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-clinical-border bg-clinical-surface/50 px-2.5 py-1.5">
            <p className="text-[9px] uppercase tracking-[0.14em] font-semibold text-clinical-zinc flex items-center gap-1">
              <Utensils className="w-3 h-3 text-clinical-gold" aria-hidden />
              Last 3 meals
            </p>
            {recent.length === 0 ? (
              <p className="text-[11px] text-clinical-zinc-muted mt-1">
                No prior meals on record.
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {recent.map((m) => (
                  <li
                    key={m.orderId}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <time
                      dateTime={m.whenIso}
                      className="text-clinical-zinc tabular-nums shrink-0 w-[5.5rem]"
                    >
                      {m.whenLabel}
                    </time>
                    <span className="text-white truncate flex-1 min-w-0">
                      {m.itemSummary}
                    </span>
                    <span className="text-[9px] uppercase tracking-[0.1em] text-clinical-sage shrink-0">
                      {m.stageLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
