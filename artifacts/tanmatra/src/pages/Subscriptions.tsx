import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CalendarClock,
  Pause,
  Play,
  XCircle,
  SkipForward,
  Replace,
  Clock,
  Users,
  Sparkles,
  Wallet,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import {
  subscriptionsApi,
  CADENCE_LABEL,
  formatScheduledDate,
  type Subscription,
  type SubscriptionDelivery,
  type SubscriptionMember,
  type MealCredit,
} from "@/lib/subscriptionsApi";

interface Detail {
  subscription: Subscription;
  members: SubscriptionMember[];
  deliveries: SubscriptionDelivery[];
}

const STATUS_BADGE: Record<Subscription["status"], { label: string; cls: string }> = {
  active: {
    label: "Active",
    cls: "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/40",
  },
  paused: {
    label: "Paused",
    cls: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-red-500/15 text-red-400 border-red-500/40",
  },
};

const DELIVERY_BADGE: Record<SubscriptionDelivery["status"], { label: string; cls: string }> = {
  upcoming: {
    label: "Upcoming",
    cls: "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/40",
  },
  skipped: {
    label: "Skipped",
    cls: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  },
  delivered: {
    label: "Delivered",
    cls: "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/40",
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-red-500/15 text-red-400 border-red-500/40",
  },
};

const TIME_WINDOWS = [
  "07:00 - 08:00",
  "12:00 - 13:00",
  "13:00 - 14:00",
  "19:00 - 20:00",
  "20:00 - 21:00",
];

export default function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [credits, setCredits] = useState<{ balance: number; rows: MealCredit[] }>({
    balance: 0,
    rows: [],
  });
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [reschedDelivery, setReschedDelivery] =
    useState<SubscriptionDelivery | null>(null);
  const [reschedDate, setReschedDate] = useState("");
  const [reschedWindow, setReschedWindow] = useState(TIME_WINDOWS[1]);
  const [windowEditOpen, setWindowEditOpen] = useState(false);
  const [pendingWindow, setPendingWindow] = useState(TIME_WINDOWS[1]);

  const refreshList = useCallback(async () => {
    try {
      const [list, c] = await Promise.all([
        subscriptionsApi.list(),
        subscriptionsApi.credits(),
      ]);
      setSubs(list.subscriptions);
      setCredits({ balance: c.balance, rows: c.credits });
      if (list.subscriptions.length > 0 && activeId === null) {
        setActiveId(list.subscriptions[0].id);
      }
    } catch (err) {
      if (err instanceof Error && err.message === "unauthorized") {
        setUnauthorized(true);
      } else {
        toast.error("Failed to load subscriptions");
      }
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  const refreshDetail = useCallback(async (id: number) => {
    try {
      const d = await subscriptionsApi.get(id);
      setDetail(d);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (activeId !== null) refreshDetail(activeId);
  }, [activeId, refreshDetail]);

  const wrap = async <T,>(p: Promise<T>, msg: string) => {
    try {
      await p;
      toast.success(msg);
      if (activeId !== null) await refreshDetail(activeId);
      await refreshList();
    } catch (err) {
      const m = err instanceof Error ? err.message : "Error";
      toast.error("Action failed", { description: m });
    }
  };

  if (unauthorized) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <CalendarClock className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">Sign in to manage plans</h1>
        <p className="text-sm text-clinical-zinc">
          Subscriptions are tied to your Tanmatra account.
        </p>
        <Link to="/login?next=/subscriptions">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            Sign In
          </Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-clinical-zinc text-sm">
        Loading subscriptions…
      </div>
    );
  }

  if (subs.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4 animate-in fade-in">
        <Sparkles className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">No active plans yet</h1>
        <p className="text-sm text-clinical-zinc">
          Set up a recurring plan to lock in your delivery window and earn cadence
          discounts.
        </p>
        <Link to="/subscribe">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-2">
            <PlusCircle className="w-4 h-4" />
            Build a Plan
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Your Subscriptions</h1>
          <p className="text-xs text-clinical-zinc">
            {subs.length} plan{subs.length === 1 ? "" : "s"} · {credits.balance} meal
            credit{credits.balance === 1 ? "" : "s"} available
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Card className="bg-clinical-surface border-clinical-gold/30">
            <CardContent className="px-3 py-2 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-clinical-gold" />
              <div>
                <p className="text-[9px] uppercase tracking-widest text-clinical-zinc">
                  Credit Balance
                </p>
                <p className="text-sm font-bold text-clinical-gold tabular-nums">
                  {credits.balance} meals
                </p>
              </div>
            </CardContent>
          </Card>
          <Link to="/subscribe">
            <Button
              size="sm"
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 gap-1.5"
            >
              <PlusCircle className="w-4 h-4" /> New Plan
            </Button>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-clinical-slate/20 pb-2">
        {subs.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                active
                  ? "bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30"
                  : "text-clinical-zinc hover:text-white"
              }`}
            >
              {CADENCE_LABEL[s.cadence]} · {s.mealsPerDelivery} meals
            </button>
          );
        })}
      </div>

      {detail && <DetailView
        detail={detail}
        onPause={() =>
          wrap(subscriptionsApi.pause(detail.subscription.id), "Subscription paused")
        }
        onResume={() =>
          wrap(subscriptionsApi.resume(detail.subscription.id), "Subscription resumed")
        }
        onCancel={() =>
          wrap(subscriptionsApi.cancel(detail.subscription.id), "Subscription cancelled")
        }
        onEditWindow={() => {
          setPendingWindow(detail.subscription.deliveryWindow);
          setWindowEditOpen(true);
        }}
        onGenerateMore={() =>
          wrap(
            subscriptionsApi.generateNext(detail.subscription.id),
            "Added 4 more deliveries",
          )
        }
        onSkip={(d) =>
          wrap(subscriptionsApi.skip(d.id), "Delivery skipped — credits added")
        }
        onSwap={(d) => {
          const next = [...d.items];
          if (next.length === 0) {
            next.push({
              slug: "house-special",
              name: "Chef's House Special",
              image: "",
              quantity: detail.subscription.mealsPerDelivery,
              unitPricePaise: 26000,
            });
          } else {
            next[0] = {
              ...next[0],
              name:
                next[0].name === "Chef's House Special"
                  ? "RD Curated Box"
                  : "Chef's House Special",
            };
          }
          return wrap(subscriptionsApi.swap(d.id, next), "Delivery contents updated");
        }}
        onReschedule={(d) => {
          setReschedDelivery(d);
          setReschedDate(new Date(d.scheduledFor).toISOString().slice(0, 10));
          setReschedWindow(d.deliveryWindow);
        }}
      />}

      <Dialog open={windowEditOpen} onOpenChange={setWindowEditOpen}>
        <DialogContent className="bg-clinical-surface border-clinical-slate/30">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-clinical-gold" />
              Update locked delivery window
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-clinical-zinc">
              The new window applies to every upcoming delivery on this plan.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TIME_WINDOWS.map((w) => (
                <button
                  key={w}
                  onClick={() => setPendingWindow(w)}
                  className={`px-2.5 py-1 rounded-md text-[11px] border ${
                    w === pendingWindow
                      ? "border-clinical-gold bg-clinical-gold/10 text-clinical-gold"
                      : "border-clinical-slate/30 text-clinical-zinc"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-clinical-slate/30 text-clinical-zinc"
              onClick={() => setWindowEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
              onClick={async () => {
                if (!detail) return;
                await wrap(
                  subscriptionsApi.updateDeliveryWindow(
                    detail.subscription.id,
                    pendingWindow,
                  ),
                  "Delivery window updated",
                );
                setWindowEditOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reschedDelivery !== null} onOpenChange={(open) => !open && setReschedDelivery(null)}>
        <DialogContent className="bg-clinical-surface border-clinical-slate/30">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-clinical-gold" />
              Reschedule delivery
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-clinical-zinc">New date</Label>
              <Input
                type="date"
                value={reschedDate}
                onChange={(e) => setReschedDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="bg-clinical-dark border-clinical-slate/30 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-clinical-zinc">Window</Label>
              <div className="flex flex-wrap gap-1.5">
                {TIME_WINDOWS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setReschedWindow(w)}
                    className={`px-2.5 py-1 rounded-md text-[11px] border ${
                      w === reschedWindow
                        ? "border-clinical-gold bg-clinical-gold/10 text-clinical-gold"
                        : "border-clinical-slate/30 text-clinical-zinc"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-clinical-slate/30 text-clinical-zinc"
              onClick={() => setReschedDelivery(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
              onClick={async () => {
                if (!reschedDelivery) return;
                await wrap(
                  subscriptionsApi.reschedule(
                    reschedDelivery.id,
                    new Date(reschedDate).toISOString(),
                    reschedWindow,
                  ),
                  "Delivery rescheduled",
                );
                setReschedDelivery(null);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailView({
  detail,
  onPause,
  onResume,
  onCancel,
  onEditWindow,
  onGenerateMore,
  onSkip,
  onSwap,
  onReschedule,
}: {
  detail: Detail;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onEditWindow: () => void;
  onGenerateMore: () => void;
  onSkip: (d: SubscriptionDelivery) => void;
  onSwap: (d: SubscriptionDelivery) => void;
  onReschedule: (d: SubscriptionDelivery) => void;
}) {
  const { subscription: s, members, deliveries } = detail;
  const badge = STATUS_BADGE[s.status];

  return (
    <div className="space-y-4">
      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">
                  {CADENCE_LABEL[s.cadence]} Plan
                </h2>
                <Badge variant="outline" className={`text-[10px] ${badge.cls}`}>
                  {badge.label}
                </Badge>
              </div>
              <p className="text-xs text-clinical-zinc">
                {s.mealsPerDelivery} meals · Window locked at {s.deliveryWindow} ·
                Next on {formatScheduledDate(s.nextDeliveryAt)}
              </p>
              <p className="text-[10px] text-clinical-zinc">
                Delivers to {s.addressLabel ?? "Home"} · {s.city ?? ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.status === "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onPause}
                  className="border-orange-400/40 text-orange-300 hover:bg-orange-500/10 gap-1.5 text-xs"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause
                </Button>
              )}
              {s.status === "paused" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onResume}
                  className="border-clinical-sage/40 text-clinical-sage hover:bg-clinical-sage/10 gap-1.5 text-xs"
                >
                  <Play className="w-3.5 h-3.5" /> Resume
                </Button>
              )}
              {s.status !== "cancelled" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancel}
                  className="text-clinical-zinc hover:text-red-400 gap-1.5 text-xs"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onEditWindow}
                className="border-clinical-slate/30 text-clinical-zinc hover:text-white gap-1.5 text-xs"
              >
                <Clock className="w-3.5 h-3.5" /> Edit window
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onGenerateMore}
                className="border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 gap-1.5 text-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Add 4 more
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-clinical-slate/15">
            <Users className="w-3.5 h-3.5 text-clinical-zinc" />
            <span className="text-[11px] text-clinical-zinc">Family:</span>
            {members.map((m) => (
              <Badge
                key={m.id}
                variant="outline"
                className="text-[10px] border-clinical-slate/30 text-clinical-zinc"
              >
                {m.name}
                {m.lifestyle ? ` · ${m.lifestyle}` : ""}
                {m.allergens.length > 0 ? ` · no ${m.allergens.join("/")}` : ""}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-widest text-clinical-zinc px-1">
          Upcoming deliveries
        </h3>
        {deliveries.map((d) => {
          const db = DELIVERY_BADGE[d.status];
          const isUpcoming = d.status === "upcoming";
          return (
            <Card key={d.id} className="bg-clinical-surface border-clinical-slate/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
                        {new Date(d.scheduledFor).toLocaleString("en-IN", {
                          weekday: "short",
                        })}
                      </p>
                      <p className="text-lg font-bold text-clinical-gold leading-none">
                        {new Date(d.scheduledFor).getDate()}
                      </p>
                      <p className="text-[10px] text-clinical-zinc">
                        {new Date(d.scheduledFor).toLocaleString("en-IN", {
                          month: "short",
                        })}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-sm text-white">
                        {d.items.length === 0
                          ? "Chef's curated box"
                          : `${d.items.length} item${d.items.length === 1 ? "" : "s"} curated`}
                      </p>
                      <p className="text-[10px] text-clinical-zinc flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {d.deliveryWindow}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${db.cls}`}>
                    {db.label}
                  </Badge>
                </div>
                {isUpcoming && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-clinical-slate/15">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSkip(d)}
                      className="border-orange-400/40 text-orange-300 hover:bg-orange-500/10 gap-1.5 text-xs"
                    >
                      <SkipForward className="w-3.5 h-3.5" /> Skip
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSwap(d)}
                      className="border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 gap-1.5 text-xs"
                    >
                      <Replace className="w-3.5 h-3.5" /> Swap
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReschedule(d)}
                      className="border-clinical-slate/30 text-clinical-zinc hover:text-white gap-1.5 text-xs"
                    >
                      <Clock className="w-3.5 h-3.5" /> Reschedule
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
