import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
} from "@/lib/preferencesApi";
import { usePreferences } from "@/lib/preferencesContext";
import { Sparkles, Save, Stethoscope, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  recommendPlansForPreferences,
  PLAN_GOAL_LABEL,
} from "@/lib/rdPlans";

export default function Preferences() {
  const { preferences, loading, unauthorized, update, refresh } =
    usePreferences();

  const [dietaryStyle, setDietaryStyle] = useState<DietaryStyle>("omnivore");
  const [goal, setGoal] = useState<WellnessGoal>("general_wellness");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");
  const [spiceLevel, setSpiceLevel] = useState<SpiceLevel>("medium");
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState("");
  const [calorieTarget, setCalorieTarget] = useState("");
  const [proteinTargetGrams, setProteinTargetGrams] = useState("");
  const [carbsTargetGrams, setCarbsTargetGrams] = useState("");
  const [fatTargetGrams, setFatTargetGrams] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!preferences) return;
    setDietaryStyle(preferences.dietaryStyle);
    setGoal(preferences.goal);
    setActivityLevel(preferences.activityLevel);
    setSpiceLevel(preferences.spiceLevel);
    setCuisines(preferences.cuisines);
    setAllergens(preferences.allergens);
    setDislikes(preferences.dislikedIngredients.join(", "));
    setCalorieTarget(
      preferences.calorieTarget ? String(preferences.calorieTarget) : "",
    );
    setProteinTargetGrams(
      preferences.proteinTargetGrams
        ? String(preferences.proteinTargetGrams)
        : "",
    );
    setCarbsTargetGrams(
      preferences.carbsTargetGrams
        ? String(preferences.carbsTargetGrams)
        : "",
    );
    setFatTargetGrams(
      preferences.fatTargetGrams ? String(preferences.fatTargetGrams) : "",
    );
  }, [preferences]);

  const toggle = (
    setter: (v: string[]) => void,
    list: string[],
    value: string,
  ) => {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const parseNum = (v: string, lo: number, hi: number) => {
    if (!v.trim()) return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return null;
    return Math.max(lo, Math.min(hi, n));
  };

  const handleSave = async () => {
    setSaving(true);
    const out = await update({
      dietaryStyle,
      goal,
      activityLevel,
      spiceLevel,
      cuisines,
      allergens,
      dislikedIngredients: dislikes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      calorieTarget: parseNum(calorieTarget, 800, 6000),
      proteinTargetGrams: parseNum(proteinTargetGrams, 20, 400),
      carbsTargetGrams: parseNum(carbsTargetGrams, 0, 800),
      fatTargetGrams: parseNum(fatTargetGrams, 0, 300),
      markQuizComplete: true,
    });
    setSaving(false);
    if (!out) {
      toast.error("Could not save preferences");
      return;
    }
    toast.success("Preferences saved");
    void refresh();
  };

  if (unauthorized) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center space-y-4">
        <h1 className="font-serif text-2xl text-white">Sign in to set preferences</h1>
        <p className="text-sm text-clinical-zinc">
          We use your taste profile to personalize the menu.
        </p>
        <Link to="/login">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center text-sm text-clinical-zinc">
        Loading your preferences…
      </div>
    );
  }

  const recommendations = recommendPlansForPreferences(preferences, 3);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-3xl text-white">Your Preferences</h1>
        <p className="text-xs uppercase tracking-[0.18em] text-clinical-zinc-muted font-medium">
          Used by menu, dish detail, and recommendations
        </p>
      </div>

      {preferences && recommendations.length > 0 && (
        <Card className="bg-gradient-to-br from-clinical-gold/10 to-transparent border-clinical-gold/30">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-clinical-gold" />
                <h2 className="text-sm font-semibold text-clinical-gold uppercase tracking-wider">
                  RD plans matched to your profile
                </h2>
              </div>
              <Link
                to="/plans"
                className="text-[11px] text-clinical-gold hover:underline flex items-center gap-1"
              >
                Browse all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {recommendations.map(({ plan, reasons }) => (
                <Link to={`/plans/${plan.slug}`} key={plan.slug}>
                  <div className="rounded-lg border border-clinical-border bg-clinical-surface p-3 hover:border-clinical-gold/40 transition-all h-full space-y-1.5">
                    <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 text-[9px]">
                      {PLAN_GOAL_LABEL[plan.goal]}
                    </Badge>
                    <h3 className="text-sm font-semibold text-white">
                      {plan.name}
                    </h3>
                    <p className="text-[10px] text-clinical-sage line-clamp-2">
                      {reasons[0]}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-6 space-y-6">
          <Section title="Dietary style">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(DIETARY_STYLE_LABEL) as DietaryStyle[]).map((d) => (
                <Pill
                  key={d}
                  active={dietaryStyle === d}
                  onClick={() => setDietaryStyle(d)}
                >
                  {DIETARY_STYLE_LABEL[d]}
                </Pill>
              ))}
            </div>
          </Section>

          <Separator className="bg-clinical-surface-elevated" />

          <Section title="Wellness goal">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(GOAL_LABEL) as WellnessGoal[]).map((g) => (
                <Pill key={g} active={goal === g} onClick={() => setGoal(g)}>
                  {GOAL_LABEL[g]}
                </Pill>
              ))}
            </div>
          </Section>

          <Section title="Activity level">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
                <Pill
                  key={a}
                  active={activityLevel === a}
                  onClick={() => setActivityLevel(a)}
                >
                  {ACTIVITY_LABEL[a]}
                </Pill>
              ))}
            </div>
          </Section>

          <Separator className="bg-clinical-surface-elevated" />

          <Section title="Cuisines you enjoy">
            <div className="flex flex-wrap gap-2">
              {CUISINE_OPTIONS.map((c) => (
                <Pill
                  key={c}
                  active={cuisines.includes(c)}
                  onClick={() => toggle(setCuisines, cuisines, c)}
                  className="capitalize"
                >
                  {c}
                </Pill>
              ))}
            </div>
          </Section>

          <Section title="Spice tolerance">
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(SPICE_LABEL) as SpiceLevel[]).map((s) => (
                <Pill
                  key={s}
                  active={spiceLevel === s}
                  onClick={() => setSpiceLevel(s)}
                >
                  {SPICE_LABEL[s]}
                </Pill>
              ))}
            </div>
          </Section>

          <Separator className="bg-clinical-surface-elevated" />

          <Section title="Allergens — these dishes are blocked">
            <div className="flex flex-wrap gap-2">
              {ALLERGEN_OPTIONS.map((a) => (
                <Pill
                  key={a}
                  active={allergens.includes(a)}
                  onClick={() => toggle(setAllergens, allergens, a)}
                  className="capitalize"
                  variant="warning"
                >
                  {a}
                </Pill>
              ))}
            </div>
          </Section>

          <Section title="Disliked ingredients (comma-separated)">
            <Input
              value={dislikes}
              onChange={(e) => setDislikes(e.target.value)}
              placeholder="e.g. mushrooms, olives, cilantro"
              className="bg-clinical-surface-elevated border-clinical-border text-sm"
            />
          </Section>

          <Separator className="bg-clinical-surface-elevated" />

          <Section title="Daily macro targets (optional)">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <NumField
                label="Calories"
                value={calorieTarget}
                onChange={setCalorieTarget}
                placeholder="2000"
              />
              <NumField
                label="Protein (g)"
                value={proteinTargetGrams}
                onChange={setProteinTargetGrams}
                placeholder="120"
              />
              <NumField
                label="Carbs (g)"
                value={carbsTargetGrams}
                onChange={setCarbsTargetGrams}
                placeholder="220"
              />
              <NumField
                label="Fat (g)"
                value={fatTargetGrams}
                onChange={setFatTargetGrams}
                placeholder="60"
              />
            </div>
          </Section>

          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 mt-2 bg-clinical-surface/95 backdrop-blur border-t border-clinical-border flex items-center justify-end gap-2 z-10">
            <span className="text-[11px] text-clinical-zinc mr-auto">
              Changes apply to future menu suggestions and meal plans.
            </span>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs font-semibold gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving…" : "Save preferences"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-clinical-gold">
            <Sparkles className="w-4 h-4" />
            <h2 className="text-sm font-semibold">How we use this</h2>
          </div>
          <p className="text-xs text-clinical-zinc leading-relaxed">
            The menu hides dishes that contain your allergens, deprioritizes
            dishes with disliked ingredients, surfaces a "Why this for you"
            hint when something matches, and shows a Smart Swap suggestion when
            a dish conflicts with your profile.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-clinical-label">{title}</Label>
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  className = "",
  variant = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "warning";
}) {
  const activeCls =
    variant === "warning"
      ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
      : "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-2 rounded-md border transition-all ${
        active
          ? activeCls
          : "border-clinical-border text-clinical-zinc hover:text-white"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc-muted">
        {label}
      </Label>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-clinical-surface-elevated border-clinical-border text-sm"
      />
    </div>
  );
}
