import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Flask,
  ShieldCheck,
  Pulse,
  Phone,
  ChatCircleText,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { API_BASE as API_BASE } from "@/lib/apiBase";
import { captureAttribution, getAttribution } from "@/lib/attribution";
import { WelcomeModal } from "@/components/auth/WelcomeModal";

type Step = "phone" | "code";

// Country-aware minimum phone-number length. Per-country mapping so a
// user with a valid IN number can't send their OTP after typing 6
// digits (which used to pass the old `length < 6` check, then waste
// one of their 5-per-hour OTP attempts on a server-side reject).
// Anything not mapped falls through to a permissive default — the
// server still normalises and rejects garbage.
const MIN_PHONE_LEN_BY_CC: Record<string, number> = {
  "+91": 10,
  "+1": 10,
  "+44": 10,
  "+971": 9,
};
const DEFAULT_MIN_PHONE_LEN = 7;
function minPhoneLen(cc: string): number {
  return MIN_PHONE_LEN_BY_CC[cc] ?? DEFAULT_MIN_PHONE_LEN;
}

// Cooldown (seconds) before "Resend code" re-enables. Matches the
// server's per-phone OTP throttle (5/hour) loosely — 30s is enough to
// prevent accidental double-tap burns without making real users wait.
const RESEND_COOLDOWN_SECS = 30;

// Bumped whenever the Terms / Privacy doc materially changes. Persisted
// per-user as `tos_accepted_version` so we can re-prompt on update.
const TOS_VERSION = "2026-05";

interface SendOtpResponse {
  ok: boolean;
  devCode?: string;
  error?: string;
}

interface VerifyOtpResponse {
  ok: boolean;
  user: { id: string; firstName: string | null } | null;
  error?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  // Reveal the admin shortcut in any environment when the URL carries
  // `?unlock=<UNLOCK_PHRASE>`. Keeps the button hidden from regular users
  // (it's gated by `import.meta.env.DEV` in dev too as a fallback) without
  // requiring DevTools. Rotate UNLOCK_PHRASE if it leaks.
  const UNLOCK_PHRASE = "tanmatra-ops-2026";
  const adminShortcutVisible =
    import.meta.env.DEV || params.get("unlock") === UNLOCK_PHRASE;

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  // SMS marketing consent. Default false — DPDP Act 2023 requires explicit
  // opt-in (no pre-checked boxes for marketing communication).
  const [smsConsent, setSmsConsent] = useState(false);
  // WhatsApp is the de-facto transactional + marketing channel for
  // Indian D2C. Captured as a separate granular consent here per
  // DPDP §6 (granular, purpose-specific). Sent alongside the SMS
  // consent on verify-otp; backend may ignore until a Meta WABA
  // template is wired — UI is forward-compatible.
  const [whatsAppConsent, setWhatsAppConsent] = useState(true);
  // Shown after a successful OTP verify when the user has no firstName yet
  // (i.e. brand-new account). Skippable. While open, we DON'T navigate away
  // — that happens in onComplete/onSkip so the modal closes cleanly first.
  const [showWelcome, setShowWelcome] = useState(false);

  // Capture first-touch attribution from the URL on mount. Idempotent: if
  // we've already captured a record from a previous visit, this is a no-op.
  // Done here (rather than App.tsx) because the login page is the most
  // common landing page for ad clicks (`/login?utm_source=…`); root-level
  // capture is a Phase-3 nice-to-have if we want to attribute browse-then-
  // signup users.
  useEffect(() => {
    captureAttribution();
  }, []);
  // Seconds until "Resend code" re-enables. Counts down via the
  // useEffect below. Starts at RESEND_COOLDOWN_SECS after each successful
  // send and on initial OTP-step entry.
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(
      () => setResendIn((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [resendIn]);

  const enterAdminMode = () => {
    try {
      window.localStorage.setItem("tanmatra:admin:v1", "1");
      toast.success("Admin mode enabled (dev only)");
      navigate(next.startsWith("/") ? next : "/admin/ops", { replace: true });
    } catch {
      toast.error("Could not enable admin mode");
    }
  };

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < minPhoneLen(countryCode)) {
      toast.error(`Enter a valid ${countryCode} phone number`);
      return;
    }
    setIsSending(true);
    try {
      const res = await fetch(`${API_BASE}/auth/phone/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ countryCode, phone }),
      });
      const data = (await res.json().catch(() => ({}))) as SendOtpResponse & {
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Could not send code");
        return;
      }
      setDevCode(data.devCode ?? null);
      setStep("code");
      setResendIn(RESEND_COOLDOWN_SECS);
      toast.success(`Code sent to ${countryCode} ${phone}`);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setIsSending(false);
    }
  };

  const verifyOtp = async () => {
    if (code.replace(/\D/g, "").length < 4) {
      toast.error("Enter the verification code");
      return;
    }
    setIsVerifying(true);
    try {
      // Send the persisted first-touch attribution + the user's explicit
      // consent choices. The server stamps attribution only on first user
      // creation; consent flags update on every sign-in.
      const attr = getAttribution();
      const res = await fetch(`${API_BASE}/auth/phone/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          countryCode,
          phone,
          code,
          attribution: {
            ...(attr ?? {}),
            // Continuing past the login form *is* the DPDP consent moment
            // — we display the Terms/Privacy footer right above the Send
            // Code button, so by the time they verify they've had the
            // notice in front of them.
            dpdpConsent: true,
            tosVersion: TOS_VERSION,
            // Explicit consents. Backend treats unknown fields as
            // no-ops, so adding a new consent here is safe pre-
            // schema-migration.
            marketingSmsConsent: smsConsent,
            marketingWhatsAppConsent: whatsAppConsent,
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as VerifyOtpResponse & {
        error?: string;
      };
      if (!res.ok || !data.ok || !data.user) {
        toast.error(data.error ?? "Incorrect code");
        return;
      }
      // Brand-new account → ask for name+email before navigating away.
      // Returning user with firstName already set → straight to next.
      if (data.user.firstName === null) {
        setShowWelcome(true);
        return;
      }
      toast.success("Signed in");
      navigate(next, { replace: true });
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm bg-clinical-surface border-clinical-border">
        <CardHeader className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-clinical-gold/15 flex items-center justify-center border border-clinical-gold/25">
            <Flask className="w-6 h-6 text-clinical-gold" weight="bold" />
          </div>
          <CardTitle className="text-white">Welcome to Tanmatra</CardTitle>
          <p className="text-xs text-clinical-zinc">
            {step === "phone"
              ? "Sign in with your phone number — we'll text you a code."
              : `Enter the 6-digit code we sent to ${countryCode} ${phone}.`}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "phone" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs text-clinical-zinc">
                  Phone number
                </Label>
                {/* Country code as a Select prevents users from deleting
                    the `+91` prefix entirely (a known OTP-send failure
                    mode flagged in the adoption audit P2 finding).
                    India default + a few diaspora markets cover the
                    target audience without bloating the list. */}
                <div className="flex gap-2">
                  <select
                    id="cc"
                    aria-label="Country code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-24 h-10 bg-clinical-bg border border-clinical-border rounded-md text-white text-sm px-2 focus:outline-none focus:ring-2 focus:ring-clinical-gold/40"
                  >
                    <option value="+91">🇮🇳 +91</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                    <option value="+61">🇦🇺 +61</option>
                    <option value="+971">🇦🇪 +971</option>
                    <option value="+65">🇸🇬 +65</option>
                  </select>
                  <Input
                    id="phone"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 bg-clinical-bg border-clinical-border text-white text-clinical-data"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void sendOtp();
                    }}
                  />
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="wa-consent"
                  checked={whatsAppConsent}
                  onCheckedChange={(c) => setWhatsAppConsent(c === true)}
                  className="mt-0.5 border-clinical-border data-[state=checked]:bg-clinical-sage data-[state=checked]:border-clinical-sage"
                />
                <Label
                  htmlFor="wa-consent"
                  className="text-[11px] text-clinical-zinc font-normal leading-snug cursor-pointer"
                >
                  Send me order confirmations and delivery updates on
                  WhatsApp. Reply STOP any time.
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="sms-consent"
                  checked={smsConsent}
                  onCheckedChange={(c) => setSmsConsent(c === true)}
                  className="mt-0.5 border-clinical-border data-[state=checked]:bg-clinical-gold data-[state=checked]:border-clinical-gold"
                />
                <Label
                  htmlFor="sms-consent"
                  className="text-[11px] text-clinical-zinc font-normal leading-snug cursor-pointer"
                >
                  Send me menu updates and offers by SMS. Unsubscribe by
                  replying STOP.
                </Label>
              </div>
              <Button
                onClick={sendOtp}
                disabled={isSending}
                className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 shadow-clinical gap-2"
                size="lg"
              >
                <Phone className="w-4 h-4" weight="bold" aria-hidden />
                {isSending ? "Sending…" : "Send code"}
              </Button>
              <p className="text-[10px] text-clinical-zinc text-center leading-snug">
                By continuing you agree to our{" "}
                <Link
                  to="/terms"
                  className="text-clinical-gold hover:underline underline-offset-2"
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  className="text-clinical-gold hover:underline underline-offset-2"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="code" className="text-xs text-clinical-zinc">
                  Verification code
                </Label>
                <Input
                  id="code"
                  autoFocus
                  inputMode="numeric"
                  // Triggers iOS / Android SMS-OTP auto-fill from
                  // Twilio's verified-sender messages. Without this
                  // attribute, mobile keyboards just show numbers and
                  // the user has to copy-paste from the SMS app.
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  // Strip non-digits as the user types so paste-from-SMS
                  // text like "Your code is 123456" still works.
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="bg-clinical-bg border-clinical-border text-white text-clinical-data tracking-[0.4em] text-center text-lg"
                  maxLength={6}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void verifyOtp();
                  }}
                />
                {/* Dev-only OTP echo. Gated by Vite's compile-time DEV
                    flag so a misconfigured prod env that returns a
                    devCode in the API response can't accidentally
                    reveal the code on a shared screen. */}
                {import.meta.env.DEV && devCode && (
                  <p className="text-[10px] text-clinical-sage flex items-center gap-1.5">
                    <ChatCircleText className="w-3 h-3" weight="bold" />
                    Dev mode — your code is{" "}
                    <span className="font-mono font-semibold">{devCode}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-clinical-zinc-muted">
                  Didn't get the code?
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={resendIn > 0 || isSending}
                  onClick={() => void sendOtp()}
                  className="h-auto px-2 py-1 text-clinical-gold hover:text-clinical-gold/90 disabled:text-clinical-zinc-muted disabled:opacity-100"
                >
                  {resendIn > 0
                    ? `Resend in ${resendIn}s`
                    : isSending
                      ? "Sending…"
                      : "Resend code"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("phone");
                    setCode("");
                    setDevCode(null);
                    // Reset cooldown so the user isn't locked out of
                    // requesting an OTP for the *new* number for the
                    // remainder of the previous number's window.
                    setResendIn(0);
                  }}
                  className="border-clinical-border text-clinical-zinc hover:text-white"
                >
                  Change number
                </Button>
                <Button
                  onClick={verifyOtp}
                  disabled={isVerifying}
                  className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold"
                >
                  {isVerifying ? "Verifying…" : "Verify"}
                </Button>
              </div>
            </>
          )}

          <p className="text-[10px] text-clinical-zinc flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-clinical-sage" weight="bold" />
            Secured by Twilio Verify
          </p>

          {adminShortcutVisible && (
            <>
              <Separator className="bg-clinical-surface-elevated my-2" />
              <Button
                variant="outline"
                onClick={enterAdminMode}
                className="w-full border-clinical-border text-clinical-zinc hover:text-clinical-gold hover:border-clinical-gold/40 gap-2 text-xs"
              >
                <Pulse className="w-3.5 h-3.5" />
                Continue as Operations
              </Button>
              <p className="text-[10px] text-clinical-zinc text-center">
                Internal shortcut to /admin
              </p>
            </>
          )}
        </CardContent>
      </Card>
      <WelcomeModal
        open={showWelcome}
        onComplete={() => {
          setShowWelcome(false);
          toast.success("Signed in");
          navigate(next, { replace: true });
        }}
        onSkip={() => {
          setShowWelcome(false);
          toast.success("Signed in");
          navigate(next, { replace: true });
        }}
      />
    </div>
  );
}
