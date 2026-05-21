import type { MetaFunction } from "react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

export const meta: MetaFunction = () => [
  { title: "Track Order | Tanmatra" },
  { name: "robots", content: "noindex, nofollow" },
];
import { Link, useSearchParams, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useDeliveryTimeline, useRecordDeliveryEvent } from "@/lib/queries";
import { useOrders } from "@/lib/ordersContext";
import { getSocket } from "@/lib/socket";
import { API_BASE } from "@/lib/apiBase";
import { ClinicalLifecycleStepper } from "@/components/track/ClinicalLifecycleStepper";
import { StatCancelButton } from "@/components/track/StatCancelButton";
import { useSocketStatus } from "@/lib/useSocketStatus";
import { wellnessApi } from "@/lib/wellnessApi";
import { isCancellable } from "@/lib/clinicalLifecycle";
// RiderMap pulls in leaflet + react-leaflet (~150kB gzip). Only the live
// tracking screen needs it, so split it out of the customer entry chunk.
const RiderMap = lazy(() => import("@/components/track/RiderMap"));
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatPrice } from "@/lib/api/adapter";
import {
  Clock,
  Bike,
  Phone,
  Package,
  ChefHat,
  User,
  Navigation,
  MapPin,
  AlertTriangle,
  ClipboardList,
  Leaf,
  NotebookPen,
  Store,
  CalendarClock,
  ArrowLeft,
  LifeBuoy,
} from "lucide-react";
import { fulfillmentApi, type PackagingReturnRow } from "@/lib/fulfillmentApi";
import SupportTicketDialog from "@/components/track/SupportTicketDialog";

const EVENT_LABELS: Record<string, string> = {
  rider_assigned: "Rider assigned",
  rider_en_route_to_kitchen: "Rider heading to kitchen",
  rider_at_kitchen: "Rider at kitchen",
  order_picked_up: "Order picked up",
  rider_en_route_to_customer: "Rider heading to you",
  rider_at_customer: "Rider at your location",
  delivered: "Delivered",
  delivery_failed: "Delivery failed",
};

function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function PackagingReturnCard({
  orderServerId,
  delivered,
}: {
  orderServerId: number | undefined;
  delivered: boolean;
}) {
  const [row, setRow] = useState<PackagingReturnRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orderServerId) return;
    let alive = true;
    fulfillmentApi
      .listPackagingReturns()
      .then((r) => {
        if (!alive) return;
        const match = r.returns.find((x) => x.orderId === orderServerId) ?? null;
        setRow(match);
      })
      .catch(() => setRow(null));
    return () => {
      alive = false;
    };
  }, [orderServerId]);

  const status = row?.status ?? "opted_in";
  const credit = row?.creditPaise ?? 2000;

  async function confirmReturn() {
    if (!orderServerId || busy) return;
    setBusy(true);
    try {
      const r = await fulfillmentApi.confirmPackagingReturn(orderServerId);
      setRow(r.packagingReturn);
      toast.success(
        r.alreadyCredited
          ? "Container return already credited"
          : `₹${(credit / 100).toFixed(0)} credit added — thanks for returning!`,
      );
    } catch {
      toast.error("Could not confirm return — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-l-4 border-l-clinical-sage">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Leaf className="w-4 h-4 text-clinical-sage" />
          Reusable Eco Packaging
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {status === "credited" ? (
          <p className="text-clinical-sage">
            ₹{(credit / 100).toFixed(0)} credit applied to your account. Thanks for closing the loop.
          </p>
        ) : status === "returned" ? (
          <p className="text-clinical-sage">
            Return logged — credit will appear shortly.
          </p>
        ) : (
          <>
            <p className="text-clinical-zinc">
              Hand the clean container back to the rider on your next order, or drop it at a partner pickup point. We'll add ₹{(credit / 100).toFixed(0)} to your wallet.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={!delivered || busy || !orderServerId}
              onClick={confirmReturn}
              className="border-clinical-sage/40 text-clinical-sage hover:bg-clinical-sage/10"
            >
              {delivered ? "I've returned the container" : "Available after delivery"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Track() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get("orderId") ?? undefined;
  const showDevPanel = searchParams.get("dev") === "1";

  const { orders, latest, getOrder, updateStatus } = useOrders();
  const order = orderIdParam ? getOrder(orderIdParam) : latest();
  const { connected: socketConnected } = useSocketStatus();

  const [hasAutologged, setHasAutologged] = useState(false);

  // Zero-Friction Autologging hook: automatically log macros when order status transitions to delivered
  useEffect(() => {
    if (!order || order.status !== "delivered" || hasAutologged) return;
    
    const logOrderMacros = async () => {
      try {
        // Sum up macros across all items in the order
        const totals = order.items.reduce(
          (acc, it) => {
            const qty = it.quantity ?? 1;
            const m = it.macros ?? { protein: 0, carbs: 0, fat: 0, fiber: 0, calories: 0 };
            return {
              calories: acc.calories + (m.calories ?? 0) * qty,
              proteinGrams: acc.proteinGrams + (m.protein ?? 0) * qty,
              carbsGrams: acc.carbsGrams + (m.carbs ?? 0) * qty,
              fatGrams: acc.fatGrams + (m.fat ?? 0) * qty,
              fiberGrams: acc.fiberGrams + (m.fiber ?? 0) * qty,
              vegServings: acc.vegServings + (m.vegServings ?? 0) * qty,
            };
          },
          { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fiberGrams: 0, vegServings: 0 }
        );

        if (totals.calories === 0) return; // No macros to log

        await wellnessApi.log({
          label: `Tanmatra Order: ${order.orderId}`,
          ...totals,
        });

        setHasAutologged(true);
        toast.success("🎉 Order delivered & automatically logged!", {
          description: `Added +${Math.round(totals.proteinGrams)}g Protein & +${Math.round(totals.calories)} kcal to your Wellness tracker!`,
          action: { label: "View Dashboard", onClick: () => navigate("/wellness") },
        });
      } catch {
        // Quietly fail — don't block UI
      }
    };

    void logOrderMacros();
  }, [order, hasAutologged, navigate]);

  const numericOrderId = useMemo(() => {
    if (!order) return 0;
    const m = order.orderId.match(/(\d+)$/);
    return m ? Number(m[1]) : 1;
  }, [order]);

  const { data: timeline, isLoading } = useDeliveryTimeline(numericOrderId || 0);
  const recordEvent = useRecordDeliveryEvent();
  const qc = useQueryClient();
  const [supportOpen, setSupportOpen] = useState(false);

  // Dynamic ETA pulled from the server model. Falls back to the static
  // etaAt stored on the order if the request fails or the model is disabled.
  const [dynamicEta, setDynamicEta] = useState<{
    etaAt: string;
    source: "model" | "static";
    dropLat?: number | null;
    dropLng?: number | null;
  } | null>(null);
  useEffect(() => {
    if (!numericOrderId || !order) return;
    if (order.status === "delivered" || order.status === "cancelled") return;
    let cancelled = false;
    const fetchEta = async () => {
      try {
        const base = API_BASE;
        const r = await fetch(`${base}/delivery/eta/${numericOrderId}`, {
          credentials: "include",
        });
        if (!r.ok) return;
        const data = (await r.json()) as {
          etaAt: string;
          source: "model" | "static";
          dropLat?: number | null;
          dropLng?: number | null;
        };
        if (!cancelled && data?.etaAt) setDynamicEta(data);
      } catch {
        /* keep static */
      }
    };
    void fetchEta();
    const id = window.setInterval(fetchEta, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [numericOrderId, order]);

  const displayEtaAt = dynamicEta?.etaAt ?? order?.etaAt;

  // Subscribe to live delivery events for this order; invalidate the timeline cache
  // on any push from the server (replaces the previous polling interval).
  useEffect(() => {
    if (!numericOrderId) return;
    const socket = getSocket();
    socket.emit("subscribe:order", numericOrderId);
    const onEvent = () => {
      qc.invalidateQueries({ queryKey: ["delivery", "timeline", numericOrderId] });
    };
    socket.on("delivery:event", onEvent);
    return () => {
      socket.off("delivery:event", onEvent);
      socket.emit("unsubscribe:order", numericOrderId);
    };
  }, [numericOrderId, qc]);

  // Once the order is ready, ask the server to auto-assign a rider. That kicks off the
  // server-side rider simulator which begins streaming live position + ETA updates over
  // the websocket. Idempotent on the server (the rider is only assigned if there isn't one).
  useEffect(() => {
    if (!numericOrderId) return;
    if (order?.status !== "ready" && order?.status !== "out_for_delivery") return;
    const base = API_BASE;
    void fetch(`${base}/delivery/auto-assign`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: numericOrderId }),
    }).catch(() => {
      /* no riders available or already assigned — fine */
    });
  }, [order?.status, numericOrderId]);

  // Auto-advance "placed" → "preparing" via the server-side BullMQ pipeline (falls back to a
  // local optimistic update if the queue isn't accepting jobs — e.g. REDIS_URL unset).
  useEffect(() => {
    if (!order || order.status !== "placed" || !numericOrderId) return;
    let cancelled = false;
    void (async () => {
      try {
        const base = API_BASE;
        const r = await fetch(`${base}/delivery/schedule-advance`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: numericOrderId, step: "preparing", delayMs: 6000 }),
        });
        if (!r.ok && !cancelled) {
          // Optimistic local fallback so the user still sees progress in dev.
          setTimeout(() => !cancelled && updateStatus(order.orderId, "preparing"), 6000);
        }
      } catch {
        setTimeout(() => !cancelled && updateStatus(order.orderId, "preparing"), 6000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order, updateStatus, numericOrderId]);

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

  const handleEvent = (event: string) => {
    recordEvent.mutate(
      { orderId: numericOrderId, riderId: 1, event },
      {
        onSuccess: () => {
          toast.info(EVENT_LABELS[event] ?? event);
          if (event === "delivered") updateStatus(order.orderId, "delivered");
          else if (event === "order_picked_up") updateStatus(order.orderId, "out_for_delivery");
          else if (event === "rider_at_kitchen") updateStatus(order.orderId, "ready");
        },
      },
    );
  };

  const showRiderCard =
    order.status === "ready" || order.status === "out_for_delivery" || order.status === "delivered";

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5 animate-in fade-in duration-150">
      {/* Order header — IDs and times */}
      <div className="space-y-2">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-xs text-clinical-zinc hover:text-clinical-gold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to orders
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Track Order</h1>
            <p className="font-mono text-xs text-clinical-gold mt-1">{order.orderId}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isCancellable(order.status) && (
              <StatCancelButton
                orderId={order.orderId}
                patientName={order.patientName}
                size="sm"
              />
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSupportOpen(true)}
              className="gap-1.5 border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              Need help with this order?
            </Button>
          </div>
        </div>

        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-clinical-zinc text-[10px] uppercase tracking-wide">Submitted</p>
              <p className="text-white tabular-nums font-medium">{formatAbsoluteTime(order.placedAt)}</p>
            </div>
            <div>
              <p className="text-clinical-zinc text-[10px] uppercase tracking-wide">
                Arriving by
                {dynamicEta?.source === "model" ? (
                  <span className="ml-1 text-clinical-gold/80">· live</span>
                ) : null}
              </p>
              <p className="text-clinical-gold tabular-nums font-semibold">
                {formatAbsoluteTime(displayEtaAt ?? order.etaAt)}
              </p>
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

      {/* Clinical lifecycle stepper */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <ClinicalLifecycleStepper order={order} socketConnected={socketConnected} />
        </CardContent>
      </Card>

      {/* Live rider map — visible once a rider is on the move. */}
      {showRiderCard && numericOrderId > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Navigation className="w-4 h-4 text-clinical-gold" />
              Live Rider Location
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <Suspense fallback={<Skeleton className="h-64 w-full rounded-md" />}>
              <RiderMap
                orderId={numericOrderId}
                destination={
                  dynamicEta?.dropLat != null && dynamicEta?.dropLng != null
                    ? {
                        lat: dynamicEta.dropLat,
                        lng: dynamicEta.dropLng,
                        label: order?.address?.label ?? "Delivery address",
                      }
                    : undefined
                }
              />
            </Suspense>
          </CardContent>
        </Card>
      )}

      {/* Rider card — only after ready */}
      {showRiderCard ? (
        <Card className="border-l-4 alert-info-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bike className="w-4 h-4 alert-info-text" />
              Delivery Partner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full alert-info-bg flex items-center justify-center clinical-decorative">
                  <User className="w-5 h-5 alert-info-text" />
                </div>
                <div>
                  <p className="font-medium text-white">
                    {order.status === "delivered" ? "Delivered by your rider" : "Rider on the way"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.status === "delivered"
                      ? `Completed at ${formatAbsoluteTime(order.etaAt)}`
                      : `Arriving by ${formatAbsoluteTime(displayEtaAt ?? order.etaAt)}`}
                  </p>
                </div>
              </div>
              {/* Rider contact — tel: + WhatsApp deep-links. Render
                  only when backend has populated rider info; otherwise
                  the button is hidden (no dead-end disabled state).
                  Indian customers expect both a phone call AND a
                  WhatsApp option for last-mile direction. */}
              {order.status !== "delivered" && order.riderPhone && (
                <div className="flex gap-1.5">
                  <a
                    href={`tel:${order.riderPhone}`}
                    className="inline-flex items-center justify-center gap-1 min-h-9 px-3 rounded-md border border-clinical-border text-xs text-clinical-zinc hover:text-white hover:border-clinical-gold/40"
                    aria-label={`Call rider${order.riderName ? " " + order.riderName : ""}`}
                  >
                    <Phone className="w-3 h-3" />
                    Call
                  </a>
                  <a
                    href={`https://wa.me/${order.riderPhone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 min-h-9 px-3 rounded-md border border-clinical-sage/40 text-xs text-clinical-sage hover:text-white hover:bg-clinical-sage/10"
                    aria-label={`WhatsApp rider${order.riderName ? " " + order.riderName : ""}`}
                  >
                    <Phone className="w-3 h-3" />
                    WhatsApp
                  </a>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-dashed border-clinical-border">
          <CardContent className="p-4 text-xs text-clinical-zinc flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-clinical-gold" />
            Kitchen is preparing your order. A rider will be assigned once it's ready.
          </CardContent>
        </Card>
      )}

      {/* Delivery address / pickup point */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {order.fulfillmentType === "pickup" ? (
              <Store className="w-4 h-4 text-clinical-gold" />
            ) : (
              <MapPin className="w-4 h-4 text-clinical-gold" />
            )}
            {order.fulfillmentType === "pickup" ? "Pickup at" : "Delivery Address"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          {order.fulfillmentType === "pickup" && order.pickupLocationName && (
            <p className="text-white font-medium">{order.pickupLocationName}</p>
          )}
          <p className="text-white font-medium">{order.address.label}</p>
          <p className="text-clinical-zinc">
            {order.address.line1}
            {order.address.line2 ? ` · ${order.address.line2}` : ""} · {order.address.city} {order.address.pincode}
          </p>
          <p className="text-clinical-zinc flex items-center gap-1.5 pt-0.5">
            <Phone className="w-3 h-3" />
            {order.fulfillmentType === "pickup"
              ? `We'll text ${order.address.phone} when it's ready`
              : `Rider will call ${order.address.phone}`}
          </p>
          {order.deliverySlotLabel && (
            <p className="text-clinical-zinc flex items-center gap-1.5 pt-0.5">
              <CalendarClock className="w-3 h-3" />
              Window: {order.deliverySlotLabel}
            </p>
          )}
          {order.deliveryInstructions && (
            <div className="mt-2 p-2 rounded-md bg-clinical-dark border border-clinical-border">
              <p className="text-[10px] text-clinical-zinc uppercase tracking-wider flex items-center gap-1">
                <NotebookPen className="w-3 h-3" /> Notes for rider
              </p>
              <p className="text-xs text-white mt-1 whitespace-pre-wrap">
                {order.deliveryInstructions}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {order.ecoPackagingOptIn && (
        <PackagingReturnCard
          orderServerId={order.serverOrderId}
          delivered={order.status === "delivered"}
        />
      )}

      {/* Timeline (server events) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Delivery Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : timeline && timeline.length > 0 ? (
            <div className="space-y-4">
              {timeline.map((event, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          event.event === "delivered"
                            ? "var(--color-alert-safe)"
                            : "var(--color-clinical-gold)",
                      }}
                    />
                    {idx < timeline.length - 1 && <div className="w-0.5 flex-1 bg-muted mt-1" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium">{EVENT_LABELS[event.event] ?? event.event}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.createdAt
                        ? new Date(event.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                        : "Just now"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Timeline events will appear here as your order progresses.
            </p>
          )}
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
              <img src={item.image} alt={item.name} className="w-10 h-10 rounded object-cover border border-clinical-border clinical-decorative" />
              <div className="flex-1 min-w-0">
                <p className="text-white truncate">{item.name}</p>
                <p className="text-[10px] text-clinical-zinc">Qty: {item.quantity}</p>
              </div>
              <span className="tabular-nums text-clinical-gold font-medium">
                {formatPrice(item.unitPrice * item.quantity)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dev panel — gated behind ?dev=1 */}
      {showDevPanel && (
        <Card className="border-dashed alert-stat-border alert-stat-bg">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2 alert-stat-text">
              <AlertTriangle className="w-3.5 h-3.5" />
              Developer Controls
              <Badge variant="outline" className="ml-auto text-[9px] alert-stat-border alert-stat-text">?dev=1</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[
                "rider_en_route_to_kitchen",
                "rider_at_kitchen",
                "order_picked_up",
                "rider_en_route_to_customer",
                "delivered",
              ].map((evt) => (
                <Button
                  key={evt}
                  size="sm"
                  variant="outline"
                  onClick={() => handleEvent(evt)}
                  disabled={recordEvent.isPending}
                  className="text-xs alert-stat-border alert-stat-text hover:alert-stat-bg"
                >
                  {EVENT_LABELS[evt]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <SupportTicketDialog
        open={supportOpen}
        onOpenChange={setSupportOpen}
        orderDisplayId={order.orderId}
        orderServerId={order.serverOrderId}
      />
    </div>
  );
}
