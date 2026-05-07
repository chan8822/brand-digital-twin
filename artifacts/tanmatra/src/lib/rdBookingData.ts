import { TEAM, type TeamMember } from "./teamData";

export type AppointmentKind = "intro_15m" | "follow_up_30m" | "follow_up_45m";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export interface RdBookingProfile {
  slug: string;
  languages: string[];
  specialties: string[];
  bookable: boolean;
  introPricePaise: number;
  followUp30PricePaise: number;
  followUp45PricePaise: number;
  /** Office hours per day-of-week (0=Sun..6=Sat). Strings "HH:MM" 24h, IST. */
  hours: Partial<Record<number, Array<[string, string]>>>;
}

export const RD_BOOKING: RdBookingProfile[] = [
  {
    slug: "rd-anjali-nair",
    languages: ["English", "Hindi", "Malayalam"],
    specialties: ["Type 2 diabetes", "PCOS", "Cardiometabolic", "Cholesterol"],
    bookable: true,
    introPricePaise: 0,
    followUp30PricePaise: 120000,
    followUp45PricePaise: 180000,
    hours: {
      1: [["09:00", "12:00"], ["15:00", "18:00"]],
      2: [["09:00", "12:00"], ["15:00", "18:00"]],
      3: [["09:00", "12:00"]],
      4: [["09:00", "12:00"], ["15:00", "18:00"]],
      5: [["09:00", "13:00"]],
    },
  },
  {
    slug: "rd-vikram-sethi",
    languages: ["English", "Hindi", "Punjabi"],
    specialties: ["Sports nutrition", "Lean muscle", "Body recomposition"],
    bookable: true,
    introPricePaise: 0,
    followUp30PricePaise: 100000,
    followUp45PricePaise: 150000,
    hours: {
      1: [["07:00", "10:00"], ["18:00", "21:00"]],
      2: [["07:00", "10:00"], ["18:00", "21:00"]],
      3: [["07:00", "10:00"], ["18:00", "21:00"]],
      4: [["07:00", "10:00"]],
      6: [["08:00", "12:00"]],
    },
  },
  {
    slug: "rd-kavya-menon",
    languages: ["English", "Hindi", "Tamil", "Malayalam"],
    specialties: ["Family nutrition", "Paediatric", "Gut health / IBS", "Senior wellness"],
    bookable: true,
    introPricePaise: 0,
    followUp30PricePaise: 90000,
    followUp45PricePaise: 135000,
    hours: {
      1: [["10:00", "13:00"], ["16:00", "19:00"]],
      3: [["10:00", "13:00"], ["16:00", "19:00"]],
      5: [["10:00", "13:00"], ["16:00", "19:00"]],
      6: [["10:00", "14:00"]],
    },
  },
];

export const APPOINTMENT_KIND_META: Record<
  AppointmentKind,
  { label: string; durationMin: number; description: string }
> = {
  intro_15m: {
    label: "15-min intro",
    durationMin: 15,
    description: "Free first call to align goals and decide on a plan.",
  },
  follow_up_30m: {
    label: "30-min follow-up",
    durationMin: 30,
    description: "Review progress, lab notes, and adjust your plan.",
  },
  follow_up_45m: {
    label: "45-min deep-dive",
    durationMin: 45,
    description: "Long session for new protocols or complex cases.",
  },
};

export function getRdProfile(slug: string): RdBookingProfile | undefined {
  return RD_BOOKING.find((r) => r.slug === slug);
}

export function getRdMember(slug: string): TeamMember | undefined {
  return TEAM.find((m) => m.slug === slug);
}

export function listRds(): Array<{ profile: RdBookingProfile; member: TeamMember }> {
  return RD_BOOKING.map((profile) => {
    const member = getRdMember(profile.slug);
    if (!member) return null;
    return { profile, member };
  }).filter((x): x is { profile: RdBookingProfile; member: TeamMember } => x !== null);
}

export function priceForKind(profile: RdBookingProfile, kind: AppointmentKind): number {
  if (kind === "intro_15m") return profile.introPricePaise;
  if (kind === "follow_up_30m") return profile.followUp30PricePaise;
  return profile.followUp45PricePaise;
}

export function formatRupees(paise: number): string {
  if (paise === 0) return "Free";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

interface SlotInput {
  rdSlug: string;
  durationMin: number;
  daysAhead?: number;
  taken?: Array<{ startAt: string; endAt: string }>;
}

export interface SlotOption {
  startAt: string; // ISO
  endAt: string; // ISO
}

/**
 * Generate available slot times for the next N days from the RD's office hours,
 * subtracting any taken slots and any time in the past.
 */
export function generateSlots({
  rdSlug,
  durationMin,
  daysAhead = 14,
  taken = [],
}: SlotInput): SlotOption[] {
  const profile = getRdProfile(rdSlug);
  if (!profile || !profile.bookable) return [];

  const slots: SlotOption[] = [];
  const now = new Date();
  const minStart = new Date(now.getTime() + 60 * 60 * 1000); // at least 1h out

  const takenRanges = taken.map((t) => ({
    start: new Date(t.startAt).getTime(),
    end: new Date(t.endAt).getTime(),
  }));

  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const dow = day.getDay();
    const windows = profile.hours[dow] ?? [];
    for (const [startStr, endStr] of windows) {
      const [sh, sm] = startStr.split(":").map(Number);
      const [eh, em] = endStr.split(":").map(Number);
      const winStart = new Date(day);
      winStart.setHours(sh ?? 0, sm ?? 0, 0, 0);
      const winEnd = new Date(day);
      winEnd.setHours(eh ?? 0, em ?? 0, 0, 0);

      let cur = new Date(winStart);
      while (cur.getTime() + durationMin * 60_000 <= winEnd.getTime()) {
        const slotStart = new Date(cur);
        const slotEnd = new Date(cur.getTime() + durationMin * 60_000);
        if (slotStart >= minStart) {
          const startMs = slotStart.getTime();
          const endMs = slotEnd.getTime();
          const conflict = takenRanges.some(
            (r) => startMs < r.end && endMs > r.start,
          );
          if (!conflict) {
            slots.push({
              startAt: slotStart.toISOString(),
              endAt: slotEnd.toISOString(),
            });
          }
        }
        cur = new Date(cur.getTime() + durationMin * 60_000);
      }
    }
  }
  return slots;
}
