import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { getRdPlanBySlug, getRdAuthor, resolvePlanWeek, findPlanSafeSwap } from "@/lib/rdPlans";
import { evaluateDishForPreferences } from "@/lib/preferencesMatch";
import { usePreferences } from "@/lib/preferencesContext";
import { ACCENT_CLASSES } from "@/lib/teamData";
import type { SubscriptionItem } from "@/lib/subscriptionsApi";
import { Stethoscope } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CalendarDays,
  Users,
  Clock,
  Sparkles,
  Plus,
  X,
  ChevronRight,
  MapPin,
} from "lucide-react";
import {
  subscriptionsApi,
  CADENCE_LABEL,
  type SubscriptionCadence,
} from "@/lib/subscriptionsApi";

const CADENCES: Array<{
  value: SubscriptionCadence;
  description: string;
  saving: string;
}> = [
  { value: "weekly", description: "7 days · max freshness", saving: "Save 5%" },
  {
    value: "fortnightly",
    description: "14 days · balanced rhythm",
    saving: "Save 10%",
  },
  {
    value: "monthly",
    description: "30 days · best value",
    saving: "Save 15%",
  },
];

const MEAL_COUNTS = [5, 10, 15, 21];

const TIME_WINDOWS = [
  "07:00 - 08:00",
  "12:00 - 13:00",
  "13:00 - 14:00",
  "19:00 - 20:00",
  "20:00 - 21:00",
];

const LIFESTYLES = [
  { value: "", label: "No preference" },
  { value: "heart-healthy", label: "Heart-Healthy" },
  { value: "fitness-gains", label: "Fitness Gains" },
  { value: "diabetes-management", label: "Diabetes Mgmt" },
  { value: "junior-explorers", label: "Junior Explorer" },
  { value: "silver-vitality", label: "Silver Vitality" },
];

const COMMON_ALLERGENS = ["dairy", "gluten", "nuts", "soy", "eggs", "shellfish"];

interface MemberDraft {
  name: string;
  diet: "any" | "veg" | "nonveg";
  allergens: string[];
  lifestyle: string;
  spiceLevel: "mild" | "medium" | "hot";
}

const blankMember = (): MemberDraft => ({
  name: "",
  diet: "any",
  allergens: [],
  lifestyle: "",
  spiceLevel: "medium",
});

function basePrice(cadence: SubscriptionCadence, meals: number): number {
  const perMeal = 26000;
  const discount = cadence === "weekly" ? 0.95 : cadence === "fortnightly" ? 0.9 : 0.85;
  return Math.round(meals * perMeal * discount);
}

export default function Subscribe() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planSlug = searchParams.get("plan");
  const rdPlan = planSlug ? getRdPlanBySlug(planSlug) : undefined;
  const rdAuthor = rdPlan ? getRdAuthor(rdPlan) : undefined;
  const { preferences } = usePreferences();
  const planItemsResult = useMemo<{ items: SubscriptionItem[]; swappedCount: number; droppedCount: number }>(() => {
    if (!rdPlan) return { items: [], swappedCount: 0, droppedCount: 0 };
    const week = resolvePlanWeek(rdPlan);
    const items: SubscriptionItem[] = [];
    const seen = new Set<string>();
    let swappedCount = 0;
    let droppedCount = 0;
    for (const day of week) {
      for (const meal of [day.lunch, day.dinner]) {
        if (!meal) continue;
        let chosen = meal;
        if (preferences) {
          const evalResult = evaluateDishForPreferences(meal, preferences);
          const needsSwap =
            evalResult.blocked ||
            evalResult.matchedAllergens.length > 0 ||
            evalResult.matchedDislikes.length > 0;
          if (needsSwap) {
            const swap = findPlanSafeSwap(rdPlan, meal, preferences);
            if (!swap) {
              droppedCount += 1;
              continue;
            }
            chosen = swap;
            swappedCount += 1;
          }
        }
        if (seen.has(chosen.slug)) continue;
        seen.add(chosen.slug);
        items.push({
          slug: chosen.slug,
          name: chosen.name,
          image: chosen.image,
          quantity: 1,
          unitPricePaise: chosen.price,
        });
      }
    }
    return { items: items.slice(0, 14), swappedCount, droppedCount };
  }, [rdPlan, preferences]);
  const planWeekItems = planItemsResult.items;
  const [cadence, setCadence] = useState<SubscriptionCadence>("weekly");
  const [meals, setMeals] = useState(10);
  useEffect(() => {
    if (rdPlan) {
      setCadence("weekly");
      setMeals(Math.min(planWeekItems.length || 10, 14));
    }
  }, [rdPlan, planWeekItems.length]);
  const [window, setWindow] = useState(TIME_WINDOWS[1]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [members, setMembers] = useState<MemberDraft[]>([
    { ...blankMember(), name: "Primary" },
  ]);
  const [address, setAddress] = useState({
    label: "Home",
    line: "",
    city: "",
    pincode: "",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const total = basePrice(cadence, meals);

  const updateMember = (idx: number, patch: Partial<MemberDraft>) => {
    setMembers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    );
  };
  const toggleAllergen = (idx: number, allergen: string) => {
    setMembers((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const has = m.allergens.includes(allergen);
        return {
          ...m,
          allergens: has
            ? m.allergens.filter((a) => a !== allergen)
            : [...m.allergens, allergen],
        };
      }),
    );
  };
  const addMember = () => setMembers((p) => [...p, blankMember()]);
  const removeMember = (idx: number) =>
    setMembers((p) => p.filter((_, i) => i !== idx));

  const submit = async () => {
    if (members.some((m) => !m.name.trim())) {
      toast.error("Please name every family member");
      return;
    }
    if (!address.line.trim() || !address.phone.trim()) {
      toast.error("Address line and phone are required");
      return;
    }
    setSubmitting(true);
    try {
      const result = await subscriptionsApi.create({
        cadence,
        mealsPerDelivery: meals,
        deliveryWindow: window,
        startDate: new Date(startDate).toISOString(),
        addressLabel: address.label,
        addressLine: address.line,
        city: address.city,
        pincode: address.pincode,
        phone: address.phone,
        notes: rdPlan ? `RD Plan: ${rdPlan.name}` : undefined,
        members: members.map((m) => ({
          name: m.name.trim(),
          diet: m.diet,
          allergens: m.allergens,
          lifestyle: m.lifestyle || undefined,
          spiceLevel: m.spiceLevel,
        })),
        defaultItems: planWeekItems,
      });
      toast.success("Subscription activated", {
        description: `Next delivery: ${new Date(result.subscription.nextDeliveryAt).toLocaleDateString()}`,
      });
      navigate("/subscriptions");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message === "unauthorized") {
        toast.error("Please sign in to subscribe");
        navigate("/login?next=/subscribe");
      } else {
        toast.error("Could not create subscription", { description: message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <header className="space-y-2 text-center">
        <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
          Tanmatra Plans
        </Badge>
        <h1 className="text-3xl md:text-4xl font-serif text-white">
          Build your nourishment subscription
        </h1>
        <p className="text-sm text-clinical-zinc max-w-xl mx-auto">
          Choose your rhythm. We materialize the next four deliveries instantly,
          locked into the same time window. Skip any week — your meals roll over
          as credits.
        </p>
      </header>

      {rdPlan && (
        <Card className="bg-gradient-to-br from-clinical-gold/10 to-transparent border-clinical-gold/40">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-clinical-gold/15 ring-1 ring-clinical-gold/30 flex items-center justify-center shrink-0">
              <Stethoscope className="w-5 h-5 text-clinical-gold" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-clinical-gold">
                Subscribing to RD Plan
              </p>
              <h2 className="font-serif text-xl text-white">{rdPlan.name}</h2>
              <p className="text-xs text-clinical-zinc">
                We've pre-loaded {planWeekItems.length} curated meals
                {planItemsResult.swappedCount > 0 && (
                  <>
                    {" "}— <span className="text-clinical-sage">{planItemsResult.swappedCount} auto-swapped</span> for your allergens & dislikes
                  </>
                )}
                {planItemsResult.droppedCount > 0 && (
                  <>
                    {" "}({planItemsResult.droppedCount} skipped — no safe match in catalog)
                  </>
                )}
                . Update{" "}
                <Link to="/preferences" className="text-clinical-gold underline">
                  Preferences
                </Link>{" "}
                any time to re-curate.
                {rdAuthor && (
                  <>
                    {" "}Curated by{" "}
                    <Link
                      to={`/team/${rdAuthor.slug}`}
                      className={`underline ${ACCENT_CLASSES[rdAuthor.accent].text}`}
                    >
                      {rdAuthor.name}
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
            <Link
              to={`/plans/${rdPlan.slug}`}
              className="text-[11px] uppercase tracking-wider text-clinical-gold hover:underline shrink-0"
            >
              View week →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Cadence */}
      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-clinical-zinc text-xs uppercase tracking-widest">
            <CalendarDays className="w-4 h-4 text-clinical-gold" /> Step 1 — Cadence
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {CADENCES.map((c) => {
              const active = cadence === c.value;
              return (
                <button
                  key={c.value}
                  onClick={() => setCadence(c.value)}
                  className={`text-left rounded-lg border p-4 transition-all ${
                    active
                      ? "border-clinical-gold bg-clinical-gold/10"
                      : "border-clinical-slate/30 hover:border-clinical-gold/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-white font-semibold">
                      {CADENCE_LABEL[c.value]}
                    </p>
                    <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 text-[10px]">
                      {c.saving}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-clinical-zinc mt-1">
                    {c.description}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Meals + window */}
      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2 text-clinical-zinc text-xs uppercase tracking-widest">
            <Sparkles className="w-4 h-4 text-clinical-gold" /> Step 2 — Volume & Window
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-clinical-zinc">Meals per delivery</Label>
            <div className="flex flex-wrap gap-2">
              {MEAL_COUNTS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMeals(m)}
                  className={`px-4 py-2 rounded-md border text-sm transition-all ${
                    meals === m
                      ? "border-clinical-gold bg-clinical-gold/10 text-clinical-gold"
                      : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                  }`}
                >
                  {m} meals
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-clinical-zinc flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Delivery window (locked-in)
              </Label>
              <div className="flex flex-wrap gap-2">
                {TIME_WINDOWS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWindow(w)}
                    className={`px-3 py-1.5 rounded-md border text-xs transition-all ${
                      window === w
                        ? "border-clinical-gold bg-clinical-gold/10 text-clinical-gold"
                        : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-clinical-zinc">First delivery date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="bg-clinical-dark border-clinical-slate/30 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-clinical-zinc text-xs uppercase tracking-widest">
              <Users className="w-4 h-4 text-clinical-gold" /> Step 3 — Family Members
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={addMember}
              className="border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 gap-1.5 text-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Add eater
            </Button>
          </div>
          {members.map((m, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-clinical-slate/30 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <Input
                  placeholder="Member name"
                  value={m.name}
                  onChange={(e) => updateMember(idx, { name: e.target.value })}
                  className="bg-clinical-dark border-clinical-slate/30 text-white max-w-[260px]"
                />
                {members.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeMember(idx)}
                    className="h-7 w-7 text-clinical-zinc hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-clinical-zinc uppercase tracking-wider">Diet</Label>
                  <div className="flex gap-1.5">
                    {(["any", "veg", "nonveg"] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => updateMember(idx, { diet: d })}
                        className={`flex-1 px-2 py-1 rounded-md border text-[11px] uppercase tracking-wide ${
                          m.diet === d
                            ? "border-clinical-gold bg-clinical-gold/10 text-clinical-gold"
                            : "border-clinical-slate/30 text-clinical-zinc"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-clinical-zinc uppercase tracking-wider">Spice</Label>
                  <div className="flex gap-1.5">
                    {(["mild", "medium", "hot"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateMember(idx, { spiceLevel: s })}
                        className={`flex-1 px-2 py-1 rounded-md border text-[11px] uppercase tracking-wide ${
                          m.spiceLevel === s
                            ? "border-clinical-gold bg-clinical-gold/10 text-clinical-gold"
                            : "border-clinical-slate/30 text-clinical-zinc"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-clinical-zinc uppercase tracking-wider">Lifestyle</Label>
                  <select
                    value={m.lifestyle}
                    onChange={(e) => updateMember(idx, { lifestyle: e.target.value })}
                    className="w-full bg-clinical-dark border border-clinical-slate/30 text-white text-xs rounded-md px-2 py-1.5"
                  >
                    {LIFESTYLES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] text-clinical-zinc uppercase tracking-wider">Allergens to avoid</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_ALLERGENS.map((a) => {
                    const on = m.allergens.includes(a);
                    return (
                      <button
                        key={a}
                        onClick={() => toggleAllergen(idx, a)}
                        className={`px-2 py-1 rounded-full text-[10px] capitalize border transition-all ${
                          on
                            ? "border-red-400/50 bg-red-500/10 text-red-300"
                            : "border-clinical-slate/30 text-clinical-zinc hover:text-white"
                        }`}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-clinical-zinc text-xs uppercase tracking-widest">
            <MapPin className="w-3.5 h-3.5 text-clinical-gold" />
            Step 4 — Delivery Address
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-clinical-zinc">Label</Label>
              <Input
                value={address.label}
                onChange={(e) => setAddress({ ...address, label: e.target.value })}
                className="bg-clinical-dark border-clinical-slate/30 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-clinical-zinc">Phone</Label>
              <Input
                value={address.phone}
                onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                className="bg-clinical-dark border-clinical-slate/30 text-white"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs text-clinical-zinc">Address line</Label>
              <Input
                value={address.line}
                onChange={(e) => setAddress({ ...address, line: e.target.value })}
                className="bg-clinical-dark border-clinical-slate/30 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-clinical-zinc">City</Label>
              <Input
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
                className="bg-clinical-dark border-clinical-slate/30 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-clinical-zinc">PIN code</Label>
              <Input
                value={address.pincode}
                onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                className="bg-clinical-dark border-clinical-slate/30 text-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="bg-gradient-to-br from-clinical-gold/10 to-transparent border-clinical-gold/30 sticky bottom-4">
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
              {CADENCE_LABEL[cadence]} · {meals} meals · {members.length} member{members.length === 1 ? "" : "s"}
            </p>
            <p className="text-2xl font-bold text-clinical-gold tabular-nums">
              ₹{(total / 100).toFixed(0)}
              <span className="text-sm text-clinical-zinc font-normal"> / delivery</span>
            </p>
          </div>
          <Button
            onClick={submit}
            disabled={submitting}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2 px-6"
          >
            {submitting ? "Activating…" : "Activate Subscription"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
