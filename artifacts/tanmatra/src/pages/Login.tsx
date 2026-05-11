import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Flask,
  ShieldCheck,
  Pulse,
  Phone,
  ChatCircleText,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { API_BASE as API_BASE } from "@/lib/apiBase";

type Step = "phone" | "code";

interface SendOtpResponse {
  ok: boolean;
  devCode?: string;
  error?: string;
}

interface VerifyOtpResponse {
  ok: boolean;
  user: { id: string } | null;
  error?: string;
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get("next") ?? "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

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
    if (phone.replace(/\D/g, "").length < 6) {
      toast.error("Enter a valid phone number");
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
      const res = await fetch(`${API_BASE}/auth/phone/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ countryCode, phone, code }),
      });
      const data = (await res.json().catch(() => ({}))) as VerifyOtpResponse & {
        error?: string;
      };
      if (!res.ok || !data.ok || !data.user) {
        toast.error(data.error ?? "Incorrect code");
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
      <Card className="w-full max-w-sm bg-clinical-surface border-clinical-slate/20">
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
                <div className="flex gap-2">
                  <Input
                    id="cc"
                    aria-label="Country code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="w-20 bg-clinical-bg border-clinical-slate/30 text-white text-clinical-data"
                    maxLength={5}
                  />
                  <Input
                    id="phone"
                    autoFocus
                    inputMode="tel"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 bg-clinical-bg border-clinical-slate/30 text-white text-clinical-data"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void sendOtp();
                    }}
                  />
                </div>
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
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="bg-clinical-bg border-clinical-slate/30 text-white text-clinical-data tracking-[0.4em] text-center text-lg"
                  maxLength={10}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void verifyOtp();
                  }}
                />
                {devCode && (
                  <p className="text-[10px] text-clinical-sage flex items-center gap-1.5">
                    <ChatCircleText className="w-3 h-3" weight="bold" />
                    Dev mode — your code is{" "}
                    <span className="font-mono font-semibold">{devCode}</span>
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("phone");
                    setCode("");
                    setDevCode(null);
                  }}
                  className="border-clinical-slate/30 text-clinical-zinc hover:text-white"
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

          {import.meta.env.DEV && (
            <>
              <Separator className="bg-clinical-slate/20 my-2" />
              <Button
                variant="outline"
                onClick={enterAdminMode}
                className="w-full border-clinical-slate/30 text-clinical-zinc hover:text-clinical-gold hover:border-clinical-gold/40 gap-2 text-xs"
              >
                <Pulse className="w-3.5 h-3.5" />
                Continue as Operations (dev)
              </Button>
              <p className="text-[10px] text-clinical-zinc text-center">
                Local dev shortcut for /admin/ops dashboards
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
