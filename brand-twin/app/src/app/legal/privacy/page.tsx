"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchLegalDoc, type LegalDoc } from "@/lib/auth";

export default function PrivacyPage() {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetchLegalDoc("privacy")
      .then(setDoc)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{doc?.title ?? "Privacy Policy"}</h1>
          {doc && <p className="mt-1 text-xs text-text-muted">Version {doc.version}</p>}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <article className="prose prose-sm prose-invert max-w-none rounded-xl border border-border bg-surface p-8 text-sm leading-relaxed text-text-secondary">
        <p className="mb-4">This Privacy Policy describes how we handle your personal data when you use our services.</p>
        <p className="mb-4">{doc?.content ?? "No privacy policy content available."}</p>
        <h3 className="mb-2 mt-6 text-base font-bold text-text-primary">1. Data Ingestion</h3>
        <p className="mb-4">
          We ingest orders and transaction records from Shopify and WooCommerce, and campaign
          performance indices from Google Ads and Meta Ads. We do not store raw email records or
          customer identifiers in plaintext; all PII is hashed before audit logging.
        </p>
        <h3 className="mb-2 mt-6 text-base font-bold text-text-primary">2. GDPR and Data Rights</h3>
        <p className="mb-4">
          Under the GDPR, you have the right to export all data processed by our systems, or to
          request permanent deletion. Soft-deleted profiles are scrubbed of transactional ties
          immediately, and all database backups are permanently scrubbed after 30 days.
        </p>
      </article>
    </main>
  );
}
