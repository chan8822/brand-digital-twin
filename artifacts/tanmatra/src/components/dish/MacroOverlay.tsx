import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, Flame } from "lucide-react";

export interface MacroData {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  calories: number;
}

interface MacroOverlayProps {
  macros: MacroData;
  rdVerified?: boolean;
  compact?: boolean;
  sodiumMg?: number;
}

export default function MacroOverlay({ macros, rdVerified = false, compact = false, sodiumMg }: MacroOverlayProps) {
  const total = macros.protein + macros.carbs + macros.fat;
  const proteinPct = Math.round((macros.protein / total) * 100);
  const carbsPct = Math.round((macros.carbs / total) * 100);
  const fatPct = Math.round((macros.fat / total) * 100);

  if (compact) {
    // Each chip gets its own dark backdrop so contrast is preserved when this
    // row is layered over a bright dish photo (e.g. quinoa salad). Each chip
    // also carries an aria-label expanding the single-letter code so screen
    // readers announce "12 grams of protein" instead of "P 12g".
    const chip =
      "text-clinical-data text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#050505]/70 backdrop-blur-sm";
    return (
      <div
        className="flex items-center gap-1.5 flex-wrap"
        role="group"
        aria-label="Macro nutrients"
      >
        {rdVerified && (
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[9px] border-clinical-sage/40 text-clinical-sage gap-0.5 bg-clinical-sage/10"
            aria-label="Verified by Tanmatra Registered Dietitian advisory board"
          >
            <ShieldCheck className="w-2.5 h-2.5" aria-hidden="true" />
            RD
          </Badge>
        )}
        <span
          className={`${chip} text-clinical-zinc`}
          aria-label={`${macros.calories} kilocalories`}
        >
          <Flame className="w-2.5 h-2.5 text-orange-400" aria-hidden="true" />
          <span aria-hidden="true">{macros.calories} kcal</span>
        </span>
        <span
          className={`${chip} text-clinical-blue`}
          aria-label={`${macros.protein} grams of protein`}
        >
          <span aria-hidden="true">P {macros.protein}g</span>
        </span>
        <span
          className={`${chip} text-clinical-gold`}
          aria-label={`${macros.carbs} grams of carbohydrates`}
        >
          <span aria-hidden="true">C {macros.carbs}g</span>
        </span>
        <span
          className={`${chip} text-clinical-sage`}
          aria-label={`${macros.fat} grams of fat`}
        >
          <span aria-hidden="true">F {macros.fat}g</span>
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* RD Badge */}
      {rdVerified && (
        <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 hover:bg-clinical-sage/20 gap-1.5 text-[10px] h-6">
          <ShieldCheck className="w-3 h-3" />
          RD Advisory Board Verified
        </Badge>
      )}

      {/* Calorie badge */}
      <div className="flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-400" />
        <span className="tabular-nums text-lg font-semibold text-white">{macros.calories}</span>
        <span className="text-clinical-label">kcal</span>
      </div>

      {/* Macro bars */}
      <div className="space-y-2.5">
        <MacroBar label="Protein" value={macros.protein} pct={proteinPct} barColor="bg-clinical-blue" unit="g" />
        <MacroBar label="Carbs" value={macros.carbs} pct={carbsPct} barColor="bg-clinical-gold" unit="g" />
        <MacroBar label="Fat" value={macros.fat} pct={fatPct} barColor="bg-clinical-sage" unit="g" />
        <MacroBar label="Fiber" value={macros.fiber} pct={Math.min((macros.fiber / 30) * 100, 100)} barColor="bg-emerald-400" unit="g" />
        {typeof sodiumMg === "number" && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-clinical-zinc">Sodium</span>
            <span className="tabular-nums text-white font-medium">
              {sodiumMg}mg
              <span className="text-clinical-zinc-muted text-[10px] ml-1">
                ({Math.round((sodiumMg / 2300) * 100)}% DV)
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function MacroBar({
  label,
  value,
  pct,
  barColor,
  unit,
}: {
  label: string;
  value: number;
  pct: number;
  barColor: string;
  unit: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-clinical-zinc flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${barColor}`} />
          {label}
        </span>
        <span className="tabular-nums text-white font-medium">
          {value}
          {unit}
        </span>
      </div>
      <div className="h-1.5 bg-clinical-surface-elevated rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}
