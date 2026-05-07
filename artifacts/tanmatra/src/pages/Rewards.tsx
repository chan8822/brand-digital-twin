import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Gift,
  Sparkles,
  Copy,
  Bell,
  Cake,
  RefreshCw,
  CalendarHeart,
  Trophy,
  CheckCircle2,
  Wallet,
  Share2,
  AlertTriangle,
} from "lucide-react";
import {
  loyaltyApi,
  type CreditLedgerEntry,
  type CreditLedgerReason,
  type NotificationItem,
  type NotificationKind,
  type ReferralResponse,
  type UserProfile,
} from "@/lib/loyaltyApi";

const REASON_LABEL: Record<CreditLedgerReason, string> = {
  referral_referrer_award: "Friend joined",
  referral_referee_signup: "Welcome bonus",
  loyalty_free_week: "Loyalty reward",
  premium_unlock_bonus: "Premium unlock",
  birthday_meal: "Birthday meal",
  winback_offer: "Win-back offer",
  manual_grant: "Manual grant",
  checkout_redemption: "Used at checkout",
  expired: "Expired",
};

const NOTIF_ICON: Record<NotificationKind, typeof Bell> = {
  winback: RefreshCw,
  birthday: Cake,
  loyalty_free_week: Trophy,
  loyalty_premium_unlock: Sparkles,
  protein_streak: AlertTriangle,
  referral_redeemed: Gift,
};

function formatPaise(p: number): string {
  const sign = p < 0 ? "-" : "";
  return `${sign}Rs.${Math.abs(p / 100).toFixed(0)}`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString();
}

export default function Rewards() {
  const [referral, setReferral] = useState<ReferralResponse | null>(null);
  const [entries, setEntries] = useState<CreditLedgerEntry[]>([]);
  const [balancePaise, setBalancePaise] = useState(0);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [r, c, n, p] = await Promise.all([
        loyaltyApi.getReferral(),
        loyaltyApi.getCreditLedger(),
        loyaltyApi.getNotifications(),
        loyaltyApi.getProfile(),
      ]);
      setReferral(r);
      setEntries(c.entries);
      setBalancePaise(c.balancePaise);
      setNotifs(n.notifications);
      setProfile(p.profile);
      if (p.profile?.birthDate) setBirthDate(p.profile.birthDate);
      setUnauthorized(false);
    } catch (e) {
      if (String(e).startsWith("Error: 401")) {
        setUnauthorized(true);
      } else {
        toast.error("Failed to load rewards");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (unauthorized) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center space-y-4">
        <Wallet className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">Sign in to see rewards</h1>
        <p className="text-sm text-clinical-zinc">
          Earn credits, refer friends, and unlock premium meals.
        </p>
        <Link to="/login">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-sm text-clinical-zinc">
        Loading rewards…
      </div>
    );
  }

  const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}?ref=${referral?.code ?? ""}`;

  const copyCode = () => {
    if (!referral?.code) return;
    navigator.clipboard.writeText(referral.code);
    toast.success("Code copied");
  };
  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied");
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    try {
      const out = await loyaltyApi.redeemReferral(redeemCode.trim());
      toast.success(`+${formatPaise(out.awardedPaise)} added to your wallet`);
      setRedeemCode("");
      refresh();
    } catch (e) {
      toast.error(String(e).replace(/^Error:\s*\d+:\s*/, "") || "Could not redeem");
    }
  };

  const handleEngine = async () => {
    try {
      const out = await loyaltyApi.runEngine();
      toast.success(
        out.triggered > 0
          ? `${out.triggered} new reward${out.triggered === 1 ? "" : "s"} unlocked`
          : "No new rewards yet — check back soon",
      );
      refresh();
    } catch {
      toast.error("Engine run failed");
    }
  };

  const handleSaveBirthday = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      toast.error("Pick a date first");
      return;
    }
    try {
      await loyaltyApi.updateProfile({ birthDate });
      toast.success("Birthday saved — we'll send a free meal on your day");
      refresh();
    } catch {
      toast.error("Could not save birthday");
    }
  };

  const handleDismiss = async (id: number) => {
    try {
      await loyaltyApi.dismissNotification(id);
      setNotifs((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: "dismissed" } : n)),
      );
    } catch {
      toast.error("Could not dismiss");
    }
  };

  const activeNotifs = notifs.filter((n) => n.status !== "dismissed");

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-clinical-gold" />
          Rewards
        </h1>
        <p className="text-xs text-clinical-zinc">
          Refer friends, earn credits, and unlock loyalty perks on every plan.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-sm font-semibold text-white">Your referral code</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-2xl tracking-widest text-clinical-gold bg-clinical-dark/60 px-4 py-2 rounded-lg border border-clinical-gold/30">
                {referral?.code}
              </code>
              <Button size="sm" variant="outline" onClick={copyCode} className="border-clinical-slate/30 text-clinical-zinc gap-1.5">
                <Copy className="w-3.5 h-3.5" /> Code
              </Button>
              <Button size="sm" variant="outline" onClick={copyLink} className="border-clinical-slate/30 text-clinical-zinc gap-1.5">
                <Share2 className="w-3.5 h-3.5" /> Link
              </Button>
            </div>
            <p className="text-[11px] text-clinical-zinc">
              You get {formatPaise(referral?.awards.referrerPaise ?? 0)} when a friend signs up. They get {formatPaise(referral?.awards.refereePaise ?? 0)} on their first order.
            </p>
            <div className="text-[10px] text-clinical-zinc">
              {referral?.redemptions.length ?? 0} friend
              {(referral?.redemptions.length ?? 0) === 1 ? "" : "s"} redeemed so far
            </div>
          </CardContent>
        </Card>

        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-clinical-sage" />
              <h2 className="text-sm font-semibold text-white">Credit balance</h2>
            </div>
            <p className="text-3xl font-bold text-clinical-sage tabular-nums">
              {formatPaise(balancePaise)}
            </p>
            <p className="text-[10px] text-clinical-zinc">
              Auto-applied at checkout up to your subtotal.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-clinical-gold" />
            <h2 className="text-sm font-semibold text-white">Have a code?</h2>
          </div>
          <div className="flex gap-2">
            <Input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              placeholder="ENTER CODE"
              className="h-10 bg-clinical-dark border-clinical-slate/30 font-mono tracking-widest"
            />
            <Button
              onClick={handleRedeem}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
            >
              Redeem
            </Button>
          </div>
          <p className="text-[10px] text-clinical-zinc">
            One referral per account. Credits expire 90 days after issuance.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-sm font-semibold text-white">Inbox</h2>
              {activeNotifs.length > 0 && (
                <Badge variant="outline" className="text-[10px] border-clinical-gold/40 text-clinical-gold">
                  {activeNotifs.length}
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleEngine}
              className="border-clinical-slate/30 text-clinical-zinc hover:text-clinical-gold gap-1.5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Check for new rewards
            </Button>
          </div>
          {activeNotifs.length === 0 ? (
            <p className="text-xs text-clinical-zinc py-4 text-center">
              No new messages. Tap "Check for new rewards" — we evaluate loyalty rules, win-back offers, birthday gifts, and your goals.
            </p>
          ) : (
            <div className="space-y-2">
              {activeNotifs.map((n) => {
                const Icon = NOTIF_ICON[n.kind] ?? Bell;
                return (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-clinical-slate/20 bg-clinical-dark/40"
                  >
                    <div className="w-8 h-8 rounded-md bg-clinical-gold/15 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-clinical-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{n.title}</p>
                      <p className="text-[11px] text-clinical-zinc">{n.body}</p>
                      <p className="text-[9px] text-clinical-zinc mt-1">{formatRelative(n.createdAt)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismiss(n.id)}
                      className="text-clinical-zinc hover:text-white"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarHeart className="w-4 h-4 text-pink-400" />
            <h2 className="text-sm font-semibold text-white">Birthday meal</h2>
          </div>
          <p className="text-xs text-clinical-zinc">
            Save your birthday and we'll auto-credit a free meal each year.
          </p>
          <div className="flex gap-2 max-w-sm">
            <Input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="h-10 bg-clinical-dark border-clinical-slate/30"
            />
            <Button
              onClick={handleSaveBirthday}
              variant="outline"
              className="border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10"
            >
              Save
            </Button>
          </div>
          {profile?.birthDate && (
            <p className="text-[10px] text-clinical-sage">
              Saved: {new Date(profile.birthDate).toLocaleDateString(undefined, { day: "numeric", month: "long" })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-clinical-zinc" />
            <h2 className="text-sm font-semibold text-white">Credit history</h2>
          </div>
          <Separator className="bg-clinical-slate/20" />
          {entries.length === 0 ? (
            <p className="text-xs text-clinical-zinc py-3 text-center">
              No credits yet. Refer a friend or wait for a loyalty unlock.
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white truncate">
                      {REASON_LABEL[e.reason]}
                      {e.note ? ` — ${e.note}` : ""}
                    </p>
                    <p className="text-[10px] text-clinical-zinc">
                      {formatRelative(e.createdAt)}
                      {e.expiresAt
                        ? ` · expires ${new Date(e.expiresAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`tabular-nums font-semibold shrink-0 ${
                      e.deltaPaise < 0 ? "text-red-400" : "text-clinical-sage"
                    }`}
                  >
                    {e.deltaPaise > 0 ? "+" : ""}
                    {formatPaise(e.deltaPaise)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
