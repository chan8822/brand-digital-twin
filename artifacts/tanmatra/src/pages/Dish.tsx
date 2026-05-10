import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import MacroOverlay from "@/components/dish/MacroOverlay";
import NutritionLabelModal from "@/components/dish/NutritionLabelModal";
import { buildNutritionLabel } from "@/lib/nutritionLabel";
import WhyThisMealPanel from "@/components/dish/WhyThisMealPanel";
import CoachAgentWidget from "@/components/ai/CoachAgent";
import DishReviews from "@/components/dish/DishReviews";
import { getChefForDish, getRdForDish, ACCENT_CLASSES } from "@/lib/teamData";
import { toast } from "sonner";
import { getDishBySlug, useMenuCatalog } from "@/lib/menuData";
import {
  getCustomizationsForDish,
  getKitchenNoteForDish,
  getRdNoteForDish,
  getUpsellsForDish,
  stripIngredientAmount,
} from "@/lib/dishEnrichment";
import { useCart } from "@/lib/cartContext";
import { usePreferences } from "@/lib/preferencesContext";
import { usePremiumStatus, usePremiumSlugs } from "@/lib/usePremium";
import {
  evaluateDishForPreferences,
  findSmartSwap,
} from "@/lib/preferencesMatch";
import { formatPrice } from "@/lib/api/adapter";
import {
  ArrowLeft,
  ShieldCheck,
  ChefHat,
  ClipboardList,
  ShoppingCart,
  Minus,
  Plus,
  AlertTriangle,
  Activity,
  Flame,
  Sparkles,
  Utensils,
  ArrowRight,
  Crown,
} from "lucide-react";

export default function Dish() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { preferences } = usePreferences();
  const { isPremium } = usePremiumStatus();
  const premiumSlugs = usePremiumSlugs();
  const { dishes: catalogDishes } = useMenuCatalog();
  const meal = useMemo(() => {
    if (!slug) return undefined;
    return catalogDishes.find((d) => d.slug === slug) ?? getDishBySlug(slug);
  }, [slug, catalogDishes]);
  const match = useMemo(
    () => (meal ? evaluateDishForPreferences(meal, preferences) : null),
    [meal, preferences],
  );
  const smartSwap = useMemo(
    () => (meal ? findSmartSwap(meal, preferences) : null),
    [meal, preferences],
  );

  const customizations = useMemo(
    () => (meal ? getCustomizationsForDish(meal) : []),
    [meal],
  );

  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<number, string | string[]>>(() => {
    const init: Record<number, string | string[]> = {};
    customizations.forEach((group, idx) => {
      if (group.type === "single") {
        const def = group.options.find((o) => o.default);
        init[idx] = def?.name ?? group.options[0].name;
      } else {
        init[idx] = [];
      }
    });
    return init;
  });

  const calculatedUnitPrice = useMemo(() => {
    if (!meal) return 0;
    let modifierTotal = 0;
    customizations.forEach((group, idx) => {
      const sel = selections[idx];
      if (group.type === "single" && typeof sel === "string") {
        const opt = group.options.find((o) => o.name === sel);
        modifierTotal += opt?.priceModifier ?? 0;
      } else if (group.type === "multiple" && Array.isArray(sel)) {
        sel.forEach((name) => {
          const opt = group.options.find((o) => o.name === name);
          modifierTotal += opt?.priceModifier ?? 0;
        });
      }
    });
    return meal.price + modifierTotal;
  }, [selections, meal, customizations]);

  const calculatedTotal = calculatedUnitPrice * quantity;

  if (!meal) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">Dish not found</h1>
        <p className="text-sm text-clinical-zinc">
          We couldn't find a dish with the slug <code className="text-clinical-gold">{slug}</code>.
        </p>
        <Link to="/menu">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Menu
          </Button>
        </Link>
      </div>
    );
  }

  const handleSingleSelect = (groupIdx: number, value: string) => {
    setSelections((prev) => ({ ...prev, [groupIdx]: value }));
  };

  const handleMultipleToggle = (groupIdx: number, optionName: string) => {
    setSelections((prev) => {
      const current = (prev[groupIdx] as string[]) ?? [];
      const exists = current.includes(optionName);
      return {
        ...prev,
        [groupIdx]: exists ? current.filter((n) => n !== optionName) : [...current, optionName],
      };
    });
  };

  const collectCustomizationsForCart = (): string[] => {
    const labels: string[] = [];
    customizations.forEach((group, idx) => {
      const sel = selections[idx];
      if (group.type === "single" && typeof sel === "string") {
        const opt = group.options.find((o) => o.name === sel);
        if (opt && !opt.default) {
          const sign = opt.priceModifier > 0 ? "+" : opt.priceModifier < 0 ? "−" : "";
          const amt =
            opt.priceModifier !== 0 ? ` (${sign}Rs.${Math.abs(opt.priceModifier) / 100})` : "";
          labels.push(`${opt.name}${amt}`);
        }
      } else if (group.type === "multiple" && Array.isArray(sel)) {
        sel.forEach((name) => {
          const opt = group.options.find((o) => o.name === name);
          if (opt) {
            labels.push(`${opt.name} (+Rs.${opt.priceModifier / 100})`);
          }
        });
      }
    });
    return labels;
  };

  const isPremiumOnly = !!meal && premiumSlugs.has(meal.slug);
  const handleAddToPlan = () => {
    if (isPremiumOnly && !isPremium) {
      toast.error(`${meal!.name} is a Premium-only dish`, {
        description: "Join Tanmatra Premium to add this dish.",
        action: { label: "See Premium", onClick: () => navigate("/premium") },
      });
      return;
    }
    const customizations = collectCustomizationsForCart();
    addItem({
      dishId: meal.id,
      slug: meal.slug,
      name: meal.name,
      image: meal.image,
      basePrice: meal.price,
      unitPrice: calculatedUnitPrice,
      quantity,
      kitchen: meal.kitchen,
      isVeg: meal.isVeg,
      rdVerified: meal.rdVerified,
      macros: meal.macros,
      customizations,
    });
    toast.success(`Added ${meal.name} to your order`, {
      description: `${formatPrice(calculatedTotal)} · Qty: ${quantity}${
        customizations.length > 0 ? ` · ${customizations.length} custom` : ""
      }`,
      action: {
        label: "View Cart",
        onClick: () => navigate("/cart"),
      },
    });
  };

  const pairingDish = meal.pairingSlug ? getDishBySlug(meal.pairingSlug) : undefined;
  const upsells = getUpsellsForDish(meal, 3);
  const kitchenNote = getKitchenNoteForDish(meal);
  const rdNote = getRdNoteForDish(meal);
  const chef = getChefForDish(meal);
  const rd = getRdForDish(meal);
  const chefAccent = chef ? ACCENT_CLASSES[chef.accent] : null;
  const rdAccent = rd ? ACCENT_CLASSES[rd.accent] : null;

  return (
    <div className="min-h-screen bg-clinical-dark pb-48 md:pb-32">
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <Link
          to="/menu"
          className="inline-flex items-center gap-1.5 min-h-[36px] py-2 -ml-1 px-1 text-xs text-clinical-zinc hover:text-clinical-gold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Menu
        </Link>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="relative aspect-square rounded-2xl overflow-hidden border border-clinical-slate/20">
            <img
              src={meal.image}
              alt={meal.name}
              className="w-full h-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/60 via-transparent to-transparent" />

            <div className="absolute top-4 left-4 flex gap-2 items-center">
              <span
                role="img"
                className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center bg-[#050505]/80 ${
                  meal.isVeg ? "border-green-500" : "border-red-500"
                }`}
                aria-label={meal.isVeg ? "Vegetarian" : "Non-vegetarian"}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    meal.isVeg ? "bg-green-500" : "bg-red-500"
                  }`}
                />
              </span>
              <Badge className="bg-clinical-gold/90 text-[#050505] border-0 font-bold tabular-nums">
                {formatPrice(meal.price)}
              </Badge>
              {meal.rdVerified && (
                <Badge className="bg-clinical-sage/80 text-white border-0 gap-1 backdrop-blur-sm">
                  <ShieldCheck className="w-3 h-3" />
                  RD Verified
                </Badge>
              )}
              {isPremiumOnly && (
                <Badge className="bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/50 gap-1 backdrop-blur-sm font-bold uppercase tracking-wider">
                  <Crown className="w-3 h-3" />
                  Premium
                </Badge>
              )}
            </div>

            <div className="absolute top-4 right-4">
              <Badge
                variant="outline"
                className="border-clinical-slate/40 text-clinical-zinc bg-[#050505]/60 backdrop-blur-sm capitalize"
              >
                <ChefHat className="w-3 h-3 mr-1" />
                {meal.kitchen}
              </Badge>
            </div>

            <div className="absolute bottom-3 left-3 right-3 bg-[#050505]/80 backdrop-blur-md rounded-lg px-3 py-2 border border-clinical-slate/20">
              <MacroOverlay
                macros={meal.macros}
                rdVerified={meal.rdVerified}
                sodiumMg={buildNutritionLabel(meal).macros.sodiumMg}
                compact
              />
            </div>
          </div>

          {pairingDish && (
            <Card className="bg-clinical-surface border-clinical-slate/20">
              <CardContent className="p-4">
                <p className="text-clinical-label mb-2">Suggested Pairing</p>
                <Link
                  to={`/dish/${pairingDish.slug}`}
                  className="flex items-center gap-3 group"
                  aria-label={`Pair with ${pairingDish.name} — adds ${pairingDish.macros.protein}g protein`}
                >
                  <img
                    src={pairingDish.image}
                    alt={`${pairingDish.name} — suggested pairing`}
                    className="w-14 h-14 rounded-lg object-cover border border-clinical-slate/20 group-hover:border-clinical-gold/40 transition-colors"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white group-hover:text-clinical-gold transition-colors truncate">
                      {pairingDish.name}
                    </p>
                    <p className="text-xs text-clinical-zinc">
                      Adds {pairingDish.macros.protein}g protein · {pairingDish.macros.calories} kcal
                    </p>
                  </div>
                  <p className="text-xs text-clinical-gold tabular-nums shrink-0">
                    +{formatPrice(pairingDish.price)}
                  </p>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <h1 className="text-clinical-h1 text-white">{meal.name}</h1>
            <p className="text-sm text-clinical-zinc leading-relaxed">{meal.description}</p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="border-clinical-slate/30 text-clinical-zinc text-[10px] gap-1">
                <ChefHat className="w-3 h-3" />
                {meal.prepTime} prep
              </Badge>
              <Badge variant="outline" className="border-clinical-slate/30 text-clinical-zinc text-[10px] gap-1">
                <Activity className="w-3 h-3" />
                GI: {meal.glycaemicIndex}
              </Badge>
              <Badge variant="outline" className="border-clinical-slate/30 text-clinical-zinc text-[10px]">
                Sugar: {meal.sugarPerServing}
              </Badge>
              {meal.allergens.length > 0 ? (
                meal.allergens.map((a) => (
                  <Badge
                    key={a}
                    variant="outline"
                    className="border-orange-500/30 text-orange-400 text-[10px]"
                  >
                    Allergen: {a}
                  </Badge>
                ))
              ) : (
                <Badge variant="outline" className="border-green-500/30 text-green-400 text-[10px]">
                  No common allergens
                </Badge>
              )}
            </div>
          </div>

          {preferences &&
            meal &&
            (preferences.calorieTarget || preferences.proteinTargetGrams) && (
              <div className="rounded-xl border border-clinical-slate/20 bg-clinical-surface-elevated p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc/70 font-semibold">
                  Vs. your daily targets
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {preferences.calorieTarget && (
                    <div className="flex items-center justify-between">
                      <span className="text-clinical-zinc">Calories</span>
                      <span className="tabular-nums text-white">
                        {meal.macros.calories} /{" "}
                        <span className="text-clinical-zinc">
                          {preferences.calorieTarget}
                        </span>{" "}
                        <span className="text-clinical-gold">
                          (
                          {Math.round(
                            (meal.macros.calories / preferences.calorieTarget) *
                              100,
                          )}
                          %)
                        </span>
                      </span>
                    </div>
                  )}
                  {preferences.proteinTargetGrams && (
                    <div className="flex items-center justify-between">
                      <span className="text-clinical-zinc">Protein</span>
                      <span className="tabular-nums text-white">
                        {meal.macros.protein}g /{" "}
                        <span className="text-clinical-zinc">
                          {preferences.proteinTargetGrams}g
                        </span>{" "}
                        <span className="text-clinical-gold">
                          (
                          {Math.round(
                            (meal.macros.protein /
                              preferences.proteinTargetGrams) *
                              100,
                          )}
                          %)
                        </span>
                      </span>
                    </div>
                  )}
                  {preferences.carbsTargetGrams && (
                    <div className="flex items-center justify-between">
                      <span className="text-clinical-zinc">Carbs</span>
                      <span className="tabular-nums text-white">
                        {meal.macros.carbs}g /{" "}
                        <span className="text-clinical-zinc">
                          {preferences.carbsTargetGrams}g
                        </span>
                      </span>
                    </div>
                  )}
                  {preferences.fatTargetGrams && (
                    <div className="flex items-center justify-between">
                      <span className="text-clinical-zinc">Fat</span>
                      <span className="tabular-nums text-white">
                        {meal.macros.fat}g /{" "}
                        <span className="text-clinical-zinc">
                          {preferences.fatTargetGrams}g
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {match && (
            <div className="space-y-3">
              <WhyThisMealPanel
                dish={meal}
                preferences={preferences}
                match={match}
              />
              <CoachAgentWidget dishSlug={meal.slug} inline />
              {smartSwap && (
                <Link
                  to={`/dish/${smartSwap.slug}`}
                  className="flex items-center gap-2 rounded-lg border border-clinical-gold/30 bg-clinical-gold/5 px-3 py-2 hover:border-clinical-gold/60 transition-colors"
                >
                  <img
                    src={smartSwap.image}
                    alt={smartSwap.name}
                    className="w-10 h-10 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-clinical-gold font-semibold">
                      Smart swap for your profile
                    </p>
                    <p className="text-xs text-white truncate">
                      {smartSwap.name}
                    </p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-clinical-gold shrink-0" />
                </Link>
              )}
            </div>
          )}

          <Separator className="bg-clinical-slate/20" />

          <div className="flex flex-wrap gap-2">
            <NutritionLabelModal dish={meal} />
          </div>

          <div className="bg-clinical-sage/8 rounded-xl p-4 border border-clinical-sage/20">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-clinical-sage shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-clinical-sage mb-1">RD Advisory Note</p>
                <p className="text-xs text-clinical-zinc leading-relaxed">{rdNote}</p>
                {rd && rdAccent && (
                  <Link
                    to={`/team/${rd.slug}`}
                    className="mt-3 inline-flex items-center gap-2 group"
                  >
                    <span
                      className={`w-7 h-7 rounded-full ring-1 ${rdAccent.ring} ${rdAccent.bg} flex items-center justify-center shrink-0`}
                    >
                      <span className={`text-[10px] font-bold ${rdAccent.text}`}>
                        {rd.initials}
                      </span>
                    </span>
                    <span className="text-[11px] text-clinical-zinc">
                      Signed off by{" "}
                      <span className={`${rdAccent.text} group-hover:underline`}>
                        {rd.name}
                      </span>
                      <span className="text-clinical-zinc"> · {rd.title}</span>
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="bg-clinical-gold/5 rounded-xl p-4 border border-clinical-gold/20">
            <div className="flex items-start gap-3">
              <Flame className="w-4 h-4 text-clinical-gold shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-clinical-gold mb-1">From the Kitchen</p>
                <p className="text-xs text-clinical-zinc leading-relaxed">{kitchenNote}</p>
                {chef && chefAccent && (
                  <Link
                    to={`/team/${chef.slug}`}
                    className="mt-3 inline-flex items-center gap-2 group"
                  >
                    <span
                      className={`w-7 h-7 rounded-full ring-1 ${chefAccent.ring} ${chefAccent.bg} flex items-center justify-center shrink-0`}
                    >
                      <span className={`text-[10px] font-bold ${chefAccent.text}`}>
                        {chef.initials}
                      </span>
                    </span>
                    <span className="text-[11px] text-clinical-zinc">
                      Cooked by{" "}
                      <span className={`${chefAccent.text} group-hover:underline`}>
                        {chef.name}
                      </span>
                      <span className="text-clinical-zinc"> · {chef.title}</span>
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <Separator className="bg-clinical-slate/20" />

          <div className="space-y-2">
            <p className="text-clinical-label flex items-center gap-1.5">
              <Utensils className="w-3 h-3" />
              Ingredients
            </p>
            <div className="flex flex-wrap gap-1.5">
              {meal.ingredients.map((ing, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-1 rounded-md bg-clinical-surface border border-clinical-slate/20 text-clinical-zinc capitalize"
                >
                  {stripIngredientAmount(ing)}
                </span>
              ))}
            </div>
          </div>

          {customizations.length > 0 && <Separator className="bg-clinical-slate/20" />}

          {customizations.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-clinical-gold" />
                <p className="text-clinical-label">Customize Your Order</p>
              </div>

              {customizations.map((group, groupIdx) => (
                <div key={group.groupName} className="space-y-3">
                  <h2 className="text-sm font-semibold text-white">{group.groupName}</h2>

                  {group.type === "single" ? (
                    <RadioGroup
                      value={selections[groupIdx] as string}
                      onValueChange={(v) => handleSingleSelect(groupIdx, v)}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    >
                      {group.options.map((opt) => (
                        <Label
                          key={opt.name}
                          htmlFor={`${groupIdx}-${opt.name}`}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                            (selections[groupIdx] as string) === opt.name
                              ? "border-clinical-gold/50 bg-clinical-gold/5"
                              : "border-clinical-slate/20 bg-clinical-surface hover:border-clinical-slate/40"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <RadioGroupItem
                              value={opt.name}
                              id={`${groupIdx}-${opt.name}`}
                              className="border-clinical-slate/40"
                            />
                            <span className="text-xs text-white">{opt.name}</span>
                            {opt.default && (
                              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30 font-bold leading-none">
                                Chef's pick
                              </span>
                            )}
                          </div>
                          <span
                            className={`tabular-nums text-xs font-medium ${
                              opt.priceModifier > 0
                                ? "text-clinical-sage"
                                : opt.priceModifier < 0
                                ? "text-clinical-blue"
                                : "text-clinical-zinc"
                            }`}
                          >
                            {opt.priceModifier > 0 && "+"}
                            {opt.priceModifier !== 0 && formatPrice(opt.priceModifier)}
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.options.map((opt) => {
                        const selected = ((selections[groupIdx] as string[]) ?? []).includes(opt.name);
                        return (
                          <Label
                            key={opt.name}
                            htmlFor={`${groupIdx}-${opt.name}`}
                            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                              selected
                                ? "border-clinical-gold/50 bg-clinical-gold/5"
                                : "border-clinical-slate/20 bg-clinical-surface hover:border-clinical-slate/40"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <Checkbox
                                id={`${groupIdx}-${opt.name}`}
                                checked={selected}
                                onCheckedChange={() => handleMultipleToggle(groupIdx, opt.name)}
                                className="border-clinical-slate/40"
                              />
                              <span className="text-xs text-white">{opt.name}</span>
                              {opt.default && (
                                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30 font-bold leading-none">
                                  Recommended
                                </span>
                              )}
                            </div>
                            <span className="tabular-nums text-xs font-medium text-clinical-sage">
                              +{formatPrice(opt.priceModifier)}
                            </span>
                          </Label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Separator className="bg-clinical-slate/20" />

          <DishReviews slug={meal.slug} />

          <Separator className="bg-clinical-slate/20" />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-clinical-gold" />
              <p className="text-clinical-label">Often added together</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {upsells.map((u) => (
                <Link
                  to={`/dish/${u.slug}`}
                  key={u.id}
                  className="group flex items-center gap-2.5 p-2 rounded-lg bg-clinical-surface border border-clinical-slate/20 hover:border-clinical-gold/40 transition-colors"
                >
                  <img
                    src={u.image}
                    alt={u.name}
                    className="w-12 h-12 rounded-md object-cover shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-white truncate group-hover:text-clinical-gold transition-colors">
                      {u.name}
                    </p>
                    <p className="text-[10px] text-clinical-zinc tabular-nums">
                      {u.macros.calories} kcal · {formatPrice(u.price)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed left-0 right-0 z-50 bg-[#050505]/95 backdrop-blur-xl border-t border-clinical-slate/30 bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-clinical-surface rounded-lg border border-clinical-slate/20 p-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-clinical-zinc hover:text-white"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <span className="tabular-nums text-sm font-semibold text-white w-6 text-center">
                {quantity}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-clinical-zinc hover:text-white"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="hidden sm:block">
              <p className="text-clinical-label">Total</p>
              <p className="tabular-nums text-lg font-bold text-clinical-gold">
                {formatPrice(calculatedTotal)}
              </p>
            </div>
          </div>

          {isPremiumOnly && !isPremium ? (
            <Button
              onClick={() => navigate("/premium")}
              className="flex-1 sm:flex-initial bg-transparent border border-clinical-gold/50 text-clinical-gold hover:bg-clinical-gold/10 font-semibold h-11 px-6 text-sm gap-2"
            >
              <Crown className="w-4 h-4" />
              Premium Only — See Membership
            </Button>
          ) : (
            <Button
              onClick={handleAddToPlan}
              className="flex-1 sm:flex-initial bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 px-6 shadow-clinical-lg text-sm gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              Add to Order
              <span className="tabular-nums">— {formatPrice(calculatedTotal)}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
