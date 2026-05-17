import { useState } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useRecipes } from "@/lib/contentApi";
import { BookOpen, Clock, Flame, Search, ShieldCheck } from "lucide-react";

const GOALS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Goals" },
  { value: "general_wellness", label: "General Wellness" },
  { value: "lose_weight", label: "Fat Loss" },
  { value: "gain_muscle", label: "Muscle Gain" },
  { value: "maintain", label: "Maintain" },
];

const DIETS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Any Diet" },
  { value: "omnivore", label: "Omnivore" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "pescatarian", label: "Pescatarian" },
  { value: "keto", label: "Keto" },
];

const TIME_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Any time" },
  { value: 15, label: "≤ 15 min" },
  { value: 30, label: "≤ 30 min" },
  { value: 45, label: "≤ 45 min" },
];

export default function Recipes() {
  const [goal, setGoal] = useState("all");
  const [diet, setDiet] = useState("all");
  const [maxTime, setMaxTime] = useState(0);
  const [q, setQ] = useState("");
  const { data: recipes, isLoading } = useRecipes({ goal, diet, maxTime, q });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc-muted font-semibold flex items-center gap-1.5">
          <BookOpen className="w-3 h-3 text-clinical-gold" />
          Recipe Library
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-white">
          Cook with the RD board
        </h1>
        <p className="text-sm text-clinical-zinc max-w-2xl">
          Every recipe here is written by Tanmatra's registered dietitians and
          chefs — built for the same goals as our meal plans.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clinical-zinc-muted" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search recipes…"
          className="pl-9 h-11 bg-clinical-surface border-clinical-border"
        />
      </div>

      <div className="space-y-3">
        <FilterRow label="Goal" options={GOALS} value={goal} onChange={setGoal} />
        <FilterRow label="Diet" options={DIETS} value={diet} onChange={setDiet} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc-muted font-semibold pr-1">
            Time
          </span>
          {TIME_OPTIONS.map((t) => {
            const active = maxTime === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setMaxTime(t.value)}
                className={`px-3 py-1 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                  active
                    ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold"
                    : "border-clinical-border text-clinical-zinc hover:text-clinical-gold"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-clinical-zinc-muted tabular-nums">
        {!isLoading && `${recipes?.length ?? 0} recipe${(recipes?.length ?? 0) === 1 ? "" : "s"}`}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="bg-clinical-surface border-clinical-border h-72">
              <Skeleton className="h-40 w-full bg-clinical-surface-elevated rounded-t-md" />
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4 bg-clinical-surface-elevated" />
                <Skeleton className="h-4 w-full bg-clinical-surface-elevated" />
                <Skeleton className="h-4 w-1/2 bg-clinical-surface-elevated" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {recipes?.map((r) => (
          <Link key={r.id} to={`/recipes/${r.slug}`}>
            <Card className="group bg-clinical-surface border-clinical-border hover:border-clinical-gold/40 transition-all overflow-hidden h-full">
              {r.image && (
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={r.image}
                    alt={r.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/80 via-transparent to-transparent" />
                  <Badge className="absolute top-3 left-3 bg-clinical-sage/80 text-white border-0 gap-0.5 text-[9px] h-5">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    {r.authorRole}
                  </Badge>
                </div>
              )}
              <CardContent className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-white line-clamp-2">
                  {r.title}
                </h3>
                <p className="text-[11px] text-clinical-zinc line-clamp-2 leading-relaxed">
                  {r.summary}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-clinical-zinc-muted tabular-nums pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-clinical-gold" />
                    {r.timeMinutes} min
                  </span>
                  {r.calories != null && (
                    <span className="flex items-center gap-1">
                      <Flame className="w-3 h-3 text-clinical-gold" />
                      {r.calories} kcal
                    </span>
                  )}
                  {r.proteinGrams != null && (
                    <span>{r.proteinGrams}g protein</span>
                  )}
                </div>
                <p className="text-[10px] text-clinical-zinc-muted pt-1">
                  By {r.authorName}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {!isLoading && (recipes?.length ?? 0) === 0 && (
        <p className="text-center text-sm text-clinical-zinc py-12">
          No recipes match those filters yet.
        </p>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc-muted font-semibold pr-1">
        {label}
      </span>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
              active
                ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold"
                : "border-clinical-border text-clinical-zinc hover:text-clinical-gold"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
