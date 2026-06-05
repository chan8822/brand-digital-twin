"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { requestReset, confirmReset } from "@/lib/auth";
import { USE_MOCK } from "@/lib/api";
import { AuthShell, Field, SubmitButton, FormError } from "@/components/AuthShell";

function RequestStep() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      const token = await requestReset(email);
      setDevToken(token);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="If that address exists, a reset link is on its way."
        footer={
          <Link href="/login" className="text-accent hover:underline">
            Back to login
          </Link>
        }
      >
        <p className="text-center text-sm text-text-muted">
          Follow the link in the email to set a new password.
        </p>
        {devToken && (
          <Link
            href={`/reset?token=${encodeURIComponent(devToken)}`}
            className="mt-4 block w-full rounded-md border border-border px-3 py-2 text-center text-xs text-text-muted hover:text-text-primary"
          >
            {USE_MOCK ? "Demo: continue to set password" : "Dev: open reset link"}
          </Link>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link href="/login" className="text-accent hover:underline">
          Back to login
        </Link>
      }
    >
      <form onSubmit={onSubmit}>
        <FormError message={error} />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@brand.com"
          autoComplete="email"
        />
        <SubmitButton pending={pending} disabled={!email}>
          Send reset link
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

function ConfirmStep({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      await confirmReset(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Set a new password">
      {done ? (
        <p className="text-center text-sm text-success">
          Password updated — redirecting to login…
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <FormError message={error} />
          <Field
            label="New password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <SubmitButton pending={pending} disabled={!password}>
            Update password
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

function ResetInner() {
  const token = useSearchParams().get("token");
  return token ? <ConfirmStep token={token} /> : <RequestStep />;
}

export default function ResetPage() {
  return (
    <Suspense fallback={<AuthShell title="Reset your password">{null}</AuthShell>}>
      <ResetInner />
    </Suspense>
  );
}
