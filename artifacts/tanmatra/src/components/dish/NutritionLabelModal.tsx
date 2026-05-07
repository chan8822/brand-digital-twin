import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollText, ShieldCheck, Leaf, AlertTriangle, Sprout } from "lucide-react";
import type { DishData } from "@workspace/menu-catalog";
import { buildNutritionLabel, getSourcingForDish } from "@/lib/nutritionLabel";

interface Props {
  dish: DishData;
}

export default function NutritionLabelModal({ dish }: Props) {
  const label = buildNutritionLabel(dish);
  const sourcing = getSourcingForDish(dish);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-[11px] border-clinical-slate/30 text-clinical-zinc hover:text-clinical-gold hover:border-clinical-gold/40"
        >
          <ScrollText className="w-3.5 h-3.5" />
          Full nutrition label & sourcing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-clinical-surface border-clinical-slate/30 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-xl">{dish.name}</DialogTitle>
          <DialogDescription className="text-xs text-clinical-zinc">
            Nutrition Facts &middot; Serving size: {label.servingSize}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Calories banner */}
          <div className="rounded-lg border-2 border-clinical-gold/40 bg-clinical-gold/5 p-4 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-widest text-clinical-zinc font-semibold">
              Calories
            </span>
            <span className="tabular-nums text-3xl font-bold text-clinical-gold">
              {label.calories}
            </span>
          </div>

          {/* Macros table */}
          <div className="rounded-lg border border-clinical-slate/20 overflow-hidden">
            <div className="bg-clinical-surface-elevated px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-clinical-zinc font-semibold">
              <span>Macros &amp; key nutrients</span>
              <span>Per serving</span>
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-clinical-slate/15">
                <NutRow label="Total fat" value={`${label.macros.fat} g`} />
                <NutRow
                  label="Saturated fat"
                  value={`${label.macros.saturatedFat} g`}
                  indented
                />
                <NutRow label="Sodium" value={`${label.macros.sodiumMg} mg`} />
                <NutRow label="Total carbohydrate" value={`${label.macros.carbs} g`} />
                <NutRow label="Dietary fibre" value={`${label.macros.fiber} g`} indented />
                <NutRow label="Total sugars" value={`${label.macros.sugar} g`} indented />
                <NutRow label="Protein" value={`${label.macros.protein} g`} bold />
              </tbody>
            </table>
          </div>

          {/* Micros */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-clinical-zinc/70 font-semibold mb-2">
              Micronutrients (estimated)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {label.micros.map((mn) => (
                <div
                  key={mn.key}
                  className="rounded-md border border-clinical-slate/20 bg-clinical-surface-elevated px-3 py-2"
                >
                  <p className="text-[10px] uppercase tracking-wide text-clinical-zinc">
                    {mn.label}
                  </p>
                  <p className="tabular-nums text-sm text-white font-semibold">
                    {mn.value}
                    <span className="text-[10px] text-clinical-zinc font-normal ml-0.5">
                      {mn.unit}
                    </span>
                  </p>
                  <p className="text-[10px] text-clinical-gold tabular-nums">
                    {mn.dailyTargetPct}% DV
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-clinical-zinc/60 mt-2 leading-relaxed">
              % Daily Value based on a 2,000 kcal reference diet. Micronutrient values
              estimated from ingredient composition; precise values are batch-tested
              monthly.
            </p>
          </div>

          {/* Claims */}
          {(label.containsClaims.length > 0 || label.freeFromClaims.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {label.containsClaims.length > 0 && (
                <div className="rounded-lg border border-clinical-sage/30 bg-clinical-sage/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-clinical-sage" />
                    <p className="text-[10px] uppercase tracking-widest text-clinical-sage font-semibold">
                      Health highlights
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {label.containsClaims.map((c) => (
                      <Badge
                        key={c}
                        variant="outline"
                        className="border-clinical-sage/40 text-clinical-sage bg-clinical-sage/10 text-[10px]"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {label.freeFromClaims.length > 0 && (
                <div className="rounded-lg border border-clinical-blue/30 bg-clinical-blue/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Leaf className="w-3.5 h-3.5 text-clinical-blue" />
                    <p className="text-[10px] uppercase tracking-widest text-clinical-blue font-semibold">
                      Free from
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {label.freeFromClaims.map((c) => (
                      <Badge
                        key={c}
                        variant="outline"
                        className="border-clinical-blue/40 text-clinical-blue bg-clinical-blue/10 text-[10px]"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Allergens */}
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
              <p className="text-[10px] uppercase tracking-widest text-orange-400 font-semibold">
                Allergens
              </p>
            </div>
            {label.allergens.length > 0 ? (
              <p className="text-xs text-clinical-zinc">
                Contains: {label.allergens.join(", ")}.
              </p>
            ) : (
              <p className="text-xs text-clinical-zinc">
                No common allergens reported in this dish.
              </p>
            )}
            <p className="text-[10px] text-clinical-zinc/60 mt-1 leading-relaxed">
              Prepared in a kitchen that also handles dairy, gluten, soy, and tree nuts.
              Cross-contact is possible.
            </p>
          </div>

          <Separator className="bg-clinical-slate/20" />

          {/* Ingredients */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-clinical-zinc/70 font-semibold mb-2">
              Ingredients (in descending order)
            </p>
            <p className="text-xs text-clinical-zinc leading-relaxed">
              {dish.ingredients.join(" · ")}.
            </p>
          </div>

          {/* Sourcing */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sprout className="w-3.5 h-3.5 text-clinical-sage" />
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc/70 font-semibold">
                Sourcing &amp; preparation
              </p>
            </div>
            <ul className="space-y-2">
              {sourcing.map((s) => (
                <li
                  key={s.area}
                  className="text-xs text-clinical-zinc leading-relaxed"
                >
                  <span className="text-white font-medium">{s.area}: </span>
                  {s.detail}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NutRow({
  label,
  value,
  indented,
  bold,
}: {
  label: string;
  value: string;
  indented?: boolean;
  bold?: boolean;
}) {
  return (
    <tr>
      <td
        className={`px-3 py-2 ${indented ? "pl-8 text-clinical-zinc" : "text-white"} ${
          bold ? "font-semibold" : ""
        }`}
      >
        {label}
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums ${
          bold ? "text-white font-semibold" : "text-clinical-zinc"
        }`}
      >
        {value}
      </td>
    </tr>
  );
}
