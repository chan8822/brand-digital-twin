import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MacroOverlay from "@/components/dish/MacroOverlay";
import SegmentToggle from "@/components/layout/SegmentToggle";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Zap,
  Timer,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Utensils,
  CalendarDays,
  Stethoscope,
} from "lucide-react";
import { useMenuCatalog, type DishData } from "@/lib/menuData";
import { formatPrice } from "@/lib/api/adapter";
import { dishesForProtocol, plansForProtocol, rdsForProtocol } from "@/lib/protocols";
import { RD_PLANS } from "@/lib/rdPlans";
import { RD_BOOKING } from "@/lib/rdBookingData";
import { TEAM } from "@/lib/teamData";

const PILLARS = [
  { icon: TrendingUp, title: "Muscle Protein Synthesis", desc: "Leucine-rich protein sources delivering 2.5g+ leucine per meal to trigger mTOR pathway." },
  { icon: Timer, title: "Glycogen Replenishment", desc: "Strategic carbohydrate timing with high-GI post-workout and complex pre-workout sources." },
  { icon: Zap, title: "Recovery Acceleration", desc: "Tart cherry, turmeric, and omega-3 compounds to reduce exercise-induced muscle damage." },
];

function topByProtein(dishes: DishData[], limit: number): DishData[] {
  return [...dishes]
    .sort((a, b) => b.macros.protein - a.macros.protein)
    .slice(0, limit);
}

export default function Performance() {
  const { dishes } = useMenuCatalog();
  const qualifying = useMemo(
    () => dishesForProtocol(dishes, "performance"),
    [dishes],
  );
  const featured = useMemo(() => topByProtein(qualifying, 3), [qualifying]);
  const plans = useMemo(() => plansForProtocol(RD_PLANS, "performance"), []);
  const rds = useMemo(() => rdsForProtocol(RD_BOOKING, "performance"), []);
  const teamBySlug = useMemo(
    () => new Map(TEAM.map((m) => [m.slug, m])),
    [],
  );
  const samplePlan = plans[0];

  return (
    <div className="min-h-screen bg-clinical-dark">
      <SegmentToggle />

      <div className="max-w-7xl mx-auto px-4 pt-3">
        <Link
          to="/challenges"
          className="inline-flex items-center gap-1.5 min-h-[36px] py-2 -ml-1 px-1 text-xs text-clinical-zinc hover:text-clinical-gold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Community
        </Link>
      </div>

      <section className="relative py-16 border-b border-clinical-border">
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
              {/* Only render the stat strip when all counts are positive.
                  A "0 Qualifying Dishes" stat next to a "Start Plan" CTA
                  reads as broken — better to omit until data exists. */}
              {qualifying.length > 0 && plans.length > 0 && rds.length > 0 && (
                <div className="flex gap-3">
                  <div className="text-center">
                    <p className="tabular-nums text-2xl font-bold text-clinical-blue">{qualifying.length}</p>
                    <p className="text-clinical-label mt-0.5">Qualifying Dishes</p>
                  </div>
                  <div className="w-px bg-clinical-surface-elevated" />
                  <div className="text-center">
                    <p className="tabular-nums text-2xl font-bold text-clinical-blue">{plans.length}</p>
                    <p className="text-clinical-label mt-0.5">RD Plans</p>
                  </div>
                  <div className="w-px bg-clinical-surface-elevated" />
                  <div className="text-center">
                    <p className="tabular-nums text-2xl font-bold text-clinical-blue">{rds.length}</p>
                    <p className="text-clinical-label mt-0.5">Performance RDs</p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-3 pt-2">
                <Link to="/menu?protocol=performance">
                  <Button className="bg-clinical-blue text-[#050505] hover:bg-clinical-blue/90 gap-2 h-11 px-6">
                    <Utensils className="w-4 h-4" />
                    See {qualifying.length} performance dishes
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/plans?protocol=performance">
                  <Button variant="outline" className="border-clinical-blue/40 text-clinical-blue hover:bg-clinical-blue/10 gap-2 h-11 px-6">
                    <CalendarDays className="w-4 h-4" />
                    Browse performance plans
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <img src="/dishes/buddha-bowl.jpg" alt="Performance nutrition" className="rounded-2xl border border-clinical-blue/20 aspect-[4/3] object-cover" />
              <div className="absolute -bottom-4 -left-4 bg-clinical-surface border border-clinical-blue/20 rounded-xl p-4 shadow-clinical max-w-[240px]">
                <p className="text-[10px] text-clinical-blue font-medium uppercase tracking-wider mb-1">Protocol Focus</p>
                <p className="text-xs text-clinical-zinc">Macro-tuned for muscle protein synthesis and recovery between training sessions. Individual results vary; not a medical claim.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 border-b border-clinical-border">
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
          <div className="flex items-end justify-between flex-wrap gap-3">
            <div>
              <p className="text-clinical-label mb-2">Protocol Menu</p>
              <h2 className="text-clinical-h2 text-white">Top protein-dense picks</h2>
              <p className="text-xs text-clinical-zinc mt-1">
                Highest-protein dishes that pass the Performance criteria
                ({"≥"}18g protein per plate).
              </p>
            </div>
            <Link to="/menu?protocol=performance" className="text-xs text-clinical-blue hover:underline">
              See all {qualifying.length} ��
            </Link>
          </div>
          {featured.length === 0 ? (
            <p className="text-sm text-clinical-zinc">No qualifying dishes are live right now — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featured.map((meal) => (
                <Link to={`/dish/${meal.slug}`} key={meal.id}>
                  <Card className="bg-clinical-surface border-clinical-border hover:border-clinical-blue/40 transition-all overflow-hidden group h-full">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img src={meal.image} alt={meal.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/80 via-transparent to-transparent" />
                      <div className="absolute top-3 left-3 flex gap-1.5">
                        {meal.rdVerified && <Badge className="bg-clinical-sage/80 text-white border-0 text-[9px]"><ShieldCheck className="w-2.5 h-2.5 mr-0.5" />RD</Badge>}
                      </div>
                      <div className="absolute top-3 right-3"><Badge className="bg-clinical-blue/90 text-[#050505] border-0 font-bold tabular-nums">{meal.macros.protein}g protein</Badge></div>
                      <div className="absolute bottom-3 left-3"><MacroOverlay macros={meal.macros} compact /></div>
                    </div>
                    <CardContent className="p-4 space-y-1.5">
                      <h3 className="text-sm font-semibold text-white group-hover:text-clinical-blue transition-colors">{meal.name}</h3>
                      <p className="text-xs text-clinical-zinc line-clamp-2">{meal.description}</p>
                      <p className="text-[11px] text-clinical-blue tabular-nums pt-1">{formatPrice(meal.price)}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 border-t border-b border-clinical-border bg-clinical-blue/5">
        <div className="max-w-7xl mx-auto px-4 space-y-6">
          <div>
            <p className="text-clinical-label mb-2 text-clinical-blue">Plan tiers</p>
            <h2 className="text-clinical-h2 text-white">Performance RD plans</h2>
          </div>
          {plans.length === 0 ? (
            <p className="text-sm text-clinical-zinc">No active performance plans right now.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map((plan) => (
                <Link to={`/plans/${plan.slug}`} key={plan.slug}>
                  <Card className="bg-clinical-surface border-clinical-blue/20 hover:border-clinical-blue/50 transition-colors h-full">
                    <CardContent className="p-5 space-y-2">
                      <Badge className="bg-clinical-blue/15 text-clinical-blue border-clinical-blue/30 text-[10px]">
                        {plan.calorieTargetPerDay} kcal · {plan.proteinTargetGrams}g protein
                      </Badge>
                      <h3 className="text-white font-semibold text-base">{plan.name}</h3>
                      <p className="text-xs text-clinical-zinc line-clamp-2">{plan.tagline}</p>
                      <div className="flex items-center justify-between pt-2 border-t border-clinical-border">
                        <span className="text-clinical-blue font-bold tabular-nums">
                          {formatPrice(plan.pricePerWeekPaise)}
                        </span>
                        <span className="text-[10px] text-clinical-zinc-muted uppercase tracking-widest">/ week</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 border-b border-clinical-border">
        <div className="max-w-7xl mx-auto px-4 space-y-6">
          <div>
            <p className="text-clinical-label mb-2 text-clinical-blue">RD specialists</p>
            <h2 className="text-clinical-h2 text-white">Talk to a performance RD</h2>
          </div>
          {rds.length === 0 ? (
            <p className="text-sm text-clinical-zinc">No RDs match this specialty right now — see the full directory.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {rds.map((rd) => {
                const member = teamBySlug.get(rd.slug);
                return (
                  <Card key={rd.slug} className="bg-clinical-surface border-clinical-border">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-clinical-blue/15 text-clinical-blue border border-clinical-blue/30 flex items-center justify-center font-semibold">
                          {member?.initials ?? "RD"}
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold">{member?.name ?? rd.slug}</p>
                          <p className="text-[11px] text-clinical-zinc">{member?.title}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-[11px] text-clinical-zinc">
                        <Stethoscope className="w-3.5 h-3.5 text-clinical-blue shrink-0 mt-0.5" />
                        <span>{rd.specialties.join(" · ")}</span>
                      </div>
                      <Link to={`/rd/${rd.slug}`}>
                        <Button size="sm" className="w-full bg-clinical-blue text-[#050505] hover:bg-clinical-blue/90 text-xs gap-1">
                          Book — first 15min free
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-4">
          <h2 className="text-clinical-h2 text-white">
            Start a <span className="text-clinical-blue">Performance Plan</span>
          </h2>
          <p className="text-sm text-clinical-zinc">
            {samplePlan
              ? `Lock in ${samplePlan.name} — ${samplePlan.calorieTargetPerDay} kcal · ${samplePlan.proteinTargetGrams}g protein per day, RD-signed and macro-calibrated.`
              : "Lock in a recurring delivery of performance-formulated meals — adjust your protein target, cadence, and rest-day swaps any time."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {samplePlan ? (
              <Link to={`/subscribe?plan=${samplePlan.slug}`}>
                <Button className="bg-clinical-blue text-[#050505] hover:bg-clinical-blue/90 gap-2 h-11 px-6">
                  <Zap className="w-4 h-4" />
                  Start {samplePlan.name}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Link to="/subscribe?plan=performance">
                <Button className="bg-clinical-blue text-[#050505] hover:bg-clinical-blue/90 gap-2 h-11 px-6">
                  <Zap className="w-4 h-4" />
                  Start Performance Plan
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
            <Link to="/menu?protocol=performance">
              <Button variant="outline" className="border-clinical-blue/40 text-clinical-blue hover:bg-clinical-blue/10 gap-2 h-11 px-6">
                <Utensils className="w-4 h-4" />
                Browse one-time meals
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
