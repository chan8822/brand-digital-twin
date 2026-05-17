import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listRds, formatRupees } from "@/lib/rdBookingData";
import {
  PROTOCOL_LABELS,
  PROTOCOL_TAGLINES,
  isProtocol,
  rdsForProtocol,
  type Protocol,
} from "@/lib/protocols";
import { ChevronRight, Globe, Stethoscope, CalendarDays } from "lucide-react";

export default function RdDirectory() {
  const allRds = listRds();
  const [searchParams, setSearchParams] = useSearchParams();
  const protocolParam = searchParams.get("protocol");
  const activeProtocol: Protocol | null = isProtocol(protocolParam)
    ? protocolParam
    : null;

  const rds = useMemo(() => {
    if (!activeProtocol) return allRds;
    const matching = new Set(
      rdsForProtocol(
        allRds.map(({ profile }) => profile),
        activeProtocol,
      ).map((p) => p.slug),
    );
    return allRds.filter(({ profile }) => matching.has(profile.slug));
  }, [allRds, activeProtocol]);

  function clearProtocol() {
    const next = new URLSearchParams(searchParams);
    next.delete("protocol");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <header className="space-y-3">
        <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 uppercase tracking-widest text-[10px]">
          1:1 Advisory
        </Badge>
        <h1 className="font-serif text-3xl sm:text-4xl text-white">
          {activeProtocol
            ? `${PROTOCOL_LABELS[activeProtocol]} Protocol — RD specialists`
            : "Book a registered dietitian"}
        </h1>
        <p className="text-sm text-clinical-zinc max-w-2xl">
          {activeProtocol
            ? PROTOCOL_TAGLINES[activeProtocol]
            : "Start with a free 15-minute intro to align goals, then move into paid follow-ups for plan adjustments, lab review, and ongoing support. Every RD on this page is on staff and signs off our menu."}
        </p>
        {activeProtocol && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-clinical-zinc">
            <span>
              Showing {rds.length} of {allRds.length} RDs matching this protocol.
            </span>
            <button
              type="button"
              onClick={clearProtocol}
              className="text-[11px] uppercase tracking-[0.12em] text-clinical-gold hover:underline font-semibold"
            >
              Clear filter — see all RDs
            </button>
          </div>
        )}
      </header>

      {activeProtocol && rds.length === 0 && (
        <div className="rounded-xl border border-clinical-border bg-clinical-surface p-5 text-sm text-clinical-zinc">
          No RDs currently match this protocol —{" "}
          <button
            type="button"
            onClick={clearProtocol}
            className="text-clinical-gold hover:underline"
          >
            see the full directory
          </button>
          .
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {rds.map(({ profile, member }) => (
          <Card
            key={profile.slug}
            className="bg-clinical-surface border-clinical-border hover:border-clinical-gold/40 transition-colors flex flex-col"
          >
            <CardContent className="p-5 space-y-4 flex-1 flex flex-col">
              <div className="flex items-start gap-3">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center font-semibold text-sm border ${
                    member.accent === "sage"
                      ? "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30"
                      : member.accent === "blue"
                        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                        : "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30"
                  }`}
                >
                  {member.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white truncate">
                    {member.name}
                  </h3>
                  <p className="text-[11px] text-clinical-zinc">{member.title}</p>
                </div>
              </div>

              <p className="text-xs text-clinical-zinc leading-relaxed line-clamp-3">
                {member.bio}
              </p>

              <div className="space-y-2">
                <div className="flex items-start gap-2 text-[11px] text-clinical-zinc">
                  <Stethoscope className="w-3.5 h-3.5 text-clinical-sage shrink-0 mt-0.5" />
                  <span>{profile.specialties.join(" · ")}</span>
                </div>
                <div className="flex items-start gap-2 text-[11px] text-clinical-zinc">
                  <Globe className="w-3.5 h-3.5 text-clinical-sage shrink-0 mt-0.5" />
                  <span>{profile.languages.join(", ")}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 mt-auto border-t border-clinical-border">
                <div className="text-[11px] text-clinical-zinc">
                  <span className="text-clinical-sage font-semibold">Free</span>{" "}
                  intro · {formatRupees(profile.followUp30PricePaise)}/30m
                </div>
                <Link to={`/rd/${profile.slug}`}>
                  <Button
                    size="sm"
                    className="h-8 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs gap-1"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Book
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-clinical-border bg-clinical-surface p-5">
        <h2 className="text-sm font-semibold text-white mb-1">
          Already booked?
        </h2>
        <p className="text-xs text-clinical-zinc mb-3">
          See your upcoming sessions, message your RD, log progress, and share
          lab results from your appointments dashboard.
        </p>
        <Link to="/appointments">
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 text-xs"
          >
            Open my appointments
          </Button>
        </Link>
      </div>
    </div>
  );
}
