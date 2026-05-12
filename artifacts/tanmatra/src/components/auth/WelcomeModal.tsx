import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkle } from "@phosphor-icons/react";

import { API_BASE } from "@/lib/apiBase";

interface WelcomeModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Post-OTP first-sign-in capture. Asks for first name (required) + optional
 * email. Skippable so we never block a returning customer's order intent;
 * the same modal can be retriggered later from the Account page.
 *
 * Persists via PATCH /auth/profile-info — the server returns the updated
 * AuthUser but we don't propagate it here because the only place reading it
 * client-side is the Account page, which refetches /auth/user on its own.
 */
export function WelcomeModal({
  open,
  onComplete,
  onSkip,
}: WelcomeModalProps) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmedName = firstName.trim();
    if (!trimmedName) {
      toast.error("Please tell us your first name");
      return;
    }
    setSubmitting(true);
    try {
      const trimmedEmail = email.trim();
      const res = await fetch(`${API_BASE}/auth/profile-info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firstName: trimmedName,
          ...(trimmedEmail ? { email: trimmedEmail } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(
          res.status === 409
            ? "That email is already used by another account"
            : data.error ?? "Could not save your details",
        );
        return;
      }
      toast.success(`Welcome, ${trimmedName}!`);
      onComplete();
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      // Block dismiss-by-overlay-click while we're posting; otherwise allow
      // it (treated as "skip"). The X button is also handled this way
      // because radix calls onOpenChange(false) for both.
      onOpenChange={(o) => {
        if (!o && !submitting) onSkip();
      }}
    >
      <DialogContent className="bg-clinical-surface border-clinical-slate/30 sm:max-w-sm">
        <DialogHeader className="space-y-2">
          <div className="w-10 h-10 rounded-xl bg-clinical-gold/15 flex items-center justify-center border border-clinical-gold/25">
            <Sparkle className="w-5 h-5 text-clinical-gold" weight="bold" />
          </div>
          <DialogTitle className="text-white">
            What should we call you?
          </DialogTitle>
          <DialogDescription className="text-clinical-zinc text-xs">
            Helps your rider greet you correctly and personalises your menu.
            Email is optional — only used for receipts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="welcome-fn" className="text-xs text-clinical-zinc">
              First name
            </Label>
            <Input
              id="welcome-fn"
              autoFocus
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Priya"
              className="bg-clinical-bg border-clinical-slate/30 text-white"
              maxLength={64}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="welcome-email"
              className="text-xs text-clinical-zinc"
            >
              Email <span className="text-clinical-zinc/60">(optional)</span>
            </Label>
            <Input
              id="welcome-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="priya@example.com"
              className="bg-clinical-bg border-clinical-slate/30 text-white"
              maxLength={254}
              autoComplete="email"
              inputMode="email"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={onSkip}
            disabled={submitting}
            className="text-clinical-zinc hover:text-white"
          >
            Skip for now
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !firstName.trim()}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold"
          >
            {submitting ? "Saving…" : "Save & continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
