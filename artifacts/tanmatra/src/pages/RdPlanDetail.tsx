import { useMemo } from "react";
import { Link, useParams, Navigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getRdPlanBySlug,
  resolvePlanWeek,
  getRdAuthor,
  getPlanConflicts,
  formatRupees,
  PLAN_GOAL_LABEL,
} from "@/lib/rdPlans";
import { usePreferences } from "@/lib/preferencesContext";
import { ACCENT_CLASSES } from "@/lib/teamData";
import {
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  ChevronRight,
} from "lucide-react";

export default function RdPlanDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const plan = getRdPlanBySlug(slug);
  const { preferences } = usePreferences();

  const week = useMemo(() => (plan ? resolvePlanWeek(plan) : []), [plan]);
  const conflicts = useMemo(
    () => (plan ? getPlanConflicts(plan, preferences) : []),
    [plan, preferences],
  );

  if (!plan) return <Navigate to="/plans" replace />;
  const rd = getRdAuthor(plan);
  const accent = rd ? ACCENT_CLASSES[rd.accent] : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      <Link
        to="/plans"
        className="text-xs text-clinical-zinc hover:text-clinical-gold inline-flex items-center gap-1"
      >
        ← All plans
      </Link>

      {/* Hero */}
      <header className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        <div className="md:col-span-2 space-y-3">
          <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
            {PLAN_GOAL_LABEL[plan.goal]}
          </Badge>
          <h1 className="font-serif text-3xl sm:text-4xl text-white">
            {plan.name}
          </h1>
          <p className="text-sm text-clinical-zinc">{plan.tagline}</p>
          <p className="text-sm text-clinical-zinc-muted leading-relaxed">
            {plan.description}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {plan.badges.map((b) => (
              <span
                key={b}
                className="text-[10px] px-2 py-0.5 rounded-full bg-clinical-sage/10 border border-clinical-sage/30 text-clinical-sage uppercase tracking-wider"
              >
                <ShieldCheck className="inline w-2.5 h-2.5 mr-1" />
                {b}
              </span>
            ))}
          </div>
        </div>
        <Card className="bg-gradient-to-br from-clinical-gold/10 to-transparent border-clinical-gold/30">
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="kcal / day" value={plan.calorieTargetPerDay.toString()} />
              <Stat label="protein" value={`${plan.proteinTargetGrams}g`} />
              <Stat label="carbs" value={`${plan.carbsTargetGrams}g`} />
              <Stat label="fat" value={`${plan.fatTargetGrams}g`} />
            </div>
            <div className="border-t border-clinical-border pt-3">
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc-muted">
                from
              </p>
              <p className="text-2xl font-semibold text-clinical-gold tabular-nums">
                {formatRupees(plan.pricePerWeekPaise)}
                <span className="text-sm text-clinical-zinc font-normal">
                  {" "}
                  / week
                </span>
              </p>
            </div>
            <Link to={`/subscribe?plan=${plan.slug}`}>
              <Button className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-bold uppercase tracking-wider text-xs gap-1">
                Subscribe to this plan <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </header>

      {/* Author */}
      {rd && (
        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-5 flex flex-col sm:flex-row gap-5 items-start">
            <div
              className={`w-16 h-16 rounded-full ${accent?.bg} ring-2 ${accent?.ring} flex items-center justify-center text-lg font-bold ${accent?.text} shrink-0`}
            >
              {rd.initials}
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] uppercase tracking-widest text-clinical-zinc-muted">
                  Authored by
                </p>
                <Badge className={`text-[10px] ${accent?.chip}`}>
                  {rd.title}
                </Badge>
              </div>
              <Link
                to={`/team/${rd.slug}`}
                className="font-serif text-xl text-white hover:underline"
              >
                {rd.name}
              </Link>
              <p className="text-xs text-clinical-zinc leading-relaxed">{rd.bio}</p>
              <p className="text-[11px] text-clinical-zinc-muted">
                {rd.credentials.join(" · ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Allergen conflicts overlay */}
      {preferences && conflicts.length > 0 && (
        <Card className="bg-orange-500/5 border-orange-500/30">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-orange-300 uppercase tracking-wide">
                {conflicts.length} dish{conflicts.length === 1 ? "" : "es"} conflict with your profile
              </h3>
            </div>
            <p className="text-xs text-clinical-zinc">
              We'll auto-swap these at delivery so you get the same nutritional shape without your allergens or dislikes. Edit your{" "}
              <Link to="/preferences" className="text-clinical-gold underline">
                preferences
              </Link>{" "}
              any time.
            </p>
            <ul className="space-y-1.5">
              {conflicts.slice(0, 6).map((c, idx) => (
                <li
                  key={`${c.dayLabel}-${c.mealKey}-${idx}`}
                  className="text-[12px] text-clinical-zinc flex items-center gap-2 flex-wrap"
                >
                  <span className="text-orange-400 font-semibold tabular-nums w-12">
                    {c.dayLabel} {c.mealKey[0].toUpperCase()}
                  </span>
                  <span className="line-through opacity-70">{c.dish.name}</span>
                  {c.swap && (
                    <>
                      <ArrowRight className="w-3 h-3 text-clinical-sage" />
                      <Link
                        to={`/dish/${c.swap.slug}`}
                        className="text-clinical-sage hover:underline"
                      >
                        {c.swap.name}
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Sample week */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-white">Sample week</h2>
          <p className="text-[11px] text-clinical-zinc-muted uppercase tracking-widest">
            3 meals × 7 days
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {week.map((day) => (
            <Card
              key={day.label}
              className="bg-clinical-surface border-clinical-border"
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-clinical-gold uppercase tracking-widest">
                    {day.label}
                  </h3>
                </div>
                <MealRow label="Breakfast" dish={day.breakfast} />
                <MealRow label="Lunch" dish={day.lunch} />
                <MealRow label="Dinner" dish={day.dinner} />
                {day.rdTip && (
                  <div className="flex items-start gap-1.5 pt-2 border-t border-clinical-border text-[11px] text-clinical-sage">
                    <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="leading-snug">{day.rdTip}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Weekly notes */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl text-white">Weekly notes from {rd?.name ?? "your RD"}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plan.weeklyNotes.map((note) => (
            <Card
              key={note.weekNumber}
              className="bg-clinical-surface border-clinical-border"
            >
              <CardContent className="p-5 space-y-2">
                <Badge className={`text-[10px] ${accent?.chip ?? ""}`}>
                  Week {note.weekNumber}
                </Badge>
                <h3 className="text-sm font-semibold text-white">{note.title}</h3>
                <p className="text-xs text-clinical-zinc leading-relaxed">
                  {note.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function MealRow({
  label,
  dish,
}: {
  label: string;
  dish: { name: string; slug: string; macros: { calories: number; protein: number } } | undefined;
}) {
  if (!dish) {
    return (
      <div className="space-y-0.5">
        <p className="text-[10px] uppercase tracking-widest text-clinical-zinc-muted">
          {label}
        </p>
        <p className="text-xs text-clinical-zinc-muted italic">Curator's choice</p>
      </div>
    );
  }
  return (
    <Link to={`/dish/${dish.slug}`} className="block space-y-0.5 group">
      <p className="text-[10px] uppercase tracking-widest text-clinical-zinc-muted">
        {label}
      </p>
      <p className="text-xs text-white group-hover:text-clinical-gold transition-colors">
        {dish.name}
      </p>
      <p className="text-[10px] text-clinical-zinc-muted tabular-nums">
        {dish.macros.calories} kcal · {dish.macros.protein}g protein
      </p>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-clinical-border bg-clinical-surface-elevated px-2 py-1.5 text-center">
      <p className="text-[9px] uppercase tracking-widest text-clinical-zinc-muted">
        {label}
      </p>
      <p className="text-sm font-semibold text-clinical-gold tabular-nums">
        {value}
      </p>
    </div>
  );
}
