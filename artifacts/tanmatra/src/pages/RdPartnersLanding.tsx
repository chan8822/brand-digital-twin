import { useEffect } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  CalendarCheck,
  ChartLine,
  CheckCircle2,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";
import { trackRdPartnersEvent } from "@/lib/rdPartnersAnalytics";

const VALUE_PROPS = [
  {
    icon: Users,
    title: "A pre-qualified client base",
    body: "Tanmatra members already pay for clinical-grade meals. They want a partner — not a marketplace listing.",
  },
  {
    icon: CalendarCheck,
    title: "Booking & messaging, built-in",
    body: "Sessions, lab uploads, progress notes and chat run through your console. No CRM stitching.",
  },
  {
    icon: ChartLine,
    title: "Transparent revenue share",
    body: "Keep 70% on follow-ups; intro 15-min call is free for the member. Monthly payouts, plain dashboard.",
  },
  {
    icon: HeartPulse,
    title: "Influence the menu",
    body: "Advisory partners co-sign protocols, review formulations and appear on dish pages they helped shape.",
  },
];

const STEPS = [
  "Pick your path — partner, advisory, or both",
  "Tell us about your credentials and licence",
  "Share where & how you practise",
  "Verify a WhatsApp number for case alerts",
  "Review and submit — we reply in 3 working days",
];

export default function RdPartnersLanding() {
  useEffect(() => {
    void trackRdPartnersEvent("landing_view", { step: 0 });
  }, []);

  return (
    <div className="bg-clinical-dark text-white">
      {/* hero */}
      <section className="border-b border-clinical-slate/30">
        <div className="max-w-6xl mx-auto px-4 py-14 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-10 items-start">
          <div className="space-y-5">
            <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
              For Registered Dietitians
            </Badge>
            <h1 className="font-serif text-3xl sm:text-5xl leading-tight">
              Practise where the meals come from.
            </h1>
            <p className="text-base text-clinical-zinc max-w-xl leading-relaxed">
              Tanmatra is opening its kitchen and member base to RDs who want
              to grow a clinical practice without building the back-office.
              Run sessions, ship plans, and see your protocols on the plate.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/rd-partners/apply"
                onClick={() =>
                  void trackRdPartnersEvent("hero_cta_click", { step: 0 })
                }
              >
                <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 h-10 text-sm gap-2">
                  Start application
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a
                href="#how-it-works"
                className="text-xs text-clinical-zinc hover:text-white"
              >
                What's involved →
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 text-[11px] text-clinical-zinc">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-clinical-sage" />
                FSSAI &amp; ISO 22000 kitchens
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-clinical-sage" />
                RD-led menu sign-off
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-clinical-sage" />
                3 working day response
              </span>
            </div>
          </div>

          <Card className="bg-clinical-surface border-clinical-slate/30">
            <CardContent className="p-5 space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
                The deal, in one card
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border border-clinical-slate/30 p-3">
                  <p className="text-clinical-gold font-semibold">70 / 30</p>
                  <p className="text-clinical-zinc">RD / platform split on follow-ups</p>
                </div>
                <div className="rounded-md border border-clinical-slate/30 p-3">
                  <p className="text-clinical-gold font-semibold">Free</p>
                  <p className="text-clinical-zinc">15-min intro covered by Tanmatra</p>
                </div>
                <div className="rounded-md border border-clinical-slate/30 p-3">
                  <p className="text-clinical-gold font-semibold">Monthly</p>
                  <p className="text-clinical-zinc">Direct payout, no minimums</p>
                </div>
                <div className="rounded-md border border-clinical-slate/30 p-3">
                  <p className="text-clinical-gold font-semibold">Owned</p>
                  <p className="text-clinical-zinc">Your client list stays yours</p>
                </div>
              </div>
              <Link
                to="/rd-partners/apply"
                className="block"
                onClick={() =>
                  void trackRdPartnersEvent("card_cta_click", { step: 0 })
                }
              >
                <Button className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 h-9 text-xs">
                  Apply in 5 minutes
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* value props */}
      <section className="border-b border-clinical-slate/30">
        <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-clinical-slate/30 bg-clinical-surface p-5"
            >
              <Icon className="w-5 h-5 text-clinical-gold mb-3" />
              <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
              <p className="text-xs text-clinical-zinc leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how-it-works" className="border-b border-clinical-slate/30">
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
          <div>
            <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 uppercase tracking-widest text-[10px] mb-2">
              Application
            </Badge>
            <h2 className="font-serif text-2xl sm:text-3xl text-white">
              What happens after you click "Start"
            </h2>
          </div>
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li
                key={step}
                className="flex gap-3 rounded-lg border border-clinical-slate/30 bg-clinical-surface p-4"
              >
                <span className="w-7 h-7 rounded-full bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30 flex items-center justify-center text-xs font-semibold">
                  {i + 1}
                </span>
                <p className="text-sm text-white pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
          <div className="pt-2">
            <Link
              to="/rd-partners/apply"
              onClick={() =>
                void trackRdPartnersEvent("steps_cta_click", { step: 0 })
              }
            >
              <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 h-10 text-sm gap-2">
                I'm ready, start the application
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <p className="text-[11px] text-clinical-zinc mt-2">
              Already submitted? We reply by email — no need to apply again.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ-lite */}
      <section>
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-4">
          <h2 className="font-serif text-xl text-white">Common questions</h2>
          <div className="space-y-3 text-xs text-clinical-zinc">
            <div className="rounded-lg border border-clinical-slate/30 bg-clinical-surface p-4">
              <p className="text-white text-sm font-medium mb-1">
                Do I have to leave my current practice?
              </p>
              No. Most partners run Tanmatra alongside an existing clinic. We
              ask for at least 4 booking hours per week to keep response times
              honest with members.
            </div>
            <div className="rounded-lg border border-clinical-slate/30 bg-clinical-surface p-4">
              <p className="text-white text-sm font-medium mb-1">
                Who handles the meals?
              </p>
              We do — formulation, sourcing, kitchen, last-mile. You own the
              clinical relationship; we own the cold chain.
            </div>
            <div className="rounded-lg border border-clinical-slate/30 bg-clinical-surface p-4">
              <p className="text-white text-sm font-medium mb-1">
                What's "advisory" vs "partner"?
              </p>
              Partners take bookings. Advisory members shape protocols, sign
              off menu changes, and join a quarterly clinical council — paid
              as a retainer, no booking obligation. Pick "both" if you want
              the option to do either.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
