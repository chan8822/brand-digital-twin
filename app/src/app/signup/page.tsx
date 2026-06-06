"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signup, fetchLegalDoc } from "@/lib/auth";
import { USE_MOCK } from "@/lib/api";
import { AuthShell, Field, SubmitButton, FormError } from "@/components/AuthShell";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [activeVersion, setActiveVersion] = useState("v1.0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetchLegalDoc("tos")
      .then((doc) => setActiveVersion(doc.version))
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) {
      setError("You must accept the Terms of Service to register.");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const { verificationToken } = await signup(email, password, orgName, accepted, activeVersion);
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
        <label className="mb-4 flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 rounded border-border bg-bg text-accent focus:ring-accent outline-none"
          />
          <span className="text-xs text-text-muted select-none leading-relaxed">
            I accept the{" "}
            <Link href="/legal/tos" target="_blank" className="text-accent hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" target="_blank" className="text-accent hover:underline">
              Privacy Policy
            </Link>.
          </span>
        </label>
        <SubmitButton pending={pending} disabled={!orgName || !email || !password || !accepted}>
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
