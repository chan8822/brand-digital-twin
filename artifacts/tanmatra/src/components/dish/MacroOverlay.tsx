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
  const proteinPct = total > 0 ? Math.round((macros.protein / total) * 100) : 0;
  const carbsPct = total > 0 ? Math.round((macros.carbs / total) * 100) : 0;
  const fatPct = total > 0 ? Math.round((macros.fat / total) * 100) : 0;

  if (compact) {
    // Circumference of circle with r = 16 is 2 * pi * 16 = 100.53
    const r = 16;
    const C = 2 * Math.PI * r;
    
    const lenP = (proteinPct / 100) * C;
    const lenC = (carbsPct / 100) * C;
    const lenF = (fatPct / 100) * C;

    return (
      <div
        className="flex items-center gap-2.5 p-1.5 rounded-xl bg-[#050505]/85 border border-clinical-border/40 backdrop-blur-md shadow-clinical-lg"
        role="group"
        aria-label="Macro nutrient distribution ratios"
      >
        {/* SVG Macro Progress Ring */}
        <div className="relative w-10 h-10 shrink-0 group/ring">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
            {/* Background circle */}
            <circle
              cx="18"
              cy="18"
              r={r}
              fill="transparent"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="3"
            />
            {/* Protein segment */}
            {lenP > 0 && (
              <circle
                cx="18"
                cy="18"
                r={r}
                fill="transparent"
                stroke="#6BA3C8"
                strokeWidth="3.5"
                strokeDasharray={`${lenP} ${C}`}
                strokeDashoffset="0"
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            )}
            {/* Carbs segment */}
            {lenC > 0 && (
              <circle
                cx="18"
                cy="18"
                r={r}
                fill="transparent"
                stroke="#D4AF37"
                strokeWidth="3.5"
                strokeDasharray={`${lenC} ${C}`}
                strokeDashoffset={`-${lenP}`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            )}
            {/* Fat segment */}
            {lenF > 0 && (
              <circle
                cx="18"
                cy="18"
                r={r}
                fill="transparent"
                stroke="#7D9E7E"
                strokeWidth="3.5"
                strokeDasharray={`${lenF} ${C}`}
                strokeDashoffset={`-${lenP + lenC}`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            )}
          </svg>
          {/* Center Calorie Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#050505] dark:text-white">
            <span className="text-[9px] font-bold leading-none tabular-nums">{macros.calories}</span>
            <span className="text-[6px] opacity-60 font-medium uppercase tracking-tight">kcal</span>
          </div>
        </div>

        {/* Precise Nutrient Breakdown Column */}
        <div className="flex flex-col gap-0.5 justify-center">
          <div className="flex items-center gap-1.5 text-[9px] leading-none font-semibold text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-clinical-blue" />
            <span className="text-clinical-blue-muted">P</span>
            <span className="tabular-nums">{macros.protein}g</span>
            <span className="opacity-40 text-[8px]">({proteinPct}%)</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] leading-none font-semibold text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-clinical-gold" />
            <span className="text-clinical-gold-muted">C</span>
            <span className="tabular-nums">{macros.carbs}g</span>
            <span className="opacity-40 text-[8px]">({carbsPct}%)</span>
          </div>
          <div className="flex items-center gap-1.5 text-[9px] leading-none font-semibold text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-clinical-sage" />
            <span className="text-clinical-sage-muted">F</span>
            <span className="tabular-nums">{macros.fat}g</span>
            <span className="opacity-40 text-[8px]">({fatPct}%)</span>
          </div>
        </div>

        {rdVerified && (
          <div className="ml-auto pl-1 border-l border-clinical-border/20 flex items-center shrink-0">
            <Badge
              variant="outline"
              className="h-6 px-1 text-[8px] border-clinical-sage/30 text-clinical-sage gap-0.5 bg-clinical-sage/15 rounded-md font-bold"
              aria-label="Verified by Tanmatra Registered Dietitian advisory board"
            >
              <ShieldCheck className="w-2.5 h-2.5" aria-hidden="true" />
              RD
            </Badge>
          </div>
        )}
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
