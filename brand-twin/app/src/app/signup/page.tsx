"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signup } from "@/lib/auth";
import { USE_MOCK } from "@/lib/api";
import { AuthShell, Field, SubmitButton, FormError } from "@/components/AuthShell";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      const { verificationToken } = await signup(email, password, orgName);
      // Dev convenience: the engine returns the verification token directly, so
      // we can hand it straight to the verify screen. In production this arrives
      // by email and the user clicks a link.
      router.push(`/verify?token=${encodeURIComponent(verificationToken)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="See your real POAS in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <FormError message={error} />
        <Field
          label="Brand / org name"
          value={orgName}
          onChange={setOrgName}
          placeholder="Acme Wellness"
          autoComplete="organization"
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@brand.com"
          autoComplete="email"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />

        {/* ToS acceptance — required before account creation */}
        <label className="mt-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={tosAccepted}
            onChange={(e) => setTosAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
          />
          <span className="text-xs text-text-muted leading-relaxed">
            I agree to the{" "}
            <Link href="/legal/tos" className="text-accent hover:underline" target="_blank">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="text-accent hover:underline" target="_blank">
              Privacy Policy
            </Link>
          </span>
        </label>

        <SubmitButton
          pending={pending}
          disabled={!orgName || !email || !password || !tosAccepted}
        >
          Create account
        </SubmitButton>
        {USE_MOCK && (
          <p className="mt-3 text-center text-[11px] text-text-muted">
            Demo mode — no real account is created.
          </p>
        )}
      </form>
    </AuthShell>
  );
}
