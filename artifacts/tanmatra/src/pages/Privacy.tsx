import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";

export default function Privacy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-clinical-zinc">
          Effective May 2026
        </p>
        <h1 className="text-3xl font-semibold text-white">Privacy Policy</h1>
        <p className="text-xs text-clinical-zinc">
          Compliant with the Digital Personal Data Protection Act, 2023 (India).
        </p>
      </header>
      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-6 space-y-4 text-sm text-clinical-zinc leading-relaxed">
          <h2 className="text-base font-semibold text-white">
            What we collect
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-white">Account:</strong> phone number,
              optional name and email.
            </li>
            <li>
              <strong className="text-white">Orders:</strong> delivery address,
              order history, dietary preferences you choose to share.
            </li>
            <li>
              <strong className="text-white">Attribution:</strong> the source
              that brought you to Tanmatra (e.g. a Google Ad, a friend's
              referral link). Stored once at sign-up.
            </li>
            <li>
              <strong className="text-white">Operational telemetry:</strong>{" "}
              error reports and basic usage signals to keep the app reliable.
            </li>
          </ul>
          <h2 className="text-base font-semibold text-white pt-2">
            How we use it
          </h2>
          <p>
            To fulfil your orders, personalise your menu, keep your account
            secure, and improve the service. We do not sell your personal
            data to third parties.
          </p>
          <h2 className="text-base font-semibold text-white pt-2">
            Marketing communication
          </h2>
          <p>
            We only send marketing SMS if you explicitly opted in at sign-up.
            You can withdraw consent any time by replying STOP to any
            marketing SMS, or by toggling the option in your{" "}
            <Link
              to="/account"
              className="text-clinical-gold hover:underline underline-offset-2"
            >
              account
            </Link>{" "}
            page.
          </p>
          <h2 className="text-base font-semibold text-white pt-2">
            Health &amp; wearable data
          </h2>
          <p>
            If you choose to connect Apple Health, Health Connect, or another
            wearable, we receive only the metrics you explicitly authorise —
            currently <strong className="text-white">daily steps</strong> and{" "}
            <strong className="text-white">active calories burned</strong>. We
            never read heart rate, sleep, weight, blood glucose, ECG, location
            history, or any other category from these sources.
          </p>
          <p>
            Wearable readings are treated as <strong className="text-white">sensitive personal data</strong>{" "}
            under the DPDP Act 2023. They are stored encrypted, accessible only
            to you and the registered dietitian you explicitly book a consult
            with, and are never used for advertising or shared with third
            parties. You can disconnect the integration at any time from{" "}
            <Link to="/wellness" className="text-clinical-gold hover:underline underline-offset-2">Wellness</Link>{" "}
            — disconnecting stops new data inflows; the Erasure Right below
            covers existing readings.
          </p>
          <p>
            We do not write data back to your wearable platform and hold the
            HealthKit / Health Connect entitlements required by Apple and
            Google. We follow each platform&apos;s data-handling guidelines.
          </p>

          <h2 className="text-base font-semibold text-white pt-2">
            Your rights
          </h2>
          <p>
            Under the DPDP Act you may request access, correction, or erasure
            of your personal data. Email our Grievance Officer at{" "}
            <a
              href="mailto:dpo@tanmatra.food"
              className="text-clinical-gold hover:underline underline-offset-2"
            >
              dpo@tanmatra.food
            </a>
            . We respond within 30 days.
          </p>
          <h2 className="text-base font-semibold text-white pt-2">
            Retention
          </h2>
          <p>
            We retain order data for 7 years for tax and consumer-law reasons.
            Account data is deleted on request unless retention is required by
            law.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
