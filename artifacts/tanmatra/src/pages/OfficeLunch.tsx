import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CalendarClock,
  MapPin,
  Users,
  Plus,
  Minus,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { corporateApi, type OfficeOrder, type CompanyMember } from "@/lib/corporateApi";
import { usePublicMenu } from "@/lib/queries";
import { formatPrice } from "@/lib/api/adapter";

export default function OfficeLunchPage() {
  const { id = "" } = useParams<{ id: string }>();
  const orderId = Number(id);
  const [data, setData] = useState<{
    officeOrder: OfficeOrder;
    membership: CompanyMember;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const { data: menu = [] } = usePublicMenu();

  const refresh = async () => {
    try {
      const r = await corporateApi.getOfficeOrder(orderId);
      setData(r);
    } catch {
      toast.error("Could not load office lunch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const myPick = useMemo(() => {
    if (!data) return null;
    const me = data.membership.userId;
    return data.officeOrder.picks.find((p) => p.userId === me) ?? null;
  }, [data]);

  useEffect(() => {
    // Pre-fill form from existing pick
    if (myPick) {
      const seed: Record<number, number> = {};
      for (const it of myPick.items) seed[it.dishId] = it.quantity;
      setPicks(seed);
    }
  }, [myPick?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !data) {
    return <div className="p-6 text-sm text-clinical-zinc">Loading…</div>;
  }

  const o = data.officeOrder;
  const isAdmin = data.membership.role === "admin";
  const window = new Date(o.windowClosesAt);
  const windowOpen = o.status === "open" && window.getTime() > Date.now();

  const myTotal = Object.entries(picks).reduce((sum, [dishId, qty]) => {
    const dish = menu.find((m) => m.id === Number(dishId));
    return sum + (dish?.price ?? 0) * qty;
  }, 0);
  const overBudget = myTotal > o.perEmployeeBudgetPaise;

  const handleSave = async () => {
    const items = Object.entries(picks)
      .filter(([, q]) => q > 0)
      .map(([dishId, quantity]) => ({ dishId: Number(dishId), quantity }));
    if (items.length === 0) {
      toast.error("Pick at least one dish");
      return;
    }
    if (overBudget) {
      toast.error("Over your budget");
      return;
    }
    setSubmitting(true);
    try {
      await corporateApi.pickOfficeOrder(orderId, items);
      toast.success("Pick saved");
      refresh();
    } catch (e) {
      toast.error(String((e as Error).message).includes("422") ? "Over budget" : "Could not save pick");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    try {
      await corporateApi.closeOfficeOrder(orderId);
      toast.success("Office lunch closed and dispatched");
      refresh();
    } catch {
      toast.error("Could not close");
    }
  };

  const bump = (dishId: number, delta: number) => {
    setPicks((prev) => {
      const next = { ...prev, [dishId]: Math.max(0, (prev[dishId] ?? 0) + delta) };
      if (next[dishId] === 0) delete next[dishId];
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-5 animate-in fade-in duration-500">
      <div>
        <Link
          to={`/corporate`}
          className="text-[10px] text-clinical-zinc hover:text-clinical-gold"
        >
          ← Companies
        </Link>
        <h1 className="text-2xl font-bold text-white">{o.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-clinical-zinc mt-1">
          <span className="flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5" />
            {new Date(o.scheduledFor).toLocaleString([], {
              weekday: "long",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" /> {o.address.line}, {o.address.city} {o.address.pincode}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] capitalize ${
              windowOpen
                ? "border-clinical-sage/40 text-clinical-sage"
                : "border-clinical-slate/40 text-clinical-zinc"
            }`}
          >
            {windowOpen ? "Picks open" : o.status}
          </Badge>
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Budget {formatPrice(o.perEmployeeBudgetPaise)} / person
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Pick your meal</h2>
            {!windowOpen && (
              <p className="text-xs text-clinical-zinc flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> Pick window has closed.
              </p>
            )}
            <div className="space-y-2">
              {menu.map((dish) => {
                const qty = picks[dish.id] ?? 0;
                return (
                  <div
                    key={dish.id}
                    className="flex items-center justify-between p-2 rounded-md border border-clinical-slate/20 bg-clinical-dark"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {dish.imageUrl && (
                        <img
                          src={dish.imageUrl}
                          alt={dish.name}
                          loading="lazy"
                          className="w-10 h-10 rounded object-cover border border-clinical-slate/20"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{dish.name}</p>
                        <p className="text-[10px] text-clinical-zinc tabular-nums">
                          {formatPrice(dish.price)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        disabled={!windowOpen || qty <= 0}
                        onClick={() => bump(dish.id, -1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-6 text-center text-xs tabular-nums">{qty}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        disabled={!windowOpen}
                        onClick={() => bump(dish.id, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Separator className="bg-clinical-slate/20" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-clinical-zinc">Your total</span>
              <span
                className={`tabular-nums font-medium ${
                  overBudget ? "text-red-400" : "text-white"
                }`}
              >
                {formatPrice(myTotal)} / {formatPrice(o.perEmployeeBudgetPaise)}
              </span>
            </div>
            <Button
              onClick={handleSave}
              disabled={!windowOpen || submitting || overBudget}
              className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
            >
              {submitting ? "Saving…" : myPick ? "Update my pick" : "Lock my pick"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-clinical-gold" /> Team picks ({o.picks.length})
            </h2>
            <p className="text-[10px] text-clinical-zinc">
              Aggregated total: <span className="text-white tabular-nums">{formatPrice(o.totalPaise)}</span>
            </p>
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {o.picks.length === 0 ? (
                <p className="text-xs text-clinical-zinc">No picks yet.</p>
              ) : (
                o.picks.map((p) => (
                  <div
                    key={p.userId}
                    className="p-2 rounded-md border border-clinical-slate/20 bg-clinical-dark"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-white">{p.userName}</p>
                      <span className="text-[10px] tabular-nums text-clinical-gold">
                        {formatPrice(p.totalPaise)}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {p.items.map((it) => (
                        <li key={it.dishId} className="text-[10px] text-clinical-zinc">
                          {it.quantity} × {it.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
            {isAdmin && windowOpen && (
              <Button
                onClick={handleClose}
                variant="outline"
                className="w-full border-clinical-gold/40 text-clinical-gold"
              >
                Close picks & dispatch
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
