"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchLegalDoc, acceptLegalDoc, type LegalDoc } from "@/lib/auth";

function TosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reaccept = searchParams.get("reaccept") === "true";

  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetchLegalDoc("tos")
      .then(setDoc)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAccept() {
    if (!doc) return;
    setAccepting(true);
    setError(undefined);
    try {
      await acceptLegalDoc(doc.version);
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between border-b border-border pb-6">
        <div>
          <Link href="/" className="text-xs font-bold tracking-tight text-accent hover:underline">
            ← Back to App
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{doc?.title ?? "Terms of Service"}</h1>
          {doc && <p className="mt-1 text-xs text-text-muted">Version {doc.version}</p>}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <article className="prose prose-sm prose-invert max-w-none rounded-xl border border-border bg-surface p-8 text-sm leading-relaxed text-text-secondary">
        <p className="mb-4">Please read these Terms of Service carefully before using our services.</p>
        <p className="mb-4">{doc?.content ?? "No terms content available."}</p>
        <h3 className="mb-2 mt-6 text-base font-bold text-text-primary">1. Acceptable Use</h3>
        <p className="mb-4">
          You agree not to use this service for any illegal or unauthorized purpose, or to automate
          actions that violate connected third-party platform policies (e.g. Google Ads, Meta Ads).
        </p>
        <h3 className="mb-2 mt-6 text-base font-bold text-text-primary">2. Data and Privacy</h3>
        <p className="mb-4">
          Your use of this service is also governed by our{" "}
          <Link href="/legal/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
          We ingest ad platform metrics to calculate Profit on Ad Spend (POAS), which may process
          customer click IDs or transactional totals. All data is processed in compliance with the
          Data Rights model (GDPR export and deletion).
        </p>
      </article>

      {reaccept && doc && (
        <div className="sticky bottom-6 mt-8 rounded-xl border border-accent/20 bg-accent/5 p-6 shadow-lg backdrop-blur-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-semibold text-text-primary">Terms have been updated</h4>
              <p className="mt-0.5 text-xs text-text-muted">
                You must accept version {doc.version} to continue using the dashboard.
              </p>
            </div>
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
            >
              {accepting ? "Accepting..." : "I Accept the Terms"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function TosPage() {
  return (
    <Suspense>
      <TosContent />
    </Suspense>
  );
}
