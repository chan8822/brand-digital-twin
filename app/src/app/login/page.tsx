"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login } from "@/lib/auth";
import { USE_MOCK } from "@/lib/api";
import { AuthShell, Field, SubmitButton, FormError } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    try {
      await login(email, password);
      router.push("/connect");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={USE_MOCK ? "Demo mode — any credentials work." : undefined}
      footer={
        <>
          No account?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </>
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
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <div className="mb-4 text-right">
          <Link href="/reset" className="text-xs text-text-muted hover:text-text-primary">
            Forgot password?
          </Link>
        </div>
        <SubmitButton pending={pending} disabled={!email || !password}>
          Log in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
