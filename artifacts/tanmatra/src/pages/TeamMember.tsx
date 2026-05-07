import { useParams, Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, ChefHat, Award } from "lucide-react";
import {
  ACCENT_CLASSES,
  getOwnedDishesForMember,
  getTeamMemberBySlug,
} from "@/lib/teamData";
import { LIFESTYLE_LABELS } from "@/lib/dishEnrichment";
import { formatPrice } from "@/lib/api/adapter";

export default function TeamMember() {
  const { slug } = useParams<{ slug: string }>();
  const member = slug ? getTeamMemberBySlug(slug) : undefined;

  if (!member) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Profile not found</h1>
        <Link to="/team">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to team
          </Button>
        </Link>
      </div>
    );
  }

  const accent = ACCENT_CLASSES[member.accent];
  const ownedDishes = getOwnedDishesForMember(member);

  return (
    <div className="min-h-screen bg-clinical-dark pb-16">
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <Link
          to="/team"
          className="inline-flex items-center gap-1.5 text-xs text-clinical-zinc hover:text-clinical-gold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to team
        </Link>
      </div>

      <section className="max-w-5xl mx-auto px-4 pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card className="bg-clinical-surface border-clinical-slate/20">
            <CardContent className="p-6 text-center space-y-3">
              <div
                className={`w-24 h-24 rounded-full ring-4 ${accent.ring} ${accent.bg} flex items-center justify-center mx-auto`}
              >
                <span className={`text-2xl font-bold ${accent.text}`}>
                  {member.initials}
                </span>
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{member.name}</p>
                <p className="text-xs text-clinical-zinc">{member.title}</p>
              </div>
              <Badge
                variant="outline"
                className={`${accent.chip} text-[10px] gap-1`}
              >
                {member.role === "rd" ? (
                  <ShieldCheck className="w-3 h-3" />
                ) : (
                  <ChefHat className="w-3 h-3" />
                )}
                {member.role === "rd" ? "Registered Dietitian" : "Head Chef"}
              </Badge>
              <div className="text-[10px] uppercase tracking-widest text-clinical-zinc/70 pt-2">
                {member.yearsExperience} years experience
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-5">
          <div>
            <h1 className="text-clinical-h1 text-white">{member.name}</h1>
            <p className={`text-sm ${accent.text} mt-1`}>{member.signatureLine}</p>
          </div>

          <p className="text-sm text-clinical-zinc leading-relaxed">{member.bio}</p>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-clinical-gold" />
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc/70 font-semibold">
                Credentials
              </p>
            </div>
            <ul className="space-y-1">
              {member.credentials.map((c) => (
                <li key={c} className="text-xs text-clinical-zinc">
                  • {c}
                </li>
              ))}
            </ul>
          </div>

          {member.lifestyles && member.lifestyles.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc/70 font-semibold">
                Owns these protocols
              </p>
              <div className="flex flex-wrap gap-1.5">
                {member.lifestyles.map((l) => (
                  <Badge
                    key={l}
                    variant="outline"
                    className={`${accent.chip} text-[10px]`}
                  >
                    {LIFESTYLE_LABELS[l]}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {ownedDishes.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 mt-10 space-y-4">
          <p className="text-clinical-label">
            {member.role === "chef" ? "Dishes from this kitchen" : "Dishes signed off by this RD"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ownedDishes.map((d) => (
              <Link key={d.id} to={`/dish/${d.slug}`}>
                <Card className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/40 transition-colors overflow-hidden h-full">
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={d.image}
                      alt={d.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <CardContent className="p-3 space-y-1">
                    <p className="text-xs font-medium text-white truncate">{d.name}</p>
                    <p className="text-[10px] text-clinical-zinc tabular-nums">
                      {d.macros.calories} kcal · {formatPrice(d.price)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
