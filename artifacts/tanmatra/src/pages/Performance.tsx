import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MacroOverlay from "@/components/dish/MacroOverlay";
import SegmentToggle from "@/components/layout/SegmentToggle";
import { Link } from "react-router";
import { Zap, Timer, TrendingUp, ShieldCheck } from "lucide-react";

const FEATURED = [
  { id: 2, name: "Performance Power Bowl", image: "/dishes/buddha-bowl.jpg", price: 39500, slug: "power-bowl", macros: { protein: 42, carbs: 55, fat: 22, fiber: 9, calories: 580 }, rdVerified: true, description: "Grilled chicken, brown rice, sweet potato, avocado — engineered for recovery." },
  { id: 3, name: "Keto Prime Ribeye", image: "/dishes/steak-keto.jpg", price: 62500, slug: "keto-ribeye", macros: { protein: 48, carbs: 8, fat: 38, fiber: 5, calories: 540 }, rdVerified: true, description: "Grass-fed ribeye with cauliflower puree. Ketogenic macro ratio." },
  { id: 1, name: "Grilled Atlantic Salmon", image: "/dishes/salmon-quinoa.jpg", price: 48500, slug: "grilled-salmon", macros: { protein: 34, carbs: 28, fat: 18, fiber: 6, calories: 420 }, rdVerified: true, description: "Omega-3 rich salmon for muscle protein synthesis support." },
];

const PILLARS = [
  { icon: TrendingUp, title: "Muscle Protein Synthesis", desc: "Leucine-rich protein sources delivering 2.5g+ leucine per meal to trigger mTOR pathway." },
  { icon: Timer, title: "Glycogen Replenishment", desc: "Strategic carbohydrate timing with high-GI post-workout and complex pre-workout sources." },
  { icon: Zap, title: "Recovery Acceleration", desc: "Tart cherry, turmeric, and omega-3 compounds to reduce exercise-induced muscle damage." },
];

function formatPrice(p: number) { return `Rs.${(p/100).toFixed(0)}`; }

export default function Performance() {
  return (
    <div className="min-h-screen bg-clinical-dark">
      <SegmentToggle />

      <section className="relative py-16 border-b border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-clinical-blue/15 flex items-center justify-center border border-clinical-blue/25">
                  <Zap className="w-5 h-5 text-clinical-blue" />
                </div>
                <Badge className="bg-clinical-blue/15 text-clinical-blue border-clinical-blue/30 text-[10px] tracking-widest uppercase">
                  Performance Protocol
                </Badge>
              </div>
              <h1 className="text-clinical-h1 text-white">
                Athletic Nutrition for <span className="text-clinical-blue">Peak Output</span>
              </h1>
              <p className="text-sm text-clinical-zinc leading-relaxed max-w-md">
                Evidence-based sports nutrition engineered for muscle protein synthesis, glycogen
                replenishment, and rapid recovery. Optimized macro ratios validated by exercise
                physiology research at performance institutes.
              </p>
              <div className="flex gap-3">
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-blue">40g+</p>
                  <p className="text-clinical-label mt-0.5">Protein / Meal</p>
                </div>
                <div className="w-px bg-clinical-slate/30" />
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-blue">3:1</p>
                  <p className="text-clinical-label mt-0.5">Carb:Protein Ratio</p>
                </div>
                <div className="w-px bg-clinical-slate/30" />
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-blue">600+</p>
                  <p className="text-clinical-label mt-0.5">Avg kcal</p>
                </div>
              </div>
            </div>
            <div className="relative">
              <img src="/dishes/buddha-bowl.jpg" alt="Performance nutrition" className="rounded-2xl border border-clinical-blue/20 aspect-[4/3] object-cover" />
              <div className="absolute -bottom-4 -left-4 bg-clinical-surface border border-clinical-blue/20 rounded-xl p-4 shadow-clinical max-w-[240px]">
                <p className="text-[10px] text-clinical-blue font-medium uppercase tracking-wider mb-1">Protocol Outcome</p>
                <p className="text-xs text-clinical-zinc">Demonstrated 23% improvement in time-to-exhaustion after 6-week adherence.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 border-b border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PILLARS.map((p) => (
              <Card key={p.title} className="bg-clinical-blue/5 border-clinical-blue/15">
                <CardContent className="p-5 space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-clinical-blue/15 flex items-center justify-center border border-clinical-blue/25">
                    <p.icon className="w-4 h-4 text-clinical-blue" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                  <p className="text-xs text-clinical-zinc leading-relaxed">{p.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 space-y-8">
          <div>
            <p className="text-clinical-label mb-2">Protocol Menu</p>
            <h2 className="text-clinical-h2 text-white">Performance Offerings</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURED.map((meal) => (
              <Link to={`/dish/${meal.slug}`} key={meal.id}>
                <Card className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-blue/40 transition-all overflow-hidden group">
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
                    <h3 className="text-sm font-semibold text-white group-hover:text-clinical-blue transition-colors">{meal.name}</h3>
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
