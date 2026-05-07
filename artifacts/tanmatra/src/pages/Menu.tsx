import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import MacroOverlay from "@/components/dish/MacroOverlay";
import { formatPrice } from "@/lib/api/adapter";
import { DISHES, CATEGORY_LABELS, type DishCategory, type DishKitchen } from "@/lib/menuData";
import { AlertTriangle, ChefHat, Search, X } from "lucide-react";

const KITCHEN_TABS: Array<"all" | DishKitchen> = ["all", "continental", "chinese"];
const CATEGORY_TABS: Array<"all" | DishCategory> = ["all", "wellness", "performance", "clinical", "desserts"];
type DietFilter = "all" | "veg" | "nonveg";

export default function Menu() {
  const [kitchen, setKitchen] = useState<"all" | DishKitchen>("all");
  const [category, setCategory] = useState<"all" | DishCategory>("all");
  const [diet, setDiet] = useState<DietFilter>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DISHES.filter((d) => {
      if (kitchen !== "all" && d.kitchen !== kitchen) return false;
      if (category !== "all" && d.category !== category) return false;
      if (diet === "veg" && !d.isVeg) return false;
      if (diet === "nonveg" && d.isVeg) return false;
      if (q) {
        const hay = `${d.name} ${d.description} ${d.ingredients.join(" ")} ${d.category} ${d.kitchen}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [kitchen, category, diet, query]);

  const clearFilters = () => {
    setKitchen("all");
    setCategory("all");
    setDiet("all");
    setQuery("");
  };

  const hasActiveFilters = kitchen !== "all" || category !== "all" || diet !== "all" || query.trim().length > 0;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-5 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-white">Clinical Menu</h1>
        <p className="text-muted-foreground font-mono text-sm">
          Kitchen-synced · Inventory-aware · RD-verified
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clinical-zinc" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search dishes, ingredients, protocols…"
          className="pl-10 pr-10 h-11 bg-clinical-surface border-clinical-slate/30 text-sm"
          aria-label="Search menu"
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

      {/* Diet pills (veg / non-veg) */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-clinical-zinc">Diet</span>
        {([
          { val: "all" as const, label: "All" },
          { val: "veg" as const, label: "Veg", dotClass: "bg-green-500 border-green-700" },
          { val: "nonveg" as const, label: "Non-Veg", dotClass: "bg-red-500 border-red-700" },
        ]).map((opt) => (
          <button
            key={opt.val}
            onClick={() => setDiet(opt.val)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
              diet === opt.val
                ? "bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/40"
                : "bg-clinical-surface text-clinical-zinc border border-clinical-slate/20 hover:border-clinical-slate/40"
            }`}
            aria-pressed={diet === opt.val}
          >
            {opt.dotClass && <span className={`w-2 h-2 rounded-sm border ${opt.dotClass}`} />}
            {opt.label}
          </button>
        ))}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORY_TABS.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              category === c
                ? "bg-clinical-gold text-[#050505]"
                : "bg-clinical-surface text-clinical-zinc border border-clinical-slate/20 hover:text-foreground"
            }`}
            role="tab"
            aria-selected={category === c}
          >
            {c === "all" ? "All Categories" : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Kitchen tabs */}
      <div className="flex gap-2">
        {KITCHEN_TABS.map((k) => (
          <button
            key={k}
            onClick={() => setKitchen(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              kitchen === k
                ? "bg-clinical-gold/20 text-clinical-gold border border-clinical-gold/40"
                : "bg-clinical-surface text-clinical-zinc border border-clinical-slate/20 hover:text-foreground"
            }`}
            role="tab"
            aria-selected={kitchen === k}
          >
            {k === "all" ? "All Kitchens" : k}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="flex items-center justify-between text-xs text-clinical-zinc">
        <span>
          {filtered.length} {filtered.length === 1 ? "dish" : "dishes"}
        </span>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-clinical-gold hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="border border-dashed border-clinical-slate/30 rounded-2xl p-10 text-center space-y-3">
          <Search className="w-8 h-8 text-clinical-zinc mx-auto" />
          <h3 className="text-sm font-semibold text-white">No dishes match your filters</h3>
          <p className="text-xs text-clinical-zinc">
            Try clearing a filter or searching for an ingredient.
          </p>
          <button
            onClick={clearFilters}
            className="text-xs text-clinical-gold hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => (
          <Link to={`/dish/${item.slug}`} key={item.id}>
            <Card
              className={`relative overflow-hidden transition-opacity ${
                !item.isAvailable ? "opacity-50 grayscale" : ""
              } bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/30 transition-all duration-300 hover:shadow-clinical group`}
            >
              <CardContent className="p-0">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/80 via-transparent to-transparent" />
                  <div className="absolute top-3 left-3 flex gap-1.5 items-center">
                    {/* Veg / Non-veg dot */}
                    <span
                      className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center bg-[#050505]/80 ${
                        item.isVeg ? "border-green-500" : "border-red-500"
                      }`}
                      title={item.isVeg ? "Vegetarian" : "Non-vegetarian"}
                      aria-label={item.isVeg ? "Vegetarian" : "Non-vegetarian"}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          item.isVeg ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                    </span>
                    {item.rdVerified && (
                      <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 bg-green-500/10">
                        RD Verified
                      </Badge>
                    )}
                  </div>
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-clinical-gold/90 text-[#050505] border-0 font-bold tabular-nums text-xs">
                      {formatPrice(item.price)}
                    </Badge>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <MacroOverlay macros={item.macros} compact />
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm text-white group-hover:text-clinical-gold transition-colors truncate">
                      {item.name}
                    </h3>
                    <Badge variant="outline" className="text-[9px] capitalize border-clinical-slate/30 text-clinical-zinc shrink-0">
                      <ChefHat className="w-2.5 h-2.5 mr-1" />
                      {item.kitchen}
                    </Badge>
                  </div>
                  <p className="text-xs text-clinical-zinc line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant="outline" className="text-[9px] capitalize border-clinical-slate/30 text-clinical-zinc">
                      {CATEGORY_LABELS[item.category]}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] border-clinical-slate/30 text-clinical-zinc">
                      GI: {item.glycaemicIndex}
                    </Badge>
                  </div>
                </div>
              </CardContent>

              {!item.isAvailable && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl pointer-events-none">
                  <Badge variant="destructive" className="text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Out of Stock
                  </Badge>
                </div>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
