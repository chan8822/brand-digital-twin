import { Link, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import MacroOverlay from "@/components/dish/MacroOverlay";
import {
  Trash2,
  Minus,
  Plus,
  ClipboardList,
  ShoppingBag,
  ArrowRight,
  MapPin,
  Utensils,
} from "lucide-react";
import { formatPrice } from "@/lib/api/adapter";
import { useCart, FREE_DELIVERY_THRESHOLD, DELIVERY_FEE } from "@/lib/cartContext";
import { groupOrdersApi } from "@/lib/queries";
import { Users } from "lucide-react";
import { useState } from "react";
import { usePreferences } from "@/lib/preferencesContext";
import {
  evaluateDishForPreferences,
  findSmartSwap,
} from "@/lib/preferencesMatch";
import { getDishById, useMenuCatalog } from "@/lib/menuData";
import { ShieldAlert, Sparkles, AlertCircle, Clock } from "lucide-react";
import { fulfillmentApi, type DeliverySlotOption } from "@/lib/fulfillmentApi";
import { useEffect } from "react";

export default function Cart() {
  const navigate = useNavigate();
  const { items, updateQty, removeItem, subtotal, totalQuantity } = useCart();
  const { preferences } = usePreferences();
  // Hydrate the runtime menu cache so getDishById reflects CMS edits.
  useMenuCatalog();

  // Surface the next-available delivery slot in the cart so users see the
  // fulfillment commitment BEFORE checkout instead of discovering it at
  // payment time. Per UX audit Journey-B finding 1.
  const [nextSlot, setNextSlot] = useState<DeliverySlotOption | null>(null);
  useEffect(() => {
    let alive = true;
    void fulfillmentApi
      .listSlots()
      .then((r) => {
        if (!alive) return;
        const candidate =
          r.slots
            .filter((s) => !s.full)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null;
        setNextSlot(candidate);
      })
      .catch(() => {
        /* slot info is best-effort; cart still works */
      });
    return () => {
      alive = false;
    };
  }, []);

  const conflictMap = (() => {
    const out = new Map<
      string,
      {
        warnings: string[];
        blocked: boolean;
        matchedAllergens: string[];
        swapSlug: string | null;
        swapName: string | null;
      }
    >();
    if (!preferences) return out;
    for (const item of items) {
      const dish = getDishById(item.dishId);
      if (!dish) continue;
      const m = evaluateDishForPreferences(dish, preferences);
      if (m.warnings.length === 0 && !m.blocked) continue;
      const swap = findSmartSwap(dish, preferences);
      out.set(item.lineId, {
        warnings: m.warnings,
        blocked: m.blocked,
        matchedAllergens: m.matchedAllergens,
        swapSlug: swap?.slug ?? null,
        swapName: swap?.name ?? null,
      });
    }
    return out;
  })();
  const conflictCount = conflictMap.size;
  const allergenCount = Array.from(conflictMap.values()).filter(
    (c) => c.matchedAllergens.length > 0,
  ).length;

  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const total = subtotal + deliveryFee;
  const amountToFreeDelivery = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);
  const freeDeliveryProgress = Math.min(100, (subtotal / FREE_DELIVERY_THRESHOLD) * 100);

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-clinical-surface border border-clinical-slate/20 flex items-center justify-center mx-auto">
          <ShoppingBag className="w-7 h-7 text-clinical-zinc" />
        </div>
        <div className="space-y-2">
          <h1 className="text-clinical-h2 text-white">Your cart is empty</h1>
          <p className="text-sm text-clinical-zinc">
            Browse the menu to start an instant order. Looking for a recurring
            7-day meal plan instead? Try the{" "}
            <Link
              to="/meal-planner"
              className="text-clinical-gold underline underline-offset-2"
            >
              Weekly Planner
            </Link>
            .
          </p>
        </div>
        <Link to="/menu">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2 h-11 px-6 shadow-clinical">
            <Utensils className="w-4 h-4" />
            Browse Menu
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 pb-40 lg:pb-4 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-clinical-h2 text-white">Your Order</h1>
            <p className="text-xs text-clinical-zinc mt-1">
              {totalQuantity} item{totalQuantity === 1 ? "" : "s"} · Clinical-grade precision meals
            </p>
          </div>
          <Link to="/menu" className="text-xs text-clinical-gold hover:underline flex items-center gap-1">
            <Utensils className="w-3 h-3" /> Add more
          </Link>
        </div>

        {conflictCount > 0 && (
          <Card className={
            allergenCount > 0
              ? "bg-red-500/10 border-red-500/40"
              : "bg-orange-500/5 border-orange-500/30"
          }>
            <CardContent className={`p-3 text-xs flex items-start gap-2 ${
              allergenCount > 0 ? "text-red-300" : "text-orange-400"
            }`}>
              {allergenCount > 0 ? (
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              )}
              <span>
                {allergenCount > 0 && (
                  <strong className="block uppercase tracking-wider text-[10px] text-red-300 mb-0.5">
                    Allergen warning
                  </strong>
                )}
                {allergenCount > 0
                  ? `${allergenCount} item${allergenCount === 1 ? "" : "s"} contain${allergenCount === 1 ? "s" : ""} ingredients flagged in your `
                  : `${conflictCount} item${conflictCount === 1 ? "" : "s"} in your cart conflict with your `}
                <Link
                  to="/preferences"
                  className="underline underline-offset-2 hover:text-white"
                >
                  {allergenCount > 0 ? "allergen profile" : "preferences"}
                </Link>
                . {allergenCount > 0 ? "Review carefully before checkout." : "Smart Swap suggestions are shown below."}
              </span>
            </CardContent>
          </Card>
        )}

        {/* Free delivery progress */}
        {amountToFreeDelivery > 0 ? (
          <Card className="bg-clinical-gold/5 border-clinical-gold/20">
            <CardContent className="p-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-clinical-gold font-medium">
                  Add {formatPrice(amountToFreeDelivery)} more for FREE delivery
                </span>
                <Link to="/menu" className="text-clinical-gold hover:underline">
                  Browse →
                </Link>
              </div>
              <Progress value={freeDeliveryProgress} className="h-1.5" />
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-clinical-sage/10 border-clinical-sage/30">
            <CardContent className="p-3 text-xs text-clinical-sage flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5" />
              You've unlocked FREE delivery on this order.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.lineId} className="bg-clinical-surface border-clinical-slate/20 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex gap-4">
                  <Link to={`/dish/${item.slug}`} className="shrink-0 w-28 h-28 sm:w-32 sm:h-32">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </Link>

                  <div className="flex-1 py-3 pr-4 space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/dish/${item.slug}`}>
                          <h3 className="text-sm font-semibold text-white hover:text-clinical-gold transition-colors truncate flex items-center gap-2">
                            <span
                              className={`inline-flex items-center justify-center w-3 h-3 rounded-sm border ${
                                item.isVeg ? "border-green-500" : "border-red-500"
                              }`}
                              aria-label={item.isVeg ? "Vegetarian" : "Non-vegetarian"}
                            >
                              <span
                                className={`w-1 h-1 rounded-full ${
                                  item.isVeg ? "bg-green-500" : "bg-red-500"
                                }`}
                              />
                            </span>
                            {item.name}
                          </h3>
                        </Link>
                        <p className="text-[10px] text-clinical-zinc capitalize mt-0.5">{item.kitchen}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 sm:h-7 sm:w-7 text-clinical-zinc hover:text-red-400 shrink-0"
                        onClick={() => {
                          removeItem(item.lineId);
                          toast.success("Item removed from your order");
                        }}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      </Button>
                    </div>

                    {item.customizations.length > 0 && (
                      <div
                        className="flex flex-wrap gap-1"
                        title="Premium-only customizations"
                      >
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-clinical-gold/15 text-clinical-gold uppercase tracking-wide">
                          Premium
                        </span>
                        {item.customizations.map((c) => (
                          <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-end justify-between gap-3">
                      <MacroOverlay macros={item.macros} rdVerified={item.rdVerified} compact />

                      <div className="flex items-center gap-1 shrink-0 rounded-md border border-clinical-slate/30 bg-clinical-dark/40">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 sm:h-8 sm:w-8 text-clinical-zinc rounded-r-none"
                          onClick={() => updateQty(item.lineId, -1)}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4 sm:w-3 sm:h-3" />
                        </Button>
                        <span className="tabular-nums text-sm font-semibold text-white w-6 text-center">
                          {item.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 sm:h-8 sm:w-8 text-clinical-zinc rounded-l-none"
                          onClick={() => updateQty(item.lineId, 1)}
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4 sm:w-3 sm:h-3" />
                        </Button>
                      </div>
                    </div>

                    <p className="tabular-nums text-sm font-bold text-clinical-gold text-right">
                      {formatPrice(item.unitPrice * item.quantity)}
                    </p>

                    {conflictMap.get(item.lineId) && (() => {
                      const c = conflictMap.get(item.lineId)!;
                      const hasAllergen = c.matchedAllergens.length > 0;
                      // Allergen mismatches get a louder treatment than
                      // preference warnings — different border/icon/badge —
                      // so users can't miss a clinically-significant flag
                      // among generic "this is high-spice" notes.
                      return (
                      <div className={`mt-2 rounded-lg border p-2.5 space-y-2 ${
                        hasAllergen
                          ? "border-red-500/50 bg-red-500/10"
                          : "border-orange-500/30 bg-orange-500/5"
                      }`}>
                        {hasAllergen && (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
                              <AlertCircle className="w-2.5 h-2.5" aria-hidden="true" />
                              Allergen
                            </span>
                            <span className="text-[11px] text-red-300 font-semibold">
                              Contains {c.matchedAllergens.join(", ")}
                            </span>
                          </div>
                        )}
                        {c.warnings
                          .filter((w) => !hasAllergen || !w.toLowerCase().includes("allergens"))
                          .map((w, i) => (
                            <div
                              key={i}
                              className={`flex items-start gap-1.5 text-[11px] ${
                                hasAllergen ? "text-red-200" : "text-orange-400"
                              }`}
                            >
                              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span className="leading-tight">{w}</span>
                            </div>
                          ))}
                        {c.swapSlug && (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="flex items-center gap-1 text-clinical-gold">
                              <Sparkles className="w-3 h-3" />
                              Smart swap:{" "}
                              <span className="text-white">{c.swapName}</span>
                            </span>
                            <Link
                              to={`/dish/${c.swapSlug}`}
                              className="min-h-9 inline-flex items-center text-clinical-gold hover:underline shrink-0"
                            >
                              View →
                            </Link>
                          </div>
                        )}
                      </div>
                      );
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="space-y-4 hidden lg:block">
        <Card className="bg-clinical-surface border-clinical-slate/20 sticky top-20">
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-clinical-gold" />
              Order Summary
            </h2>

            <div className="space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-clinical-zinc">Subtotal ({totalQuantity} items)</span>
                <span className="tabular-nums text-white font-medium">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-clinical-zinc flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Delivery
                </span>
                <span className={deliveryFee === 0 ? "text-clinical-sage" : "tabular-nums text-white"}>
                  {deliveryFee === 0 ? "FREE" : formatPrice(deliveryFee)}
                </span>
              </div>
              {deliveryFee === 0 && (
                <p className="text-[10px] text-clinical-sage">Free delivery on orders above Rs.500</p>
              )}
            </div>

            <Separator className="bg-clinical-slate/20" />

            <div className="flex justify-between">
              <span className="text-sm font-semibold text-white">Total</span>
              <span className="tabular-nums text-lg font-bold text-clinical-gold">{formatPrice(total)}</span>
            </div>

            {nextSlot && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-clinical-slate/30 bg-clinical-surface-elevated/50 px-3 py-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-clinical-zinc min-w-0">
                  <Clock className="w-3 h-3 text-clinical-gold shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    Next slot:{" "}
                    <span className="text-white font-medium">
                      {new Date(nextSlot.startsAt).toLocaleString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </div>
                <span className="text-clinical-zinc/70 shrink-0">Change at checkout</span>
              </div>
            )}

            <Button
              onClick={() => navigate("/checkout")}
              className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 shadow-clinical gap-2"
            >
              Proceed to Checkout
              <ArrowRight className="w-4 h-4" />
            </Button>

            <StartGroupOrderButton />

            <Link
              to="/subscriptions"
              className="block text-center text-[11px] text-clinical-gold hover:underline pt-1"
            >
              Subscribe to weekly delivery — save 10% →
            </Link>

            <p className="text-[10px] text-clinical-zinc text-center">
              Secured by Razorpay · SSL encrypted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Mobile sticky bottom action bar (sits above the bottom nav) */}
      <div
        className="lg:hidden fixed left-0 right-0 z-30 px-3 pb-2 pointer-events-none"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto rounded-xl border border-clinical-slate/40 bg-clinical-surface/95 backdrop-blur-xl shadow-2xl p-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-clinical-zinc leading-none">
              {totalQuantity} item{totalQuantity === 1 ? "" : "s"} · {deliveryFee === 0 ? "FREE delivery" : `+ ${formatPrice(deliveryFee)} delivery`}
            </p>
            <p className="tabular-nums text-lg font-bold text-clinical-gold leading-tight mt-0.5">
              {formatPrice(total)}
            </p>
          </div>
          <Button
            onClick={() => navigate("/checkout")}
            className="h-12 px-5 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2 shrink-0"
          >
            Checkout
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StartGroupOrderButton() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await groupOrdersApi.create();
      const code = r.group.code;
      toast.success(`Group order ${code} created`, {
        description: "Share the code with friends",
      });
      navigate(`/group/${code}`);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("401")) {
        toast.error("Sign in to start a group order", {
          action: {
            label: "Sign in",
            onClick: () => navigate("/login?next=/cart"),
          },
        });
      } else {
        toast.error("Could not start a group order — please try again");
      }
      setBusy(false);
    }
  };
  return (
    <Button
      onClick={start}
      disabled={busy}
      variant="outline"
      className="w-full border-clinical-gold/40 text-clinical-gold hover:bg-clinical-gold/10 gap-2 h-10"
    >
      <Users className="w-4 h-4" />
      {busy ? "Starting…" : "Start a Group Order"}
    </Button>
  );
}
