import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/api/adapter";
import {
  DISHES,
  CATEGORY_LABELS,
  type DishCategory,
  type DishKitchen,
  type DishData,
} from "@/lib/menuData";
import {
  LIFESTYLE_LABELS,
  LIFESTYLE_TAGS,
  matchesLifestyle,
  type Lifestyle,
} from "@/lib/dishEnrichment";
import { useCart } from "@/lib/cartContext";
import { toast } from "sonner";
import {
  AlertTriangle,
  Heart,
  Dumbbell,
  Activity,
  Baby,
  Leaf,
  Search,
  X,
  Plus,
} from "lucide-react";

const KITCHEN_TABS: Array<"all" | DishKitchen> = [
  "all",
  "continental",
  "indian",
  "asian",
  "mediterranean",
];
const CATEGORY_TABS: Array<"all" | DishCategory> = [
  "all",
  "beverages",
  "breakfast",
  "salads",
  "soups",
  "pasta",
  "wraps",
  "bowls",
  "snacks",
  "mains",
];
const LIFESTYLE_TABS: Array<{ value: Lifestyle; label: string; icon: typeof Heart }> = [
  { value: "all", label: "All", icon: Leaf },
  { value: "heart-healthy", label: LIFESTYLE_LABELS["heart-healthy"], icon: Heart },
  { value: "fitness-gains", label: LIFESTYLE_LABELS["fitness-gains"], icon: Dumbbell },
  { value: "diabetes-management", label: LIFESTYLE_LABELS["diabetes-management"], icon: Activity },
  { value: "junior-explorers", label: LIFESTYLE_LABELS["junior-explorers"], icon: Baby },
  { value: "silver-vitality", label: LIFESTYLE_LABELS["silver-vitality"], icon: Leaf },
];
type DietFilter = "all" | "veg" | "nonveg";

export default function Menu() {
  const [kitchen, setKitchen] = useState<"all" | DishKitchen>("all");
  const [category, setCategory] = useState<"all" | DishCategory>("all");
  const [diet, setDiet] = useState<DietFilter>("all");
  const [lifestyle, setLifestyle] = useState<Lifestyle>("all");
  const [query, setQuery] = useState("");
  const { addItem } = useCart();

  const handleQuickAdd = (e: React.MouseEvent, item: DishData) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.isAvailable) return;
    addItem({
      dishId: item.id,
      slug: item.slug,
      name: item.name,
      image: item.image,
      basePrice: item.price,
      unitPrice: item.price,
      quantity: 1,
      kitchen: item.kitchen,
      isVeg: item.isVeg,
      rdVerified: item.rdVerified,
      macros: item.macros,
      customizations: [],
    });
    toast.success(`Added ${item.name} to cart`);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DISHES.filter((d) => {
      if (kitchen !== "all" && d.kitchen !== kitchen) return false;
      if (category !== "all" && d.category !== category) return false;
      if (diet === "veg" && !d.isVeg) return false;
      if (diet === "nonveg" && d.isVeg) return false;
      if (!matchesLifestyle(d, lifestyle)) return false;
      if (q && !d.name.toLowerCase().includes(q) && !d.description.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [kitchen, category, diet, lifestyle, query]);

  const lifestyleTag =
    lifestyle !== "all" ? LIFESTYLE_TAGS[lifestyle as Exclude<Lifestyle, "all">] : null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
      <div className="space-y-1">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          Curated Selections
        </h1>
        <p className="text-xs uppercase tracking-[0.18em] text-clinical-zinc/70 font-medium">
          Kitchen-synced · Inventory-aware · RD-verified
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clinical-zinc/60" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search dishes, ingredients, protocols..."
          className="pl-9 pr-9 h-11 bg-clinical-surface border-clinical-slate/20 focus-visible:border-clinical-gold/40 focus-visible:ring-clinical-gold/20 text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-clinical-zinc hover:text-white"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lifestyle filter chips */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc/60 font-semibold">
          Lifestyle
        </p>
        <div className="flex flex-wrap gap-2">
          {LIFESTYLE_TABS.map(({ value, label, icon: Icon }) => {
            const active = lifestyle === value;
            return (
              <button
                key={value}
                onClick={() => setLifestyle(value)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                  active
                    ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold shadow-[0_0_12px_rgba(212,175,55,0.18)]"
                    : "border-clinical-slate/30 text-clinical-zinc hover:border-clinical-gold/30 hover:text-clinical-gold"
                }`}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Diet + Category + Kitchen */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc/60 font-semibold pr-1">
            Diet
          </span>
          {(["all", "veg", "nonveg"] as DietFilter[]).map((opt) => {
            const active = diet === opt;
            const dot = opt === "veg" ? "bg-green-500" : opt === "nonveg" ? "bg-red-500" : null;
            return (
              <button
                key={opt}
                onClick={() => setDiet(opt)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                  active
                    ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold"
                    : "border-clinical-slate/30 text-clinical-zinc hover:text-clinical-gold"
                }`}
              >
                {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
                {opt === "all" ? "All" : opt === "veg" ? "Veg" : "Non-Veg"}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORY_TABS.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-3 py-1 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                  active
                    ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold"
                    : "border-clinical-slate/30 text-clinical-zinc hover:text-clinical-gold"
                }`}
              >
                {c === "all" ? "All Categories" : CATEGORY_LABELS[c]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {KITCHEN_TABS.map((k) => {
            const active = kitchen === k;
            return (
              <button
                key={k}
                onClick={() => setKitchen(k)}
                className={`px-3 py-1 rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                  active
                    ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold"
                    : "border-clinical-slate/30 text-clinical-zinc hover:text-clinical-gold"
                }`}
              >
                {k === "all" ? "All Kitchens" : k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-xs text-clinical-zinc/70 tabular-nums">
        {filtered.length} {filtered.length === 1 ? "dish" : "dishes"}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <AlertTriangle className="w-8 h-8 text-clinical-gold mx-auto" />
          <p className="text-sm text-clinical-zinc">No dishes match your filters.</p>
          <button
            onClick={() => {
              setKitchen("all");
              setCategory("all");
              setDiet("all");
              setLifestyle("all");
              setQuery("");
            }}
            className="text-xs text-clinical-gold hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Dish grid — dark luxury cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((item) => (
          <article
            key={item.id}
            className={`group relative flex flex-col rounded-2xl overflow-hidden bg-clinical-surface-elevated border border-clinical-slate/20 hover:border-clinical-gold/50 transition-all duration-300 ${
              !item.isAvailable ? "opacity-50 grayscale" : ""
            }`}
          >
            {/* Image */}
            <div className="relative h-52 overflow-hidden">
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-clinical-surface-elevated via-clinical-surface-elevated/30 to-transparent z-10" />

              {/* Top-left: veg dot + RD */}
              <div className="absolute top-3 left-3 z-20 flex gap-1.5 items-center">
                <span
                  className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center bg-[#050505]/80 ${
                    item.isVeg ? "border-green-500" : "border-red-500"
                  }`}
                  title={item.isVeg ? "Vegetarian" : "Non-vegetarian"}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      item.isVeg ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                </span>
                {item.rdVerified && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-clinical-sage/40 text-clinical-sage bg-clinical-sage/10 backdrop-blur-sm font-semibold tracking-wider uppercase">
                    RD
                  </span>
                )}
              </div>

              {/* Top-right: lifestyle tag */}
              {lifestyleTag && (
                <div className="absolute top-3 right-3 z-20">
                  <span className="text-[9px] px-2 py-1 rounded border border-clinical-gold/40 text-clinical-gold bg-[#050505]/70 backdrop-blur-sm font-bold tracking-[0.12em] uppercase">
                    {lifestyleTag}
                  </span>
                </div>
              )}
            </div>

            {/* Content card with negative top margin overlay */}
            <div className="relative z-20 -mt-10 flex-1 flex flex-col p-5 gap-3">
              <div className="flex justify-between items-start gap-3">
                <h3 className="font-serif text-lg font-medium leading-tight text-white">
                  {item.name}
                </h3>
                <span className="font-serif text-lg font-medium text-clinical-gold tabular-nums shrink-0">
                  {formatPrice(item.price)}
                </span>
              </div>
              <p className="text-xs text-clinical-zinc line-clamp-2 leading-relaxed">
                {item.description}
              </p>

              {/* Macro chips */}
              <div className="flex flex-wrap gap-1.5">
                <MacroChip label="CAL" value={`${item.macros.calories}`} />
                <MacroChip label="PRO" value={`${item.macros.protein}g`} />
                <MacroChip label="C" value={`${item.macros.carbs}g`} />
                <MacroChip label="F" value={`${item.macros.fat}g`} />
                <MacroChip label="GI" value={item.glycaemicIndex} />
              </div>

              <div className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc/60 font-semibold">
                {CATEGORY_LABELS[item.category]} · {item.kitchen}
              </div>

              {/* Action buttons */}
              <div className="mt-auto pt-2 flex gap-2">
                <Link to={`/dish/${item.slug}`} className="flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-10 border-clinical-slate/30 bg-transparent text-clinical-zinc hover:bg-clinical-surface hover:text-white hover:border-clinical-gold/40 text-[11px] uppercase tracking-[0.12em] font-semibold"
                  >
                    Details
                  </Button>
                </Link>
                <Button
                  size="sm"
                  onClick={(e) => handleQuickAdd(e, item)}
                  disabled={!item.isAvailable}
                  className="flex-1 h-10 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 disabled:opacity-50 disabled:pointer-events-none text-[11px] uppercase tracking-[0.12em] font-bold gap-1 shadow-[0_0_15px_rgba(212,175,55,0.15)] hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]"
                >
                  <Plus className="w-3 h-3" />
                  Add to Order
                </Button>
              </div>
            </div>

            {!item.isAvailable && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 pointer-events-none">
                <span className="text-xs flex items-center gap-1 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 font-semibold">
                  <AlertTriangle className="w-3 h-3" />
                  Out of Stock
                </span>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function MacroChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-clinical-surface border border-clinical-slate/20">
      <span className="text-[9px] uppercase tracking-[0.12em] text-clinical-zinc/70 font-semibold">
        {label}
      </span>
      <span className="text-[11px] tabular-nums text-clinical-gold font-medium">{value}</span>
    </div>
  );
}
