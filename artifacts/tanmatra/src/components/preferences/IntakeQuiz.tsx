import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, AlertCircle, Sparkles, ArrowRight, Stethoscope } from "lucide-react";
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

// `STEPS.length` is the form steps; once the user saves, we show a results
// surface in-dialog rather than redirecting away — the highest-leverage
// conversion moment in the product.
const RESULTS_STEP = STEPS.length;

export default function IntakeQuiz({ open, onOpenChange }: IntakeQuizProps) {
  const { preferences, update } = usePreferences();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<QuizState>(() => initialState(preferences));
  const [saving, setSaving] = useState(false);
  const [showManualTargets, setShowManualTargets] = useState(false);
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
      // Restore the user's most-advanced answered step on reopen so they
      // resume where they left off — paired with the per-step
      // `update()` call below, no answers are silently lost when the
      // user closes the dialog mid-quiz.
      const initial = initialState(preferences);
      setState(initial);
      let resumeAt = 0;
      if (preferences?.dietaryStyle) resumeAt = 1;
      if (preferences?.goal && preferences?.activityLevel) resumeAt = 2;
      if (preferences?.cuisines?.length || preferences?.spiceLevel) resumeAt = 3;
      if (preferences?.allergens?.length) resumeAt = 4;
      // Cap at last form step — the results step is only entered after a
      // successful save in onNext.
      setStep(Math.min(resumeAt, STEPS.length - 1));
      setShowManualTargets(
        Boolean(
          preferences?.calorieTarget ||
            preferences?.proteinTargetGrams ||
            preferences?.carbsTargetGrams ||
            preferences?.fatTargetGrams,
        ),
      );
    }
  }, [open, preferences]);

  /** Build a partial-progress patch from the current state, WITHOUT
   *  marking the quiz complete. Called between steps so progress
   *  survives a mid-quiz close. */
  const buildPartialPatch = (s: QuizState): PreferencesPatch => ({
    dietaryStyle: s.dietaryStyle,
    goal: s.goal,
    activityLevel: s.activityLevel,
    spiceLevel: s.spiceLevel,
    cuisines: s.cuisines,
    allergens: s.allergens,
    dislikedIngredients: s.dislikedIngredients
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    calorieTarget: clampNum(s.calorieTarget, 800, 6000),
    proteinTargetGrams: clampNum(s.proteinTargetGrams, 20, 400),
    carbsTargetGrams: clampNum(s.carbsTargetGrams, 0, 800),
    fatTargetGrams: clampNum(s.fatTargetGrams, 0, 300),
    markQuizComplete: false,
  });

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
      // Stay in the dialog and reveal the results step rather than
      // hard-redirecting — the user gets to see what they unlocked
      // (RD-matched plans, free RD consult, personalized menu) and
      // pick their next action instead of being dumped on /menu.
      setStep(RESULTS_STEP);
    }
  };

  const onNext = () => {
    if (step < STEPS.length - 1) {
      // Persist partial progress before advancing so a mid-quiz close
      // doesn't lose answers. Failures are silent — the user will see
      // the real toast on final save.
      void update(buildPartialPatch(state));
      setStep(step + 1);
    } else void handleSave(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto bg-clinical-surface border-clinical-border sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-white font-serif">
            {step === RESULTS_STEP
              ? "You're set up — here's what's next"
              : `Metabolic assessment · Step ${step + 1} of ${STEPS.length}`}
          </DialogTitle>
          <DialogDescription className="text-clinical-zinc text-xs">
            {step === RESULTS_STEP
              ? "Your menu and recommendations are personalized to your goal."
              : `${STEPS[step]} — RD-validated, ~2 minutes. Edit any time from Preferences.`}
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
                          : "border-clinical-border text-clinical-zinc hover:text-white"
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
                            : "border-clinical-border text-clinical-zinc hover:text-white"
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
                            : "border-clinical-border text-clinical-zinc hover:text-white"
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
                            : "border-clinical-border text-clinical-zinc hover:text-white"
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
                            : "border-clinical-border text-clinical-zinc hover:text-white"
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
                            : "border-clinical-border text-clinical-zinc hover:text-white"
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
                  className="bg-clinical-surface-elevated border-clinical-border text-sm"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-clinical-gold/30 bg-clinical-gold/5 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-clinical-gold mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white leading-tight">
                      Recommended for you
                    </p>
                    <p className="text-[11px] text-clinical-zinc leading-tight mt-0.5">
                      Daily targets based on your goal &amp; activity level —
                      tap to apply.
                    </p>
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
                  className="w-full min-h-11 text-xs px-3 py-2.5 rounded-md bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold"
                >
                  Calculate my targets
                </button>
                {(state.calorieTarget || state.proteinTargetGrams) && (
                  <div className="grid grid-cols-4 gap-1.5 pt-1 text-[10px] tabular-nums">
                    {[
                      ["kcal", state.calorieTarget],
                      ["P g", state.proteinTargetGrams],
                      ["C g", state.carbsTargetGrams],
                      ["F g", state.fatTargetGrams],
                    ].map(([k, v]) => (
                      <div key={k} className="text-center rounded bg-clinical-surface-elevated/60 py-1">
                        <div className="text-clinical-gold font-bold leading-none">{v || "—"}</div>
                        <div className="text-clinical-zinc leading-none mt-0.5">{k}</div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-clinical-zinc-muted leading-snug">
                  Estimated against an average 70 kg adult — refine in Preferences once you add weight, height &amp; age for a true Mifflin-St Jeor calculation.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowManualTargets((v) => !v)}
                aria-expanded={showManualTargets}
                className="w-full text-[11px] text-clinical-zinc hover:text-white inline-flex items-center justify-center gap-1.5 py-2"
              >
                {showManualTargets ? "Hide" : "Customize manually"}
                <span aria-hidden>{showManualTargets ? "▲" : "▼"}</span>
              </button>

              {showManualTargets && (
                <>
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
                        className="bg-clinical-surface-elevated border-clinical-border text-sm"
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
                        className="bg-clinical-surface-elevated border-clinical-border text-sm"
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
                        className="bg-clinical-surface-elevated border-clinical-border text-sm"
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
                        className="bg-clinical-surface-elevated border-clinical-border text-sm"
                      />
                    </div>
                  </div>
                  <p
                    id={targetsHintId}
                    className="text-[11px] text-clinical-zinc-muted"
                  >
                    Optional — leave blank if you're not tracking macros yet.
                    Out-of-range values are clamped on save (kcal 800-6000,
                    protein 20-400 g, carbs 0-800 g, fat 0-300 g).
                  </p>
                </>
              )}
            </div>
          )}

          {step === RESULTS_STEP && (
            <ResultsStep
              goal={state.goal}
              calorieTarget={clampNum(state.calorieTarget, 800, 6000)}
              proteinTarget={clampNum(state.proteinTargetGrams, 20, 400)}
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>

        {step !== RESULTS_STEP && (
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
              className="min-h-11 text-xs text-clinical-zinc"
            >
              {step === 0 ? "Skip for now" : "Back"}
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={onNext}
              className="min-h-11 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs font-semibold"
            >
              {step === STEPS.length - 1 ? "Save & see results" : "Next"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Results step — replaces the old `window.location.href` redirect to /menu.
// Shown in-dialog after a successful save so the user gets to *see* the
// personalization payload (matched plan + calorie/protein anchor) and pick
// a next action — Browse menu, Book free RD, or Open weekly planner.
// ---------------------------------------------------------------------------

function ResultsStep({
  goal,
  calorieTarget,
  proteinTarget,
  onClose,
}: {
  goal: WellnessGoal;
  calorieTarget: number | null;
  proteinTarget: number | null;
  onClose: () => void;
}) {
  // Map the user's goal to the most relevant protocol page so the primary
  // CTA points at the protocol that matches their stated outcome.
  const recommendation = useMemo<{
    label: string;
    summary: string;
    plan: { slug: string; title: string };
    protocolHref: string;
  }>(() => {
    if (goal === "gain_muscle") {
      return {
        label: "Performance protocol",
        summary:
          "High-protein meals timed around training, leucine-rich, RD-tuned for muscle synthesis.",
        plan: { slug: "performance-builder", title: "Performance Builder Plan" },
        protocolHref: "/performance",
      };
    }
    if (goal === "lose_weight") {
      return {
        label: "Wellness protocol — fat-loss track",
        summary:
          "Calorie-controlled, satiety-first dishes. Protein anchor protected; carbs cycled.",
        plan: { slug: "wellness-cut", title: "Wellness Cut Plan" },
        protocolHref: "/wellness",
      };
    }
    if ((goal as string) === "manage_condition") {
      return {
        label: "Clinical protocol",
        summary:
          "ADA / low-glycaemic, sodium-aware, RD-monitored. Pair with an RD consult for a tailored plan.",
        plan: { slug: "clinical-baseline", title: "Clinical Baseline Plan" },
        protocolHref: "/clinical",
      };
    }
    return {
      label: "Wellness protocol",
      summary:
        "Everyday balanced, RD-validated meals. Macro anchor matched to your activity level.",
      plan: { slug: "wellness-everyday", title: "Wellness Everyday Plan" },
      protocolHref: "/wellness",
    };
  }, [goal]);

  return (
    <div className="space-y-4 py-1">
      {/* Outcome stat row — makes the personalization tangible */}
      {(calorieTarget || proteinTarget) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-clinical-gold/10 border border-clinical-gold/30 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-clinical-zinc">Daily kcal</div>
            <div className="text-xl font-bold text-clinical-gold tabular-nums leading-tight">
              {calorieTarget ?? "—"}
            </div>
          </div>
          <div className="rounded-md bg-clinical-gold/10 border border-clinical-gold/30 p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-clinical-zinc">Protein</div>
            <div className="text-xl font-bold text-clinical-gold tabular-nums leading-tight">
              {proteinTarget ?? "—"}<span className="text-sm">g</span>
            </div>
          </div>
        </div>
      )}

      {/* Primary recommendation — protocol + plan match */}
      <div className="rounded-lg border border-clinical-gold/30 bg-clinical-gold/5 p-4 space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
            Matched to your goal
          </p>
          <p className="text-sm font-semibold text-white mt-0.5">
            {recommendation.label}
          </p>
          <p className="text-xs text-clinical-zinc leading-snug mt-1">
            {recommendation.summary}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <Link
            to={`/plans/${recommendation.plan.slug}`}
            onClick={onClose}
            className="min-h-11 inline-flex items-center justify-between gap-2 px-3 rounded-md bg-clinical-gold text-[#050505] text-xs font-semibold hover:bg-clinical-gold/90"
          >
            <span>View {recommendation.plan.title}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
          <Link
            to={recommendation.protocolHref}
            onClick={onClose}
            className="min-h-11 inline-flex items-center justify-between gap-2 px-3 rounded-md border border-clinical-border text-xs text-white hover:bg-white/5"
          >
            <span>Read about the {recommendation.label.split(" ")[0]} protocol</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Free 15-min RD consult — highest-LTV next step */}
      <Link
        to="/rd"
        onClick={onClose}
        className="flex items-center gap-3 rounded-md border border-clinical-sage/40 bg-clinical-sage/5 px-3 py-3 hover:bg-clinical-sage/10"
      >
        <Stethoscope className="w-5 h-5 text-clinical-sage shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white leading-tight">
            Talk to an RD — first 15 min free
          </p>
          <p className="text-[11px] text-clinical-zinc leading-tight mt-0.5">
            Validate your plan with a registered dietitian.
          </p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-clinical-sage shrink-0" aria-hidden="true" />
      </Link>

      {/* Tertiary: just browse */}
      <Link
        to="/menu?personalized=1"
        onClick={onClose}
        className="block text-center text-[11px] text-clinical-zinc hover:text-white py-2"
      >
        Or browse the personalized menu →
      </Link>
    </div>
  );
}
