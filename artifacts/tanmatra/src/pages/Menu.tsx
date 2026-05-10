import { useState, useMemo } from "react";
import { useDishRationales, type DishRationale } from "@/lib/dishRationaleApi";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/api/adapter";
import { useBundles, groupOrdersApi } from "@/lib/queries";
import {
  CATEGORY_LABELS,
  getDishById,
  useMenuCatalog,
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
import {
  PROTOCOLS,
  PROTOCOL_LABELS,
  PROTOCOL_TAGLINES,
  isProtocol,
  matchesProtocol,
  type Protocol,
} from "@/lib/protocols";
import { useCart } from "@/lib/cartContext";
import { usePreferences } from "@/lib/preferencesContext";
import { usePremiumStatus, usePremiumSlugs } from "@/lib/usePremium";
import { useNavigate } from "react-router";
import { Crown } from "lucide-react";
import {
  evaluateDishForPreferences,
  rankDishesForPreferences,
  findSmartSwap,
} from "@/lib/preferencesMatch";
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
  ShieldAlert,
  Sparkles as SparklesIcon,
  SlidersHorizontal,
  Package,
  Users,
  PlusCircle,
} from "lucide-react";
import { Link } from "react-router";

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
  const { isPremium } = usePremiumStatus();
  const premiumSlugs = usePremiumSlugs();
  const navigate = useNavigate();
  const [kitchen, setKitchen] = useState<"all" | DishKitchen>("all");
  const [category, setCategory] = useState<"all" | DishCategory>("all");
  const [diet, setDiet] = useState<DietFilter>("all");
  const [lifestyle, setLifestyle] = useState<Lifestyle>("all");
  const [query, setQuery] = useState("");
  const [hideBlocked, setHideBlocked] = useState(true);
  const { addItem, addBundleSlug } = useCart();
  const { preferences } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const groupCode = searchParams.get("group");
  const protocolParam = searchParams.get("protocol");
  const activeProtocol: Protocol | null = isProtocol(protocolParam)
    ? protocolParam
    : null;
  const { data: bundles } = useBundles();
  const { dishes: catalogDishes } = useMenuCatalog();

  const handleQuickAdd = (e: React.MouseEvent, item: DishData) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.isAvailable) return;
    if (groupCode) {
      groupOrdersApi
        .addItem(groupCode, {
          dishId: item.id,
          quantity: 1,
          customizations: [],
        })
        .then(() => {
          toast.success(`Added ${item.name} to group ${groupCode}`);
        })
        .catch(() => toast.error("Could not add to group order"));
      return;
    }
    if (premiumSlugs.has(item.slug) && !isPremium) {
      toast.error(`${item.name} is a Premium-only dish`, {
        description: "Join Tanmatra Premium to unlock chef-table dishes.",
        action: { label: "See Premium", onClick: () => navigate("/premium") },
      });
      return;
    }
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
    toast.success(`Added ${item.name} to your order`, {
      description: "Tap View Cart to review and check out.",
      action: { label: "View Cart", onClick: () => navigate("/cart") },
    });
  };

  const handleAddBundle = (
    bundle: NonNullable<typeof bundles>[number],
  ) => {
    if (groupCode) {
      toast.error("Bundles can only be added to your personal cart");
      return;
    }
    let added = 0;
    for (const did of bundle.dishIds) {
      const dish = getDishById(did);
      if (!dish || !dish.isAvailable) continue;
      // Per-line discount so the cart subtotal matches the bundle price.
      const perDishOriginal = dish.price;
      const ratio = bundle.pricePaise / Math.max(1, bundle.originalPricePaise);
      const discounted = Math.round(perDishOriginal * ratio);
      addItem({
        dishId: dish.id,
        slug: dish.slug,
        name: dish.name,
        image: dish.image,
        basePrice: dish.price,
        unitPrice: discounted,
        quantity: 1,
        kitchen: dish.kitchen,
        isVeg: dish.isVeg,
        rdVerified: dish.rdVerified,
        macros: dish.macros,
        customizations: [`Bundle: ${bundle.name}`],
      });
      added++;
    }
    if (added === 0) {
      toast.error("This bundle is currently unavailable");
    } else {
      // Record the slug so the server can re-validate at finalize and
      // apply the authoritative bundle discount (client-side per-line
      // pricing is just for cart UX).
      addBundleSlug(bundle.slug);
      toast.success(`${bundle.name} added to your order`, {
        description: `${added} item${added === 1 ? "" : "s"} for ${formatPrice(bundle.pricePaise)}`,
        action: { label: "View Cart", onClick: () => navigate("/cart") },
      });
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const baseList = catalogDishes.filter((d) => {
      if (kitchen !== "all" && d.kitchen !== kitchen) return false;
      if (category !== "all" && d.category !== category) return false;
      if (diet === "veg" && !d.isVeg) return false;
      if (diet === "nonveg" && d.isVeg) return false;
      if (!matchesLifestyle(d, lifestyle)) return false;
      if (activeProtocol && !matchesProtocol(d, activeProtocol)) return false;
      if (q && !d.name.toLowerCase().includes(q) && !d.description.toLowerCase().includes(q))
        return false;
      return true;
    });
    const ranked = rankDishesForPreferences(baseList, preferences);
    return hideBlocked ? ranked.filter((r) => !r.match.blocked) : ranked;
  }, [kitchen, category, diet, lifestyle, query, preferences, hideBlocked, catalogDishes, activeProtocol]);

  const blockedCount = useMemo(() => {
    if (!preferences) return 0;
    return catalogDishes.filter(
      (d) => evaluateDishForPreferences(d, preferences).blocked,
    ).length;
  }, [preferences, catalogDishes]);

  const lifestyleTag =
    lifestyle !== "all" ? LIFESTYLE_TAGS[lifestyle as Exclude<Lifestyle, "all">] : null;

  // Lazy "why this meal" rationales for the visible dishes. Only enabled
  // when the user has a saved taste profile (otherwise the rationale has
  // little to tie to). The hook silently no-ops on 401.
  const visibleDishIds = useMemo(
    () => filtered.slice(0, 12).map((r) => r.dish.id),
    [filtered],
  );
  // Fingerprint the user's brief so the rationale cache is dropped when
  // preferences change (server's brief-hash invalidation already handles
  // freshness on the wire — this just stops the client from showing a
  // stale cached value while the new one is fetched).
  const briefFingerprint = useMemo(
    () =>
      preferences
        ? `${preferences.userId}:${preferences.updatedAt}`
        : "anon",
    [preferences],
  );
  const { byId: rationalesById } = useDishRationales(
    visibleDishIds,
    Boolean(preferences),
    briefFingerprint,
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
      <div className="space-y-1">
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          {activeProtocol
            ? `${PROTOCOL_LABELS[activeProtocol]} Protocol — qualifying dishes`
            : "Menu"}
        </h1>
        <p className="text-xs uppercase tracking-[0.18em] text-clinical-zinc font-medium">
          {activeProtocol
            ? `Filtered by ${PROTOCOL_LABELS[activeProtocol]} criteria · ${filtered.length} ${filtered.length === 1 ? "dish" : "dishes"}`
            : "Kitchen-synced · Inventory-aware · RD-verified"}
        </p>
      </div>

      {activeProtocol && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-clinical-gold/30 bg-clinical-gold/5 px-4 py-3">
          <SparklesIcon className="w-4 h-4 text-clinical-gold shrink-0" />
          <p className="text-xs text-clinical-zinc flex-1 min-w-[12rem] leading-relaxed">
            {PROTOCOL_TAGLINES[activeProtocol]}
          </p>
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("protocol");
              setSearchParams(next, { replace: true });
            }}
            className="text-[11px] uppercase tracking-[0.12em] text-clinical-gold hover:underline font-semibold"
          >
            Clear protocol filter
          </button>
        </div>
      )}

      {groupCode && (
        <Card className="bg-clinical-gold/5 border-clinical-gold/30">
          <CardContent className="p-3 text-xs flex items-center gap-2 text-clinical-zinc">
            <Users className="w-4 h-4 text-clinical-gold" />
            <span className="flex-1">
              Adding items to group{" "}
              <span className="font-mono text-clinical-gold">{groupCode}</span>.
              Items go straight to the shared order, not your cart.
            </span>
            <Link
              to={`/group/${groupCode}`}
              className="text-clinical-gold hover:underline"
            >
              View group →
            </Link>
          </CardContent>
        </Card>
      )}

      {bundles && bundles.length > 0 && !groupCode && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc font-semibold flex items-center gap-1.5">
                <Package className="w-3 h-3 text-clinical-gold" />
                Curated Selections
              </p>
              <h2 className="text-lg font-serif text-white mt-0.5">
                RD-curated combos
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {bundles.map((b) => {
              const savings = b.originalPricePaise - b.pricePaise;
              const includedDishes = b.dishIds
                .map((id) => getDishById(id))
                .filter((d): d is DishData => Boolean(d));
              const includesLine = includedDishes.map((d) => d.name).join(" · ");
              return (
                <Dialog key={b.id}>
                  <Card className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/40 transition-colors overflow-hidden flex flex-col">
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="relative aspect-[4/3] block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-clinical-gold/60"
                        aria-label={`View ${b.name} combo details — save ${formatPrice(savings)}${b.badge ? ` · ${b.badge}` : ""}`}
                      >
                        {b.image && (
                          <img
                            src={b.image}
                            alt={b.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/85 via-transparent to-transparent" />
                        {b.badge && (
                          <Badge className="absolute top-2 left-2 bg-clinical-gold/90 text-[#050505] border-0 text-[9px] tracking-widest">
                            {b.badge}
                          </Badge>
                        )}
                        <div className="absolute bottom-2 right-2 bg-clinical-sage/90 text-[#050505] rounded px-1.5 py-0.5 text-[10px] font-bold">
                          Save {formatPrice(savings)}
                        </div>
                      </button>
                    </DialogTrigger>
                    <CardContent className="p-3 space-y-2 flex-1 flex flex-col">
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-clinical-gold/60 rounded"
                        >
                          <h3 className="text-sm font-semibold text-white hover:text-clinical-gold transition-colors">
                            {b.name}
                          </h3>
                        </button>
                      </DialogTrigger>
                      <p className="text-[11px] text-clinical-zinc line-clamp-2 leading-relaxed">
                        {b.description}
                      </p>
                      {includesLine && (
                        <p className="text-[10px] text-clinical-zinc line-clamp-2 leading-snug">
                          <span className="text-white/80">Includes: </span>
                          {includesLine}
                        </p>
                      )}
                      <div className="flex items-baseline gap-2 mt-auto pt-1">
                        <span className="text-base font-bold text-clinical-gold tabular-nums">
                          {formatPrice(b.pricePaise)}
                        </span>
                        <span className="text-[11px] text-clinical-zinc line-through tabular-nums">
                          {formatPrice(b.originalPricePaise)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-clinical-slate/40 text-clinical-zinc hover:text-white hover:border-clinical-slate/60 h-9 text-xs"
                          >
                            View
                          </Button>
                        </DialogTrigger>
                        <Button
                          size="sm"
                          onClick={() => handleAddBundle(b)}
                          className="bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/40 hover:bg-clinical-gold/25 gap-1.5 h-9 text-xs"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Add Combo to Order
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <DialogContent className="bg-clinical-surface border-clinical-slate/20 max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-white font-serif text-xl">
                        {b.name}
                      </DialogTitle>
                      <DialogDescription className="text-clinical-zinc text-xs leading-relaxed">
                        {b.description}
                      </DialogDescription>
                    </DialogHeader>
                    {b.image && (
                      <div className="relative aspect-[16/9] rounded-lg overflow-hidden border border-clinical-slate/20">
                        <img
                          src={b.image}
                          alt={b.name}
                          className="w-full h-full object-cover"
                        />
                        {b.badge && (
                          <Badge className="absolute top-2 left-2 bg-clinical-gold/90 text-[#050505] border-0 text-[9px] tracking-widest">
                            {b.badge}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc/60 font-semibold">
                        What's inside ({includedDishes.length} {includedDishes.length === 1 ? "dish" : "dishes"})
                      </p>
                      {includedDishes.length === 0 ? (
                        <p className="text-xs text-clinical-zinc/70 italic">
                          This combo's dishes are temporarily unavailable.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {includedDishes.map((d) => (
                            <li key={d.id}>
                              <Link
                                to={`/dish/${d.slug}`}
                                className="flex items-center gap-3 p-2 rounded-lg border border-clinical-slate/20 hover:border-clinical-gold/40 transition-colors group"
                              >
                                <img
                                  src={d.image}
                                  alt={d.name}
                                  className="w-12 h-12 rounded object-cover shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-white group-hover:text-clinical-gold transition-colors truncate">
                                    {d.name}
                                  </p>
                                  <p className="text-[11px] text-clinical-zinc truncate">
                                    {d.macros.calories} kcal · {d.macros.protein}g protein
                                  </p>
                                </div>
                                <span className="text-xs text-clinical-zinc tabular-nums shrink-0">
                                  {formatPrice(d.price)}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-clinical-slate/20">
                      <div className="space-y-0.5">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-bold text-clinical-gold tabular-nums">
                            {formatPrice(b.pricePaise)}
                          </span>
                          <span className="text-xs text-clinical-zinc line-through tabular-nums">
                            {formatPrice(b.originalPricePaise)}
                          </span>
                        </div>
                        <p className="text-[10px] text-clinical-sage font-semibold">
                          You save {formatPrice(savings)}
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => handleAddBundle(b)}
                        className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-1.5"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Add Combo to Order
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Protocol filter chips — promotes the clinical-grade IA axis to
          a first-class browsing dimension (was previously only reachable
          via deep-link `?protocol=` from the Community → Wellness/
          Performance/Clinical pages). Per UX audit dimension 1.2. */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc font-semibold">
          Protocol
        </p>
        <div
          className="flex gap-2 overflow-x-auto md:flex-wrap -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filter by clinical protocol"
        >
          {(["all", ...PROTOCOLS] as const).map((p) => {
            const active = p === "all" ? !activeProtocol : activeProtocol === p;
            const label = p === "all" ? "All Protocols" : PROTOCOL_LABELS[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  if (p === "all") next.delete("protocol");
                  else next.set("protocol", p);
                  setSearchParams(next, { replace: true });
                }}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center px-3 min-h-[36px] rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
                  active
                    ? "border-clinical-gold/50 bg-clinical-gold/10 text-clinical-gold shadow-[0_0_12px_rgba(212,175,55,0.18)]"
                    : "border-clinical-slate/30 text-clinical-zinc hover:border-clinical-gold/30 hover:text-clinical-gold"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lifestyle filter chips */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc font-semibold">
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
        <div className="flex items-center gap-2 overflow-x-auto md:flex-wrap -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-clinical-zinc font-semibold pr-1">
            Diet
          </span>
          {(["all", "veg", "nonveg"] as DietFilter[]).map((opt) => {
            const active = diet === opt;
            const dot = opt === "veg" ? "bg-green-500" : opt === "nonveg" ? "bg-red-500" : null;
            return (
              <button
                key={opt}
                onClick={() => setDiet(opt)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
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

        <div
          className="flex gap-2 overflow-x-auto md:flex-wrap -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Filter by category"
        >
          {CATEGORY_TABS.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`shrink-0 inline-flex items-center px-3 min-h-[36px] rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
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

        <div
          className="flex gap-2 overflow-x-auto md:flex-wrap -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Filter by kitchen"
        >
          {KITCHEN_TABS.map((k) => {
            const active = kitchen === k;
            return (
              <button
                key={k}
                onClick={() => setKitchen(k)}
                className={`shrink-0 inline-flex items-center px-3 min-h-[36px] rounded-full border text-[11px] uppercase tracking-[0.12em] font-semibold transition-all ${
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

      {preferences && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-clinical-gold/20 bg-clinical-gold/5 px-3 py-2">
          <SparklesIcon className="w-3.5 h-3.5 text-clinical-gold" />
          <span className="text-[11px] text-clinical-zinc">
            Personalized for your{" "}
            <span className="text-clinical-gold capitalize">
              {preferences.dietaryStyle}
            </span>{" "}
            profile
            {blockedCount > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setHideBlocked((v) => !v)}
                  className="text-clinical-gold underline-offset-2 hover:underline"
                >
                  {hideBlocked
                    ? `${blockedCount} hidden by your preferences — show`
                    : "hide conflicts"}
                </button>
              </>
            )}
          </span>
          <Link
            to="/preferences"
            className="ml-auto text-[11px] text-clinical-gold hover:underline flex items-center gap-1"
          >
            <SlidersHorizontal className="w-3 h-3" />
            Edit
          </Link>
        </div>
      )}

      <div className="text-xs text-clinical-zinc tabular-nums">
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
              if (activeProtocol) {
                const next = new URLSearchParams(searchParams);
                next.delete("protocol");
                setSearchParams(next, { replace: true });
              }
            }}
            className="text-xs text-clinical-gold hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Dish grid — dark luxury cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(({ dish: item, match }) => (
          <article
            key={item.id}
            className={`group relative flex flex-col rounded-2xl overflow-hidden bg-clinical-surface-elevated border border-clinical-slate/20 hover:border-clinical-gold/50 transition-all duration-300 ${
              !item.isAvailable ? "opacity-50 grayscale" : ""
            } ${match.blocked ? "ring-1 ring-orange-500/40" : ""}`}
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
                {premiumSlugs.has(item.slug) && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-clinical-gold/50 text-clinical-gold bg-[#050505]/80 backdrop-blur-sm font-bold tracking-wider uppercase flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5" /> Premium
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

              {/* Macro chips — labels are abbreviated visually (CAL / PRO / C
                  / F / GI) so they fit on small screens, but every chip
                  carries an aria-label expanding the abbreviation so screen
                  readers announce them as full words instead of single
                  letters. */}
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={`Nutrition for ${item.name}`}
              >
                <MacroChip
                  label="CAL"
                  value={`${item.macros.calories}`}
                  ariaLabel={`${item.macros.calories} kilocalories`}
                />
                <MacroChip
                  label="PRO"
                  value={`${item.macros.protein}g`}
                  ariaLabel={`${item.macros.protein} grams of protein`}
                />
                <MacroChip
                  label="C"
                  value={`${item.macros.carbs}g`}
                  ariaLabel={`${item.macros.carbs} grams of carbohydrates`}
                />
                <MacroChip
                  label="F"
                  value={`${item.macros.fat}g`}
                  ariaLabel={`${item.macros.fat} grams of fat`}
                />
                <MacroChip
                  label="GI"
                  value={item.glycaemicIndex}
                  ariaLabel={`Glycaemic index ${item.glycaemicIndex}`}
                />
              </div>

              <div className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc font-semibold">
                {CATEGORY_LABELS[item.category]} · {item.kitchen}
              </div>

              {preferences &&
                (preferences.calorieTarget || preferences.proteinTargetGrams) && (
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {preferences.calorieTarget && (
                      <span className="px-1.5 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc">
                        {Math.round(
                          (item.macros.calories / preferences.calorieTarget) * 100,
                        )}
                        % of daily kcal
                      </span>
                    )}
                    {preferences.proteinTargetGrams && (
                      <span className="px-1.5 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc">
                        {Math.round(
                          (item.macros.protein / preferences.proteinTargetGrams) * 100,
                        )}
                        % of daily protein
                      </span>
                    )}
                  </div>
                )}

              {match.warnings.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-start gap-1.5 text-[11px] text-orange-400">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="leading-tight">{match.warnings[0]}</span>
                  </div>
                  {(() => {
                    const swap = findSmartSwap(item, preferences);
                    if (!swap) return null;
                    return (
                      <Link
                        to={`/dish/${swap.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 text-[11px] text-clinical-gold hover:underline"
                      >
                        <SparklesIcon className="w-3 h-3" />
                        Smart swap: {swap.name} →
                      </Link>
                    );
                  })()}
                </div>
              )}
              {match.warnings.length === 0 && match.reasons.length > 0 && (
                <div className="flex items-start gap-1.5 text-[11px] text-clinical-sage">
                  <SparklesIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="leading-tight">
                    Why this for you: {match.reasons[0]}
                  </span>
                </div>
              )}

              <WhyThisMealRow rationale={rationalesById.get(item.id)} />


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
                {premiumSlugs.has(item.slug) && !isPremium ? (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate("/premium");
                    }}
                    disabled={!item.isAvailable}
                    className="flex-1 h-10 bg-transparent border border-clinical-gold/50 text-clinical-gold hover:bg-clinical-gold/10 text-[11px] uppercase tracking-[0.12em] font-bold gap-1"
                  >
                    <Crown className="w-3 h-3" />
                    Premium Only
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={(e) => handleQuickAdd(e, item)}
                    disabled={!item.isAvailable}
                    className="flex-1 h-10 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 disabled:opacity-50 disabled:pointer-events-none text-[11px] uppercase tracking-[0.12em] font-bold gap-1 shadow-[0_0_15px_rgba(212,175,55,0.15)] hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]"
                  >
                    <Plus className="w-3 h-3" />
                    Add to Order
                  </Button>
                )}
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
            {premiumSlugs.has(item.slug) && !isPremium && item.isAvailable && (
              <div className="absolute inset-0 z-20 flex items-start justify-end p-2 bg-gradient-to-b from-[#050505]/30 to-transparent pointer-events-none">
                <span className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-full bg-clinical-gold/15 border border-clinical-gold/40 text-clinical-gold font-bold uppercase tracking-wider backdrop-blur-sm">
                  <Crown className="w-3 h-3" />
                  Premium
                </span>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function WhyThisMealRow({ rationale }: { rationale: DishRationale | undefined }) {
  const [open, setOpen] = useState(false);
  if (!rationale) return null;
  return (
    <div className="rounded-md border border-clinical-gold/20 bg-clinical-gold/[0.04] px-2.5 py-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-full flex items-start gap-1.5 text-left"
        aria-expanded={open}
      >
        <SparklesIcon className="w-3 h-3 mt-0.5 text-clinical-gold shrink-0" />
        <span className="flex-1 text-[11px] leading-snug text-clinical-zinc">
          <span className="text-clinical-gold font-semibold uppercase tracking-[0.1em] text-[9px] mr-1">
            Why this meal
          </span>
          {open ? rationale.expanded : rationale.rationale}
        </span>
        <span className="text-[10px] text-clinical-zinc/60 shrink-0">
          {open ? "Less" : "More"}
        </span>
      </button>
    </div>
  );
}

function MacroChip({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-clinical-surface border border-clinical-slate/20"
      aria-label={ariaLabel ?? `${label} ${value}`}
      role="group"
    >
      <span
        className="text-[9px] uppercase tracking-[0.12em] text-clinical-zinc font-semibold"
        aria-hidden="true"
      >
        {label}
      </span>
      <span
        className="text-[11px] tabular-nums text-clinical-gold font-medium"
        aria-hidden="true"
      >
        {value}
      </span>
    </div>
  );
}
