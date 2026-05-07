import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChefHat, Stethoscope, ShieldCheck, ArrowRight } from "lucide-react";
import { TEAM, ACCENT_CLASSES } from "@/lib/teamData";

export default function Team() {
  const chefs = TEAM.filter((m) => m.role === "chef");
  const rds = TEAM.filter((m) => m.role === "rd");

  return (
    <div className="min-h-screen bg-clinical-dark pb-16">
      <section className="border-b border-clinical-slate/20 py-12">
        <div className="max-w-5xl mx-auto px-4 space-y-3">
          <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 text-[10px] tracking-widest uppercase">
            Behind the food
          </Badge>
          <h1 className="text-clinical-h1 text-white">Meet the people on your plate</h1>
          <p className="text-sm text-clinical-zinc max-w-2xl leading-relaxed">
            Every dish at Tanmatra is owned end-to-end. A head chef cooks it, a
            registered dietitian signs it off, and both of their names sit next to
            the meal — not on a corporate page.
          </p>
        </div>
      </section>

      <section className="py-10 border-b border-clinical-slate/20">
        <div className="max-w-5xl mx-auto px-4 space-y-5">
          <div className="flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-clinical-gold" />
            <h2 className="text-clinical-h2 text-white">Chefs</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {chefs.map((m) => (
              <TeamCard key={m.slug} member={m} />
            ))}
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="max-w-5xl mx-auto px-4 space-y-5">
          <div className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-clinical-sage" />
            <h2 className="text-clinical-h2 text-white">Registered Dietitians</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rds.map((m) => (
              <TeamCard key={m.slug} member={m} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function TeamCard({ member }: { member: (typeof TEAM)[number] }) {
  const accent = ACCENT_CLASSES[member.accent];
  return (
    <Link to={`/team/${member.slug}`}>
      <Card className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/40 transition-colors h-full">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-12 h-12 rounded-full ring-2 ${accent.ring} ${accent.bg} flex items-center justify-center shrink-0`}
            >
              <span className={`text-sm font-bold ${accent.text}`}>{member.initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{member.name}</p>
              <p className="text-xs text-clinical-zinc truncate">{member.title}</p>
            </div>
            {member.role === "rd" && (
              <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 gap-1 text-[9px] h-5">
                <ShieldCheck className="w-2.5 h-2.5" />
                RD
              </Badge>
            )}
          </div>
          <p className="text-xs text-clinical-zinc leading-relaxed line-clamp-3">
            {member.signatureLine}
          </p>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] uppercase tracking-wider text-clinical-zinc/70">
              {member.yearsExperience} yrs experience
            </span>
            <span className="text-[11px] text-clinical-gold inline-flex items-center gap-1">
              View profile
              <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
