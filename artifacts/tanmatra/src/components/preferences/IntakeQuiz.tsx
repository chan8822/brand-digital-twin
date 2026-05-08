import { useEffect, useId, useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ALLERGEN_OPTIONS,
  CUISINE_OPTIONS,
  DIETARY_STYLE_LABEL,
  GOAL_LABEL,
  ACTIVITY_LABEL,
  SPICE_LABEL,
  type DietaryStyle,
  type SpiceLevel,
  type ActivityLevel,
  type WellnessGoal,
  type PreferencesPatch,
  type UserPreferences,
} from "@/lib/preferencesApi";
import { usePreferences } from "@/lib/preferencesContext";

interface QuizState {
  dietaryStyle: DietaryStyle;
  goal: WellnessGoal;
  activityLevel: ActivityLevel;
  spiceLevel: SpiceLevel;
  cuisines: string[];
  allergens: string[];
  dislikedIngredients: string;
  calorieTarget: string;
  proteinTargetGrams: string;
  carbsTargetGrams: string;
  fatTargetGrams: string;
}

function initialState(prefs: UserPreferences | null): QuizState {
  return {
    dietaryStyle: prefs?.dietaryStyle ?? "omnivore",
    goal: prefs?.goal ?? "general_wellness",
    activityLevel: prefs?.activityLevel ?? "moderate",
    spiceLevel: prefs?.spiceLevel ?? "medium",
    cuisines: prefs?.cuisines ?? [],
    allergens: prefs?.allergens ?? [],
    dislikedIngredients: (prefs?.dislikedIngredients ?? []).join(", "),
    calorieTarget: prefs?.calorieTarget ? String(prefs.calorieTarget) : "",
    proteinTargetGrams: prefs?.proteinTargetGrams
      ? String(prefs.proteinTargetGrams)
      : "",
    carbsTargetGrams: prefs?.carbsTargetGrams
      ? String(prefs.carbsTargetGrams)
      : "",
    fatTargetGrams: prefs?.fatTargetGrams ? String(prefs.fatTargetGrams) : "",
  };
}

function clampNum(v: string, lo: number, hi: number): number | null {
  if (!v.trim()) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}

const STEPS = ["Diet", "Goals", "Cuisine & Spice", "Allergens", "Targets"] as const;

function suggestedTargets(goal: WellnessGoal, activity: ActivityLevel) {
  const baseCal: Record<ActivityLevel, number> = {
    sedentary: 1700,
    light: 1900,
    moderate: 2100,
    active: 2400,
    very_active: 2700,
  } as Record<ActivityLevel, number>;
  let calories = baseCal[activity] ?? 2000;
  let proteinPerKgFactor = 1.6;
  if (goal === "lose_weight") {
    calories = Math.round(calories * 0.82);
    proteinPerKgFactor = 1.8;
  } else if (goal === "gain_muscle") {
    calories = Math.round(calories * 1.12);
    proteinPerKgFactor = 2.0;
  } else if (goal === "maintain") {
    proteinPerKgFactor = 1.6;
  }
  const assumedKg = 70;
  const protein = Math.round(assumedKg * proteinPerKgFactor);
  const proteinKcal = protein * 4;
  const fatKcal = Math.round(calories * 0.28);
  const fat = Math.round(fatKcal / 9);
  const carbsKcal = Math.max(0, calories - proteinKcal - fatKcal);
  const carbs = Math.round(carbsKcal / 4);
  return { calories, protein, carbs, fat };
}

interface IntakeQuizProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function IntakeQuiz({ open, onOpenChange }: IntakeQuizProps) {
  const { preferences, update } = usePreferences();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<QuizState>(() => initialState(preferences));
  const [saving, setSaving] = useState(false);
  // Stable ids so each Label can be aria-labelledby for its corresponding
  // radiogroup / group, instead of relying on visual proximity alone.
  const dietId = useId();
  const goalId = useId();
  const actId = useId();
  const cuisineId = useId();
  const spiceId = useId();
  const allergenId = useId();
  const targetsHintId = useId();

  useEffect(() => {
    if (open) {
      setStep(0);
      setState(initialState(preferences));
    }
  }, [open, preferences]);

  const toggleArr = (key: "cuisines" | "allergens", value: string) => {
    setState((s) => {
      const has = s[key].includes(value);
      return {
        ...s,
        [key]: has ? s[key].filter((v) => v !== value) : [...s[key], value],
      };
    });
  };

  const handleSave = async (markComplete: boolean) => {
    setSaving(true);
    const patch: PreferencesPatch = {
      dietaryStyle: state.dietaryStyle,
      goal: state.goal,
      activityLevel: state.activityLevel,
      spiceLevel: state.spiceLevel,
      cuisines: state.cuisines,
      allergens: state.allergens,
      dislikedIngredients: state.dislikedIngredients
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      calorieTarget: clampNum(state.calorieTarget, 800, 6000),
      proteinTargetGrams: clampNum(state.proteinTargetGrams, 20, 400),
      carbsTargetGrams: clampNum(state.carbsTargetGrams, 0, 800),
      fatTargetGrams: clampNum(state.fatTargetGrams, 0, 300),
      markQuizComplete: markComplete,
    };
    const out = await update(patch);
    setSaving(false);
    if (!out) {
      toast.error("Could not save preferences");
      return;
    }
    if (markComplete) {
      toast.success("Your menu is now personalized", {
        description: "Showing RD-matched dishes for your goal.",
        duration: 6000,
      });
      onOpenChange(false);
      window.location.href = `${import.meta.env.BASE_URL}menu?personalized=1`;
    }
  };

  const onNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else void handleSave(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-clinical-surface border-clinical-slate/30">
        <DialogHeader>
          <DialogTitle className="text-white font-serif">
            Quick taste profile · Step {step + 1} of {STEPS.length}
          </DialogTitle>
          <DialogDescription className="text-clinical-zinc text-xs">
            {STEPS[step]} — takes under a minute. You can edit any time from
            Preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === 0 && (
            <div className="space-y-3">
              <Label className="text-clinical-label" id={dietId}>
                Dietary style
              </Label>
              <div
                className="grid grid-cols-1 gap-2"
                role="radiogroup"
                aria-labelledby={dietId}
              >
                {(Object.keys(DIETARY_STYLE_LABEL) as DietaryStyle[]).map((d) => {
                  const active = state.dietaryStyle === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setState((s) => ({ ...s, dietaryStyle: d }))}
                      className={`text-left text-xs px-3 py-2 rounded-md border flex items-center gap-2 ${
                        active
                          ? "border-clinical-gold/60 bg-clinical-gold/10 text-clinical-gold"
                          : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                      }`}
                    >
                      {active && (
                        <Check
                          className="w-3.5 h-3.5 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span>{DIETARY_STYLE_LABEL[d]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-clinical-label" id={goalId}>
                  Wellness goal
                </Label>
                <div
                  className="grid grid-cols-2 gap-2"
                  role="radiogroup"
                  aria-labelledby={goalId}
                >
                  {(Object.keys(GOAL_LABEL) as WellnessGoal[]).map((g) => {
                    const active = state.goal === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setState((s) => ({ ...s, goal: g }))}
                        className={`text-xs px-3 py-2 rounded-md border inline-flex items-center justify-center gap-1.5 ${
                          active
                            ? "border-clinical-gold/60 bg-clinical-gold/10 text-clinical-gold"
                            : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                        }`}
                      >
                        {active && (
                          <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        {GOAL_LABEL[g]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-clinical-label" id={actId}>
                  Activity level
                </Label>
                <div
                  className="grid grid-cols-3 gap-2"
                  role="radiogroup"
                  aria-labelledby={actId}
                >
                  {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => {
                    const active = state.activityLevel === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() =>
                          setState((s) => ({ ...s, activityLevel: a }))
                        }
                        className={`text-xs px-3 py-2 rounded-md border inline-flex items-center justify-center gap-1.5 ${
                          active
                            ? "border-clinical-gold/60 bg-clinical-gold/10 text-clinical-gold"
                            : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                        }`}
                      >
                        {active && (
                          <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        {ACTIVITY_LABEL[a]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-clinical-label" id={cuisineId}>
                  Cuisines you enjoy (pick any)
                </Label>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-labelledby={cuisineId}
                >
                  {CUISINE_OPTIONS.map((c) => {
                    const active = state.cuisines.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleArr("cuisines", c)}
                        className={`text-xs px-3 py-1.5 rounded-full border capitalize inline-flex items-center gap-1.5 ${
                          active
                            ? "border-clinical-gold/60 bg-clinical-gold/10 text-clinical-gold"
                            : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                        }`}
                      >
                        {active && (
                          <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-clinical-label" id={spiceId}>
                  Spice tolerance
                </Label>
                <div
                  className="grid grid-cols-4 gap-2"
                  role="radiogroup"
                  aria-labelledby={spiceId}
                >
                  {(Object.keys(SPICE_LABEL) as SpiceLevel[]).map((s) => {
                    const active = state.spiceLevel === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setState((st) => ({ ...st, spiceLevel: s }))}
                        className={`text-xs px-2 py-2 rounded-md border inline-flex items-center justify-center gap-1 ${
                          active
                            ? "border-clinical-gold/60 bg-clinical-gold/10 text-clinical-gold"
                            : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                        }`}
                      >
                        {active && (
                          <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        {SPICE_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-clinical-label" id={allergenId}>
                  Allergens (we'll block these)
                </Label>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-labelledby={allergenId}
                >
                  {ALLERGEN_OPTIONS.map((a) => {
                    const active = state.allergens.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={active}
                        aria-label={
                          active
                            ? `Blocking ${a} — tap to allow`
                            : `${a} — tap to block`
                        }
                        onClick={() => toggleArr("allergens", a)}
                        className={`text-xs px-3 py-1.5 rounded-full border capitalize inline-flex items-center gap-1.5 ${
                          active
                            ? "border-orange-500/60 bg-orange-500/10 text-orange-400"
                            : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                        }`}
                      >
                        {/* Icon makes the "blocked" state distinguishable
                            without relying on the orange-vs-gold color
                            difference, which can be invisible to users with
                            red/green color-vision deficiency. */}
                        {active && (
                          <AlertCircle
                            className="w-3 h-3 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-clinical-label" htmlFor="dislikes">
                  Disliked ingredients (comma-separated)
                </Label>
                <Input
                  id="dislikes"
                  value={state.dislikedIngredients}
                  placeholder="e.g. mushrooms, olives, cilantro"
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      dislikedIngredients: e.target.value,
                    }))
                  }
                  className="bg-clinical-surface-elevated border-clinical-slate/30 text-sm"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-clinical-label" htmlFor="carbs">
                    Daily carbs (g)
                  </Label>
                  <Input
                    id="carbs"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={800}
                    placeholder="220"
                    aria-describedby={targetsHintId}
                    value={state.carbsTargetGrams}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        carbsTargetGrams: e.target.value,
                      }))
                    }
                    className="bg-clinical-surface-elevated border-clinical-slate/30 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-clinical-label" htmlFor="fat">
                    Daily fat (g)
                  </Label>
                  <Input
                    id="fat"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={300}
                    placeholder="60"
                    aria-describedby={targetsHintId}
                    value={state.fatTargetGrams}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        fatTargetGrams: e.target.value,
                      }))
                    }
                    className="bg-clinical-surface-elevated border-clinical-slate/30 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-clinical-label" htmlFor="cal">
                    Daily calories
                  </Label>
                  <Input
                    id="cal"
                    type="number"
                    inputMode="numeric"
                    min={800}
                    max={6000}
                    placeholder="2000"
                    aria-describedby={targetsHintId}
                    value={state.calorieTarget}
                    onChange={(e) =>
                      setState((s) => ({ ...s, calorieTarget: e.target.value }))
                    }
                    className="bg-clinical-surface-elevated border-clinical-slate/30 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-clinical-label" htmlFor="pro">
                    Daily protein (g)
                  </Label>
                  <Input
                    id="pro"
                    type="number"
                    inputMode="numeric"
                    min={20}
                    max={400}
                    placeholder="120"
                    aria-describedby={targetsHintId}
                    value={state.proteinTargetGrams}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        proteinTargetGrams: e.target.value,
                      }))
                    }
                    className="bg-clinical-surface-elevated border-clinical-slate/30 text-sm"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const t = suggestedTargets(state.goal, state.activityLevel);
                  setState((s) => ({
                    ...s,
                    calorieTarget: String(t.calories),
                    proteinTargetGrams: String(t.protein),
                    carbsTargetGrams: String(t.carbs),
                    fatTargetGrams: String(t.fat),
                  }));
                  toast.success("Targets calculated from your goal & activity");
                }}
                className="w-full text-xs px-3 py-2 rounded-md border border-clinical-gold/40 bg-clinical-gold/10 text-clinical-gold hover:bg-clinical-gold/15 font-semibold"
              >
                Calculate for me — based on goal &amp; activity
              </button>
              <p
                id={targetsHintId}
                className="text-[11px] text-clinical-zinc/70"
              >
                Optional — leave blank if you're not tracking macros yet. Out-of-range
                values are clamped on save (calories 800-6000, protein 20-400 g,
                carbs 0-800 g, fat 0-300 g). You can edit any time from
                Preferences.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              if (step === 0) {
                onOpenChange(false);
                return;
              }
              setStep(step - 1);
            }}
            className="text-xs text-clinical-zinc"
          >
            {step === 0 ? "Skip for now" : "Back"}
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={onNext}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs font-semibold"
          >
            {step === STEPS.length - 1 ? "Save preferences" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
