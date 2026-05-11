import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/apiBase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, LifeBuoy } from "lucide-react";

interface SupportTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderDisplayId: string;
  orderServerId: number | undefined;
}

export default function SupportTicketDialog({
  open,
  onOpenChange,
  orderDisplayId,
  orderServerId,
}: SupportTicketDialogProps) {
  const [subject, setSubject] = useState(`Help with order ${orderDisplayId}`);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setSubject(`Help with order ${orderDisplayId}`);
      setBody("");
      setError(null);
      setDone(false);
      setSubmitting(false);
    }
  }, [open, orderDisplayId]);

  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  const canSubmit = trimmedSubject.length > 0 && trimmedBody.length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const base = API_BASE;
      const payload: {
        subject: string;
        body: string;
        orderId?: number;
      } = { subject: trimmedSubject, body: trimmedBody };
      if (orderServerId && orderServerId > 0) payload.orderId = orderServerId;
      const r = await fetch(`${base}/support-tickets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        let msg = `Could not send (${r.status})`;
        try {
          const data = (await r.json()) as { error?: string };
          if (data?.error) {
            msg =
              r.status === 401
                ? "Please sign in to contact our care team."
                : data.error;
          }
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-clinical-sage" />
                Care team is on it
              </DialogTitle>
              <DialogDescription>
                Thanks — we've logged your request for order{" "}
                <span className="font-mono text-xs">{orderDisplayId}</span>. Our
                care team will reply by email shortly.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-clinical-gold" />
                Need help with this order?
              </DialogTitle>
              <DialogDescription>
                Tell us what's going on with order{" "}
                <span className="font-mono text-xs">{orderDisplayId}</span> and
                our care team will get back to you.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="ticket-subject" className="text-xs">
                  Subject
                </Label>
                <Input
                  id="ticket-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ticket-body" className="text-xs">
                  How can we help?
                </Label>
                <Textarea
                  id="ticket-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  maxLength={8000}
                  placeholder="Describe the issue — missing item, late delivery, allergen concern, etc."
                  disabled={submitting}
                />
              </div>
              {error && (
                <p className="text-xs text-red-400" role="alert">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={!canSubmit}
                className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
              >
                {submitting ? "Sending…" : "Send to care team"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
