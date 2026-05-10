import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatPrice } from "@/lib/api/adapter";
import { useCart, FREE_DELIVERY_THRESHOLD, DELIVERY_FEE } from "@/lib/cartContext";
import { useOrders, generateOrderId } from "@/lib/ordersContext";
import { loyaltyApi } from "@/lib/loyaltyApi";
import { corporateApi, type CompanySubsidy } from "@/lib/corporateApi";
import {
  fulfillmentApi,
  type DeliverySlotOption,
  type PickupLocationOption,
} from "@/lib/fulfillmentApi";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Leaf, Store, Truck, NotebookPen, ArrowRight } from "lucide-react";
import AddOnRail from "@/components/checkout/AddOnRail";
import { addonsApi } from "@/lib/marketplaceApi";
import {
  MapPin,
  CreditCard,
  Bike,
  Plus,
  Home,
  Building2,
  ShieldCheck,
  ClipboardList,
  IndianRupee,
  Phone,
  AlertTriangle,
  CalendarClock,
  Tag,
  Building2 as Building2Icon,
  Gift,
  Ticket,
} from "lucide-react";

import { SAVED_ADDRESSES } from "@/lib/savedAddresses";

const TIP_PRESETS = [0, 2000, 5000, 10000];

export default function Checkout() {
  const navigate = useNavigate();
  const { items, bundleSlugs, subtotal, clear } = useCart();
  const { addOrder } = useOrders();
  const [selectedAddress, setSelectedAddress] = useState<string>(
    () => SAVED_ADDRESSES[0]?.id ?? "",
  );
  const [selectedAddons, setSelectedAddons] = useState<Map<number, number>>(
    new Map(),
  );
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);
  const [applyCredits, setApplyCredits] = useState(true);
  const [preorderTomorrow, setPreorderTomorrow] = useState(false);
  const [subsidy, setSubsidy] = useState<CompanySubsidy | null>(null);
  const [applySubsidy, setApplySubsidy] = useState(true);
  const [voucherCode, setVoucherCode] = useState("");
  const [redeemingVoucher, setRedeemingVoucher] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">("delivery");
  const [slots, setSlots] = useState<DeliverySlotOption[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [pickupLocations, setPickupLocations] = useState<PickupLocationOption[]>([]);
  const [selectedPickupId, setSelectedPickupId] = useState<number | null>(null);
  const [ecoPackagingOptIn, setEcoPackagingOptIn] = useState(false);
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [savedInstructions, setSavedInstructions] = useState<Record<string, string>>({});

  // Default scheduled time: tomorrow 12:30 in the user's locale.
  const tomorrowSlot = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(12, 30, 0, 0);
    return d;
  })();
  const PREORDER_BPS = 500;
  const preorderDiscount = preorderTomorrow
    ? Math.floor((subtotal * PREORDER_BPS) / 10_000)
    : 0;

  useEffect(() => {
    let alive = true;
    void fulfillmentApi
      .listSlots()
      .then((r) => {
        if (alive) setSlots(r.slots);
      })
      .catch(() => {
        if (alive) setSlots([]);
      });
    void fulfillmentApi
      .listPickupLocations()
      .then((r) => {
        if (alive) setPickupLocations(r.locations);
      })
      .catch(() => {
        if (alive) setPickupLocations([]);
      });
    void fulfillmentApi
      .listInstructions()
      .then((r) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const it of r.instructions) map[it.addressLabel] = it.instructions;
        setSavedInstructions(map);
      })
      .catch(() => {
        /* not signed in or none yet */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Hydrate the instructions field from the persisted value for the
  // currently-selected saved address.
  const activeAddrLabel = SAVED_ADDRESSES.find((a) => a.id === selectedAddress)?.label;
  useEffect(() => {
    if (!activeAddrLabel) return;
    setDeliveryInstructions(savedInstructions[activeAddrLabel] ?? "");
  }, [activeAddrLabel, savedInstructions]);

  useEffect(() => {
    let alive = true;
    loyaltyApi
      .getCreditLedger()
      .then((r) => {
        if (alive) setCreditBalance(r.balancePaise);
      })
      .catch(() => {
        if (alive) setCreditBalance(0);
      });
    return () => {
      alive = false;
    };
  }, []);

  const [newAddr, setNewAddr] = useState({ label: "", line1: "", line2: "", city: "", pincode: "", phone: "" });

  const effectiveTip = tipAmount === -1 ? Math.round((parseFloat(customTip) || 0) * 100) : tipAmount;
  const selectedPickup =
    fulfillmentType === "pickup"
      ? pickupLocations.find((p) => p.id === selectedPickupId) ?? null
      : null;
  const pickupDiscount = selectedPickup?.discountPaise ?? 0;
  // Pickup orders skip delivery fee entirely; otherwise the existing free-over-threshold rule.
  const deliveryFee =
    fulfillmentType === "pickup" ? 0 : subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const discountedSubtotal = Math.max(0, subtotal - preorderDiscount - pickupDiscount);
  const grossTotal = discountedSubtotal + deliveryFee + effectiveTip;
  // Server only redeems against the (discounted) meal subtotal; cap here too
  // so the UI total matches the server final total exactly.
  const creditApplied =
    applyCredits && creditBalance > 0
      ? Math.min(creditBalance, discountedSubtotal)
      : 0;
  const remainingAfterCredit = Math.max(0, grossTotal - creditApplied);
  const subsidyAvailable =
    applySubsidy && subsidy?.active ? Math.min(subsidy.subsidyPaise ?? 0, remainingAfterCredit) : 0;
  const razorpayTotal = Math.max(0, remainingAfterCredit - subsidyAvailable);

  useEffect(() => {
    let alive = true;
    corporateApi
      .getSubsidy(discountedSubtotal)
      .then((r) => {
        if (alive) setSubsidy(r);
      })
      .catch(() => {
        if (alive) setSubsidy(null);
      });
    return () => {
      alive = false;
    };
  }, [discountedSubtotal]);

  const handleRedeemVoucher = async () => {
    if (!voucherCode.trim()) {
      toast.error("Enter a voucher code");
      return;
    }
    setRedeemingVoucher(true);
    try {
      const r = await corporateApi.redeemVoucher(voucherCode.trim());
      toast.success(`Voucher applied: +${formatPrice(r.creditedPaise)}`);
      setVoucherCode("");
      // Refresh credit balance so it shows up in summary
      const ledger = await loyaltyApi.getCreditLedger();
      setCreditBalance(ledger.balancePaise);
    } catch (e) {
      const msg = String((e as Error).message);
      toast.error(
        msg.includes("404")
          ? "Voucher not found"
          : msg.includes("409")
            ? "Voucher already redeemed"
            : "Could not redeem voucher",
      );
    } finally {
      setRedeemingVoucher(false);
    }
  };

  const activeAddr = SAVED_ADDRESSES.find((a) => a.id === selectedAddress);

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">Your cart is empty</h1>
        <p className="text-sm text-clinical-zinc">Add meals to your cart before checking out.</p>
        <Button onClick={() => navigate("/menu")} className="bg-clinical-gold text-[#050505]">
          Browse Menu
        </Button>
      </div>
    );
  }

  const handleConfirmedPayment = async () => {
    if (!activeAddr) {
      toast.error("Please select a delivery address");
      setConfirmOpen(false);
      return;
    }
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 1500));

    const orderId = generateOrderId();
    const placedAt = new Date().toISOString();
    // Dynamic ETA from server (kitchen queue + rider load + distance + time-of-day).
    // Falls back to legacy 25-min static if the model errors or is disabled.
    let etaAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    try {
      const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
      const r = await fetch(`${apiBase}/delivery/eta/estimate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it) => ({ id: it.dishId, qty: it.quantity })),
          address: {
            line: [activeAddr.line1, activeAddr.line2].filter(Boolean).join(", "),
            city: activeAddr.city,
            pincode: activeAddr.pincode,
          },
        }),
      });
      if (r.ok) {
        const data = (await r.json()) as { etaAt?: string };
        if (data.etaAt) etaAt = data.etaAt;
      }
    } catch {
      // keep static fallback
    }

    // Server-owned atomic finalize: persists the order in the database,
    // redeems credits, and awards any pending referral inside one
    // transaction. The server computes the gross from item prices
    // (client-supplied amounts cannot underprice the order).
    let finalTotal = grossTotal;
    let referralAwarded = false;
    let serverOrderIdFromFinalize: number | undefined;
    try {
      const out = await loyaltyApi.finalizeOrder({
        orderId,
        items: items.map((it) => ({
          id: it.dishId,
          name: it.name,
          qty: it.quantity,
          price: it.unitPrice,
        })),
        address: {
          label: activeAddr.label,
          line: [activeAddr.line1, activeAddr.line2].filter(Boolean).join(", "),
          city: activeAddr.city,
          pincode: activeAddr.pincode,
          phone: activeAddr.phone,
        },
        applyCreditsPaise: creditApplied > 0 ? creditApplied : undefined,
        scheduledFor: preorderTomorrow ? tomorrowSlot.toISOString() : undefined,
        bundleSlugs: bundleSlugs.length > 0 ? bundleSlugs : undefined,
        fulfillmentType,
        deliverySlotId: fulfillmentType === "delivery" ? selectedSlotId : null,
        pickupLocationId: fulfillmentType === "pickup" ? selectedPickupId : null,
        ecoPackagingOptIn: fulfillmentType === "delivery" && ecoPackagingOptIn,
        deliveryInstructions: deliveryInstructions.trim() || null,
      });
      // Persist the per-address instructions so the next order on this
      // saved address pre-fills with the same note. We always upsert,
      // including empty strings, so the user can clear stale notes.
      if (activeAddr) {
        const trimmed = deliveryInstructions.trim();
        const previous = savedInstructions[activeAddr.label] ?? "";
        if (trimmed !== previous) {
          try {
            await fulfillmentApi.upsertInstructions(activeAddr.label, trimmed);
            setSavedInstructions((prev) => ({
              ...prev,
              [activeAddr.label]: trimmed,
            }));
          } catch {
            // non-fatal: order is already placed
          }
        }
      }
      // Add delivery + tip on top of the server-validated meal total. The
      // server's finalPaise already nets out bundle, pickup, preorder, and
      // credit redemptions (see loyaltyEngine.finalizeOrder), so we must
      // NOT subtract preorder/pickup again here — that would double-discount.
      finalTotal = out.finalPaise + deliveryFee + effectiveTip;
      setCreditBalance(out.balancePaise);
      referralAwarded = out.referral.awarded;
      serverOrderIdFromFinalize = out.serverOrderId;
      // Attach add-ons (drinks/snacks/supplements) to the freshly-created
      // server order. Failures here should not block the order itself —
      // the user already paid for the meals.
      if (out.serverOrderId && selectedAddons.size > 0) {
        try {
          const items = Array.from(selectedAddons.entries()).map(
            ([addonId, qty]) => ({ addonId, qty }),
          );
          const r = await addonsApi.attach(out.serverOrderId, items);
          finalTotal += r.addedPaise;
        } catch {
          toast.warning("Add-ons could not be attached — contact support");
        }
      }
    } catch (err) {
      const msg = String((err as Error).message);
      // loyaltyApi.request() throws Error(`${status}: ${text}`); parse the
      // status prefix exactly so a future error body containing the digits
      // "401" or "403" can never get misclassified as auth/premium.
      const statusMatch = /^(\d{3}):/.exec(msg);
      const status = statusMatch ? Number(statusMatch[1]) : 0;
      const scrollToFulfillment = () => {
        document
          .getElementById("checkout-fulfillment")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      if (msg.includes("delivery slot full")) {
        try {
          const r = await fulfillmentApi.listSlots();
          setSlots(r.slots);
        } catch {
          /* noop */
        }
        setSelectedSlotId(null);
        toast.error("That delivery slot is full", {
          description: "Pick another delivery window to continue.",
          action: { label: "Pick a slot", onClick: scrollToFulfillment },
        });
      } else if (msg.includes("delivery slot required")) {
        toast.error("Please pick a delivery window before placing the order", {
          action: { label: "Pick a slot", onClick: scrollToFulfillment },
        });
      } else if (
        msg.includes("pickup location required") ||
        msg.includes("pickup location unavailable")
      ) {
        toast.error("Please choose a pickup partner to continue", {
          action: { label: "Choose pickup", onClick: scrollToFulfillment },
        });
      } else if (status === 401) {
        // Session expired mid-checkout. Cart is preserved in localStorage
        // (Zustand persist key tanmatra:cart:v1), so /login?next=/checkout
        // will drop the user back here ready to retry.
        toast.error("Your session expired — sign in to finish your order", {
          description: "We've kept your cart safe.",
          action: {
            label: "Sign in",
            onClick: () => navigate("/login?next=/checkout"),
          },
        });
      } else if (
        status === 403 ||
        msg.includes("premium membership required")
      ) {
        toast.error("This order includes a Premium-only dish", {
          description:
            "Join Tanmatra Premium to unlock chef-table dishes and finish checkout.",
          action: {
            label: "See Premium",
            onClick: () => navigate("/premium"),
          },
        });
      } else {
        toast.error("Could not finalize order — please try again");
      }
      setIsProcessing(false);
      return;
    }

    // Charge the company subsidy AFTER the order is finalized server-side.
    // The subsidy reduces the employee's out-of-pocket without changing the
    // order amount itself; it's tracked separately for usage reporting.
    if (subsidyAvailable > 0 && subsidy?.active && subsidy.company) {
      try {
        // Use the server-returned charged amount, NOT the requested amount —
        // the server may charge less under contention or stale budget data.
        const charge = await corporateApi.chargeSubsidy(
          subsidy.company.id,
          subsidyAvailable,
          orderId,
        );
        finalTotal = Math.max(0, finalTotal - (charge.chargedPaise ?? 0));
      } catch {
        // Non-fatal: order is placed, just log a soft warning.
        toast.warning("Company subsidy could not be applied to this order");
      }
    }

    const selectedSlot = slots.find((s) => s.id === selectedSlotId);
    const slotLabel = selectedSlot
      ? `${new Date(selectedSlot.startsAt).toLocaleString([], {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })} – ${new Date(selectedSlot.endsAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}`
      : undefined;

    addOrder({
      orderId,
      placedAt,
      etaAt,
      status: "placed",
      items: [...items],
      subtotal,
      deliveryFee,
      tip: effectiveTip,
      total: finalTotal,
      scheduledFor: preorderTomorrow ? tomorrowSlot.toISOString() : undefined,
      preorderDiscount: preorderTomorrow ? preorderDiscount : undefined,
      pickupDiscount: pickupDiscount > 0 ? pickupDiscount : undefined,
      fulfillmentType,
      pickupLocationName: selectedPickup?.name,
      deliverySlotLabel: fulfillmentType === "delivery" ? slotLabel : undefined,
      ecoPackagingOptIn: fulfillmentType === "delivery" && ecoPackagingOptIn,
      deliveryInstructions: deliveryInstructions.trim() || undefined,
      serverOrderId: serverOrderIdFromFinalize,
      address: {
        label: activeAddr.label,
        line1: activeAddr.line1,
        line2: activeAddr.line2,
        city: activeAddr.city,
        pincode: activeAddr.pincode,
        phone: activeAddr.phone,
      },
    });

    if (referralAwarded) {
      toast.success("Referral reward unlocked for your friend");
    }

    clear();
    setIsProcessing(false);
    setConfirmOpen(false);

    toast.success(`Order ${orderId} confirmed`, {
      description: `Rider will contact you on ${activeAddr.phone}`,
    });
    navigate(`/track?orderId=${encodeURIComponent(orderId)}`);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 pb-40 lg:pb-4 grid grid-cols-1 lg:grid-cols-5 gap-6 animate-in fade-in duration-500">
      <div className="lg:col-span-3 space-y-5">
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-sm font-semibold text-white">Delivery Address</h2>
            </div>

            <RadioGroup
              value={selectedAddress}
              onValueChange={(v) => {
                setSelectedAddress(v);
                setShowNewAddress(false);
              }}
            >
              <div className="space-y-2">
                {SAVED_ADDRESSES.map((addr) => (
                  <Label
                    key={addr.id}
                    htmlFor={addr.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedAddress === addr.id
                        ? "border-clinical-gold/50 bg-clinical-gold/5"
                        : "border-clinical-slate/20 bg-transparent hover:border-clinical-slate/40"
                    }`}
                  >
                    <RadioGroupItem value={addr.id} id={addr.id} className="mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {addr.type === "home" && <Home className="w-3 h-3 text-clinical-blue" />}
                        {addr.type === "work" && <Building2 className="w-3 h-3 text-clinical-gold" />}
                        <span className="text-xs font-medium text-white">{addr.label}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize border-clinical-slate/30 text-clinical-zinc">
                          {addr.type}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-clinical-zinc mt-1">
                        {addr.line1}
                        {addr.line2 ? ` · ${addr.line2}` : ""} · {addr.city} {addr.pincode}
                      </p>
                      <p className="text-[10px] text-clinical-zinc flex items-center gap-1 mt-0.5">
                        <Phone className="w-2.5 h-2.5" />
                        Rider will call you on {addr.phone}
                      </p>
                    </div>
                  </Label>
                ))}

                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 text-xs text-clinical-gold hover:bg-clinical-gold/10 h-10"
                  onClick={() => {
                    setShowNewAddress(true);
                    setSelectedAddress("new");
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New Address
                </Button>
              </div>
            </RadioGroup>

            <div className="pt-2 border-t border-clinical-slate/20 space-y-2">
              <div className="flex items-center gap-2">
                <NotebookPen className="w-3.5 h-3.5 text-clinical-gold" />
                <Label className="text-xs font-medium text-white">
                  Notes for the rider
                </Label>
                {activeAddrLabel && savedInstructions[activeAddrLabel] && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1 ml-auto border-clinical-sage/40 text-clinical-sage"
                  >
                    Saved for this address
                  </Badge>
                )}
              </div>
              <Textarea
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                placeholder="e.g. Gate code 4421, leave at door, call on arrival"
                maxLength={512}
                className="text-xs bg-clinical-dark border-clinical-slate/30 min-h-[60px]"
              />
              <p className="text-[10px] text-clinical-zinc">
                We'll remember these notes for{" "}
                <span className="text-white">{activeAddrLabel ?? "this address"}</span>{" "}
                so you don't have to type them again.
              </p>
            </div>

            {showNewAddress && (
              <div className="space-y-3 p-3 rounded-lg bg-clinical-dark border border-clinical-slate/20">
                <p className="text-xs font-medium text-white">New Address</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Label (e.g., Home)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} className="h-9 text-xs bg-clinical-surface border-clinical-slate/30" />
                  <Input placeholder="Phone (rider will call this)" value={newAddr.phone} onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })} className="h-9 text-xs bg-clinical-surface border-clinical-slate/30" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="City" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} className="h-9 text-xs bg-clinical-surface border-clinical-slate/30" />
                  <Input placeholder="Pincode" value={newAddr.pincode} onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value })} className="h-9 text-xs bg-clinical-surface border-clinical-slate/30" />
                </div>
                <Input placeholder="Address line 1 (street, building)" value={newAddr.line1} onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })} className="h-9 text-xs bg-clinical-surface border-clinical-slate/30" />
                <Input placeholder="Address line 2 (apt, floor — optional)" value={newAddr.line2} onChange={(e) => setNewAddr({ ...newAddr, line2: e.target.value })} className="h-9 text-xs bg-clinical-surface border-clinical-slate/30" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          id="checkout-fulfillment"
          className="bg-clinical-surface border-clinical-slate/20 scroll-mt-24"
        >
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-sm font-semibold text-white">Get it your way</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFulfillmentType("delivery")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  fulfillmentType === "delivery"
                    ? "border-clinical-gold/50 bg-clinical-gold/5"
                    : "border-clinical-slate/20 hover:border-clinical-slate/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-clinical-gold" />
                  <span className="text-xs font-medium text-white">Doorstep delivery</span>
                </div>
                <p className="text-[10px] text-clinical-zinc mt-1">
                  Reserve a 30-minute window
                </p>
              </button>
              <button
                type="button"
                onClick={() => setFulfillmentType("pickup")}
                disabled={pickupLocations.length === 0}
                className={`p-3 rounded-lg border text-left transition-all disabled:opacity-50 ${
                  fulfillmentType === "pickup"
                    ? "border-clinical-gold/50 bg-clinical-gold/5"
                    : "border-clinical-slate/20 hover:border-clinical-slate/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Store className="w-3.5 h-3.5 text-clinical-gold" />
                  <span className="text-xs font-medium text-white">Partner pickup</span>
                </div>
                <p className="text-[10px] text-clinical-sage mt-1">
                  Save up to Rs.{Math.max(0, ...pickupLocations.map((p) => p.discountPaise)) / 100 || 30}
                </p>
              </button>
            </div>

            {fulfillmentType === "delivery" && (
              <div className="space-y-2">
                <p className="text-[10px] text-clinical-zinc uppercase tracking-wider">
                  Pick a delivery slot
                </p>
                {slots.length === 0 ? (
                  <p className="text-xs text-clinical-zinc">Loading available windows…</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                    {slots.map((slot) => {
                      const start = new Date(slot.startsAt);
                      const end = new Date(slot.endsAt);
                      const day = start.toLocaleDateString([], {
                        weekday: "short",
                      });
                      const window = `${start.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })} – ${end.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}`;
                      const selected = selectedSlotId === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={slot.full}
                          onClick={() => setSelectedSlotId(slot.id)}
                          className={`p-2 rounded-md border text-left text-[11px] transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            selected
                              ? "border-clinical-gold/60 bg-clinical-gold/10 text-white"
                              : "border-clinical-slate/20 text-clinical-zinc hover:border-clinical-slate/40"
                          }`}
                        >
                          <div className="font-medium text-white">{day}</div>
                          <div className="tabular-nums">{window}</div>
                          <div className="text-[9px] mt-0.5">
                            {slot.full
                              ? "Full"
                              : `${slot.remaining} left`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {fulfillmentType === "pickup" && (
              <div className="space-y-2">
                <p className="text-[10px] text-clinical-zinc uppercase tracking-wider">
                  Choose a pickup partner
                </p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {pickupLocations.map((loc) => {
                    const selected = selectedPickupId === loc.id;
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setSelectedPickupId(loc.id)}
                        className={`w-full p-3 rounded-lg border text-left transition-all ${
                          selected
                            ? "border-clinical-gold/50 bg-clinical-gold/5"
                            : "border-clinical-slate/20 hover:border-clinical-slate/40"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Store className="w-3 h-3 text-clinical-gold" />
                          <span className="text-xs font-medium text-white">
                            {loc.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="ml-auto text-[9px] h-4 px-1 border-clinical-sage/40 text-clinical-sage"
                          >
                            -Rs.{(loc.discountPaise / 100).toFixed(0)}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-clinical-zinc mt-1">
                          {loc.addressLine}, {loc.city} {loc.pincode}
                        </p>
                        {loc.hours && (
                          <p className="text-[10px] text-clinical-zinc">
                            Open {loc.hours}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {fulfillmentType === "delivery" && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-clinical-sage/30 bg-clinical-sage/5">
                <div className="flex items-start gap-2 min-w-0">
                  <Leaf className="w-4 h-4 text-clinical-sage shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">
                      Reusable eco packaging
                    </p>
                    <p className="text-[10px] text-clinical-zinc">
                      Return clean containers on your next order to earn Rs.20 credit
                    </p>
                  </div>
                </div>
                <Switch
                  checked={ecoPackagingOptIn}
                  onCheckedChange={setEcoPackagingOptIn}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Bike className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-sm font-semibold text-white">Tip for Rider</h2>
              <span className="text-[10px] text-clinical-zinc ml-auto">100% goes to your delivery partner</span>
            </div>

            <div className="flex gap-2">
              {TIP_PRESETS.map((tip) => (
                <Button
                  key={tip}
                  size="sm"
                  variant={tipAmount === tip && tip !== -1 ? "default" : "outline"}
                  className={`flex-1 h-9 text-xs tabular-nums ${
                    tipAmount === tip && tip !== -1
                      ? "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/40"
                      : "border-clinical-slate/30 text-clinical-zinc hover:border-clinical-slate/50"
                  }`}
                  onClick={() => {
                    setTipAmount(tip);
                    setCustomTip("");
                  }}
                >
                  {tip === 0 ? "No Tip" : `+Rs.${(tip / 100).toFixed(0)}`}
                </Button>
              ))}
              <Button
                size="sm"
                variant={tipAmount === -1 ? "default" : "outline"}
                className={`h-9 text-xs px-3 ${
                  tipAmount === -1
                    ? "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/40"
                    : "border-clinical-slate/30 text-clinical-zinc"
                }`}
                onClick={() => setTipAmount(-1)}
              >
                Custom
              </Button>
            </div>

            {tipAmount === -1 && (
              <div className="flex gap-2">
                <IndianRupee className="w-4 h-4 text-clinical-zinc mt-2" />
                <Input
                  placeholder="Enter custom tip amount"
                  type="number"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  className="h-9 text-xs bg-clinical-surface border-clinical-slate/30 tabular-nums"
                  autoFocus
                  aria-label="Custom tip amount in rupees"
                />
              </div>
            )}

            {effectiveTip > 0 && (
              <p className="text-[10px] text-clinical-sage flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Your rider will receive Rs.{(effectiveTip / 100).toFixed(0)} extra
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-sm font-semibold text-white">Delivery Time</h2>
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-clinical-gold/30 bg-clinical-gold/5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white">
                  Pre-order for tomorrow
                </p>
                <p className="text-[10px] text-clinical-zinc">
                  {preorderTomorrow
                    ? `Scheduled for ${tomorrowSlot.toLocaleString([], {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })} · 5% off your meals`
                    : "Lock in tomorrow's lunch slot and save 5%"}
                </p>
              </div>
              <Switch
                checked={preorderTomorrow}
                onCheckedChange={setPreorderTomorrow}
              />
            </div>
            {preorderTomorrow && (
              <p className="text-[10px] text-clinical-sage flex items-center gap-1">
                <Tag className="w-3 h-3" />
                You save {formatPrice(preorderDiscount)} on this order
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-sm font-semibold text-white">Payment</h2>
            </div>
            <div
              className="p-3 rounded-lg border border-clinical-gold/30 bg-clinical-gold/5 flex items-center gap-3"
              title="Razorpay handles your payment securely. Tanmatra never sees your card or UPI details."
            >
              <div className="w-8 h-8 rounded-md bg-clinical-gold/20 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-clinical-gold" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">Razorpay Secure Checkout</p>
                <p className="text-[10px] text-clinical-zinc">UPI · Cards · Net Banking · Wallets · PCI-DSS Level 1</p>
              </div>
              <ShieldCheck className="w-4 h-4 text-clinical-sage ml-auto" aria-label="Encrypted payment" />
            </div>

            {/* Recurring upsell — closes the missing one-off → subscription
                bridge. Per UX audit Journey-B finding 4. We don't toggle
                the order itself into a subscription (that requires backend
                contract changes); we deep-link into /subscribe with the
                current cart's items so the user finishes there post-payment. */}
            <Link
              to={`/subscribe?fromCart=1&cadence=weekly`}
              className="block rounded-md border border-clinical-gold/30 bg-clinical-gold/5 px-3 py-3 hover:bg-clinical-gold/10"
            >
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-clinical-gold mt-0.5 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white leading-tight">
                    Make this a weekly subscription — save up to 15%
                  </p>
                  <p className="text-[10px] text-clinical-zinc leading-tight mt-0.5">
                    Skip checkout next week. Pause, swap or cancel any time.
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-clinical-gold mt-1 shrink-0" aria-hidden="true" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <AddOnRail
          cartTags={Array.from(
            new Set(
              items.flatMap((it) => [
                it.kitchen,
                it.isVeg ? "vegan" : "nonveg",
                ...(it.macros.protein >= 25 ? ["fitness", "performance"] : []),
                "lunch",
              ]),
            ),
          )}
          selected={selectedAddons}
          onChange={setSelectedAddons}
        />
        <Card className="bg-clinical-surface border-clinical-slate/20 sticky top-20">
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-clinical-gold" />
              Order Summary
            </h2>

            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.lineId} className="flex items-start gap-3">
                  <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-clinical-slate/20 shrink-0" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{item.name}</p>
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
                  <span className="tabular-nums text-xs text-white font-medium shrink-0">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <Separator className="bg-clinical-slate/20" />

            {activeAddr && (
              <div className="space-y-1 text-[10px] text-clinical-zinc">
                <div className="flex items-start gap-2">
                  <MapPin className="w-3 h-3 text-clinical-gold shrink-0 mt-0.5" />
                  <span>
                    {activeAddr.label} · {activeAddr.line1} · {activeAddr.city}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="w-3 h-3 text-clinical-gold shrink-0 mt-0.5" />
                  <span>Rider will contact you on {activeAddr.phone}</span>
                </div>
              </div>
            )}

            <Separator className="bg-clinical-slate/20" />

            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-clinical-zinc">Subtotal</span>
                <span className="tabular-nums text-white">{formatPrice(subtotal)}</span>
              </div>
              {preorderDiscount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-clinical-sage flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" /> Pre-order discount (5%)
                  </span>
                  <span className="tabular-nums text-clinical-sage">
                    -{formatPrice(preorderDiscount)}
                  </span>
                </div>
              )}
              {pickupDiscount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-clinical-sage flex items-center gap-1">
                    <Store className="w-3 h-3" /> Partner pickup
                  </span>
                  <span className="tabular-nums text-clinical-sage">
                    -{formatPrice(pickupDiscount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-clinical-zinc">
                  {fulfillmentType === "pickup" ? "Pickup" : "Delivery"}
                </span>
                <span className={deliveryFee === 0 ? "text-clinical-sage text-xs" : "tabular-nums text-white"}>
                  {fulfillmentType === "pickup"
                    ? "Self-collect"
                    : deliveryFee === 0
                      ? "FREE"
                      : formatPrice(deliveryFee)}
                </span>
              </div>
              {effectiveTip > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-clinical-zinc flex items-center gap-1">
                    <Bike className="w-3 h-3" />
                    Rider Tip
                  </span>
                  <span className="tabular-nums text-clinical-gold">{formatPrice(effectiveTip)}</span>
                </div>
              )}
              {creditBalance > 0 && (
                <div className="flex items-center justify-between gap-2 p-2 rounded-md border border-clinical-sage/30 bg-clinical-sage/5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-clinical-sage shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-white">Apply credits</p>
                      <p className="text-[9px] text-clinical-zinc">
                        Wallet: {formatPrice(creditBalance)}
                      </p>
                    </div>
                  </div>
                  <Switch checked={applyCredits} onCheckedChange={setApplyCredits} />
                </div>
              )}
              {creditApplied > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-clinical-sage flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Credits applied
                  </span>
                  <span className="tabular-nums text-clinical-sage">
                    -{formatPrice(creditApplied)}
                  </span>
                </div>
              )}

              {subsidy?.active && subsidy.company && (
                <div className="rounded-lg border border-clinical-slate/30 bg-clinical-dark/40 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-white">
                      <Building2Icon className="w-3.5 h-3.5 text-clinical-gold" />
                      <span className="font-medium">{subsidy.company.name} subsidy</span>
                    </div>
                    <Switch checked={applySubsidy} onCheckedChange={setApplySubsidy} />
                  </div>
                  <p className="text-[10px] text-clinical-zinc">
                    {formatPrice(subsidy.remainingPaise ?? 0)} of{" "}
                    {formatPrice(subsidy.monthlyBudgetPaise ?? 0)} left this month
                  </p>
                  {subsidyAvailable > 0 && (
                    <div className="flex justify-between text-xs pt-0.5">
                      <span className="text-clinical-sage flex items-center gap-1">
                        <Building2Icon className="w-3 h-3" /> Company pays
                      </span>
                      <span className="tabular-nums text-clinical-sage">
                        -{formatPrice(subsidyAvailable)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-clinical-slate/30 bg-clinical-dark/40 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-white">
                  <Ticket className="w-3.5 h-3.5 text-clinical-gold" />
                  <span className="font-medium">Have a voucher?</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                    placeholder="VOUCHER CODE"
                    className="flex-1 min-w-0 h-8 rounded-md bg-clinical-dark border border-clinical-slate/30 px-2 text-[11px] text-white placeholder:text-clinical-zinc/60 tracking-wider uppercase focus:outline-none focus:border-clinical-gold/60"
                    disabled={redeemingVoucher}
                  />
                  <Button
                    type="button"
                    onClick={handleRedeemVoucher}
                    disabled={redeemingVoucher || !voucherCode.trim()}
                    className="h-8 px-3 text-[11px] bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
                  >
                    <Gift className="w-3 h-3 mr-1" />
                    {redeemingVoucher ? "..." : "Redeem"}
                  </Button>
                </div>
              </div>
            </div>

            <Separator className="bg-clinical-slate/20" />

            <div className="flex justify-between items-baseline">
              <span className="text-sm font-semibold text-white">Total</span>
              <div className="text-right">
                <span className="tabular-nums text-xl font-bold text-clinical-gold">{formatPrice(razorpayTotal)}</span>
                <p className="text-[9px] text-clinical-zinc">Inclusive of all taxes</p>
              </div>
            </div>

            <Button
              onClick={() => setConfirmOpen(true)}
              className="hidden lg:flex w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 shadow-clinical gap-2"
            >
              <CreditCard className="w-4 h-4" />
              Review & Pay {formatPrice(razorpayTotal)}
            </Button>

            <p className="text-[9px] text-clinical-zinc text-center flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3 text-clinical-sage" />
              256-bit SSL encryption · Razorpay secure
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
            <p className="text-[10px] text-clinical-zinc leading-none truncate">
              {fulfillmentType === "pickup" ? "Self-collect" : deliveryFee === 0 ? "FREE delivery" : `+ ${formatPrice(deliveryFee)} delivery`}
              {preorderDiscount > 0 && ` · -${formatPrice(preorderDiscount)} preorder`}
              {pickupDiscount > 0 && ` · -${formatPrice(pickupDiscount)} pickup`}
              {creditApplied > 0 && ` · -${formatPrice(creditApplied)} credits`}
              {subsidyAvailable > 0 && ` · -${formatPrice(subsidyAvailable)} company`}
              {effectiveTip > 0 && ` · +${formatPrice(effectiveTip)} tip`}
            </p>
            <p className="tabular-nums text-lg font-bold text-clinical-gold leading-tight mt-0.5">
              {formatPrice(razorpayTotal)}
            </p>
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            className="h-12 px-4 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2 shrink-0"
          >
            <CreditCard className="w-4 h-4" />
            Review & Pay
          </Button>
        </div>
      </div>

      {/* Payment confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={(open) => !isProcessing && setConfirmOpen(open)}>
        <DialogContent className="bg-clinical-surface border-clinical-slate/30">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-clinical-sage" />
              Confirm Payment
            </DialogTitle>
            <DialogDescription className="text-clinical-zinc">
              You will be charged <span className="text-clinical-gold font-bold tabular-nums">{formatPrice(razorpayTotal)}</span> via Razorpay.
              Your rider will contact you on <span className="text-white">{activeAddr?.phone}</span> after pickup.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-clinical-dark/60 border border-clinical-slate/20 rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-clinical-zinc">Subtotal ({items.length} item{items.length === 1 ? "" : "s"})</span>
              <span className="tabular-nums text-white">{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-clinical-zinc">Delivery</span>
              <span className={deliveryFee === 0 ? "text-clinical-sage" : "tabular-nums text-white"}>
                {deliveryFee === 0 ? "FREE" : formatPrice(deliveryFee)}
              </span>
            </div>
            {effectiveTip > 0 && (
              <div className="flex justify-between">
                <span className="text-clinical-zinc">Rider Tip</span>
                <span className="tabular-nums text-clinical-gold">{formatPrice(effectiveTip)}</span>
              </div>
            )}
            <Separator className="bg-clinical-slate/20 my-1" />
            <div className="flex justify-between font-semibold">
              <span className="text-white">Total</span>
              <span className="tabular-nums text-clinical-gold">{formatPrice(razorpayTotal)}</span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isProcessing}
              className="border-clinical-slate/30 text-clinical-zinc"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmedPayment}
              disabled={isProcessing}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2"
            >
              {isProcessing ? "Processing…" : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Confirm & Pay {formatPrice(razorpayTotal)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
