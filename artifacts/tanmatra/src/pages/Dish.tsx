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
import { toast } from "sonner";
import { getDishBySlug } from "@/lib/menuData";
import { useCart } from "@/lib/cartContext";
import { formatPrice } from "@/lib/api/adapter";
import {
  ArrowLeft,
  ShieldCheck,
  ChefHat,
  ClipboardList,
  Minus,
  Plus,
  AlertTriangle,
  Activity,
} from "lucide-react";

export default function Dish() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const meal = slug ? getDishBySlug(slug) : undefined;

  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Record<number, string | string[]>>(() => {
    const init: Record<number, string | string[]> = {};
    meal?.customizations.forEach((group, idx) => {
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
    meal.customizations.forEach((group, idx) => {
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
  }, [selections, meal]);

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
    meal.customizations.forEach((group, idx) => {
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

  const handleAddToPlan = () => {
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
    toast.success(`Added ${meal.name} to Nutrition Plan`, {
      description: `${formatPrice(calculatedTotal)} · Qty: ${quantity}${
        customizations.length > 0 ? ` · ${customizations.length} custom` : ""
      }`,
      action: {
        label: "View Plan",
        onClick: () => navigate("/cart"),
      },
    });
  };

  const pairingDish = meal.pairingSlug ? getDishBySlug(meal.pairingSlug) : undefined;

  return (
    <div className="min-h-screen bg-clinical-dark pb-32">
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <Link
          to="/menu"
          className="inline-flex items-center gap-1.5 text-xs text-clinical-zinc hover:text-clinical-gold transition-colors"
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

            <div className="absolute bottom-4 left-4 right-4 bg-[#050505]/80 backdrop-blur-md rounded-xl p-4 border border-clinical-slate/20">
              <MacroOverlay macros={meal.macros} rdVerified={meal.rdVerified} />
            </div>
          </div>

          {pairingDish && (
            <Card className="bg-clinical-surface border-clinical-slate/20">
              <CardContent className="p-4">
                <p className="text-clinical-label mb-2">Suggested Pairing</p>
                <Link to={`/dish/${pairingDish.slug}`} className="flex items-center gap-3 group">
                  <img
                    src={pairingDish.image}
                    alt={pairingDish.name}
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
            <p className="text-xs text-clinical-zinc/70 leading-relaxed">{meal.longDescription}</p>

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

          <Separator className="bg-clinical-slate/20" />

          {meal.rdNote && (
            <div className="bg-clinical-sage/8 rounded-xl p-4 border border-clinical-sage/20">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-clinical-sage shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-clinical-sage mb-1">RD Advisory Note</p>
                  <p className="text-xs text-clinical-zinc leading-relaxed">{meal.rdNote}</p>
                </div>
              </div>
            </div>
          )}

          <Separator className="bg-clinical-slate/20" />

          <div className="space-y-2">
            <p className="text-clinical-label">Ingredients</p>
            <ul className="space-y-1.5">
              {meal.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-clinical-zinc">
                  <span className="w-1 h-1 rounded-full bg-clinical-gold shrink-0" />
                  {ing}
                </li>
              ))}
            </ul>
          </div>

          {meal.customizations.length > 0 && <Separator className="bg-clinical-slate/20" />}

          {meal.customizations.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-clinical-gold" />
                <p className="text-clinical-label">Customize Your Order</p>
              </div>

              {meal.customizations.map((group, groupIdx) => (
                <div key={group.groupName} className="space-y-3">
                  <h3 className="text-sm font-semibold text-white">{group.groupName}</h3>

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
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#050505]/95 backdrop-blur-xl border-t border-clinical-slate/30">
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

          <Button
            onClick={handleAddToPlan}
            className="flex-1 sm:flex-initial bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 px-6 shadow-clinical-lg text-sm gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            Add to Plan
            <span className="tabular-nums">— {formatPrice(calculatedTotal)}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
