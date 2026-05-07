import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MacroOverlay from "@/components/dish/MacroOverlay";
import SegmentToggle from "@/components/layout/SegmentToggle";
import { Link } from "react-router";
import { HeartPulse, Leaf, Sparkles, ShieldCheck } from "lucide-react";

const FEATURED = [
  { id: 1, name: "Grilled Atlantic Salmon", image: "/dishes/salmon-quinoa.jpg", price: 48500, slug: "grilled-salmon", macros: { protein: 34, carbs: 28, fat: 18, fiber: 6, calories: 420 }, rdVerified: true, description: "Omega-3 rich with quinoa pilaf and steamed broccoli." },
  { id: 5, name: "Superfood Smoothie Bowl", image: "/dishes/smoothie-bowl.jpg", price: 28500, slug: "smoothie-bowl", macros: { protein: 12, carbs: 45, fat: 14, fiber: 11, calories: 340 }, rdVerified: true, description: "Antioxidant-dense acai with berries and chia seeds." },
  { id: 6, name: "Mediterranean Grain Salad", image: "/dishes/mediterranean-salad.jpg", price: 32500, slug: "mediterranean-salad", macros: { protein: 18, carbs: 38, fat: 20, fiber: 10, calories: 380 }, rdVerified: false, description: "Heart-healthy chickpeas, feta, olives, and fresh herbs." },
];

const PILLARS = [
  { icon: Leaf, title: "Anti-Inflammatory", desc: "Polyphenol-rich ingredients selected to reduce systemic inflammation markers." },
  { icon: Sparkles, title: "Micronutrient Density", desc: "Every meal delivers >80% RDA of 12+ essential vitamins and minerals." },
  { icon: ShieldCheck, title: "Gut Health Optimized", desc: "Prebiotic fiber and fermented components support microbiome diversity." },
];

function formatPrice(p: number) { return `Rs.${(p/100).toFixed(0)}`; }

export default function Wellness() {
  return (
    <div className="min-h-screen bg-clinical-dark">
      <SegmentToggle />

      {/* Hero */}
      <section className="relative py-16 border-b border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-clinical-sage/15 flex items-center justify-center border border-clinical-sage/25">
                  <HeartPulse className="w-5 h-5 text-clinical-sage" />
                </div>
                <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 text-[10px] tracking-widest uppercase">
                  Wellness Protocol
                </Badge>
              </div>
              <h1 className="text-clinical-h1 text-white">
                Preventive Nutrition for <span className="text-clinical-sage">Longevity</span>
              </h1>
              <p className="text-sm text-clinical-zinc leading-relaxed max-w-md">
                Clinically formulated meals designed for disease prevention, cellular health, and
                sustained daily vitality. Each dish prioritizes anti-inflammatory compounds,
                micronutrient density, and gut microbiome support.
              </p>
              <div className="flex gap-3">
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-sage">85%</p>
                  <p className="text-clinical-label mt-0.5">Anti-oxidant Score</p>
                </div>
                <div className="w-px bg-clinical-slate/30" />
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-sage">12g+</p>
                  <p className="text-clinical-label mt-0.5">Fiber per Meal</p>
                </div>
                <div className="w-px bg-clinical-slate/30" />
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-sage">&lt;400</p>
                  <p className="text-clinical-label mt-0.5">Avg kcal</p>
                </div>
              </div>
            </div>
            <div className="relative">
              <img src="/dishes/smoothie-bowl.jpg" alt="Wellness nutrition" className="rounded-2xl border border-clinical-sage/20 aspect-[4/3] object-cover" />
              <div className="absolute -bottom-4 -left-4 bg-clinical-surface border border-clinical-sage/20 rounded-xl p-4 shadow-clinical max-w-[240px]">
                <p className="text-[10px] text-clinical-sage font-medium uppercase tracking-wider mb-1">Protocol Outcome</p>
                <p className="text-xs text-clinical-zinc">Reduced inflammatory markers (CRP, IL-6) within 4 weeks of adherence.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="py-12 border-b border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PILLARS.map((p) => (
              <Card key={p.title} className="bg-clinical-sage/5 border-clinical-sage/15">
                <CardContent className="p-5 space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-clinical-sage/15 flex items-center justify-center border border-clinical-sage/25">
                    <p.icon className="w-4 h-4 text-clinical-sage" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                  <p className="text-xs text-clinical-zinc leading-relaxed">{p.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Meals */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 space-y-8">
          <div>
            <p className="text-clinical-label mb-2">Protocol Menu</p>
            <h2 className="text-clinical-h2 text-white">Wellness Offerings</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURED.map((meal) => (
              <Link to={`/dish/${meal.slug}`} key={meal.id}>
                <Card className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-sage/40 transition-all overflow-hidden group">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img src={meal.image} alt={meal.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/80 via-transparent to-transparent" />
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      {meal.rdVerified && <Badge className="bg-clinical-sage/80 text-white border-0 text-[9px]"><ShieldCheck className="w-2.5 h-2.5 mr-0.5" />RD</Badge>}
                    </div>
                    <div className="absolute top-3 right-3"><Badge className="bg-clinical-gold/90 text-[#050505] border-0 font-bold tabular-nums">{formatPrice(meal.price)}</Badge></div>
                    <div className="absolute bottom-3 left-3"><MacroOverlay macros={meal.macros} compact /></div>
                  </div>
                  <CardContent className="p-4 space-y-1.5">
                    <h3 className="text-sm font-semibold text-white group-hover:text-clinical-sage transition-colors">{meal.name}</h3>
                    <p className="text-xs text-clinical-zinc line-clamp-2">{meal.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
