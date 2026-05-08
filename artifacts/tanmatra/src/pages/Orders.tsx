import { Link, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useOrders, formatRelativeTime, type PastOrder } from "@/lib/ordersContext";
import { useCart } from "@/lib/cartContext";
import { formatPrice } from "@/lib/api/adapter";
import {
  ClipboardList,
  Package,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Phone,
  MapPin,
  CheckCircle2,
} from "lucide-react";

const STATUS_BADGE: Record<PastOrder["status"], { label: string; className: string }> = {
  placed: { label: "Placed", className: "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/40" },
  preparing: { label: "Preparing", className: "bg-orange-500/15 text-orange-300 border-orange-500/40" },
  ready: { label: "Ready", className: "bg-orange-500/15 text-orange-300 border-orange-500/40" },
  out_for_delivery: { label: "Out for Delivery", className: "bg-clinical-blue/15 text-clinical-blue border-clinical-blue/40" },
  delivered: { label: "Delivered", className: "bg-green-500/15 text-green-400 border-green-500/40" },
  cancelled: { label: "Cancelled", className: "bg-red-500/15 text-red-400 border-red-500/40" },
};

export default function Orders() {
  const navigate = useNavigate();
  const { orders } = useOrders();
  const { addItem } = useCart();
  const [disputeFor, setDisputeFor] = useState<PastOrder | null>(null);
  const [disputeText, setDisputeText] = useState("");

  if (orders.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <Package className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">No orders yet</h1>
        <p className="text-sm text-clinical-zinc">
          Place your first clinical-grade meal and it will appear here.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link to="/menu">
            <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
              Browse Menu
            </Button>
          </Link>
          <Link to="/preferences">
            <Button
              variant="outline"
              className="border-clinical-slate/40 text-clinical-zinc hover:text-white"
            >
              Set preferences first
            </Button>
          </Link>
        </div>
        <p className="text-[11px] text-clinical-zinc pt-2">
          New here? Browse the menu, add to your Nutrition Plan, then check out — orders track in real time and earn loyalty credits.
        </p>
      </div>
    );
  }

  const handleReorder = (order: PastOrder) => {
    order.items.forEach((item) => {
      addItem({
        dishId: item.dishId,
        slug: item.slug,
        name: item.name,
        image: item.image,
        basePrice: item.basePrice,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        kitchen: item.kitchen,
        isVeg: item.isVeg,
        rdVerified: item.rdVerified,
        macros: item.macros,
        customizations: item.customizations,
      });
    });
    toast.success("Items added to your Nutrition Plan", {
      description: `${order.items.length} item${order.items.length === 1 ? "" : "s"} from ${order.orderId}`,
      action: { label: "View Plan", onClick: () => navigate("/cart") },
    });
  };

  const submitDispute = () => {
    if (!disputeFor || !disputeText.trim()) return;
    toast.success(`Dispute raised for ${disputeFor.orderId}`, {
      description: "Our care team will reach out within 30 minutes.",
    });
    setDisputeFor(null);
    setDisputeText("");
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-5 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white">Your Orders</h1>
        <p className="text-xs text-clinical-zinc">
          {orders.length} past order{orders.length === 1 ? "" : "s"} · Tap any order to track or reorder
        </p>
      </div>

      <div className="space-y-3">
        {orders.map((order) => {
          const badge = STATUS_BADGE[order.status];
          return (
            <Card key={order.orderId} className="bg-clinical-surface border-clinical-slate/20">
              <CardContent className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <p className="font-mono text-xs text-clinical-gold">{order.orderId}</p>
                    <p className="text-[10px] text-clinical-zinc">
                      Placed {formatRelativeTime(order.placedAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                    {badge.label}
                  </Badge>
                </div>

                {/* Item thumbnails */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {order.items.map((item) => (
                    <div key={item.lineId} className="shrink-0 w-14 text-center space-y-1">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-14 h-14 rounded-md object-cover border border-clinical-slate/20"
                      />
                      <p className="text-[9px] text-clinical-zinc truncate" title={item.name}>
                        ×{item.quantity}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Item details (collapsed list with customizations) */}
                <details className="group">
                  <summary className="cursor-pointer text-[10px] text-clinical-zinc flex items-center gap-1 hover:text-clinical-gold list-none">
                    <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                    View items & customizations
                  </summary>
                  <div className="mt-2 space-y-2 pl-4 border-l border-clinical-slate/20">
                    {order.items.map((item) => (
                      <div key={item.lineId} className="text-xs space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-white">
                            {item.name} · ×{item.quantity}
                          </span>
                          <span className="tabular-nums text-clinical-zinc">
                            {formatPrice(item.unitPrice * item.quantity)}
                          </span>
                        </div>
                        {item.customizations.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.customizations.map((c) => (
                              <span key={c} className="text-[9px] px-1 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>

                {/* Address */}
                <div className="text-[10px] text-clinical-zinc space-y-0.5">
                  <p className="flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" /> {order.address.label} · {order.address.city}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3" /> {order.address.phone}
                  </p>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-1 border-t border-clinical-slate/15">
                  <span className="text-xs text-clinical-zinc">Total paid</span>
                  <span className="tabular-nums text-sm font-bold text-clinical-gold">
                    {formatPrice(order.total)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {order.status !== "delivered" && order.status !== "cancelled" && (
                    <Link to={`/track?orderId=${encodeURIComponent(order.orderId)}`} className="flex-1 min-w-[120px]">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 gap-1.5 text-xs"
                      >
                        <Package className="w-3.5 h-3.5" />
                        Track Order
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReorder(order)}
                    className="flex-1 min-w-[120px] border-clinical-slate/30 text-clinical-zinc hover:text-clinical-gold gap-1.5 text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reorder
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDisputeFor(order)}
                    className="text-clinical-zinc hover:text-red-400 gap-1.5 text-xs"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Report a problem
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dispute dialog */}
      <Dialog open={disputeFor !== null} onOpenChange={(open) => !open && setDisputeFor(null)}>
        <DialogContent
          className="bg-clinical-surface border-clinical-slate/30"
          aria-describedby="dispute-desc"
        >
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              Report a problem
            </DialogTitle>
            <DialogDescription id="dispute-desc" className="text-clinical-zinc">
              Tell us what went wrong with order{" "}
              <span className="font-mono text-clinical-gold">{disputeFor?.orderId}</span>. Our care team responds
              within 30 minutes during operating hours.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-describedby="dispute-desc"
            placeholder="e.g., Wrong dish delivered, food was cold, missing item, allergen concern…"
            value={disputeText}
            onChange={(e) => setDisputeText(e.target.value)}
            className="min-h-[120px] bg-clinical-dark border-clinical-slate/30 text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDisputeFor(null)}
              className="border-clinical-slate/30 text-clinical-zinc"
            >
              Cancel
            </Button>
            <Button
              onClick={submitDispute}
              disabled={!disputeText.trim()}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
