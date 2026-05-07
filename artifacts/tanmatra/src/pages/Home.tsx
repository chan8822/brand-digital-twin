import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MacroOverlay from "@/components/dish/MacroOverlay";
import SegmentToggle from "@/components/layout/SegmentToggle";
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
} from "lucide-react";

/* ── Featured meals (each with unique image) ──────────────────────── */
const FEATURED_MEALS = [
  {
    id: 1, name: "Grilled Atlantic Salmon", slug: "grilled-salmon",
    description: "Omega-3 rich Atlantic salmon with quinoa pilaf and steamed broccoli. Clinically formulated for cardiovascular wellness and anti-inflammatory support.",
    image: "/dishes/salmon-quinoa.jpg", price: 48500, kitchen: "continental", category: "wellness", rdVerified: true,
    macros: { protein: 34, carbs: 28, fat: 18, fiber: 6, calories: 420 }, tags: ["high-protein", "omega-3", "gluten-free"],
  },
  {
    id: 2, name: "Performance Power Bowl", slug: "power-bowl",
    description: "Grilled chicken, brown rice, sweet potato, avocado, edamame. Engineered for athletic recovery and muscle protein synthesis.",
    image: "/dishes/buddha-bowl.jpg", price: 39500, kitchen: "continental", category: "performance", rdVerified: true,
    macros: { protein: 42, carbs: 55, fat: 22, fiber: 9, calories: 580 }, tags: ["high-protein", "recovery", "balanced"],
  },
  {
    id: 3, name: "Keto Prime Ribeye", slug: "keto-ribeye",
    description: "Grass-fed ribeye with cauliflower puree and grilled asparagus. Ketogenic 75F/20P/5C macro ratio for metabolic efficiency.",
    image: "/dishes/steak-keto.jpg", price: 62500, kitchen: "continental", category: "clinical", rdVerified: true,
    macros: { protein: 48, carbs: 8, fat: 38, fiber: 5, calories: 540 }, tags: ["keto", "high-protein", "low-carb"],
  },
  {
    id: 4, name: "Miso Glazed Black Cod", slug: "miso-cod",
    description: "Sustainably sourced black cod with bok choy and shiitake. Anti-inflammatory profile for clinical nutrition protocols.",
    image: "/dishes/miso-cod.jpg", price: 54500, kitchen: "continental", category: "clinical", rdVerified: true,
    macros: { protein: 32, carbs: 18, fat: 16, fiber: 4, calories: 360 }, tags: ["anti-inflammatory", "low-glycemic"],
  },
  {
    id: 5, name: "Superfood Smoothie Bowl", slug: "smoothie-bowl",
    description: "Antioxidant-dense acai with berries, chia, and almonds. Micronutrient-optimized for cellular health and longevity.",
    image: "/dishes/smoothie-bowl.jpg", price: 28500, kitchen: "continental", category: "wellness", rdVerified: true,
    macros: { protein: 12, carbs: 45, fat: 14, fiber: 11, calories: 340 }, tags: ["antioxidant", "vegan", "high-fiber"],
  },
  {
    id: 6, name: "Mediterranean Grain Salad", slug: "mediterranean-salad",
    description: "Chickpeas, feta, olives, and fresh herbs with extra virgin olive oil. Heart-healthy Mediterranean protocol.",
    image: "/dishes/mediterranean-salad.jpg", price: 32500, kitchen: "continental", category: "wellness", rdVerified: false,
    macros: { protein: 18, carbs: 38, fat: 20, fiber: 10, calories: 380 }, tags: ["heart-healthy", "vegetarian"],
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

function formatPrice(paise: number) {
  return `Rs.${(paise / 100).toFixed(0)}`;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-clinical-dark">
      <SegmentToggle />

      {/* ═══════════════ HERO SECTION ═══════════════ */}
      <section className="relative h-[70vh] min-h-[480px] overflow-hidden flex items-center">
        <div className="absolute inset-0">
          <img src="/hero-bg.jpg" alt="Clinical-grade food preparation" className="w-full h-full object-cover" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/95 via-[#050505]/70 to-[#050505]/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-[#050505]/30" />
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

            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/menu">
                <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2 h-11 px-6 shadow-clinical-lg">
                  Explore Menu <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/wellness">
                <Button variant="outline" className="border-clinical-slate/40 text-clinical-zinc hover:text-white hover:border-clinical-gold/40 h-11 px-6">
                  View Protocols
                </Button>
              </Link>
            </div>

            <div className="flex gap-6 pt-4">
              <div><p className="tabular-nums text-2xl font-bold text-white">4.9</p><p className="text-clinical-label mt-0.5 flex items-center gap-1"><Star className="w-3 h-3 text-clinical-gold" />Patient Rating</p></div>
              <div className="w-px bg-clinical-slate/30" />
              <div><p className="tabular-nums text-2xl font-bold text-white">12K+</p><p className="text-clinical-label mt-0.5">Meals Delivered</p></div>
              <div className="w-px bg-clinical-slate/30" />
              <div><p className="tabular-nums text-2xl font-bold text-white">24</p><p className="text-clinical-label mt-0.5">RD Advisors</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ TRUST BAR ═══════════════ */}
      <section className="border-y border-clinical-slate/20 bg-clinical-surface">
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
              <Link to={`/dish/${meal.slug}`} key={meal.id}>
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
          <Link to="/health-quiz">
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
