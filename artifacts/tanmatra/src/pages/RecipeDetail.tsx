import { Link, useParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRecipe } from "@/lib/contentApi";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Flame,
  ShieldCheck,
  Utensils,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecipeDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: recipe, isLoading } = useRecipe(slug);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
        <Skeleton className="h-64 w-full bg-clinical-surface-elevated rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-3/4 bg-clinical-surface-elevated" />
          <Skeleton className="h-6 w-1/4 bg-clinical-surface-elevated" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-20 bg-clinical-surface-elevated" />
            <Skeleton className="h-4 w-20 bg-clinical-surface-elevated" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-4">
            <Skeleton className="h-8 w-1/2 bg-clinical-surface-elevated" />
            <Skeleton className="h-32 w-full bg-clinical-surface-elevated" />
          </div>
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-8 w-1/3 bg-clinical-surface-elevated" />
            <Skeleton className="h-48 w-full bg-clinical-surface-elevated" />
          </div>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-3">
        <BookOpen className="w-8 h-8 text-clinical-gold mx-auto" />
        <p className="text-white font-semibold">Recipe not found</p>
        <Link to="/recipes">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to recipes
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <Link
        to="/recipes"
        className="inline-flex items-center gap-1.5 text-xs text-clinical-zinc hover:text-clinical-gold"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to recipes
      </Link>

      {recipe.image && (
        <div className="relative aspect-[16/9] rounded-2xl overflow-hidden border border-clinical-border">
          <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/70 to-transparent" />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-clinical-sage/80 text-white border-0 gap-1 text-[10px]">
            <ShieldCheck className="w-3 h-3" />
            {recipe.authorRole} authored
          </Badge>
          <Badge variant="outline" className="border-clinical-border text-clinical-zinc text-[10px] capitalize">
            {recipe.goal.replaceAll("_", " ")}
          </Badge>
          <Badge variant="outline" className="border-clinical-border text-clinical-zinc text-[10px] capitalize">
            {recipe.diet}
          </Badge>
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl text-white">{recipe.title}</h1>
        <p className="text-sm text-clinical-zinc leading-relaxed">{recipe.summary}</p>
        <p className="text-[11px] text-clinical-zinc-muted">
          By {recipe.authorName} · {recipe.authorRole}
        </p>
      </div>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat icon={Clock} label="Time" value={`${recipe.timeMinutes} min`} />
          {recipe.calories != null && (
            <Stat icon={Flame} label="Calories" value={`${recipe.calories} kcal`} />
          )}
          {recipe.proteinGrams != null && (
            <Stat icon={Utensils} label="Protein" value={`${recipe.proteinGrams}g`} />
          )}
          <Stat icon={BookOpen} label="Tags" value={recipe.tags.slice(0, 2).join(", ") || "—"} />
        </CardContent>
      </Card>

      {recipe.body && (
        <p className="text-sm text-clinical-zinc leading-relaxed">{recipe.body}</p>
      )}

      <section className="space-y-3">
        <h2 className="text-clinical-label">Ingredients</h2>
        <ul className="space-y-1.5">
          {recipe.ingredients.map((ing, i) => (
            <li
              key={i}
              className="text-sm text-white flex items-baseline gap-2 border-b border-clinical-border pb-1.5"
            >
              <span className="text-clinical-gold">·</span>
              {ing}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-clinical-label">Method</h2>
        <ol className="space-y-3">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className="shrink-0 w-7 h-7 rounded-full bg-clinical-gold/15 text-clinical-gold text-xs font-bold flex items-center justify-center tabular-nums">
                {i + 1}
              </span>
              <p className="text-sm text-clinical-zinc leading-relaxed pt-0.5">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc-muted font-semibold flex items-center gap-1">
        <Icon className="w-3 h-3 text-clinical-gold" />
        {label}
      </p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}
