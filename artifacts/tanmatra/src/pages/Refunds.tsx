import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import {
  Clock,
  CalendarX,
  Repeat,
  ShieldAlert,
  Mail,
  Phone,
  MessageCircle,
} from "lucide-react";

/**
 * Refund & cancellation policy.
 *
 * Required by the Consumer Protection (E-Commerce) Rules 2020 §5(3) to
 * be accessible *before* purchase, and by Razorpay's merchant-onboarding
 * compliance terms. Linked from the Footer "Legal" column on every page.
 *
 * Policy windows below are reasonable defaults — review with ops/legal
 * before finalising. The Grievance Officer block is mandatory under
 * the Digital Personal Data Protection Act 2023 §32.
 */
export default function Refunds() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8 text-sm text-clinical-zinc leading-relaxed">
      <header className="space-y-3 border-b border-clinical-border pb-6">
        <h1 className="text-clinical-h1 text-white">Refund & Cancellation</h1>
        <p className="text-xs text-clinical-zinc-muted">
          Last updated: {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </p>
        <p>
          We hold ourselves to a clinical-grade standard. If a meal arrives in a
          condition that doesn&apos;t meet that standard — or if anything has
          gone wrong with your order — write to us within the windows below
          and we will refund or replace promptly.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-clinical-h3 text-white flex items-center gap-2">
          <Clock className="w-4 h-4 text-clinical-gold" /> One-off orders
        </h2>
        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-5 space-y-3">
            <div>
              <p className="text-white font-medium">Cancellation</p>
              <p className="text-xs">
                Cancel free of charge until your order moves to{" "}
                <span className="text-clinical-gold">Preparing</span>. Once the
                kitchen has started, the order cannot be cancelled — it will be
                delivered.
              </p>
            </div>
            <div>
              <p className="text-white font-medium">Refunds for issues</p>
              <ul className="text-xs space-y-1 list-disc pl-5">
                <li>Wrong item, missing item, or damaged packaging — full refund or free replacement.</li>
                <li>Quality concern (taste, temperature, hygiene) — full refund on the affected item.</li>
                <li>Late delivery beyond the promised window — partial credit applied automatically.</li>
              </ul>
            </div>
            <div>
              <p className="text-white font-medium">How to raise an issue</p>
              <p className="text-xs">
                Use the <Link to="/track" className="text-clinical-gold hover:underline">Track</Link> page within 4 hours of delivery, or
                WhatsApp us at <a href="https://wa.me/918047019200" className="text-clinical-gold hover:underline" target="_blank" rel="noopener noreferrer">+91 80 4701 9200</a>. Refunds are processed
                in 3-5 business days to the original payment method.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-clinical-h3 text-white flex items-center gap-2">
          <Repeat className="w-4 h-4 text-clinical-gold" /> Subscriptions & meal plans
        </h2>
        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-5 space-y-3 text-xs">
            <p>
              <span className="text-white font-medium">Skip a delivery</span> — free up
              to 24 hours before the scheduled slot. The skipped value is added back
              to your wallet automatically.
            </p>
            <p>
              <span className="text-white font-medium">Pause your plan</span> — pause
              for up to 8 weeks via the <Link to="/subscriptions" className="text-clinical-gold hover:underline">My Plans</Link> page. Your delivery
              window is held; resume any time.
            </p>
            <p>
              <span className="text-white font-medium">Cancel a subscription</span> —
              cancel any time from the same page. Upcoming deliveries are removed.
              Prepaid balance remains as wallet credit, usable on one-off orders.
            </p>
            <p>
              <span className="text-white font-medium">Refunds against unused weeks</span>
              — if a plan is cancelled mid-cycle, we refund unused full weeks
              (deliveries not yet despatched) within 7 business days, less any
              welcome-offer credit applied at signup.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-clinical-h3 text-white flex items-center gap-2">
          <CalendarX className="w-4 h-4 text-clinical-gold" /> RD consults & appointments
        </h2>
        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-5 space-y-2 text-xs">
            <p>
              <span className="text-white font-medium">Free cancellation up to 12 hours</span>
              before your scheduled consult. Full refund processed in 3-5 business days.
            </p>
            <p>
              Within 12 hours, the consult fee becomes non-refundable but you may
              reschedule once at no charge from <Link to="/appointments" className="text-clinical-gold hover:underline">My Care</Link>.
            </p>
            <p>
              No-shows are non-refundable. The RD will dial in at the scheduled
              time and wait 10 minutes before releasing the slot.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" id="grievance">
        <h2 className="text-clinical-h3 text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-clinical-gold" /> Grievance Officer
        </h2>
        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-5 space-y-3 text-xs">
            <p>
              In compliance with the Digital Personal Data Protection Act 2023 §32
              and the Consumer Protection (E-Commerce) Rules 2020, complaints
              that cannot be resolved through normal customer support can be
              escalated to our Grievance Officer:
            </p>
            <div className="rounded-md border border-clinical-border bg-clinical-surface-elevated/50 p-3 space-y-1.5">
              <p className="text-white font-medium">Tanmatra Health Technologies Pvt. Ltd.</p>
              <p>Grievance Officer · Care Operations</p>
              <p className="flex items-center gap-2"><Mail className="w-3 h-3 text-clinical-gold" /> <a href="mailto:grievance@tanmatra.food" className="hover:text-white">grievance@tanmatra.food</a></p>
              <p className="flex items-center gap-2"><Phone className="w-3 h-3 text-clinical-gold" /> <a href="tel:+918047019200" className="hover:text-white">+91 80 4701 9200</a> (Mon-Sat 09:00-19:00 IST)</p>
              <p className="flex items-center gap-2"><MessageCircle className="w-3 h-3 text-clinical-sage" /> <a href="https://wa.me/918047019200" target="_blank" rel="noopener noreferrer" className="hover:text-white">WhatsApp +91 80 4701 9200</a></p>
            </div>
            <p className="text-clinical-zinc-muted">
              We acknowledge complaints within 24 hours and aim to resolve them
              within 7 business days. Issues unresolved after 30 days may be
              escalated to the National Consumer Helpline (1915) or the
              consumer commission having jurisdiction.
            </p>
          </CardContent>
        </Card>
      </section>

      <p className="text-[11px] text-clinical-zinc-muted pt-4 border-t border-clinical-border">
        This policy is provided for transparency and may be updated. Material
        changes will be notified by email + in-app banner. The most recent
        version always lives at this URL. See also our{" "}
        <Link to="/privacy" className="text-clinical-gold hover:underline">Privacy Policy</Link>{" "}
        and <Link to="/terms" className="text-clinical-gold hover:underline">Terms of Service</Link>.
      </p>
    </div>
  );
}
