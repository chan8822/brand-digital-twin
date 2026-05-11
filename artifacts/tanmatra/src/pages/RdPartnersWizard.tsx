import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { API_BASE } from "@/lib/apiBase";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  getRdPartnersSessionId,
  trackRdPartnersEvent,
} from "@/lib/rdPartnersAnalytics";

type Path = "partner" | "advisory" | "both";
type PracticeSetting =
  | "solo"
  | "clinic"
  | "hospital"
  | "corporate"
  | "academia"
  | "online-only"
  | "other";

interface DraftState {
  path: Path | "";
  fullName: string;
  email: string;
  credentials: string;
  registrationBody: string;
  registrationNumber: string;
  yearsExperience: string;
  specializations: string[];
  cityRegion: string;
  languages: string[];
  practiceSetting: PracticeSetting | "";
  clientVolumeBucket: "lt10" | "10_50" | "50_200" | "gt200" | "";
  interests: string[];
  bio: string;
  whatsappCountryCode: string;
  whatsappPhone: string;
  whatsappOptIn: boolean;
  notifyPref: "daily" | "weekly" | "critical";
  whatsappVerified: boolean;
}

const EMPTY: DraftState = {
  path: "",
  fullName: "",
  email: "",
  credentials: "",
  registrationBody: "",
  registrationNumber: "",
  yearsExperience: "",
  specializations: [],
  cityRegion: "",
  languages: [],
  practiceSetting: "",
  clientVolumeBucket: "",
  interests: [],
  bio: "",
  whatsappCountryCode: "+91",
  whatsappPhone: "",
  whatsappOptIn: true,
  notifyPref: "weekly",
  whatsappVerified: false,
};

const SPECIALIZATIONS = [
  "PCOS",
  "Diabetes",
  "Sports / Performance",
  "Pediatrics",
  "Oncology",
  "Renal",
  "GI / IBS",
  "Weight management",
  "Cardiometabolic",
  "Bariatric",
];
const LANGUAGES = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Marathi"];
const INTERESTS = [
  "Take bookings",
  "Co-sign menu protocols",
  "Author recipes",
  "Join clinical council",
  "Speak / publish",
];

const DRAFT_KEY_PREFIX = "tanmatra:rd-partners:draft:v1:";
const STEPS = ["Path", "Profile", "Practice", "WhatsApp", "Review"] as const;

function draftKey(): string {
  return `${DRAFT_KEY_PREFIX}${getRdPartnersSessionId()}`;
}

function loadDraft(): DraftState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(draftKey());
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<DraftState>) };
  } catch {
    return EMPTY;
  }
}

function saveDraft(d: DraftState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftKey(), JSON.stringify(d));
}

function clearDraft() {
  if (typeof window !== "undefined") window.localStorage.removeItem(draftKey());
}

export default function RdPartnersWizard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [step, setStep] = useState<number>(0);
  const [draft, setDraft] = useState<DraftState>(loadDraft);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{
    id: number;
    notifyTo: string | null;
  } | null>(null);

  useEffect(() => {
    void trackRdPartnersEvent("rd_wizard_started", { step: 0 });
  }, []);

  // If we returned from /login with `?linked=<id>`, jump to the done
  // step and try the attach call so the user finishes the optional
  // account hookup without redoing the wizard.
  useEffect(() => {
    const linked = params.get("linked");
    if (!linked) return;
    const id = Number(linked);
    if (!Number.isInteger(id) || id < 1) return;
    setSubmitted({ id, notifyTo: null });
    setStep(5);
    // Strip the param so a refresh doesn't re-trigger.
    params.delete("linked");
    setParams(params, { replace: true });
    void fetch(`${API_BASE}/rd-partners/applications/${id}/create-account`, {
      method: "POST",
      credentials: "include",
    }).then((res) => {
      if (res.ok) {
        toast.success("Account attached");
        void trackRdPartnersEvent("rd_account_created", {
          step: 5,
          applicationId: id,
        });
      }
    });
  }, [params, setParams]);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const update = useCallback((patch: Partial<DraftState>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const toggleArr = (key: keyof DraftState, value: string) => {
    setDraft((d) => {
      const arr = (d[key] as string[]) ?? [];
      const next = arr.includes(value)
        ? arr.filter((v) => v !== value)
        : [...arr, value];
      return { ...d, [key]: next };
    });
  };

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return Boolean(draft.path);
      case 1:
        return (
          draft.fullName.trim().length >= 2 &&
          /.+@.+\..+/.test(draft.email) &&
          draft.credentials.trim().length >= 1 &&
          /^\d+$/.test(draft.yearsExperience) &&
          Number(draft.yearsExperience) >= 0
        );
      case 2:
        return (
          Boolean(draft.practiceSetting) &&
          draft.cityRegion.trim().length >= 2 &&
          draft.languages.length >= 1
        );
      case 3:
        // WhatsApp is optional per task — allow continuing with no
        // number, but mark verification when number is supplied.
        if (!draft.whatsappPhone.trim()) return true;
        return draft.whatsappVerified;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, draft]);

  const next = () => {
    if (!stepValid) return;
    void trackRdPartnersEvent("rd_wizard_step_completed", {
      step,
      extra: { to: step + 1 },
    });
    setStep((s) => Math.min(5, s + 1));
  };
  const back = () => {
    void trackRdPartnersEvent("rd_wizard_step_back", { step });
    setStep((s) => Math.max(0, s - 1));
  };

  async function submit() {
    setSubmitting(true);
    try {
      const body = {
        path: draft.path,
        fullName: draft.fullName.trim(),
        email: draft.email.trim().toLowerCase(),
        credentials: draft.credentials.trim(),
        registrationBody: draft.registrationBody.trim() || undefined,
        registrationNumber: draft.registrationNumber.trim() || undefined,
        yearsExperience: Number(draft.yearsExperience),
        specializations: draft.specializations,
        cityRegion: draft.cityRegion.trim(),
        languages: draft.languages,
        practiceSetting: draft.practiceSetting,
        clientVolumeBucket: draft.clientVolumeBucket || undefined,
        interests: draft.interests,
        bio: draft.bio.trim() || undefined,
        whatsapp: draft.whatsappPhone.trim()
          ? {
              countryCode: draft.whatsappCountryCode,
              phone: draft.whatsappPhone,
            }
          : undefined,
        whatsappOptIn: draft.whatsappOptIn && draft.whatsappVerified,
        notifyPref: draft.notifyPref,
        sessionId: getRdPartnersSessionId(),
      };
      const res = await fetch(`${API_BASE}/rd-partners/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as {
        application: { id: number };
        notify: { to: string | null };
      };
      setSubmitted({ id: j.application.id, notifyTo: j.notify.to });
      setStep(5);
      clearDraft();
      void trackRdPartnersEvent("rd_wizard_submitted", {
        step: 5,
        applicationId: j.application.id,
      });
    } catch (err) {
      toast.error("Could not submit", { description: (err as Error).message });
      void trackRdPartnersEvent("rd_wizard_submit_failed", {
        step: 5,
        extra: { message: (err as Error).message },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-2">
        <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
          RD Partner Application
        </Badge>
        <h1 className="font-serif text-3xl text-white">Join the Tanmatra clinical bench</h1>
        <p className="text-xs text-clinical-zinc">
          About 5 minutes. We save your progress as you go — close the tab and
          come back any time.
        </p>
      </header>

      <Stepper step={step} />

      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-6 space-y-5">
          {step === 0 && <StepPath value={draft.path} onPick={(p) => update({ path: p })} />}
          {step === 1 && <StepProfile draft={draft} update={update} />}
          {step === 2 && (
            <StepPractice draft={draft} update={update} toggle={toggleArr} />
          )}
          {step === 3 && (
            <StepWhatsapp draft={draft} update={update} />
          )}
          {step === 4 && <StepReview draft={draft} />}
          {step === 5 && submitted && (
            <StepDone id={submitted.id} notifyTo={submitted.notifyTo} email={draft.email} />
          )}
        </CardContent>
      </Card>

      {step < 5 && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={step === 0 ? () => navigate("/rd-partners") : back}
            className="text-xs text-clinical-zinc hover:text-white gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {step === 0 ? "Back to overview" : "Previous"}
          </Button>
          {step < 4 ? (
            <Button
              onClick={next}
              disabled={!stepValid}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 h-9 text-xs gap-1"
            >
              Continue
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={submitting}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 h-9 text-xs gap-1"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Submit application
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- subcomponents ----------

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center border text-[10px] ${
                done
                  ? "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/40"
                  : active
                    ? "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/40"
                    : "bg-transparent text-clinical-zinc border-clinical-slate/30"
              }`}
            >
              {done ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
            </div>
            <span className={active ? "text-white" : "text-clinical-zinc"}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="text-clinical-slate/50">·</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepPath({
  value,
  onPick,
}: {
  value: DraftState["path"];
  onPick: (p: Path) => void;
}) {
  const opts: { id: Path; title: string; body: string }[] = [
    {
      id: "partner",
      title: "Practising partner",
      body: "Take member bookings (free 15-min intros, paid follow-ups). Use our console for sessions, lab uploads, progress notes.",
    },
    {
      id: "advisory",
      title: "Advisory board",
      body: "Shape menu protocols, co-sign launches, join the quarterly clinical council. Paid as a retainer.",
    },
    {
      id: "both",
      title: "Both",
      body: "Pick both — we'll discuss the right mix during onboarding.",
    },
  ];
  return (
    <div className="space-y-3">
      <h2 className="text-sm text-white font-medium">
        How do you want to work with Tanmatra?
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            className={`text-left rounded-lg border p-4 transition-colors ${
              value === o.id
                ? "border-clinical-gold/60 bg-clinical-gold/10"
                : "border-clinical-slate/30 hover:border-clinical-gold/30"
            }`}
          >
            <p className="text-sm text-white font-semibold">{o.title}</p>
            <p className="text-xs text-clinical-zinc mt-1">{o.body}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepProfile({
  draft,
  update,
}: {
  draft: DraftState;
  update: (p: Partial<DraftState>) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm text-white font-medium">About you</h2>
      <Field label="Full name">
        <Input
          value={draft.fullName}
          onChange={(e) => update({ fullName: e.target.value })}
          className="bg-[#050505] border-clinical-slate/40 text-sm"
          placeholder="e.g. Dr. Anika Rao"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Email">
          <Input
            type="email"
            value={draft.email}
            onChange={(e) => update({ email: e.target.value })}
            className="bg-[#050505] border-clinical-slate/40 text-sm"
            placeholder="you@clinic.com"
          />
        </Field>
        <Field label="Years of experience">
          <Input
            inputMode="numeric"
            value={draft.yearsExperience}
            onChange={(e) =>
              update({
                yearsExperience: e.target.value.replace(/[^0-9]/g, ""),
              })
            }
            className="bg-[#050505] border-clinical-slate/40 text-sm"
            placeholder="e.g. 7"
          />
        </Field>
      </div>
      <Field label="Credentials (e.g. RD, MSc Clinical Nutrition)">
        <Input
          value={draft.credentials}
          onChange={(e) => update({ credentials: e.target.value })}
          className="bg-[#050505] border-clinical-slate/40 text-sm"
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Registration body (optional)">
          <Input
            value={draft.registrationBody}
            onChange={(e) => update({ registrationBody: e.target.value })}
            className="bg-[#050505] border-clinical-slate/40 text-sm"
            placeholder="e.g. IDA, ICDA"
          />
        </Field>
        <Field label="Registration number (optional)">
          <Input
            value={draft.registrationNumber}
            onChange={(e) => update({ registrationNumber: e.target.value })}
            className="bg-[#050505] border-clinical-slate/40 text-sm"
          />
        </Field>
      </div>
    </div>
  );
}

function StepPractice({
  draft,
  update,
  toggle,
}: {
  draft: DraftState;
  update: (p: Partial<DraftState>) => void;
  toggle: (k: keyof DraftState, v: string) => void;
}) {
  const settings: { id: PracticeSetting; label: string }[] = [
    { id: "solo", label: "Solo / private" },
    { id: "clinic", label: "Group clinic" },
    { id: "hospital", label: "Hospital" },
    { id: "corporate", label: "Corporate wellness" },
    { id: "academia", label: "Academia / research" },
    { id: "online-only", label: "Online-only practice" },
    { id: "other", label: "Other" },
  ];
  return (
    <div className="space-y-5">
      <h2 className="text-sm text-white font-medium">Your practice</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="City / region">
          <Input
            value={draft.cityRegion}
            onChange={(e) => update({ cityRegion: e.target.value })}
            className="bg-[#050505] border-clinical-slate/40 text-sm"
            placeholder="Bengaluru, KA"
          />
        </Field>
        <Field label="Practice setting">
          <select
            value={draft.practiceSetting}
            onChange={(e) =>
              update({ practiceSetting: e.target.value as PracticeSetting })
            }
            className="bg-[#050505] border border-clinical-slate/40 text-sm rounded-md h-9 px-3 text-white w-full"
          >
            <option value="">Choose…</option>
            {settings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Active client volume (optional)">
        <select
          value={draft.clientVolumeBucket}
          onChange={(e) =>
            update({
              clientVolumeBucket: e.target.value as DraftState["clientVolumeBucket"],
            })
          }
          className="bg-[#050505] border border-clinical-slate/40 text-sm rounded-md h-9 px-3 text-white w-full md:w-1/2"
        >
          <option value="">Prefer not to say</option>
          <option value="lt10">Fewer than 10</option>
          <option value="10_50">10–50</option>
          <option value="50_200">50–200</option>
          <option value="gt200">200+</option>
        </select>
      </Field>
      <Field label="Specializations">
        <Chips
          options={SPECIALIZATIONS}
          values={draft.specializations}
          onToggle={(v) => toggle("specializations", v)}
        />
      </Field>
      <Field label="Languages you consult in">
        <Chips
          options={LANGUAGES}
          values={draft.languages}
          onToggle={(v) => toggle("languages", v)}
        />
      </Field>
      <Field label="What interests you?">
        <Chips
          options={INTERESTS}
          values={draft.interests}
          onToggle={(v) => toggle("interests", v)}
        />
      </Field>
      <Field label="Anything you'd like us to know? (optional)">
        <Textarea
          value={draft.bio}
          onChange={(e) => update({ bio: e.target.value })}
          rows={4}
          className="bg-[#050505] border-clinical-slate/40 text-sm"
          placeholder="Approach, populations, recent wins…"
        />
      </Field>
    </div>
  );
}

function StepWhatsapp({
  draft,
  update,
}: {
  draft: DraftState;
  update: (p: Partial<DraftState>) => void;
}) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendOtp() {
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/rd-partners/whatsapp/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: draft.whatsappCountryCode,
          phone: draft.whatsappPhone,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { devCode?: string };
      setSent(true);
      if (j.devCode) setDevCode(j.devCode);
      toast.success("Code sent on WhatsApp", {
        description: j.devCode
          ? `Dev mode — your code is ${j.devCode}`
          : "Check WhatsApp for the 6-digit code.",
      });
      setResendIn(30);
      void trackRdPartnersEvent("rd_whatsapp_otp_sent", { step: 3 });
    } catch (err) {
      toast.error("Could not send code", {
        description: (err as Error).message,
      });
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    setVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/rd-partners/whatsapp/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: draft.whatsappCountryCode,
          phone: draft.whatsappPhone,
          code,
          sessionId: getRdPartnersSessionId(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "invalid code");
      }
      update({ whatsappVerified: true });
      toast.success("WhatsApp verified");
      void trackRdPartnersEvent("rd_whatsapp_verified", { step: 3 });
    } catch (err) {
      toast.error("Could not verify", {
        description: (err as Error).message,
      });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm text-white font-medium">WhatsApp updates</h2>
      <p className="text-xs text-clinical-zinc">
        Optional — but it's how the clinical team flags new bookings, lab
        uploads and case alerts. We never share your number.
      </p>
      <div className="grid grid-cols-[80px_1fr] gap-2">
        <Input
          value={draft.whatsappCountryCode}
          onChange={(e) => update({ whatsappCountryCode: e.target.value })}
          className="bg-[#050505] border-clinical-slate/40 text-sm"
        />
        <Input
          value={draft.whatsappPhone}
          onChange={(e) =>
            update({
              whatsappPhone: e.target.value.replace(/[^0-9]/g, ""),
              whatsappVerified: false,
            })
          }
          placeholder="WhatsApp number"
          className="bg-[#050505] border-clinical-slate/40 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={sendOtp}
          disabled={
            sending || draft.whatsappPhone.length < 6 || resendIn > 0
          }
          variant="outline"
          className="border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 text-xs h-8"
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : resendIn > 0 ? (
            `Resend in ${resendIn}s`
          ) : sent ? (
            "Resend code"
          ) : (
            "Send code on WhatsApp"
          )}
        </Button>
        {sent && (
          <div className="flex items-center gap-2">
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
              }
              placeholder="6-digit code"
              className="bg-[#050505] border-clinical-slate/40 text-sm w-32"
            />
            <Button
              onClick={verify}
              disabled={verifying || code.length < 4 || draft.whatsappVerified}
              className="bg-clinical-sage text-[#050505] hover:bg-clinical-sage/90 text-xs h-8"
            >
              {draft.whatsappVerified ? "Verified" : verifying ? "…" : "Verify"}
            </Button>
          </div>
        )}
      </div>
      {devCode && !draft.whatsappVerified && (
        <p className="text-[11px] text-clinical-zinc">
          Dev mode is on (no Twilio creds) — paste{" "}
          <span className="font-mono text-white">{devCode}</span> to continue.
        </p>
      )}

      <div className="rounded-md border border-clinical-slate/30 bg-[#050505] p-3 space-y-3">
        <label className="flex items-start gap-2 text-xs text-clinical-zinc cursor-pointer">
          <input
            type="checkbox"
            checked={draft.whatsappOptIn}
            onChange={(e) => update({ whatsappOptIn: e.target.checked })}
            className="mt-0.5 accent-clinical-gold"
          />
          <span>
            I agree to receive case alerts and operational updates from
            Tanmatra on WhatsApp. I can opt out any time by replying STOP.
          </span>
        </label>
        <Field label="How often?">
          <select
            value={draft.notifyPref}
            onChange={(e) =>
              update({
                notifyPref: e.target.value as DraftState["notifyPref"],
              })
            }
            className="bg-[#050505] border border-clinical-slate/40 text-sm rounded-md h-9 px-3 text-white w-full md:w-1/2"
          >
            <option value="critical">Critical only</option>
            <option value="weekly">Weekly digest</option>
            <option value="daily">Daily snapshot</option>
          </select>
        </Field>
      </div>

      <p className="text-[11px] text-clinical-zinc">
        Don't want to share WhatsApp? Skip — we'll just email you. You can
        add a number from the console later.
      </p>
    </div>
  );
}

function StepReview({ draft }: { draft: DraftState }) {
  const rows: [string, string][] = [
    ["Path", draft.path],
    ["Name", draft.fullName],
    ["Email", draft.email],
    ["Credentials", draft.credentials],
    ["Years", draft.yearsExperience],
    ["Specializations", draft.specializations.join(", ") || "—"],
    ["City / region", draft.cityRegion],
    ["Practice", draft.practiceSetting],
    ["Languages", draft.languages.join(", ") || "—"],
    ["Interests", draft.interests.join(", ") || "—"],
    [
      "WhatsApp",
      draft.whatsappPhone
        ? `${draft.whatsappCountryCode}${draft.whatsappPhone} ${
            draft.whatsappVerified ? "(verified)" : "(unverified)"
          }`
        : "Not provided",
    ],
    [
      "Updates",
      draft.whatsappOptIn && draft.whatsappVerified
        ? `WhatsApp · ${draft.notifyPref}`
        : "Email only",
    ],
  ];
  return (
    <div className="space-y-4">
      <h2 className="text-sm text-white font-medium">Review &amp; submit</h2>
      <p className="text-xs text-clinical-zinc">
        Please double-check — once submitted, edits go through ops.
      </p>
      <dl className="rounded-md border border-clinical-slate/30 divide-y divide-clinical-slate/30 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start gap-3 px-3 py-2">
            <dt className="w-32 text-clinical-zinc">{k}</dt>
            <dd className="flex-1 text-white break-words">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      {draft.bio && (
        <div className="rounded-md border border-clinical-slate/30 p-3 text-xs">
          <p className="text-clinical-zinc mb-1">About</p>
          <p className="text-white whitespace-pre-line">{draft.bio}</p>
        </div>
      )}
      <p className="text-[11px] text-clinical-zinc inline-flex items-start gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-clinical-sage mt-0.5" />
        We use these details only for partner review and never share them with
        third parties.
      </p>
    </div>
  );
}

function StepDone({
  id,
  notifyTo,
  email,
}: {
  id: number;
  notifyTo: string | null;
  email: string;
}) {
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);

  async function attachAccount() {
    setLinking(true);
    try {
      const res = await fetch(
        `/api/rd-partners/applications/${id}/create-account`,
        { method: "POST", credentials: "include" },
      );
      if (res.status === 401) {
        // Bounce to login then back here
        const next = encodeURIComponent(`/rd-partners/apply?linked=${id}`);
        window.location.href = `/login?next=${next}`;
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json().catch(() => ({}))) as {
        rdSlug?: string | null;
        provisioned?: boolean;
      };
      setLinked(true);
      void trackRdPartnersEvent("rd_account_created", {
        applicationId: id,
        extra: {
          rdSlug: j.rdSlug ?? null,
          provisioned: Boolean(j.provisioned),
        },
      });
      toast.success("Account attached");
    } catch (err) {
      toast.error("Could not attach", { description: (err as Error).message });
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="space-y-4 text-center">
      <CheckCircle2 className="w-10 h-10 text-clinical-sage mx-auto" />
      <h2 className="text-xl text-white font-serif">
        Application #{id} received
      </h2>
      <p className="text-xs text-clinical-zinc max-w-md mx-auto">
        Thanks — our partner ops team will review and reply by email to{" "}
        <span className="text-white">{email}</span> within 3 working days.
        {notifyTo && (
          <>
            {" "}
            (We've notified <span className="text-white">{notifyTo}</span>.)
          </>
        )}
      </p>
      <div className="rounded-lg border border-clinical-slate/30 bg-[#050505] p-4 text-left text-xs space-y-2">
        <p className="text-white text-sm font-medium">Want a head start?</p>
        <p className="text-clinical-zinc">
          Sign in (or create an account with the same email) to see your
          application status, and we'll attach this submission so you can
          step into the RD console the moment we approve.
        </p>
        <Button
          onClick={attachAccount}
          disabled={linking || linked}
          className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs h-8"
        >
          {linked ? "Account attached" : linking ? "Attaching…" : "Attach my account"}
        </Button>
      </div>
      <div className="flex items-center justify-center gap-4 text-xs">
        <a
          href="/downloads/tanmatra-rd-partner-brochure.pdf"
          target="_blank"
          rel="noopener noreferrer"
          download
          className="text-clinical-gold hover:text-clinical-gold/80 underline"
        >
          Download partner brochure (PDF)
        </a>
        <Link
          to="/rd-partners"
          className="text-clinical-zinc hover:text-white"
        >
          Back to partners overview
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-widest text-clinical-zinc">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Chips({
  options,
  values,
  onToggle,
}: {
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`text-xs px-3 h-7 rounded-full border transition-colors ${
              on
                ? "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/40"
                : "border-clinical-slate/30 text-clinical-zinc hover:border-clinical-gold/30 hover:text-white"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
