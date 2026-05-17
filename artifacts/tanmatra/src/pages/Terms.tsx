import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";

export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-clinical-zinc">
          Effective May 2026
        </p>
        <h1 className="text-3xl font-semibold text-white">Terms of Service</h1>
      </header>
      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-6 space-y-4 text-sm text-clinical-zinc leading-relaxed">
          <p>
            Welcome to Tanmatra. By placing an order, signing in, or using any
            part of our service you agree to these terms.
          </p>
          <h2 className="text-base font-semibold text-white pt-2">
            1. Your account
          </h2>
          <p>
            You are responsible for keeping your phone number, OTP, and account
            details secure. Tanmatra may suspend accounts used in violation of
            these terms or applicable law.
          </p>
          <h2 className="text-base font-semibold text-white pt-2">
            2. Orders, payments, refunds
          </h2>
          <p>
            All prices are inclusive of applicable taxes. Order cancellation
            and refund policies are explained at checkout. Disputes should be
            raised within 24 hours of delivery via the in-app support channel.
          </p>
          <h2 className="text-base font-semibold text-white pt-2">
            3. Content & conduct
          </h2>
          <p>
            Reviews, photos, and other content you submit must be your own and
            comply with applicable law. Tanmatra may remove content that
            violates these terms.
          </p>
          <h2 className="text-base font-semibold text-white pt-2">
            4. Limitation of liability
          </h2>
          <p>
            Subject to applicable consumer-protection law, Tanmatra's
            aggregate liability for any claim is limited to the value of the
            order giving rise to the claim.
          </p>
          <h2 className="text-base font-semibold text-white pt-2">
            5. Changes
          </h2>
          <p>
            We may update these terms; material changes will be notified at
            sign-in. Continued use after a change constitutes acceptance.
          </p>
          <p className="pt-4 text-xs">
            Questions? See our{" "}
            <Link
              to="/privacy"
              className="text-clinical-gold hover:underline underline-offset-2"
            >
              Privacy Policy
            </Link>{" "}
            or contact support from your{" "}
            <Link
              to="/account"
              className="text-clinical-gold hover:underline underline-offset-2"
            >
              account
            </Link>{" "}
            page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
