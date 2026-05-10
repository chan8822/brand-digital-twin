import { Link, useNavigate } from "react-router";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MacroOverlay from "@/components/dish/MacroOverlay";
import { WeeklySummaryCard } from "@/pages/Wellness";
import SegmentToggle from "@/components/layout/SegmentToggle";
import { useOrders } from "@/lib/ordersContext";
import { useCart } from "@/lib/cartContext";
import { useMenuCatalog, type DishData } from "@/lib/menuData";
import { useChallenges } from "@/lib/contentApi";
import { usePreferences } from "@/lib/preferencesContext";
import {
  useDishRationales,
  type DishRationale,
} from "@/lib/dishRationaleApi";
import { Sparkles as SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import {
  ShieldCheck,
  BrainCircuit,
  FlaskConical,
  Activity,
  Microscope,
  Dna,
  ArrowRight,
  Star,
  HeartPulse,
  Zap,
  ChevronRight,
  Leaf,
  TrendingUp,
  Syringe,
  RefreshCw,
  Clock,
  Sun,
  Sunset,
  Moon,
  Plus,
  Flag,
  Users as UsersIcon,
  CalendarDays,
  Utensils,
  CalendarClock,
  HeartHandshake,
} from "lucide-react";

/* ── Featured meals (each with unique image) ──────────────────────── */
const FEATURED_MEALS = [
  {
    id: 1, name: "Activated Charcoal Smoothie", slug: "activated-charcoal-smoothie",
    description: "Activated charcoal powder, banana, almond milk, chia seeds. Detoxifying smoothie blended for daily gut and skin support.",
    image: "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80", price: 5000, kitchen: "continental", category: "beverages", rdVerified: true,
    macros: { protein: 3, carbs: 22, fat: 4, fiber: 2, calories: 140 }, tags: ["antioxidant", "vegetarian"],
  },
  {
    id: 3, name: "Aglio Olio (Chicken)", slug: "aglio-olio-chicken",
    description: "Spaghetti tossed in olive oil and garlic with grilled chicken strips and chili flakes. Classic continental comfort.",
    image: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80", price: 18000, kitchen: "continental", category: "pasta", rdVerified: true,
    macros: { protein: 28, carbs: 65, fat: 22, fiber: 5, calories: 580 }, tags: ["high-protein", "comfort"],
  },
  {
    id: 102, name: "Signature Quinoa Salad", slug: "signature-quinoa-salad",
    description: "Cooked quinoa with cucumber, tomato, pomegranate, and a light olive oil-lemon dressing. High-fiber, plant-based.",
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80", price: 9000, kitchen: "continental", category: "salads", rdVerified: true,
    macros: { protein: 12, carbs: 12, fat: 14, fiber: 6, calories: 220 }, tags: ["high-fiber", "vegetarian"],
  },
  {
    id: 107, name: "Tomato Basil Soup", slug: "tomato-basil-soup",
    description: "Slow-simmered tomatoes with garlic, fresh basil, and olive oil. Light, low-calorie comfort in a bowl.",
    image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80", price: 9500, kitchen: "continental", category: "soups", rdVerified: true,
    macros: { protein: 6, carbs: 14, fat: 6, fiber: 3, calories: 140 }, tags: ["low-cal", "vegetarian"],
  },
  {
    id: 97, name: "Power House Smoothie", slug: "power-house-smoothie",
    description: "Banana, oats, almonds, peanut butter, and whey protein blended with almond milk. Built for muscle recovery.",
    image: "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80", price: 8000, kitchen: "continental", category: "beverages", rdVerified: true,
    macros: { protein: 15, carbs: 22, fat: 4, fiber: 2, calories: 140 }, tags: ["high-protein", "vegetarian"],
  },
  {
    id: 92, name: "Peri Peri Paneer Fiesta Rice Bowl", slug: "peri-peri-paneer-fiesta-rice-bowl",
    description: "Brown rice topped with peri peri grilled paneer and steamed seasonal vegetables. A bold, balanced bowl.",
    image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80", price: 16500, kitchen: "indian", category: "bowls", rdVerified: true,
    macros: { protein: 22, carbs: 60, fat: 18, fiber: 7, calories: 460 }, tags: ["high-protein", "vegetarian"],
  },
];

const TRUST_SIGNALS = [
  { icon: ShieldCheck, label: "RD Advisory Board Verified", sub: "Every recipe reviewed by registered dietitians" },
  { icon: BrainCircuit, label: "Mifflin-St Jeor BMR Engine", sub: "Clinically precise metabolic calculations" },
  { icon: FlaskConical, label: "Gemini AI Logistics", sub: "Smart inventory & auto-rider dispatch" },
  { icon: Microscope, label: "Macro-Nutrient Precision", sub: "Lab-grade nutritional analysis per serving" },
];

const PROTOCOLS = [
  {
    id: "wellness", title: "Wellness Protocol", subtitle: "Preventive & Longevity Nutrition",
    description: "Clinically formulated meals for disease prevention, cellular health, and sustained daily vitality. Each dish prioritizes anti-inflammatory compounds and micronutrient density.",
    image: "/collections/wellness-collection.jpg",
    icon: HeartPulse, color: "text-clinical-sage", bg: "bg-clinical-sage/10", border: "border-clinical-sage/25", gradient: "from-clinical-sage/20 to-transparent",
    features: ["Anti-inflammatory ingredients", "12g+ fiber per meal", "<400 avg kcal", "Gut health optimized"],
    featureIcon: Leaf,
  },
  {
    id: "performance", title: "Performance Protocol", subtitle: "Athletic & Recovery Nutrition",
    description: "Evidence-based sports nutrition for muscle protein synthesis, glycogen replenishment, and rapid recovery. Validated by exercise physiology research.",
    image: "/collections/performance-collection.jpg",
    icon: Zap, color: "text-clinical-blue", bg: "bg-clinical-blue/10", border: "border-clinical-blue/25", gradient: "from-clinical-blue/20 to-transparent",
    features: ["2.5g+ leucine per meal", "3:1 carb:protein ratio", "40g+ protein / meal", "Tart cherry recovery"],
    featureIcon: TrendingUp,
  },
  {
    id: "clinical", title: "Clinical Protocol", subtitle: "Therapeutic & Condition-Specific",
    description: "Medical nutrition therapy for diabetes management, cardiovascular health, ketogenic protocols, and post-surgical recovery. Integrates with patient EHR.",
    image: "/collections/clinical-collection.jpg",
    icon: Dna, color: "text-clinical-gold", bg: "bg-clinical-gold/10", border: "border-clinical-gold/25", gradient: "from-clinical-gold/20 to-transparent",
    features: ["100% RD verified", "<15g net carbs (keto)", "ADA compliant", "EHR integrated"],
    featureIcon: Syringe,
  },
];

function DaypartGrid({
  dishes,
  onQuickAdd,
}: {
  dishes: DishData[];
  onQuickAdd: (e: React.MouseEvent, item: DishData) => void;
}) {
  const { preferences } = usePreferences();
  const visibleIds = useMemo(() => dishes.map((d) => d.id), [dishes]);
  const briefFingerprint = preferences
    ? `${preferences.userId}:${preferences.updatedAt}`
    : "anon";
  const { byId: rationalesById } = useDishRationales(
    visibleIds,
    Boolean(preferences),
    briefFingerprint,
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {dishes.map((d) => (
        <Link to={`/dish/${d.slug}`} key={d.id} className="group">
          <Card className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/40 transition-colors overflow-hidden">
            <div className="relative aspect-square overflow-hidden">
              <img
                src={d.image}
                alt={d.name}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/85 via-transparent to-transparent" />
              <div className="absolute top-1.5 left-1.5">
                <span
                  className={`block w-2.5 h-2.5 rounded-sm border-2 ${
                    d.isVeg ? "border-green-500" : "border-red-500"
                  } bg-[#050505]/80`}
                  title={d.isVeg ? "Vegetarian" : "Non-vegetarian"}
                />
              </div>
              <button
                onClick={(e) => onQuickAdd(e, d)}
                className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-clinical-gold text-[#050505] flex items-center justify-center hover:scale-110 transition-transform shadow-clinical"
                aria-label={`Quick add ${d.name}`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2.5 space-y-1">
              <p className="text-[11px] font-semibold text-white line-clamp-2 leading-tight">
                {d.name}
              </p>
              <p className="text-[10px] text-clinical-gold tabular-nums">
                {formatPrice(d.price)}
              </p>
              <DaypartWhyRow rationale={rationalesById.get(d.id)} />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function DaypartWhyRow({ rationale }: { rationale: DishRationale | undefined }) {
  const [open, setOpen] = useState(false);
  if (!rationale) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      className="w-full flex items-start gap-1 text-left mt-1"
      aria-expanded={open}
    >
      <SparklesIcon className="w-2.5 h-2.5 mt-0.5 text-clinical-gold shrink-0" />
      <span className="text-[9px] leading-snug text-clinical-zinc line-clamp-2">
        {open ? rationale.expanded : rationale.rationale}
      </span>
    </button>
  );
}

function formatPrice(paise: number) {
  return `Rs.${(paise / 100).toFixed(0)}`;
}

type Daypart = "breakfast" | "lunch" | "dinner";

function currentDaypart(): Daypart {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  return "dinner";
}

const DAYPART_META: Record<
  Daypart,
  { label: string; sub: string; icon: typeof Sun; categories: string[] }
> = {
  breakfast: {
    label: "Good morning — built for breakfast",
    sub: "High-protein starts and energizing smoothies for the next few hours.",
    icon: Sun,
    categories: ["breakfast", "beverages"],
  },
  lunch: {
    label: "Lunch picks for right now",
    sub: "Balanced bowls, salads, and warm comfort under 700 kcal.",
    icon: Sunset,
    categories: ["bowls", "salads", "wraps", "soups", "pasta"],
  },
  dinner: {
    label: "Tonight's lighter options",
    sub: "Lighter proteins, soups, and slow-digesting carbs for the evening.",
    icon: Moon,
    categories: ["soups", "salads", "mains", "bowls"],
  },
};

export default function Home() {
  const navigate = useNavigate();
  const { orders } = useOrders();
  const { addItem } = useCart();

  const reorderRail = useMemo(() => orders.slice(0, 3), [orders]);
  const { data: challenges } = useChallenges();
  const featuredChallenge = useMemo(() => {
    if (!challenges) return null;
    const now = Date.now();
    const live = challenges.filter(
      (c) => new Date(c.endsAt).getTime() > now && c.featured > 0,
    );
    return (live[0] ?? challenges[0]) ?? null;
  }, [challenges]);

  const daypart = currentDaypart();
  const daypartMeta = DAYPART_META[daypart];
  const { dishes: catalogDishes } = useMenuCatalog();
  const daypartDishes = useMemo(() => {
    return catalogDishes
      .filter(
        (d) => d.isAvailable && daypartMeta.categories.includes(d.category),
      )
      .slice(0, 6);
  }, [daypartMeta, catalogDishes]);

  const quickAddDaypart = (e: React.MouseEvent, item: DishData) => {
    e.preventDefault();
    e.stopPropagation();
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
      action: { label: "View Cart", onClick: () => navigate("/cart") },
    });
  };

  return (
    <div className="min-h-screen bg-clinical-dark">
      <SegmentToggle />

      {/* ═══════════════ HERO SECTION ═══════════════ */}
      <section className="relative min-h-[360px] md:h-[70vh] md:min-h-[480px] overflow-hidden flex items-center">
        <div className="absolute inset-0">
          <img src="/hero-bg.jpg" alt="Clinical-grade food preparation" className="w-full h-full object-cover" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/98 via-[#050505]/85 to-[#050505]/55 md:from-[#050505]/95 md:via-[#050505]/70 md:to-[#050505]/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-[#050505]/30 md:via-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 w-full">
          <div className="max-w-2xl space-y-6 animate-fade-in-up">
            <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 hover:bg-clinical-gold/20 text-[10px] tracking-widest uppercase h-6">
              <FlaskConical className="w-3 h-3 mr-1" />
              Clinical-Grade Precision Nutrition
            </Badge>

            <h1 className="text-clinical-h1 text-white">
              Precision Nutrition,
              <br />
              <span className="text-clinical-gold">Engineered by Science</span>
            </h1>

            <p className="text-base text-clinical-zinc leading-relaxed max-w-lg">
              Every meal is clinically formulated by registered dietitians, macro-calibrated to
              your metabolic profile, and prepared in ISO-certified kitchens.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link to="/preferences" className="flex-1 sm:flex-none">
                <Button className="w-full sm:w-auto bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2 h-12 sm:h-11 px-6 shadow-clinical-lg">
                  Take metabolic assessment <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              {/* Demoted from outline button to text link so the assessment
                  is unambiguously the primary CTA. The Menu is reachable
                  from the bottom nav on mobile and the top nav on desktop. */}
              <Link
                to="/menu"
                className="inline-flex items-center justify-center gap-1 text-xs text-clinical-zinc hover:text-white underline-offset-4 hover:underline px-2 min-h-11"
              >
                or browse the menu first <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="flex flex-wrap items-start gap-x-5 gap-y-3 pt-4">
              <div className="min-w-0"><p className="tabular-nums text-2xl font-bold text-white">4.9</p><p className="text-clinical-label mt-0.5 flex items-center gap-1"><Star className="w-3 h-3 text-clinical-gold" />Patient Rating</p></div>
              <div className="hidden sm:block w-px self-stretch bg-clinical-slate/30" />
              <div className="min-w-0"><p className="tabular-nums text-2xl font-bold text-white">12K+</p><p className="text-clinical-label mt-0.5">Meals Delivered</p></div>
              <div className="hidden sm:block w-px self-stretch bg-clinical-slate/30" />
              <div className="min-w-0"><p className="tabular-nums text-2xl font-bold text-white">24</p><p className="text-clinical-label mt-0.5">RD Advisors</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ MOBILE QUICK ACTIONS ═══════════════ */}
      <section className="md:hidden border-b border-clinical-slate/15 bg-clinical-surface/40">
        <div className="px-4 py-5">
          <p className="text-[10px] tracking-widest uppercase text-clinical-zinc mb-3">
            Quick start
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[
              // Assessment is the highest-leverage first-time CTA.
              // Orders is reachable from the bottom nav, so we drop it
              // here in favour of the assessment tile.
              { to: "/preferences", label: "Assess", icon: SparklesIcon },
              { to: "/menu", label: "Menu", icon: Utensils },
              { to: "/meal-planner", label: "Plan", icon: CalendarClock },
              { to: "/rd", label: "Book RD", icon: HeartHandshake },
            ].map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="group flex flex-col items-center justify-start gap-1.5 min-h-[76px] rounded-xl bg-[#050505] border border-clinical-slate/25 px-2 py-3 active:bg-clinical-gold/5 active:border-clinical-gold/40 transition-colors"
              >
                <span className="w-9 h-9 rounded-lg bg-clinical-gold/10 border border-clinical-gold/25 flex items-center justify-center group-active:bg-clinical-gold/20">
                  <a.icon className="w-4 h-4 text-clinical-gold" strokeWidth={1.8} />
                </span>
                <span className="text-[11px] text-white text-center leading-tight">
                  {a.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ TRUST BAR (desktop only — demoted on mobile so food sits above the fold) ═══════════════ */}
      <section className="hidden md:block border-y border-clinical-slate/20 bg-clinical-surface">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TRUST_SIGNALS.map((sig) => (
              <div key={sig.label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-clinical-gold/10 flex items-center justify-center shrink-0 border border-clinical-gold/20">
                  <sig.icon className="w-4 h-4 text-clinical-gold" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{sig.label}</p>
                  <p className="text-xs text-clinical-zinc mt-0.5 leading-relaxed">{sig.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ COHORT CHALLENGE CTA ═══════════════ */}
      {featuredChallenge && (
        <section className="py-8 border-b border-clinical-slate/15">
          <div className="max-w-7xl mx-auto px-4">
            <Link to={`/challenges/${featuredChallenge.slug}`} className="block group">
              <Card className="bg-clinical-surface border-clinical-gold/30 hover:border-clinical-gold/60 transition-colors overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3">
                  {featuredChallenge.image && (
                    <div className="relative aspect-[16/9] md:aspect-auto md:h-full overflow-hidden">
                      <img
                        src={featuredChallenge.image}
                        alt={featuredChallenge.title}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-clinical-surface/80 md:to-clinical-surface" />
                    </div>
                  )}
                  <CardContent className="p-6 md:col-span-2 space-y-3 flex flex-col justify-center">
                    <p className="text-clinical-label flex items-center gap-1.5">
                      <Flag className="w-3 h-3 text-clinical-gold" />
                      Cohort Challenge
                    </p>
                    <h2 className="text-clinical-h2 text-white">
                      {featuredChallenge.title}
                    </h2>
                    <p className="text-sm text-clinical-zinc max-w-xl">
                      {featuredChallenge.tagline}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-clinical-zinc/80 tabular-nums">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 text-clinical-gold" />
                        {featuredChallenge.durationDays} days
                      </span>
                      <span className="flex items-center gap-1">
                        <UsersIcon className="w-3 h-3 text-clinical-gold" />
                        {featuredChallenge.memberCount} joined
                      </span>
                      <span className="text-clinical-zinc">
                        Led by {featuredChallenge.rdName}
                      </span>
                    </div>
                    <div className="pt-2">
                      <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-2 h-10">
                        Join the cohort <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            </Link>
          </div>
        </section>
      )}

      {/* ═══════════════ WELLNESS WEEKLY SUMMARY ═══════════════ */}
      <section className="py-8 border-b border-clinical-slate/15">
        <div className="max-w-7xl mx-auto px-4">
          <WeeklySummaryCard />
        </div>
      </section>

      {/* ═══════════════ ORDER AGAIN RAIL ═══════════════ */}
      {reorderRail.length > 0 && (
        <section className="py-10 border-b border-clinical-slate/15">
          <div className="max-w-7xl mx-auto px-4 space-y-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-clinical-label mb-1 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 text-clinical-gold" />
                  Order Again
                </p>
                <h2 className="text-lg font-semibold text-white">
                  Reorder in one tap
                </h2>
              </div>
              <Link
                to="/orders"
                className="hidden sm:flex items-center gap-1 text-xs text-clinical-gold hover:underline"
              >
                All orders <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reorderRail.map((order) => (
                <Card
                  key={order.orderId}
                  className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/30 transition-colors"
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] text-clinical-gold truncate">
                          {order.orderId}
                        </p>
                        <p className="text-[10px] text-clinical-zinc">
                          {order.items.length} item
                          {order.items.length === 1 ? "" : "s"} ·{" "}
                          {formatPrice(order.total)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[9px] border-clinical-slate/30 text-clinical-zinc"
                      >
                        {order.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="flex gap-1.5 overflow-hidden">
                      {order.items.slice(0, 4).map((it) => (
                        <img
                          key={it.lineId}
                          src={it.image}
                          alt={it.name}
                          className="w-12 h-12 rounded object-cover border border-clinical-slate/20 shrink-0"
                          loading="lazy"
                        />
                      ))}
                      {order.items.length > 4 && (
                        <div className="w-12 h-12 rounded border border-clinical-slate/20 flex items-center justify-center text-[10px] text-clinical-zinc shrink-0">
                          +{order.items.length - 4}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        order.items.forEach((it) => {
                          addItem({
                            dishId: it.dishId,
                            slug: it.slug,
                            name: it.name,
                            image: it.image,
                            basePrice: it.basePrice,
                            unitPrice: it.unitPrice,
                            quantity: it.quantity,
                            kitchen: it.kitchen,
                            isVeg: it.isVeg,
                            rdVerified: it.rdVerified,
                            macros: it.macros,
                            customizations: it.customizations,
                          });
                        });
                        toast.success(
                          `${order.items.length} item${order.items.length === 1 ? "" : "s"} added to your order`,
                          {
                            description: `From order ${order.orderId}`,
                            action: { label: "View Cart", onClick: () => navigate("/cart") },
                          },
                        );
                      }}
                      className="w-full bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30 hover:bg-clinical-gold/25 gap-1.5 h-9 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Reorder
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════ TIME-OF-DAY RAIL ═══════════════ */}
      {daypartDishes.length > 0 && (
        <section className="py-10 border-b border-clinical-slate/15">
          <div className="max-w-7xl mx-auto px-4 space-y-5">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div>
                <p className="text-clinical-label mb-1 flex items-center gap-1.5">
                  <daypartMeta.icon className="w-3 h-3 text-clinical-gold" />
                  <Clock className="w-3 h-3 text-clinical-gold" />
                  {daypart === "breakfast"
                    ? "Breakfast"
                    : daypart === "lunch"
                      ? "Lunch"
                      : "Dinner"}{" "}
                  Now
                </p>
                <h2 className="text-lg font-semibold text-white">
                  {daypartMeta.label}
                </h2>
                <p className="text-xs text-clinical-zinc mt-1 max-w-md">
                  {daypartMeta.sub}
                </p>
              </div>
              <Link
                to="/menu"
                className="text-xs text-clinical-gold hover:underline flex items-center gap-1"
              >
                Full menu <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <DaypartGrid
              dishes={daypartDishes}
              onQuickAdd={quickAddDaypart}
            />
          </div>
        </section>
      )}

      {/* ═══════════════ FEATURED MEALS ═══════════════ */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 space-y-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-clinical-label mb-2">Curated Selection</p>
              <h2 className="text-clinical-h2 text-white">Featured Offerings</h2>
              <p className="text-sm text-clinical-zinc mt-2 max-w-md">
                Each dish is macro-calibrated and RD-verified. Select your protocol to filter by clinical intent.
              </p>
            </div>
            <Link to="/menu" className="hidden sm:flex items-center gap-1 text-xs text-clinical-gold hover:underline">
              View full menu <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURED_MEALS.map((meal, i) => (
              <Link
                to={`/dish/${meal.slug}`}
                key={meal.id}
                aria-label={`${meal.name} — ${formatPrice(meal.price)}, ${meal.macros.calories} kilocalories${meal.rdVerified ? ", Registered Dietitian verified" : ""}. Open dish details.`}
              >
                <Card className="group bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/30 transition-all duration-300 hover:shadow-clinical overflow-hidden">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img src={meal.image} alt={meal.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading={i < 3 ? "eager" : "lazy"} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/80 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      {meal.rdVerified && (
                        <Badge className="bg-clinical-sage/80 text-white border-0 text-[9px] h-5 gap-0.5 backdrop-blur-sm">
                          <ShieldCheck className="w-2.5 h-2.5" />RD
                        </Badge>
                      )}
                      <Badge className="bg-[#050505]/60 text-clinical-zinc border-clinical-slate/30 text-[9px] h-5 backdrop-blur-sm capitalize">{meal.category}</Badge>
                    </div>
                    <div className="absolute top-3 right-3">
                      <Badge className="bg-clinical-gold/90 text-[#050505] border-0 text-xs font-bold tabular-nums backdrop-blur-sm">{formatPrice(meal.price)}</Badge>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <MacroOverlay macros={meal.macros} rdVerified={false} compact />
                    </div>
                  </div>
                  <CardContent className="p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-white group-hover:text-clinical-gold transition-colors">{meal.name}</h3>
                    <p className="text-xs text-clinical-zinc line-clamp-2 leading-relaxed">{meal.description}</p>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {meal.tags.map((tag) => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc capitalize">{tag}</span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ NUTRITION PROGRAMS (Redesigned) ═══════════════ */}
      <section className="py-16 border-t border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4 space-y-10">
          <div className="text-center space-y-2">
            <p className="text-clinical-label">Three Evidence-Based Protocols</p>
            <h2 className="text-clinical-h2 text-white">Clinical Nutrition Programs</h2>
            <p className="text-sm text-clinical-zinc max-w-xl mx-auto">
              Each protocol is grounded in peer-reviewed research and calibrated to specific metabolic outcomes.
            </p>
          </div>

          <div className="space-y-6">
            {PROTOCOLS.map((proto) => (
              <Link to={`/${proto.id}`} key={proto.id}>
                <Card className={`${proto.bg} ${proto.border} border overflow-hidden hover:shadow-clinical transition-all duration-300 group`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                    {/* Image side */}
                    <div className="relative aspect-[16/10] md:aspect-auto overflow-hidden">
                      <img src={proto.image} alt={proto.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
                      <div className={`absolute inset-0 bg-gradient-to-r ${proto.gradient} to-transparent opacity-60`} />
                      <div className="absolute top-4 left-4">
                        <div className={`w-10 h-10 rounded-xl ${proto.bg} flex items-center justify-center border ${proto.border}`}>
                          <proto.icon className={`w-5 h-5 ${proto.color}`} />
                        </div>
                      </div>
                    </div>

                    {/* Content side */}
                    <CardContent className="p-6 flex flex-col justify-center space-y-4">
                      <div>
                        <h3 className={`text-xl font-bold ${proto.color}`}>{proto.title}</h3>
                        <p className="text-xs text-clinical-zinc mt-1">{proto.subtitle}</p>
                      </div>
                      <p className="text-xs text-clinical-zinc leading-relaxed">{proto.description}</p>

                      {/* Feature list */}
                      <div className="grid grid-cols-2 gap-2">
                        {proto.features.map((f) => (
                          <div key={f} className="flex items-center gap-1.5">
                            <proto.featureIcon className={`w-3 h-3 ${proto.color} shrink-0`} />
                            <span className="text-[11px] text-clinical-zinc">{f}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-1 text-xs font-semibold text-white pt-1">
                        Explore Protocol <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CTA ═══════════════ */}
      <section className="py-16 border-t border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-clinical-h2 text-white">
            Ready to begin your <span className="text-clinical-gold">clinical nutrition journey</span>?
          </h2>
          <p className="text-sm text-clinical-zinc max-w-md mx-auto">
            Take our 60-second metabolic assessment to receive a personalized nutrition plan calibrated to your BMR, TDEE, and clinical goals.
          </p>
          <Link to="/preferences">
            <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2 h-11 px-6 shadow-clinical-lg">
              <Activity className="w-4 h-4" />
              Start Assessment
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
