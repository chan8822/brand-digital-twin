"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyEmail } from "@/lib/auth";
import { USE_MOCK } from "@/lib/api";
import { AuthShell, FormError } from "@/components/AuthShell";

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"idle" | "verifying" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string>();
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    setState("verifying");
    verifyEmail(token)
      .then(() => {
        setState("done");
        // In mock mode skip the redundant login step — go straight to the product.
        if (USE_MOCK) router.replace("/connect");
      })
      .catch((err) => {
        setError((err as Error).message);
        setState("error");
      });
  }, [token, router]);

  if (!token) {
    return (
      <AuthShell title="Verify your email" subtitle="Check your inbox for the link we sent.">
        <p className="text-center text-sm text-text-muted">
          Open the verification link from your email to activate your account.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Verifying your email"
      footer={
        <Link href="/login" className="text-accent hover:underline">
          Back to login
        </Link>
      }
    >
      {state === "verifying" && (
        <p className="text-center text-sm text-text-muted">Verifying…</p>
      )}
      {state === "done" && (
        <div className="text-center">
          <p className="mb-4 text-sm text-success">Email verified — account active.</p>
          <Link
            href="/login"
            className="block w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Continue to login
          </Link>
        </div>
      )}
      {state === "error" && <FormError message={error ?? "Verification failed."} />}
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<AuthShell title="Verifying your email">{null}</AuthShell>}>
      <VerifyInner />
    </Suspense>
  );
}
