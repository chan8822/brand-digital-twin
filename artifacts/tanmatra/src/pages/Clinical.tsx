import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MacroOverlay from "@/components/dish/MacroOverlay";
import SegmentToggle from "@/components/layout/SegmentToggle";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Dna, Syringe, HeartPulse, ShieldCheck, AlertCircle, ScrollText, ArrowRight, Utensils } from "lucide-react";

const FEATURED = [
  { id: 56, name: "Moong Dal Chilla with Curd", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80", price: 7500, slug: "moong-dal-chilla-with-curd", macros: { protein: 12, carbs: 22, fat: 14, fiber: 3, calories: 260 }, rdVerified: true, description: "Protein-rich moong dal pancake with curd. Low-glycemic and gut-friendly." },
  { id: 99, name: "Quinoa Khichdi", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80", price: 9000, slug: "quinoa-khichdi", macros: { protein: 12, carbs: 22, fat: 14, fiber: 3, calories: 260 }, rdVerified: true, description: "One-pot quinoa & moong dal khichdi — easy on the gut, balanced macros." },
  { id: 107, name: "Tomato Basil Soup", image: "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80", price: 9500, slug: "tomato-basil-soup", macros: { protein: 6, carbs: 14, fat: 6, fiber: 3, calories: 140 }, rdVerified: true, description: "Lycopene-rich tomato soup with fresh basil. Low-cal, anti-inflammatory." },
];

const PILLARS = [
  { icon: Syringe, title: "Condition-Specific", desc: "Formulated for diabetes, cardiovascular, renal, and post-surgical recovery protocols with precise nutrient restrictions." },
  { icon: HeartPulse, title: "EHR Integration", desc: "Nutrition plans sync with patient electronic health records for real-time dietary adherence monitoring." },
  { icon: Dna, title: "Evidence-Based", desc: "Every formulation is grounded in peer-reviewed clinical trials and ADA/ESC guidelines." },
];

function formatPrice(p: number) { return `Rs.${(p/100).toFixed(0)}`; }

export default function Clinical() {
  return (
    <div className="min-h-screen bg-clinical-dark">
      <SegmentToggle />

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
                  <p className="tabular-nums text-2xl font-bold text-clinical-gold">100%</p>
                  <p className="text-clinical-label mt-0.5">RD Verified</p>
                </div>
                <div className="w-px bg-clinical-slate/30" />
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-gold">&lt;15g</p>
                  <p className="text-clinical-label mt-0.5">Net Carbs (Keto)</p>
                </div>
                <div className="w-px bg-clinical-slate/30" />
                <div className="text-center">
                  <p className="tabular-nums text-2xl font-bold text-clinical-gold">ADA</p>
                  <p className="text-clinical-label mt-0.5">Compliant</p>
                </div>
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

      {/* Disclaimer */}
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
          <div>
            <p className="text-clinical-label mb-2">Protocol Menu</p>
            <h2 className="text-clinical-h2 text-white">Clinical Offerings</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURED.map((meal) => (
              <Link to={`/dish/${meal.slug}`} key={meal.id}>
                <Card className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/40 transition-all overflow-hidden group">
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
                    <h3 className="text-sm font-semibold text-white group-hover:text-clinical-gold transition-colors">{meal.name}</h3>
                    <p className="text-xs text-clinical-zinc line-clamp-2">{meal.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 border-t border-clinical-slate/20">
        <div className="max-w-3xl mx-auto px-4 text-center space-y-4">
          <h2 className="text-clinical-h2 text-white">
            Start a <span className="text-clinical-gold">Clinical Plan</span>
          </h2>
          <p className="text-sm text-clinical-zinc">
            Therapeutic meal plans are reviewed by a registered dietitian before delivery. Pair with an RD consult to share your physician's nutrition prescription.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to="/subscribe?plan=clinical">
              <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-2 h-11 px-6">
                <Dna className="w-4 h-4" />
                Start Clinical Plan
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/rd">
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
