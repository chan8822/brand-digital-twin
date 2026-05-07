import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  APPOINTMENT_KIND_META,
  formatRupees,
  getRdMember,
  getRdProfile,
  priceForKind,
  type AppointmentKind,
  type SlotOption,
} from "@/lib/rdBookingData";
import { rdAdvisoryApi } from "@/lib/rdAdvisoryApi";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, Clock, Globe, Stethoscope } from "lucide-react";

const KINDS: AppointmentKind[] = [
  "intro_15m",
  "follow_up_30m",
  "follow_up_45m",
];

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RdProfile() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const profile = getRdProfile(slug);
  const member = getRdMember(slug);

  const [kind, setKind] = useState<AppointmentKind>("intro_15m");
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [selected, setSelected] = useState<SlotOption | null>(null);
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch slots from the canonical server endpoint (not local generation),
  // so booking always references the same office-hour windows + taken set
  // the server will validate against.
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    rdAdvisoryApi
      .slots(profile.slug, kind)
      .then((r) => {
        if (alive) setSlots(r.slots.slice(0, 60));
      })
      .catch(() => {
        if (alive) setSlots([]);
      });
    return () => {
      alive = false;
    };
  }, [profile, kind]);

  const meta = APPOINTMENT_KIND_META[kind];

  const grouped = useMemo(() => {
    const out: Record<string, SlotOption[]> = {};
    for (const s of slots) {
      const day = s.startAt.slice(0, 10);
      (out[day] = out[day] ?? []).push(s);
    }
    return out;
  }, [slots]);

  if (!profile || !member) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-clinical-zinc">
        <p>RD not found.</p>
        <Link to="/rd" className="text-clinical-gold underline text-sm">
          Back to directory
        </Link>
      </div>
    );
  }

  const price = priceForKind(profile, kind);

  async function confirmBooking() {
    if (!selected || !profile) return;
    // Paid follow-ups are routed through the existing checkout-style
    // confirm-and-pay screen. Free intros book directly.
    if (price > 0) {
      navigate("/checkout-appointment", {
        state: {
          rdSlug: profile.slug,
          kind,
          startAt: selected.startAt,
          endAt: selected.endAt,
          pricePaise: price,
          userQuestion: question.trim() || undefined,
          rdName: member?.name,
        },
      });
      return;
    }
    setSubmitting(true);
    try {
      const { appointment } = await rdAdvisoryApi.book({
        rdSlug: profile.slug,
        kind,
        startAt: selected.startAt,
        endAt: selected.endAt,
        userQuestion: question.trim() || undefined,
      });
      toast.success("Booking confirmed", {
        description: `${meta.label} with ${member?.name.split(" ").slice(-1)[0]} on ${formatDay(appointment.startAt)} at ${formatTime(appointment.startAt)}.`,
      });
      navigate("/appointments");
    } catch (err) {
      const msg = String(err);
      if (msg.includes("401")) {
        toast.error("Sign in to book", {
          description: "Please sign in to confirm your appointment.",
        });
      } else if (msg.includes("409")) {
        toast.error("Slot just taken", {
          description: "Please pick another time — that slot was booked.",
        });
        const r = await rdAdvisoryApi.slots(profile.slug, kind);
        setSlots(r.slots.slice(0, 60));
        setSelected(null);
      } else {
        toast.error("Could not book", { description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Link
        to="/rd"
        className="inline-flex items-center gap-1.5 text-xs text-clinical-zinc hover:text-clinical-gold"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> All RDs
      </Link>

      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-14 h-14 rounded-xl flex items-center justify-center font-semibold text-base border ${
                  member.accent === "sage"
                    ? "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30"
                    : member.accent === "blue"
                      ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                      : "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30"
                }`}
              >
                {member.initials}
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">
                  {member.name}
                </h1>
                <p className="text-xs text-clinical-zinc">{member.title}</p>
                <Badge className="mt-1 bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 text-[10px] uppercase">
                  Registered Dietitian
                </Badge>
              </div>
            </div>
            <p className="text-xs text-clinical-zinc leading-relaxed">
              {member.bio}
            </p>
            <div className="space-y-2 text-[11px] text-clinical-zinc">
              <div className="flex items-start gap-2">
                <Stethoscope className="w-3.5 h-3.5 text-clinical-sage shrink-0 mt-0.5" />
                <span>{profile.specialties.join(" · ")}</span>
              </div>
              <div className="flex items-start gap-2">
                <Globe className="w-3.5 h-3.5 text-clinical-sage shrink-0 mt-0.5" />
                <span>{profile.languages.join(", ")}</span>
              </div>
            </div>
            <div className="rounded-lg border border-clinical-slate/30 p-3 space-y-1 text-[11px] text-clinical-zinc">
              <p className="font-medium text-white text-xs">Credentials</p>
              {member.credentials.map((c) => (
                <p key={c}>· {c}</p>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc mb-2">
                Session type
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {KINDS.map((k) => {
                  const m = APPOINTMENT_KIND_META[k];
                  const p = priceForKind(profile, k);
                  const active = k === kind;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setKind(k);
                        setSelected(null);
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? "border-clinical-gold/60 bg-clinical-gold/10"
                          : "border-clinical-slate/30 hover:border-clinical-gold/30"
                      }`}
                    >
                      <p className="text-xs font-semibold text-white">
                        {m.label}
                      </p>
                      <p className="text-[10px] text-clinical-zinc mt-0.5">
                        {m.description}
                      </p>
                      <p
                        className={`text-[11px] font-semibold mt-1 ${p === 0 ? "text-clinical-sage" : "text-clinical-gold"}`}
                      >
                        {formatRupees(p)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc mb-2">
                Pick a slot (next 14 days · IST)
              </p>
              {Object.keys(grouped).length === 0 ? (
                <p className="text-xs text-clinical-zinc">
                  No open slots in the next two weeks. Try a different session
                  length or check back tomorrow.
                </p>
              ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {Object.entries(grouped).map(([day, daySlots]) => (
                    <div key={day}>
                      <p className="text-[11px] text-clinical-zinc font-medium mb-1.5">
                        {formatDay(`${day}T00:00:00`)}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {daySlots.map((s) => {
                          const active =
                            selected && selected.startAt === s.startAt;
                          return (
                            <button
                              key={s.startAt}
                              type="button"
                              onClick={() => setSelected(s)}
                              className={`text-[11px] tabular-nums px-2.5 py-1.5 rounded-md border transition-colors ${
                                active
                                  ? "bg-clinical-gold text-[#050505] border-clinical-gold"
                                  : "border-clinical-slate/30 text-clinical-zinc hover:border-clinical-gold/40 hover:text-white"
                              }`}
                            >
                              {formatTime(s.startAt)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc mb-2">
                What would you like to discuss? (optional)
              </p>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Goals, recent labs, conditions, current medications…"
                className="bg-[#050505] border-clinical-slate/30 text-xs"
                rows={3}
                maxLength={2000}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-clinical-slate/30 p-3">
              <div className="text-xs text-clinical-zinc">
                {selected ? (
                  <span>
                    <Clock className="w-3.5 h-3.5 inline mr-1 text-clinical-gold" />
                    {formatDay(selected.startAt)} ·{" "}
                    {formatTime(selected.startAt)} · {meta.durationMin}m
                  </span>
                ) : (
                  "Select a time to confirm"
                )}
              </div>
              <Button
                onClick={confirmBooking}
                disabled={!selected || submitting}
                className="h-9 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs gap-1"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                {submitting
                  ? "Booking…"
                  : price === 0
                    ? "Confirm (free)"
                    : `Confirm · ${formatRupees(price)}`}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
