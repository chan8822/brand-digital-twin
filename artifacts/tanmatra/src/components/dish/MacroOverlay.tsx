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
}

export default function MacroOverlay({ macros, rdVerified = false, compact = false }: MacroOverlayProps) {
  const total = macros.protein + macros.carbs + macros.fat;
  const proteinPct = Math.round((macros.protein / total) * 100);
  const carbsPct = Math.round((macros.carbs / total) * 100);
  const fatPct = Math.round((macros.fat / total) * 100);

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {rdVerified && (
          <Badge variant="outline" className="h-5 px-1.5 text-[9px] border-clinical-sage/40 text-clinical-sage gap-0.5 bg-clinical-sage/10">
            <ShieldCheck className="w-2.5 h-2.5" />
            RD
          </Badge>
        )}
        <span className="text-clinical-data text-[10px] text-clinical-zinc flex items-center gap-1">
          <Flame className="w-2.5 h-2.5 text-orange-400" />
          {macros.calories} kcal
        </span>
        <span className="text-clinical-data text-[10px] text-clinical-blue">P {macros.protein}g</span>
        <span className="text-clinical-data text-[10px] text-clinical-gold">C {macros.carbs}g</span>
        <span className="text-clinical-data text-[10px] text-clinical-sage">F {macros.fat}g</span>
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
      <div className="h-1.5 bg-clinical-slate/30 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}
