import { useMemo } from "react";
import {
  DIET_ORDERS,
  clinicalModeStore,
  useClinicalMode,
  useEnableClinicalMode,
} from "@/lib/clinicalDiet";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MacroOverlay from "@/components/dish/MacroOverlay";
import SegmentToggle from "@/components/layout/SegmentToggle";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dna,
  Syringe,
  HeartPulse,
  ShieldCheck,
  AlertCircle,
  ScrollText,
  ArrowRight,
  Utensils,
  CalendarDays,
  Stethoscope,
  ClipboardList,
} from "lucide-react";
import { useMenuCatalog, type DishData } from "@/lib/menuData";
import { formatPrice } from "@/lib/api/adapter";
import { dishesForProtocol, plansForProtocol, rdsForProtocol } from "@/lib/protocols";
import { RD_PLANS } from "@/lib/rdPlans";
import { RD_BOOKING } from "@/lib/rdBookingData";
import { TEAM } from "@/lib/teamData";

const PILLARS = [
  { icon: Syringe, title: "Condition-Specific", desc: "Formulated for diabetes, cardiovascular, renal, and post-surgical recovery protocols with precise nutrient restrictions." },
  { icon: HeartPulse, title: "EHR Integration", desc: "Nutrition plans sync with patient electronic health records for real-time dietary adherence monitoring." },
  { icon: Dna, title: "Evidence-Based", desc: "Every formulation is grounded in peer-reviewed clinical trials and ADA/ESC guidelines." },
];

function lowestSugar(dishes: DishData[], limit: number): DishData[] {
  const sugarOf = (d: DishData) => parseFloat(d.sugarPerServing) || 0;
  return [...dishes]
    .sort((a, b) => sugarOf(a) - sugarOf(b))
    .slice(0, limit);
}

export default function Clinical() {
  // Visiting the Clinical surface flips the global clinical-mode flag on so
  // that Menu / Cart / Checkout render the PatientContextStrip and enforce
  // the diet-order + allergen confirm-block. Stays on until the user
  // explicitly exits via the strip's affordance.
  useEnableClinicalMode();
  // Diet-order assignment lives on this clinician console (not on the
  // ordering screens, where editing the patient's Medical ID is explicitly
  // out of scope).
  const { dietOrderId } = useClinicalMode();
  const { dishes } = useMenuCatalog();
  const qualifying = useMemo(
    () => dishesForProtocol(dishes, "clinical"),
    [dishes],
  );
  const featured = useMemo(() => lowestSugar(qualifying, 3), [qualifying]);
  const plans = useMemo(() => plansForProtocol(RD_PLANS, "clinical"), []);
  const rds = useMemo(() => rdsForProtocol(RD_BOOKING, "clinical"), []);
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

      <section className="relative py-16 border-b border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-clinical-gold/15 flex items-center justify-center border border-clinical-gold/25">
                  <Dna className="w-5 h-5 text-clinical-gold" />
                </div>
                <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 text-[10px] tracking-widest uppercase">
                  Clinical Protocol
                </Badge>
              </div>
              <h1 className="text-clinical-h1 text-white">
                Medical Nutrition <span className="text-clinical-gold">Therapy</span>
              </h1>
              <p className="text-sm text-clinical-zinc leading-relaxed max-w-md">
                Therapeutic meals for diabetes management, cardiovascular health, ketogenic protocols,
                and post-surgical recovery. Each plan integrates with patient electronic health records
                and is overseen by board-certified clinical dietitians.
              </p>
              <div className="flex gap-3">
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-gold">{qualifying.length}</p>
                  <p className="text-clinical-label mt-0.5">Clinical Dishes</p>
                </div>
                <div className="w-px bg-clinical-slate/30" />
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-gold">{plans.length}</p>
                  <p className="text-clinical-label mt-0.5">Therapeutic Plans</p>
                </div>
                <div className="w-px bg-clinical-slate/30" />
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-gold">{rds.length}</p>
                  <p className="text-clinical-label mt-0.5">Clinical RDs</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link to="/menu?protocol=clinical">
                  <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-2 h-11 px-6">
                    <Utensils className="w-4 h-4" />
                    See {qualifying.length} clinical dishes
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link to="/plans?protocol=clinical">
                  <Button variant="outline" className="border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 gap-2 h-11 px-6">
                    <CalendarDays className="w-4 h-4" />
                    Browse therapeutic plans
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative">
              <img src="/dishes/steak-keto.jpg" alt="Clinical nutrition" className="rounded-2xl border border-clinical-gold/20 aspect-[4/3] object-cover" />
              <div className="absolute -bottom-4 -left-4 bg-clinical-surface border border-clinical-gold/20 rounded-xl p-4 shadow-clinical max-w-[240px]">
                <p className="text-[10px] text-clinical-gold font-medium uppercase tracking-wider mb-1">Clinical Outcome</p>
                <p className="text-xs text-clinical-zinc">HbA1c reduction of 1.2% observed in diabetic patients after 12-week MNT adherence.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-4 border-b border-clinical-slate/20 bg-clinical-surface/50">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center gap-3">
          <ClipboardList className="w-4 h-4 text-clinical-gold shrink-0" />
          <label
            htmlFor="clinical-diet-order"
            className="text-[10px] uppercase tracking-[0.14em] font-semibold text-clinical-zinc"
          >
            Active patient diet order
          </label>
          <select
            id="clinical-diet-order"
            value={dietOrderId}
            onChange={(e) =>
              clinicalModeStore.setDietOrder(
                e.target.value as (typeof DIET_ORDERS)[number]["id"],
              )
            }
            className="rounded-md border border-clinical-gold/30 bg-clinical-dark text-white text-xs px-2 py-1 focus:outline-none focus:ring-2 focus:ring-clinical-gold/50"
          >
            {DIET_ORDERS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-clinical-zinc">
            Drives the Menu / Cart / Checkout safety gate. Ordering screens
            display this value read-only.
          </p>
        </div>
      </section>

      <section className="py-4 border-b border-clinical-slate/20 bg-clinical-gold/5">
        <div className="max-w-7xl mx-auto px-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-clinical-gold shrink-0 mt-0.5" />
          <p className="text-xs text-clinical-zinc leading-relaxed">
            <strong className="text-clinical-gold">Medical Disclaimer:</strong> Clinical Protocol meals are designed as
            adjuncts to medical treatment and should not replace prescribed therapies. Always consult your
            physician or registered dietitian before beginning any therapeutic nutrition program.
          </p>
        </div>
      </section>

      <section className="py-3 border-b border-clinical-slate/20 bg-clinical-sage/5">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-clinical-zinc">
            <ScrollText className="w-4 h-4 text-clinical-sage" />
            Every clinical meal ships with a full nutrition label, allergens, and sourcing notes.
          </div>
          <Link to="/team" className="text-xs text-clinical-sage hover:underline">
            Meet the chefs &amp; RDs behind your plate →
          </Link>
        </div>
      </section>

      <section className="py-12 border-b border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PILLARS.map((p) => (
              <Card key={p.title} className="bg-clinical-gold/5 border-clinical-gold/15">
                <CardContent className="p-5 space-y-3">
                  <div className="w-9 h-9 rounded-lg bg-clinical-gold/15 flex items-center justify-center border border-clinical-gold/25">
                    <p.icon className="w-4 h-4 text-clinical-gold" />
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
              <h2 className="text-clinical-h2 text-white">Lowest-carb clinical picks</h2>
              <p className="text-xs text-clinical-zinc mt-1">
                RD-verified, low-glycaemic dishes that pass the Clinical
                criteria (≤10g sugar, low GI).
              </p>
            </div>
            <Link to="/menu?protocol=clinical" className="text-xs text-clinical-gold hover:underline">
              See all {qualifying.length} →
            </Link>
          </div>
          {featured.length === 0 ? (
            <p className="text-sm text-clinical-zinc">No qualifying dishes are live right now — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featured.map((meal) => (
                <Link to={`/dish/${meal.slug}`} key={meal.id}>
                  <Card className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/40 transition-all overflow-hidden group h-full">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <img src={meal.image} alt={meal.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/80 via-transparent to-transparent" />
                      <div className="absolute top-3 left-3 flex gap-1.5">
                        {meal.rdVerified && <Badge className="bg-clinical-sage/80 text-white border-0 text-[9px]"><ShieldCheck className="w-2.5 h-2.5 mr-0.5" />RD</Badge>}
                      </div>
                      <div className="absolute top-3 right-3"><Badge className="bg-clinical-gold/90 text-[#050505] border-0 font-bold tabular-nums">{formatPrice(meal.price)}</Badge></div>
                      <div className="absolute bottom-3 left-3"><MacroOverlay macros={meal.macros} compact /></div>
                    </div>
                    <CardContent className="p-4 space-y-1.5">
                      <h3 className="text-sm font-semibold text-white group-hover:text-clinical-gold transition-colors">{meal.name}</h3>
                      <p className="text-xs text-clinical-zinc line-clamp-2">{meal.description}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 border-t border-b border-clinical-slate/20 bg-clinical-gold/5">
        <div className="max-w-7xl mx-auto px-4 space-y-6">
          <div>
            <p className="text-clinical-label mb-2 text-clinical-gold">Therapeutic plans</p>
            <h2 className="text-clinical-h2 text-white">Clinical RD plans</h2>
          </div>
          {plans.length === 0 ? (
            <p className="text-sm text-clinical-zinc">No active clinical plans right now.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map((plan) => (
                <Link to={`/plans/${plan.slug}`} key={plan.slug}>
                  <Card className="bg-clinical-surface border-clinical-gold/20 hover:border-clinical-gold/50 transition-colors h-full">
                    <CardContent className="p-5 space-y-2">
                      <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 text-[10px]">
                        {plan.calorieTargetPerDay} kcal · {plan.proteinTargetGrams}g protein
                      </Badge>
                      <h3 className="text-white font-semibold text-base">{plan.name}</h3>
                      <p className="text-xs text-clinical-zinc line-clamp-2">{plan.tagline}</p>
                      <div className="flex items-center justify-between pt-2 border-t border-clinical-slate/20">
                        <span className="text-clinical-gold font-bold tabular-nums">
                          {formatPrice(plan.pricePerWeekPaise)}
                        </span>
                        <span className="text-[10px] text-clinical-zinc/60 uppercase tracking-widest">/ week</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 border-b border-clinical-slate/20">
        <div className="max-w-7xl mx-auto px-4 space-y-6">
          <div>
            <p className="text-clinical-label mb-2 text-clinical-gold">RD specialists</p>
            <h2 className="text-clinical-h2 text-white">Talk to a clinical RD</h2>
          </div>
          {rds.length === 0 ? (
            <p className="text-sm text-clinical-zinc">No RDs match this specialty right now — see the full directory.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {rds.map((rd) => {
                const member = teamBySlug.get(rd.slug);
                return (
                  <Card key={rd.slug} className="bg-clinical-surface border-clinical-slate/20">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30 flex items-center justify-center font-semibold">
                          {member?.initials ?? "RD"}
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold">{member?.name ?? rd.slug}</p>
                          <p className="text-[11px] text-clinical-zinc">{member?.title}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 text-[11px] text-clinical-zinc">
                        <Stethoscope className="w-3.5 h-3.5 text-clinical-gold shrink-0 mt-0.5" />
                        <span>{rd.specialties.join(" · ")}</span>
                      </div>
                      <Link to={`/rd/${rd.slug}`}>
                        <Button size="sm" className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs gap-1">
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
            Start a <span className="text-clinical-gold">Clinical Plan</span>
          </h2>
          <p className="text-sm text-clinical-zinc">
            {samplePlan
              ? `Begin ${samplePlan.name} — ${samplePlan.calorieTargetPerDay} kcal/day, RD-signed and aligned with ADA/ESC guidance. Pair with an RD consult to share your physician's nutrition prescription.`
              : "Therapeutic meal plans are reviewed by a registered dietitian before delivery. Pair with an RD consult to share your physician's nutrition prescription."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {samplePlan ? (
              <Link to={`/subscribe?plan=${samplePlan.slug}`}>
                <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-2 h-11 px-6">
                  <Dna className="w-4 h-4" />
                  Start {samplePlan.name}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Link to="/subscribe?plan=clinical">
                <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-2 h-11 px-6">
                  <Dna className="w-4 h-4" />
                  Start Clinical Plan
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
            <Link to="/rd?protocol=clinical">
              <Button variant="outline" className="border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 gap-2 h-11 px-6">
                <HeartPulse className="w-4 h-4" />
                Book an RD first
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
