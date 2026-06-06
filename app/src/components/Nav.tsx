"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { logout } from "@/lib/auth";
import { getMockBrandIndex, USE_MOCK } from "@/lib/api";
import { MOCK_BRAND_NAMES } from "@/lib/mock";
import { SupportWidget } from "./SupportWidget";

const LINKS = [
  { href: "/connect", label: "Connect" },
  { href: "/dashboard", label: "POAS" },
  { href: "/sweep", label: "Sweep" },
  { href: "/healing", label: "Healing" },
  { href: "/costs", label: "Costs" },
  { href: "/autonomy", label: "Autonomy" },
  { href: "/billing", label: "Billing" },
  { href: "/admin/billing", label: "Admin" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [supportOpen, setSupportOpen] = useState(false);

  function onLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <>
      <nav className="border-b border-border bg-surface/50 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <span className="text-sm font-bold tracking-tight text-accent">
            Brand Digital Twin
          </span>
          {USE_MOCK && (
            <Link
              href="/connect"
              className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 text-xs text-accent transition-colors hover:bg-accent/20"
            >
              {MOCK_BRAND_NAMES[getMockBrandIndex()]}
            </Link>
          )}
          <div className="flex gap-1">
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent/10 text-accent"
                      : "text-text-muted hover:text-text-primary",
                  )}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              Support
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      <SupportWidget open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
