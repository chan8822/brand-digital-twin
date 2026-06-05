"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const LINKS = [
  { href: "/connect", label: "Connect" },
  { href: "/dashboard", label: "POAS" },
  { href: "/sweep", label: "Sweep" },
  { href: "/healing", label: "Healing" },
  { href: "/autonomy", label: "Autonomy" },
];

export function Nav() {
  const pathname = usePathname();
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
      </div>
    </nav>
  );
}
