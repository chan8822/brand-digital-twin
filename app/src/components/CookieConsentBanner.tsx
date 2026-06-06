"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check local storage for existing consent preference
    const consent = localStorage.getItem("bt_cookie_consent");
    if (!consent) {
      setVisible(true);
      // Enforce essential-only default on first load by setting default preference
      localStorage.setItem("bt_cookie_consent", "essential");
    }
  }, []);

  function handleAcceptAll() {
    localStorage.setItem("bt_cookie_consent", "all");
    setVisible(false);
  }

  function handleEssentialOnly() {
    localStorage.setItem("bt_cookie_consent", "essential");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 right-6 left-6 sm:left-auto sm:max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl z-50 animate-in slide-in-from-bottom-5 duration-300">
      <h4 className="font-semibold text-text-primary text-sm">Cookie Preferences</h4>
      <p className="text-xs text-text-muted mt-2 leading-relaxed">
        We use cookies to analyze profit performance and secure your session. By default, we only use essential technical cookies. You can choose to allow performance tracking. Learn more in our{" "}
        <Link href="/legal/privacy" className="text-accent hover:underline">
          Privacy Policy
        </Link>.
      </p>
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          onClick={handleEssentialOnly}
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-bg"
        >
          Essential Only
        </button>
        <button
          onClick={handleAcceptAll}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          Accept All
        </button>
      </div>
    </div>
  );
}
