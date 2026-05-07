import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useOrders, type PastOrder } from "@/lib/ordersContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatPrice } from "@/lib/api/adapter";
import {
  Clock,
  Bike,
  Phone,
  Package,
  ChefHat,
  CheckCircle2,
  User,
  Navigation,
  MapPin,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";

const STEPS: Array<{ status: PastOrder["status"]; label: string; icon: typeof CheckCircle2 }> = [
  { status: "placed", label: "Placed", icon: CheckCircle2 },
  { status: "preparing", label: "Preparing", icon: ChefHat },
  { status: "ready", label: "Ready", icon: Package },
  { status: "out_for_delivery", label: "Delivery", icon: Navigation },
  { status: "delivered", label: "Delivered", icon: CheckCircle2 },
];

function statusToStepIndex(status: PastOrder["status"]): number {
  switch (status) {
    case "placed":
      return 0;
    case "preparing":
      return 1;
    case "ready":
      return 2;
    case "out_for_delivery":
      return 3;
    case "delivered":
      return 4;
    case "cancelled":
      return -1;
  }
}

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTimelineStamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Track() {
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get("orderId") ?? undefined;
  const showDevPanel = searchParams.get("dev") === "1";

  const { orders, latest, getOrder, updateStatus } = useOrders();
  const order = orderIdParam ? getOrder(orderIdParam) : latest();

  const currentStepIndex = order ? statusToStepIndex(order.status) : -1;

  // Auto-advance "placed" → "preparing" once the user has had a moment to read the page
  useEffect(() => {
    if (!order || order.status !== "placed") return;
    const t = setTimeout(() => updateStatus(order.orderId, "preparing"), 6000);
    return () => clearTimeout(t);
  }, [order, updateStatus]);

  if (orders.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <Package className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">No orders yet</h1>
        <p className="text-sm text-clinical-zinc">
          Once you place your first order, it will show up here for live tracking.
        </p>
        <Link to="/menu">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            Browse Menu
          </Button>
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">Order not found</h1>
        <p className="text-sm text-clinical-zinc">We couldn't find an order matching that ID.</p>
        <Link to="/orders">
          <Button className="bg-clinical-gold text-[#050505]">View All Orders</Button>
        </Link>
      </div>
    );
  }

  // Derive a deterministic timeline from the order's current status + placedAt/etaAt.
  // This avoids fetching unrelated server-side delivery events for an unrelated DB id.
  const timelineEntries: Array<{ label: string; stamp: string; done: boolean }> = (() => {
    const placed = new Date(order.placedAt).getTime();
    const eta = new Date(order.etaAt).getTime();
    const span = Math.max(eta - placed, 5 * 60 * 1000);
    const stages: Array<{ status: PastOrder["status"]; label: string; offset: number }> = [
      { status: "placed", label: "Order placed & payment confirmed", offset: 0 },
      { status: "preparing", label: "Kitchen started preparing", offset: 0.15 },
      { status: "ready", label: "Order ready for pickup", offset: 0.55 },
      { status: "out_for_delivery", label: "Rider picked up & en route", offset: 0.7 },
      { status: "delivered", label: "Delivered", offset: 1 },
    ];
    return stages.map((s) => ({
      label: s.label,
      stamp: new Date(placed + span * s.offset).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      done: statusToStepIndex(s.status) <= currentStepIndex,
    }));
  })();

  const showRiderCard =
    order.status === "ready" || order.status === "out_for_delivery" || order.status === "delivered";

  const advanceTo = (status: PastOrder["status"]) => {
    updateStatus(order.orderId, status);
    toast.info(`Status → ${status.replace(/_/g, " ")}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5 animate-in fade-in duration-500">
      {/* Order header — IDs and times */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Track Order</h1>
            <p className="font-mono text-xs text-clinical-gold mt-1">{order.orderId}</p>
          </div>
          <Link to="/orders" className="text-xs text-clinical-zinc hover:text-clinical-gold">
            View all orders →
          </Link>
        </div>

        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-clinical-zinc text-[10px] uppercase tracking-wide">Placed</p>
              <p className="text-white tabular-nums font-medium">{formatAbsoluteTime(order.placedAt)}</p>
            </div>
            <div>
              <p className="text-clinical-zinc text-[10px] uppercase tracking-wide">Arriving by</p>
              <p className="text-clinical-gold tabular-nums font-semibold">{formatAbsoluteTime(order.etaAt)}</p>
            </div>
            <div>
              <p className="text-clinical-zinc text-[10px] uppercase tracking-wide">Items</p>
              <p className="text-white tabular-nums font-medium">{order.items.reduce((t, i) => t + i.quantity, 0)}</p>
            </div>
            <div>
              <p className="text-clinical-zinc text-[10px] uppercase tracking-wide">Total</p>
              <p className="text-white tabular-nums font-medium">{formatPrice(order.total)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stepper */}
      <Card>
        <CardContent className="p-6">
          <div className="relative flex items-start justify-between">
            {STEPS.map((step, idx) => {
              const isActive = idx <= currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              const Icon = step.icon;
              return (
                <div key={step.status} className="flex flex-col items-center gap-2 flex-1 relative z-10">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                      isActive
                        ? "bg-[#D4AF37] border-[#D4AF37] text-[#050505]"
                        : "bg-muted border-muted-foreground/20 text-muted-foreground"
                    } ${isCurrent ? "ring-2 ring-[#D4AF37]/30" : ""}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className={`text-[10px] text-center leading-tight ${
                      isActive ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={`absolute top-5 left-1/2 w-full h-0.5 -z-10 ${
                        isActive ? "bg-[#D4AF37]/40" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Rider card — only after ready */}
      {showRiderCard ? (
        <Card className="border-l-4 border-l-[#6BA3C8]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bike className="w-4 h-4 text-[#6BA3C8]" />
              Delivery Partner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#6BA3C8]/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-[#6BA3C8]" />
                </div>
                <div>
                  <p className="font-medium text-white">
                    {order.status === "delivered" ? "Delivered by your rider" : "Rider on the way"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.status === "delivered"
                      ? `Completed at ${formatAbsoluteTime(order.etaAt)}`
                      : `Arriving by ${formatAbsoluteTime(order.etaAt)}`}
                  </p>
                </div>
              </div>
              {order.status !== "delivered" && (
                <Button size="sm" variant="outline" className="gap-1">
                  <Phone className="w-3 h-3" />
                  Call
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-dashed border-clinical-slate/30">
          <CardContent className="p-4 text-xs text-clinical-zinc flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-clinical-gold" />
            Kitchen is preparing your order. A rider will be assigned once it's ready.
          </CardContent>
        </Card>
      )}

      {/* Delivery address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-clinical-gold" />
            Delivery Address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          <p className="text-white font-medium">{order.address.label}</p>
          <p className="text-clinical-zinc">
            {order.address.line1}
            {order.address.line2 ? ` · ${order.address.line2}` : ""} · {order.address.city} {order.address.pincode}
          </p>
          <p className="text-clinical-zinc flex items-center gap-1.5 pt-0.5">
            <Phone className="w-3 h-3" />
            Rider will call {order.address.phone}
          </p>
        </CardContent>
      </Card>

      {/* Derived timeline (from this order only — never from another order's events) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Delivery Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {timelineEntries.map((entry, idx) => (
              <div key={idx} className="flex gap-3 items-start">
                <div className="flex flex-col items-center pt-1">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      entry.done ? "bg-clinical-gold" : "bg-muted"
                    }`}
                  />
                  {idx < timelineEntries.length - 1 && (
                    <div className={`w-0.5 flex-1 mt-1 min-h-[18px] ${entry.done ? "bg-clinical-gold/40" : "bg-muted"}`} />
                  )}
                </div>
                <div className="pb-2">
                  <p className={`text-sm ${entry.done ? "text-white font-medium" : "text-clinical-zinc"}`}>
                    {entry.label}
                  </p>
                  <p className="text-[10px] text-clinical-zinc tabular-nums">
                    {entry.done ? "Completed at" : "Expected at"} {entry.stamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Order items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-clinical-gold" />
            Order Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {order.items.map((item) => (
            <div key={item.lineId} className="flex items-center gap-3 text-xs">
              <img src={item.image} alt={item.name} className="w-10 h-10 rounded object-cover border border-clinical-slate/20" />
              <div className="flex-1 min-w-0">
                <p className="text-white truncate">{item.name}</p>
                <p className="text-[10px] text-clinical-zinc">Qty: {item.quantity}</p>
                {item.customizations.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.customizations.map((c) => (
                      <span key={c} className="text-[9px] px-1 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span className="tabular-nums text-clinical-gold font-medium">
                {formatPrice(item.unitPrice * item.quantity)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dev panel — gated behind ?dev=1, advances LOCAL order state only */}
      {showDevPanel && (
        <Card className="border-dashed border-orange-400/40 bg-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2 text-orange-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              Developer Controls
              <Badge variant="outline" className="ml-auto text-[9px] border-orange-400/40 text-orange-300">?dev=1</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(["preparing", "ready", "out_for_delivery", "delivered"] as PastOrder["status"][]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  onClick={() => advanceTo(s)}
                  className="text-xs border-orange-400/30 text-orange-200 hover:bg-orange-500/10"
                >
                  Set: {s.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
