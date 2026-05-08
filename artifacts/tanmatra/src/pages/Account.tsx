import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  UserCircle,
  SlidersHorizontal,
  Sparkle,
  Gift,
  Crown,
  Package,
  Calendar,
  MapPin,
  SignIn,
  SignOut,
  CaretRight,
  ShieldCheck,
  Wallet,
} from "@phosphor-icons/react";
import { loyaltyApi } from "@/lib/loyaltyApi";
import { subscriptionsApi } from "@/lib/subscriptionsApi";
import { corporateApi } from "@/lib/corporateApi";
import { usePremiumStatus } from "@/lib/usePremium";

interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

const API_BASE = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");

function useAuthUser() {
  return useQuery({
    queryKey: ["auth", "user"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/auth/user`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { user: AuthUser | null };
      return data.user;
    },
    staleTime: 30_000,
    retry: false,
  });
}

function isUnauth(err: unknown): boolean {
  return String((err as Error)?.message ?? "").startsWith("401");
}

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

function displayName(user: AuthUser): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (user.email) return user.email.split("@")[0];
  return "Welcome";
}

function initials(user: AuthUser): string {
  const first = user.firstName?.[0] ?? "";
  const last = user.lastName?.[0] ?? "";
  const fromName = `${first}${last}`.trim();
  if (fromName) return fromName.toUpperCase();
  if (user.email) return user.email[0]!.toUpperCase();
  return "T";
}

interface SectionLink {
  to: string;
  label: string;
  desc: string;
  icon: typeof UserCircle;
}

const SECTIONS: SectionLink[] = [
  {
    to: "/preferences",
    label: "Preferences",
    desc: "Diet, allergens, macro targets",
    icon: SlidersHorizontal,
  },
  {
    to: "/subscriptions",
    label: "My subscriptions",
    desc: "Active weekly meal plans",
    icon: Calendar,
  },
  {
    to: "/orders",
    label: "Order history",
    desc: "Past & upcoming orders",
    icon: Package,
  },
  {
    to: "/account/addresses",
    label: "Address book",
    desc: "Saved delivery addresses",
    icon: MapPin,
  },
  {
    to: "/rewards",
    label: "Rewards",
    desc: "Credit balance, referrals & ledger",
    icon: Sparkle,
  },
  {
    to: "/vouchers",
    label: "Vouchers",
    desc: "Buy gift cards or redeem a code",
    icon: Gift,
  },
  {
    to: "/premium",
    label: "Premium",
    desc: "Chef's tier benefits & membership",
    icon: Crown,
  },
];

export default function Account() {
  const auth = useAuthUser();
  const user = auth.data ?? null;
  const isAuthenticated = !!user;

  const ledger = useQuery({
    queryKey: ["loyalty", "credit-ledger"],
    queryFn: () => loyaltyApi.getCreditLedger(),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  });

  const subs = useQuery({
    queryKey: ["subscriptions", "list"],
    queryFn: () => subscriptionsApi.list(),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  });

  const vouchers = useQuery({
    queryKey: ["vouchers", "mine"],
    queryFn: () => corporateApi.myVouchers(),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  });

  const premium = usePremiumStatus();

  const balancePaise = isUnauth(ledger.error) ? 0 : ledger.data?.balancePaise ?? 0;
  const activeSubs = isUnauth(subs.error)
    ? 0
    : (subs.data?.subscriptions ?? []).filter((s) => s.status === "active")
        .length;
  const voucherCount = isUnauth(vouchers.error)
    ? 0
    : (vouchers.data?.purchased.length ?? 0) +
      (vouchers.data?.redeemed.length ?? 0);

  const loginHref = `${API_BASE}/login?returnTo=${encodeURIComponent("/account")}`;
  const logoutHref = `${API_BASE}/logout`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl text-white tracking-tight">
          Account
        </h1>
        <p className="text-sm text-clinical-zinc">
          Your profile, plan, and Tanmatra benefits in one place.
        </p>
      </header>

      {/* Profile / sign-in card */}
      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-5">
          {auth.isLoading ? (
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-white/5 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-white/5 rounded animate-pulse" />
                <div className="h-3 w-56 bg-white/5 rounded animate-pulse" />
              </div>
            </div>
          ) : isAuthenticated && user ? (
            <div className="flex items-center gap-4">
              {user.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover border border-clinical-gold/30"
                />
              ) : (
                <div
                  aria-hidden
                  className="h-14 w-14 rounded-full bg-clinical-gold/15 border border-clinical-gold/30 flex items-center justify-center text-clinical-gold font-serif text-lg"
                >
                  {initials(user)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-base font-medium truncate">
                  {displayName(user)}
                </p>
                {user.email && (
                  <p className="text-xs text-clinical-zinc truncate">
                    {user.email}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  {premium.isPremium ? (
                    <Badge className="bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30 text-[10px] font-medium gap-1">
                      <Crown className="w-3 h-3" weight="fill" aria-hidden />
                      Premium member
                    </Badge>
                  ) : (
                    <Badge className="bg-white/5 text-clinical-zinc border border-clinical-slate/30 text-[10px] font-medium">
                      Free tier
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div
                aria-hidden
                className="h-14 w-14 rounded-full bg-white/5 border border-clinical-slate/30 flex items-center justify-center"
              >
                <UserCircle className="w-7 h-7 text-clinical-zinc" />
              </div>
              <div className="flex-1">
                <p className="text-white text-base font-medium">
                  You're not signed in
                </p>
                <p className="text-xs text-clinical-zinc">
                  Sign in to track orders, save preferences, and earn rewards.
                </p>
              </div>
              <Button
                asChild
                className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2"
              >
                <a href={loginHref}>
                  <SignIn className="w-4 h-4" weight="bold" aria-hidden />
                  Sign in
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick stats — only show when authed */}
      {isAuthenticated && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile
            icon={Wallet}
            label="Rewards"
            value={
              ledger.isLoading ? "—" : formatRupees(balancePaise)
            }
            sub="balance"
            to="/rewards"
          />
          <StatTile
            icon={Calendar}
            label="Plans"
            value={subs.isLoading ? "—" : String(activeSubs)}
            sub={activeSubs === 1 ? "active" : "active"}
            to="/subscriptions"
          />
          <StatTile
            icon={Gift}
            label="Vouchers"
            value={vouchers.isLoading ? "—" : String(voucherCount)}
            sub="on file"
            to="/vouchers"
          />
          <StatTile
            icon={Crown}
            label="Premium"
            value={premium.isLoading ? "—" : premium.isPremium ? "On" : "Off"}
            sub={premium.isPremium ? "member" : "upgrade"}
            to="/premium"
          />
        </div>
      )}

      {/* Section list */}
      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-0 divide-y divide-clinical-slate/20">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.to}
                to={s.to}
                className="flex items-center gap-4 px-5 py-4 group hover:bg-white/[0.03] focus:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-clinical-gold/40 transition-colors"
              >
                <div className="h-9 w-9 rounded-md bg-clinical-gold/10 border border-clinical-gold/20 flex items-center justify-center shrink-0">
                  <Icon
                    className="w-4 h-4 text-clinical-gold"
                    weight="regular"
                    aria-hidden
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white leading-tight">{s.label}</p>
                  <p className="text-[11px] text-clinical-zinc leading-tight mt-0.5">
                    {s.desc}
                  </p>
                </div>
                <CaretRight
                  className="w-4 h-4 text-clinical-zinc group-hover:text-clinical-gold transition-colors"
                  aria-hidden
                />
              </Link>
            );
          })}
        </CardContent>
      </Card>

      {/* Sign-out / sign-in row */}
      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-5 space-y-4">
          {isAuthenticated ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-white">Sign out</p>
                  <p className="text-[11px] text-clinical-zinc">
                    End your session on this device.
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="border-clinical-slate/40 text-clinical-zinc hover:text-white hover:border-clinical-gold/40 gap-2"
                >
                  <a href={logoutHref}>
                    <SignOut className="w-4 h-4" aria-hidden />
                    Sign out
                  </a>
                </Button>
              </div>
              <Separator className="bg-clinical-slate/20" />
              <p className="text-[10px] text-clinical-zinc flex items-center gap-1.5">
                <ShieldCheck
                  className="w-3 h-3 text-clinical-sage"
                  aria-hidden
                />
                Secured by Replit Auth · ISO 22000 · FSSAI Licensed
              </p>
            </>
          ) : (
            <p className="text-[10px] text-clinical-zinc flex items-center gap-1.5">
              <ShieldCheck
                className="w-3 h-3 text-clinical-sage"
                aria-hidden
              />
              Secured by Replit Auth · ISO 22000 · FSSAI Licensed
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  to,
}: {
  icon: typeof UserCircle;
  label: string;
  value: string;
  sub: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-clinical-slate/30 bg-clinical-surface px-3 py-3 hover:border-clinical-gold/40 hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-clinical-gold/40 transition-colors block"
    >
      <div className="flex items-center gap-1.5 text-clinical-zinc text-[10px] uppercase tracking-widest">
        <Icon className="w-3 h-3 text-clinical-gold" aria-hidden />
        {label}
      </div>
      <p className="mt-1.5 text-white text-lg font-medium leading-none text-clinical-data">
        {value}
      </p>
      <p className="mt-1 text-[10px] text-clinical-zinc">{sub}</p>
    </Link>
  );
}
