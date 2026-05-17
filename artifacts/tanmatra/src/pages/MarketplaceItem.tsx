import { useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  ChevronLeft,
  Truck,
  Package,
  Plus,
  Minus,
  ShoppingBag,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { marketplaceApi, marketplaceCheckoutIdempotencyKey } from "@/lib/marketplaceApi";
import { formatPrice } from "@/lib/api/adapter";
import { useOrders } from "@/lib/ordersContext";

export default function MarketplaceItemPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { orders } = useOrders();
  const [qty, setQty] = useState(1);
  const [deliveryMode, setDeliveryMode] = useState<"ship" | "bundle_with_meal">(
    "ship",
  );
  const [bundleOrderId, setBundleOrderId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Holds the Idempotency-Key for the in-flight submit attempt. We
  // mint on first click and reuse the same key on any subsequent
  // click made before a terminal result (so a user-driven retry
  // after a timeout still hits the server's replay cache and does
  // NOT create a second order). Cleared on success so the next
  // distinct purchase intent gets its own key.
  const idempotencyRef = useRef<string | null>(null);

  const q = useQuery({
    queryKey: ["marketplace", "item", slug],
    queryFn: () => marketplaceApi.getItem(slug!),
    enabled: !!slug,
  });

  if (q.isLoading)
    return (
      <p className="max-w-3xl mx-auto p-6 text-sm text-clinical-zinc">
        Loading…
      </p>
    );
  const item = q.data?.item;
  if (!item) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3">
        <p className="text-sm text-clinical-zinc">Item not found.</p>
        <Button asChild variant="outline">
          <Link to="/marketplace">Back to marketplace</Link>
        </Button>
      </div>
    );
  }

  const recentOrders = orders
    .filter((o) => o.serverOrderId)
    .slice(0, 5);

  const handleCheckout = async () => {
    if (qty < 1) return;
    setSubmitting(true);
    try {
      if (!idempotencyRef.current) {
        idempotencyRef.current = marketplaceCheckoutIdempotencyKey();
      }
      const r = await marketplaceApi.checkout({
        idempotencyKey: idempotencyRef.current,
        items: [{ itemId: item.id, qty }],
        deliveryMode,
        bundleWithOrderId:
          deliveryMode === "bundle_with_meal" ? bundleOrderId : null,
      });
      // Terminal success — next "Buy" click is a new intent.
      idempotencyRef.current = null;
      toast.success(
        deliveryMode === "ship"
          ? "Order placed — ships in 24h"
          : "Bundled with your next meal delivery",
        {
          action: { label: "View Orders", onClick: () => navigate("/orders") },
        },
      );
      navigate(`/marketplace?ordered=${r.order.id}`);
    } catch (e) {
      const msg = String((e as Error).message);
      if (msg.includes("401")) {
        toast.error("Sign in to place a marketplace order", {
          action: {
            label: "Sign in",
            onClick: () =>
              navigate(
                `/login?next=${encodeURIComponent(window.location.pathname)}`,
              ),
          },
        });
      } else if (msg.includes("out of stock")) {
        toast.error("This item is now out of stock");
      } else {
        toast.error("Could not place order — please try again");
      }
      // 4xx-style failures (auth, out of stock, validation) need a
      // fresh key on the next click because the user will edit qty
      // / delivery mode / address, changing the body. Network/5xx
      // throws have no status digits, keep the key so a retry hits
      // the server's replay cache.
      if (/\b[45]\d{2}\b/.test(msg) || msg.includes("out of stock")) {
        idempotencyRef.current = null;
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 animate-in fade-in duration-300">
      <Link
        to="/marketplace"
        className="inline-flex items-center gap-1 text-xs text-clinical-zinc hover:text-clinical-gold"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back to marketplace
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-clinical-surface border-clinical-border overflow-hidden">
          <div className="aspect-square bg-clinical-surface-elevated">
            {item.image && (
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {item.rdVerified && (
                <Badge className="bg-clinical-sage text-[#050505] border-0 text-[10px]">
                  RD-curated
                </Badge>
              )}
              {item.badges.map((b) => (
                <Badge
                  key={b}
                  variant="outline"
                  className="border-clinical-border text-clinical-zinc text-[10px]"
                >
                  {b}
                </Badge>
              ))}
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif text-white">
              {item.name}
            </h1>
            <p className="text-sm text-clinical-zinc">{item.description}</p>
            <div className="flex items-center gap-3 pt-2">
              <span className="text-2xl text-clinical-gold tabular-nums">
                {formatPrice(item.pricePaise)}
              </span>
              {item.weightLabel && (
                <span className="text-xs text-clinical-zinc">
                  · {item.weightLabel}
                </span>
              )}
              {item.supplierName && (
                <span className="text-xs text-clinical-zinc">
                  · by {item.supplierName}
                </span>
              )}
            </div>
          </div>

          <Separator className="bg-clinical-surface-elevated" />

          <div className="space-y-2">
            <Label className="text-xs text-clinical-zinc uppercase tracking-wide">
              Quantity
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-clinical-border"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease"
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <span className="text-base text-white tabular-nums w-10 text-center">
                {qty}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-clinical-border"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                aria-label="Increase"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-clinical-zinc ml-2">
                {item.stockQty} in stock
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-clinical-zinc uppercase tracking-wide">
              Delivery
            </Label>
            <RadioGroup
              value={deliveryMode}
              onValueChange={(v) => setDeliveryMode(v as typeof deliveryMode)}
              className="space-y-2"
            >
              <label className="flex items-start gap-3 p-3 rounded-lg border border-clinical-border hover:border-clinical-gold/40 cursor-pointer">
                <RadioGroupItem value="ship" className="mt-1" />
                <div className="flex-1">
                  <div className="text-sm text-white flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-clinical-gold" />
                    Ship separately
                  </div>
                  <p className="text-[11px] text-clinical-zinc mt-0.5">
                    Standalone parcel, arrives in 24–48 hours.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-clinical-border hover:border-clinical-gold/40 cursor-pointer">
                <RadioGroupItem
                  value="bundle_with_meal"
                  className="mt-1"
                  disabled={recentOrders.length === 0}
                />
                <div className="flex-1">
                  <div className="text-sm text-white flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-clinical-gold" />
                    Bundle with my next meal
                  </div>
                  <p className="text-[11px] text-clinical-zinc mt-0.5">
                    Delivered with one of your active meal orders. Saves the
                    shipping trip.
                  </p>
                  {deliveryMode === "bundle_with_meal" &&
                    recentOrders.length > 0 && (
                      <select
                        className="mt-2 w-full bg-[#0b0b0b] border border-clinical-border rounded px-2 py-1.5 text-xs text-white"
                        value={bundleOrderId ?? ""}
                        onChange={(e) =>
                          setBundleOrderId(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      >
                        <option value="">Choose an order…</option>
                        {recentOrders.map((o) => (
                          <option key={o.serverOrderId} value={o.serverOrderId!}>
                            #{o.orderId} —{" "}
                            {new Date(o.placedAt).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    )}
                </div>
              </label>
            </RadioGroup>
          </div>

          <Button
            className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
            onClick={handleCheckout}
            disabled={
              submitting ||
              (deliveryMode === "bundle_with_meal" && !bundleOrderId)
            }
          >
            <ShoppingBag className="w-4 h-4 mr-2" />
            {submitting
              ? "Placing order…"
              : `Place order · ${formatPrice(item.pricePaise * qty)}`}
          </Button>

          <Card className="bg-clinical-surface/60 border-clinical-border">
            <CardContent className="p-3 flex items-start gap-2 text-[11px] text-clinical-zinc">
              <ShieldCheck className="w-3.5 h-3.5 text-clinical-sage shrink-0 mt-0.5" />
              7-day return on unopened items. Sealed supplements are
              non-returnable for safety.
            </CardContent>
          </Card>
        </div>
      </div>

      {item.longDescription && (
        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-5 space-y-2">
            <h2 className="text-sm font-semibold text-white">Details</h2>
            <p className="text-[12px] text-clinical-zinc leading-relaxed whitespace-pre-line">
              {item.longDescription}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
