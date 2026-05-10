import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChallenges } from "@/lib/contentApi";
import CommunityCohortPanel from "@/components/CommunityCohortPanel";
import { CalendarDays, Flag, Sparkles, Users } from "lucide-react";

function formatRange(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}

function statusFor(startsAt: string, endsAt: string): {
  label: string;
  tone: "live" | "soon" | "ended";
} {
  const now = Date.now();
  const s = new Date(startsAt).getTime();
  const e = new Date(endsAt).getTime();
  if (now < s) return { label: "Starts soon", tone: "soon" };
  if (now > e) return { label: "Ended", tone: "ended" };
  return { label: "Live now", tone: "live" };
}

export default function Challenges() {
  const { data: challenges, isLoading } = useChallenges();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.18em] text-clinical-zinc/70 font-semibold flex items-center gap-1.5">
          <Flag className="w-3 h-3 text-clinical-gold" />
          Cohort Challenges
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-white">
          Time-boxed resets, with the cohort
        </h1>
        <p className="text-sm text-clinical-zinc max-w-2xl">
          Each challenge bundles a meal plan, RD check-ins, and a private feed
          where the cohort shares progress.
        </p>
      </div>

      <CommunityCohortPanel />

      {isLoading && (
        <p className="text-sm text-clinical-zinc">Loading challenges…</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {challenges?.map((c) => {
          const status = statusFor(c.startsAt, c.endsAt);
          return (
            <Card
              key={c.id}
              className="bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/40 transition-colors overflow-hidden flex flex-col"
            >
              {c.image && (
                <div className="relative aspect-[16/9] overflow-hidden">
                  <img src={c.image} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/85 via-transparent to-transparent" />
                  {c.featured > 0 && (
                    <Badge className="absolute top-2 left-2 bg-clinical-gold/90 text-[#050505] border-0 text-[9px] gap-1">
                      <Sparkles className="w-2.5 h-2.5" />
                      Featured
                    </Badge>
                  )}
                  <Badge
                    className={`absolute top-2 right-2 border-0 text-[9px] ${
                      status.tone === "live"
                        ? "bg-clinical-sage/90 text-[#050505]"
                        : status.tone === "soon"
                          ? "bg-clinical-blue/80 text-white"
                          : "bg-clinical-slate/60 text-clinical-zinc"
                    }`}
                  >
                    {status.label}
                  </Badge>
                </div>
              )}
              <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white">{c.title}</h3>
                  <p className="text-xs text-clinical-zinc leading-relaxed line-clamp-2">
                    {c.tagline}
                  </p>
                </div>
                {c.goalTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.goalTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-clinical-surface-elevated text-clinical-zinc border border-clinical-slate/30"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 text-[10px] text-clinical-zinc/80 tabular-nums">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3 text-clinical-gold" />
                    {c.durationDays}-day program
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-clinical-gold" />
                    {c.memberCount} joined
                  </span>
                </div>
                <p className="text-[10px] text-clinical-zinc/70">
                  {formatRange(c.startsAt, c.endsAt)} · Led by {c.rdName}
                </p>
                <div className="mt-auto pt-2">
                  <Link to={`/challenges/${c.slug}`}>
                    {/* CTA promoted from outline to solid gold so non-members
                        can identify the join action from the index page —
                        per UX audit Journey-C finding 5. Mobile-first
                        min-h-11 touch target. */}
                    <Button
                      size="sm"
                      className="w-full min-h-11 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold text-xs"
                    >
                      View challenge →
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!isLoading && (challenges?.length ?? 0) === 0 && (
        <p className="text-center text-sm text-clinical-zinc py-12">
          No challenges right now — check back soon.
        </p>
      )}
    </div>
  );
}
