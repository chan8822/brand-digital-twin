import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RD_PLANS,
  PLAN_GOAL_LABEL,
  recommendPlansForPreferences,
  getRdAuthor,
  formatRupees,
  type PlanGoal,
} from "@/lib/rdPlans";
import { usePreferences } from "@/lib/preferencesContext";
import { ACCENT_CLASSES } from "@/lib/teamData";
import {
  PROTOCOL_LABELS,
  PROTOCOL_PLAN_GOALS,
  PROTOCOL_TAGLINES,
  isProtocol,
  type Protocol,
} from "@/lib/protocols";
import { ShieldCheck, Sparkles, ChevronRight, Filter } from "lucide-react";

const GOAL_FILTERS: Array<{ value: "all" | PlanGoal; label: string }> = [
  { value: "all", label: "All plans" },
  { value: "weight_loss", label: "Weight loss" },
  { value: "lean_muscle", label: "Lean muscle" },
  { value: "pcos_balance", label: "PCOS" },
  { value: "diabetic_friendly", label: "Diabetic" },
  { value: "senior_vitality", label: "Senior" },
  { value: "low_fodmap", label: "Gut / IBS" },
];

const CALORIE_BUCKETS: Array<{ value: "all" | "low" | "mid" | "high"; label: string }> = [
  { value: "all", label: "Any kcal" },
  { value: "low", label: "≤ 1700" },
  { value: "mid", label: "1700–2100" },
  { value: "high", label: "> 2100" },
];

export default function RdPlans() {
  const { preferences } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const protocolParam = searchParams.get("protocol");
  const activeProtocol: Protocol | null = isProtocol(protocolParam)
    ? protocolParam
    : null;

  const [goalFilter, setGoalFilter] = useState<"all" | PlanGoal>("all");
  const [calBucket, setCalBucket] = useState<"all" | "low" | "mid" | "high">("all");
  const [styleFilter, setStyleFilter] = useState<string>("all");

  const recommendations = useMemo(
    () => recommendPlansForPreferences(preferences, 3),
    [preferences],
  );

  // When a protocol single-goal mapping is exact (e.g. performance →
  // lean_muscle), reflect it in the goal pill so the user sees the chip
  // active. Otherwise leave goalFilter alone — the protocol filter applies
  // on top via PROTOCOL_PLAN_GOALS.
  useEffect(() => {
    if (activeProtocol) {
      const goals = PROTOCOL_PLAN_GOALS[activeProtocol];
      if (goals.length === 1) setGoalFilter(goals[0]);
    }
  }, [activeProtocol]);

  const filtered = useMemo(() => {
    const protocolGoals = activeProtocol ? PROTOCOL_PLAN_GOALS[activeProtocol] : null;
    return RD_PLANS.filter((p) => {
      if (protocolGoals && !protocolGoals.includes(p.goal)) return false;
      if (goalFilter !== "all" && p.goal !== goalFilter) return false;
      if (styleFilter !== "all" && !p.dietaryStyles.includes(styleFilter as never))
        return false;
      if (calBucket === "low" && p.calorieTargetPerDay > 1700) return false;
      if (
        calBucket === "mid" &&
        (p.calorieTargetPerDay < 1700 || p.calorieTargetPerDay > 2100)
      )
        return false;
      if (calBucket === "high" && p.calorieTargetPerDay <= 2100) return false;
      return true;
    });
  }, [goalFilter, calBucket, styleFilter, activeProtocol]);

  function clearProtocol() {
    const next = new URLSearchParams(searchParams);
    next.delete("protocol");
    setSearchParams(next, { replace: true });
    setGoalFilter("all");
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10">
      {/* Hero */}
      <header className="space-y-3">
        <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 uppercase tracking-widest text-[10px]">
          RD-Designed
        </Badge>
        <h1 className="font-serif text-3xl sm:text-4xl text-white">
          {activeProtocol
            ? `${PROTOCOL_LABELS[activeProtocol]} Protocol — RD plans`
            : "Plans curated by registered dietitians"}
        </h1>
        <p className="text-sm text-clinical-zinc max-w-2xl">
          {activeProtocol
            ? PROTOCOL_TAGLINES[activeProtocol]
            : "Six- to twelve-week protocols built around a specific goal — weight loss, lean muscle, PCOS, diabetes management, and more. Each plan is authored by an in-house RD, signed off for sodium and macros, and adapts to your allergens at delivery."}
        </p>
        {activeProtocol && (
          <button
            type="button"
            onClick={clearProtocol}
            className="text-[11px] uppercase tracking-[0.12em] text-clinical-gold hover:underline font-semibold"
          >
            Clear protocol filter — see all plans
          </button>
        )}
      </header>

      {preferences && recommendations.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-clinical-gold" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-clinical-gold">
              Top matches for your profile
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recommendations.map(({ plan, reasons }) => {
              const rd = getRdAuthor(plan);
              return (
                <Link to={`/plans/${plan.slug}`} key={plan.slug}>
                  <Card className="h-full bg-gradient-to-br from-clinical-gold/10 to-transparent border-clinical-gold/30 hover:border-clinical-gold/60 transition-all">
                    <CardContent className="p-5 space-y-3">
                      <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 text-[10px]">
                        {PLAN_GOAL_LABEL[plan.goal]}
                      </Badge>
                      <h3 className="font-serif text-lg text-white">
                        {plan.name}
                      </h3>
                      <p className="text-xs text-clinical-zinc line-clamp-2">
                        {plan.tagline}
                      </p>
                      <ul className="space-y-1">
                        {reasons.slice(0, 2).map((r) => (
                          <li
                            key={r}
                            className="text-[11px] text-clinical-sage flex items-start gap-1.5"
                          >
                            <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                            {r}
                          </li>
                        ))}
                      </ul>
                      {rd && (
                        <p className="text-[10px] text-clinical-zinc-muted">
                          By {rd.name}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Filters */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-clinical-zinc-muted font-semibold">
          <Filter className="w-3.5 h-3.5" /> Filters
        </div>
        <div className="flex flex-wrap gap-2">
          {GOAL_FILTERS.map((g) => {
            const active = goalFilter === g.value;
            return (
              <button
                key={g.value}
                onClick={() => setGoalFilter(g.value)}
                className={`px-3 py-1 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                  active
                    ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold"
                    : "border-clinical-border text-clinical-zinc hover:text-clinical-gold"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {CALORIE_BUCKETS.map((b) => {
            const active = calBucket === b.value;
            return (
              <button
                key={b.value}
                onClick={() => setCalBucket(b.value)}
                className={`px-3 py-1 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                  active
                    ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold"
                    : "border-clinical-border text-clinical-zinc hover:text-clinical-gold"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "vegetarian", "omnivore", "pescatarian"] as const).map(
            (s) => {
              const active = styleFilter === s;
              return (
                <button
                  key={s}
                  onClick={() => setStyleFilter(s)}
                  className={`px-3 py-1 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                    active
                      ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold"
                      : "border-clinical-border text-clinical-zinc hover:text-clinical-gold"
                  }`}
                >
                  {s === "all" ? "Any diet" : s}
                </button>
              );
            },
          )}
        </div>
      </section>

      <div className="text-xs text-clinical-zinc-muted tabular-nums">
        {filtered.length} {filtered.length === 1 ? "plan" : "plans"}
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map((plan) => {
          const rd = getRdAuthor(plan);
          const accent = rd ? ACCENT_CLASSES[rd.accent] : null;
          return (
            <Card
              key={plan.slug}
              className="bg-clinical-surface border-clinical-border hover:border-clinical-gold/40 transition-all overflow-hidden"
            >
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Badge className={`text-[10px] ${accent?.chip ?? "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30"}`}>
                      {PLAN_GOAL_LABEL[plan.goal]}
                    </Badge>
                    <h3 className="font-serif text-xl text-white">{plan.name}</h3>
                    <p className="text-xs text-clinical-zinc">{plan.tagline}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-widest text-clinical-zinc-muted">
                      from
                    </p>
                    <p className="text-lg font-semibold text-clinical-gold tabular-nums">
                      {formatRupees(plan.pricePerWeekPaise)}
                    </p>
                    <p className="text-[10px] text-clinical-zinc-muted">/ week</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 pt-1">
                  <Stat label="kcal" value={plan.calorieTargetPerDay.toString()} />
                  <Stat label="protein" value={`${plan.proteinTargetGrams}g`} />
                  <Stat label="carbs" value={`${plan.carbsTargetGrams}g`} />
                  <Stat label="fat" value={`${plan.fatTargetGrams}g`} />
                </div>

                <div className="flex flex-wrap gap-1.5">
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

                {rd && (
                  <div className="flex items-center gap-2 pt-1 border-t border-clinical-border">
                    <Link
                      to={`/team/${rd.slug}`}
                      className={`flex items-center gap-2 text-xs ${accent?.text}`}
                    >
                      <span
                        className={`w-7 h-7 rounded-full ${accent?.bg} ring-1 ${accent?.ring} flex items-center justify-center text-[10px] font-bold`}
                      >
                        {rd.initials}
                      </span>
                      <span>
                        Authored by <span className="font-semibold">{rd.name}</span>
                      </span>
                    </Link>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Link to={`/plans/${plan.slug}`} className="flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-clinical-border text-clinical-zinc hover:text-white hover:border-clinical-gold/40 text-[11px] uppercase tracking-wide"
                    >
                      View week & RD notes
                    </Button>
                  </Link>
                  <Link to={`/subscribe?plan=${plan.slug}`} className="flex-1">
                    <Button
                      size="sm"
                      className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-[11px] uppercase tracking-wide font-bold gap-1"
                    >
                      Subscribe <ChevronRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
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
