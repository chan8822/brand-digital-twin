import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Crown,
  Truck,
  Stethoscope,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { premiumApi } from "@/lib/marketplaceApi";
import { formatPrice } from "@/lib/api/adapter";

const BENEFITS = [
  {
    icon: Truck,
    title: "Priority delivery",
    desc: "Your orders jump the kitchen queue and ship in our first rider wave — typically 12–18 min faster.",
  },
  {
    icon: Stethoscope,
    title: "1 free RD consult / month",
    desc: "30-minute video session with a registered dietitian — typically ₹1,499 — included every billing period.",
  },
  {
    icon: Crown,
    title: "Premium-only meals",
    desc: "Access chef-table dishes (Wild salmon, dry-aged ribeye, miso black cod) reserved for members.",
  },
  {
    icon: Sparkles,
    title: "Exclusive add-ons",
    desc: "Marine collagen, chef-curated tonics, and limited drops in your checkout add-on rail.",
  },
];

export default function Premium() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["premium", "me"],
    queryFn: premiumApi.me,
  });

  const subscribe = useMutation({
    mutationFn: premiumApi.subscribe,
    onSuccess: () => {
      toast.success("Welcome to Tanmatra Premium");
      qc.invalidateQueries({ queryKey: ["premium", "me"] });
    },
    onError: (err) => {
      const msg = String((err as Error).message);
      if (msg.includes("401")) {
        toast.error("Sign in to subscribe");
      } else if (msg.includes("already")) {
        toast.message("You're already a premium member");
      } else {
        toast.error("Could not subscribe — please try again");
      }
    },
  });

  const cancel = useMutation({
    mutationFn: premiumApi.cancel,
    onSuccess: () => {
      toast.success("Membership will end at period close");
      qc.invalidateQueries({ queryKey: ["premium", "me"] });
    },
    onError: () => toast.error("Could not cancel — please try again"),
  });

  const isPremium = status.data?.isPremium ?? false;
  const membership = status.data?.membership ?? null;
  const pricePaise = status.data?.pricePaise ?? 99900;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-300">
      <header className="text-center space-y-3 py-6">
        <Badge className="bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/40 px-3 py-1 text-[11px] tracking-widest">
          <Crown className="w-3 h-3 mr-1.5" /> TANMATRA PREMIUM
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-serif text-white">
          Eat better, recover faster, get expert guidance.
        </h1>
        <p className="text-sm text-clinical-zinc max-w-xl mx-auto">
          One membership unlocks priority delivery, a monthly RD consult,
          premium-only dishes and exclusive pantry drops.
        </p>
      </header>

      <Card className="bg-gradient-to-br from-clinical-gold/10 via-clinical-surface to-clinical-surface border-clinical-gold/40">
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-serif text-clinical-gold tabular-nums">
                {formatPrice(pricePaise)}
              </span>
              <span className="text-xs text-clinical-zinc">/ month</span>
            </div>
            {isPremium && membership ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-clinical-sage text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Active —{" "}
                  {membership.status === "cancelled"
                    ? "ends"
                    : "renews"}{" "}
                  on{" "}
                  {new Date(membership.currentPeriodEnd).toLocaleDateString(
                    undefined,
                    { day: "numeric", month: "short", year: "numeric" },
                  )}
                </div>
                <p className="text-[12px] text-clinical-zinc">
                  RD consults this period:{" "}
                  <span className="text-white">
                    {membership.rdConsultsUsedThisPeriod} /{" "}
                    {membership.rdConsultsPerPeriod}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-clinical-zinc">
                Cancel anytime · No long-term commitment · Refund within 7 days
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {isPremium ? (
              <>
                <Button asChild className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
                  <Link to="/rd">Book my free RD consult</Link>
                </Button>
                {membership?.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    className="border-clinical-slate/40 text-clinical-zinc hover:text-white"
                    onClick={() => cancel.mutate()}
                    disabled={cancel.isPending}
                  >
                    {cancel.isPending ? "Cancelling…" : "Cancel renewal"}
                  </Button>
                )}
              </>
            ) : (
              <Button
                className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 px-8"
                onClick={() => subscribe.mutate()}
                disabled={subscribe.isPending}
              >
                {subscribe.isPending ? "Activating…" : "Become a member"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BENEFITS.map((b) => (
          <Card key={b.title} className="bg-clinical-surface border-clinical-slate/20">
            <CardContent className="p-5 flex gap-3">
              <div className="w-9 h-9 rounded-lg bg-clinical-gold/15 text-clinical-gold flex items-center justify-center shrink-0">
                <b.icon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">{b.title}</h3>
                <p className="text-[12px] text-clinical-zinc mt-1 leading-relaxed">
                  {b.desc}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator className="bg-clinical-slate/20" />

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 flex items-start gap-3 text-[12px] text-clinical-zinc">
          <ShieldCheck className="w-4 h-4 text-clinical-sage shrink-0 mt-0.5" />
          <p>
            Premium is operated directly by Tanmatra Health Technologies. RD
            consults are conducted by registered dietitians on our care team.
            Priority delivery is a kitchen-queue benefit — not a delivery-time
            guarantee. See{" "}
            <Link to="/terms" className="text-clinical-gold hover:underline">
              terms
            </Link>{" "}
            for full details.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
