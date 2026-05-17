import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldCheck, CreditCard, ArrowLeft, IndianRupee } from "lucide-react";
import { rdAdvisoryApi } from "@/lib/rdAdvisoryApi";
import {
  APPOINTMENT_KIND_META,
  formatRupees,
  type AppointmentKind,
} from "@/lib/rdBookingData";

interface BookingState {
  rdSlug: string;
  kind: AppointmentKind;
  startAt: string;
  endAt: string;
  pricePaise: number;
  userQuestion?: string;
  rdName?: string;
}

function fmtSlot(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CheckoutAppointment() {
  const navigate = useNavigate();
  const location = useLocation();
  const booking = location.state as BookingState | null;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  if (!booking || !booking.rdSlug) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center text-clinical-zinc text-sm">
        <p>No booking in progress.</p>
        <Button
          onClick={() => navigate("/rd")}
          className="mt-4 bg-clinical-gold text-[#050505] text-xs h-9"
        >
          Back to RDs
        </Button>
      </div>
    );
  }

  const meta = APPOINTMENT_KIND_META[booking.kind];

  async function pay() {
    if (!booking) return;
    setLastError(null);
    setProcessing(true);
    // Mock payment processing UI delay — same pattern as the meal
    // checkout flow. The actual payment is settled server-side via the
    // HMAC-signed internal webhook when /rd/appointments resolves.
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const { appointment } = await rdAdvisoryApi.book({
        rdSlug: booking.rdSlug,
        kind: booking.kind,
        startAt: booking.startAt,
        endAt: booking.endAt,
        userQuestion: booking.userQuestion,
      });
      setConfirmOpen(false);
      if (appointment.paymentStatus === "paid") {
        toast.success("Payment received", {
          description: `${meta.label} confirmed with ${booking.rdName ?? "your RD"}.`,
        });
      } else if (appointment.paymentStatus === "pending") {
        toast.error("Booking held — payment not configured", {
          description:
            "Server's payment processor is not set up. Booking saved as pending.",
        });
      } else {
        toast.success("Booking confirmed");
      }
      navigate("/appointments");
    } catch (e) {
      const msg = String(e);
      if (msg.includes("409")) {
        toast.error("Slot just taken", {
          description: "Please pick another time.",
        });
        navigate(`/rd/${booking.rdSlug}`);
      } else if (msg.includes("401")) {
        toast.error("Sign in to confirm", {
          description: "Please sign in to complete your booking.",
          action: {
            label: "Sign in",
            onClick: () =>
              navigate(
                `/login?next=${encodeURIComponent(
                  window.location.pathname + window.location.search,
                )}`,
              ),
          },
        });
        setLastError("Sign-in required to complete this booking.");
      } else {
        toast.error("Could not book", { description: msg });
        setLastError(msg);
      }
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <button
        onClick={() => navigate(-1)}
        className="text-xs text-clinical-zinc inline-flex items-center gap-1 hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      <header>
        <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px] mb-2">
          Confirm & pay
        </Badge>
        <h1 className="font-serif text-3xl text-white">Review your booking</h1>
        <p className="text-xs text-clinical-zinc mt-1">
          Reusing the same checkout pattern as your meal orders. Your RD will
          confirm and share a join link in your appointments.
        </p>
      </header>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
              Session
            </p>
            <p className="text-sm text-white">{meta.label}</p>
            <p className="text-xs text-clinical-zinc">{meta.description}</p>
          </div>
          <Separator className="bg-clinical-surface-elevated" />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
              With
            </p>
            <p className="text-sm text-white">
              {booking.rdName ?? booking.rdSlug}
            </p>
          </div>
          <Separator className="bg-clinical-surface-elevated" />
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
              When
            </p>
            <p className="text-sm text-white">{fmtSlot(booking.startAt)}</p>
          </div>
          {booking.userQuestion ? (
            <>
              <Separator className="bg-clinical-surface-elevated" />
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
                  Note for RD
                </p>
                <p className="text-xs text-white whitespace-pre-line">
                  {booking.userQuestion}
                </p>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-clinical-zinc">Session fee</span>
            <span className="text-sm text-white inline-flex items-center gap-0.5">
              <IndianRupee className="w-3 h-3" />
              {formatRupees(booking.pricePaise).replace("₹", "")}
            </span>
          </div>
          <Separator className="bg-clinical-surface-elevated" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">
              Total to pay
            </span>
            <span className="text-base text-clinical-gold font-semibold inline-flex items-center gap-0.5">
              <IndianRupee className="w-3.5 h-3.5" />
              {formatRupees(booking.pricePaise).replace("₹", "")}
            </span>
          </div>
          <p className="text-[10px] text-clinical-zinc inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            Payment settled server-side via signed webhook.
          </p>
        </CardContent>
      </Card>

      <Button
        onClick={() => setConfirmOpen(true)}
        className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 h-11 text-sm"
      >
        <CreditCard className="w-4 h-4 mr-2" />
        Confirm and pay {formatRupees(booking.pricePaise)}
      </Button>

      {lastError && (
        <Card className="bg-red-500/5 border-red-500/30">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs text-red-300">
              <span className="font-semibold">Booking didn't go through:</span>{" "}
              {lastError}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setLastError(null);
                  setConfirmOpen(true);
                }}
                size="sm"
                className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs h-8"
              >
                Retry payment
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-clinical-border text-clinical-zinc hover:text-white text-xs h-8"
              >
                <a href="mailto:care@tanmatra.health?subject=RD%20appointment%20booking%20issue">
                  Contact support
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-clinical-surface border-clinical-border">
          <DialogHeader>
            <DialogTitle className="text-white">Confirm payment</DialogTitle>
            <DialogDescription className="text-clinical-zinc text-xs">
              You're paying {formatRupees(booking.pricePaise)} for{" "}
              {meta.label} with {booking.rdName ?? "your RD"} on{" "}
              {fmtSlot(booking.startAt)}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={processing}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={pay}
              disabled={processing}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs"
            >
              {processing ? "Processing…" : "Pay now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
