"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { logout } from "@/lib/auth";

const LINKS = [
  { href: "/connect", label: "Connect" },
  { href: "/dashboard", label: "POAS" },
  { href: "/sweep", label: "Sweep" },
  { href: "/healing", label: "Healing" },
  { href: "/costs", label: "Costs" },
  { href: "/autonomy", label: "Autonomy" },
  { href: "/billing", label: "Billing" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  function onLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <nav className="border-b border-border bg-surface/50 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-bold tracking-tight text-accent">
          Brand Digital Twin
        </span>
        <div className="flex gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
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
        <button
          type="button"
          onClick={onLogout}
          className="ml-auto rounded-md px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
