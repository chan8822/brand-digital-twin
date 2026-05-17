import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CANCEL_REASONS } from "@/lib/clinicalLifecycle";
import { AlertTriangle, ShieldAlert } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderDisplayId: string;
  patientName?: string;
  onConfirm: (reasonLabel: string) => Promise<void> | void;
}

export default function StatCancelDialog({
  open,
  onOpenChange,
  orderDisplayId,
  patientName,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      setReason(CANCEL_REASONS[0].value);
      setSubmitting(false);
      // Move focus to the confirm button so Enter triggers cancel immediately.
      requestAnimationFrame(() => confirmRef.current?.focus());
    }
  }, [open]);

  async function confirm() {
    if (submitting) return;
    const meta = CANCEL_REASONS.find((r) => r.value === reason) ?? CANCEL_REASONS[0];
    setSubmitting(true);
    try {
      await onConfirm(meta.label);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md bg-clinical-surface border-red-500/40"
        aria-describedby="stat-cancel-desc"
        onKeyDown={(e) => {
          if (e.key === "Enter" && document.activeElement === confirmRef.current) {
            e.preventDefault();
            void confirm();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400" aria-hidden />
            STAT cancel order
          </DialogTitle>
          <DialogDescription id="stat-cancel-desc" className="text-clinical-zinc">
            <span className="block">
              Cancel order <span className="font-mono text-clinical-gold">{orderDisplayId}</span>
              {patientName ? (
                <>
                  {" "}for patient <span className="text-white font-medium">{patientName}</span>
                </>
              ) : null}
              .
            </span>
            <span className="block mt-1 text-[11px] text-orange-300 inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
              This is irreversible — kitchen and rider will be notified immediately.
            </span>
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2 py-2">
          <Label className="text-xs text-white">Reason</Label>
          <div className="grid grid-cols-1 gap-1.5">
            {CANCEL_REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-colors ${
                  reason === r.value
                    ? "border-red-500/60 bg-red-500/10 text-white"
                    : "border-clinical-border text-clinical-zinc hover:border-red-500/40"
                }`}
              >
                <input
                  type="radio"
                  name="stat-cancel-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="accent-red-500"
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="border-clinical-border text-clinical-zinc"
          >
            Keep order
          </Button>
          <Button
            ref={confirmRef}
            onClick={confirm}
            disabled={submitting}
            className="bg-red-500 text-white hover:bg-red-600 font-semibold"
          >
            {submitting ? "Cancelling…" : "Confirm STAT cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
