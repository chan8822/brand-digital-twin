import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
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
import { Switch } from "@/components/ui/switch";
import { Sparkles } from "lucide-react";
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
} from "lucide-react";

interface SavedAddress {
  id: string;
  label: string;
  type: "home" | "work";
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  phone: string;
}

const SAVED_ADDRESSES: SavedAddress[] = [
  { id: "addr-1", label: "Home — Koramangala", type: "home", line1: "8th Block, 5th Cross", line2: "Apt 304, Lake View Residency", city: "Bengaluru", pincode: "560095", phone: "+91 98765 43210" },
  { id: "addr-2", label: "Office — MG Road", type: "work", line1: "Prestige Trade Tower, MG Road", line2: "3rd Floor, Suite 312", city: "Bengaluru", pincode: "560001", phone: "+91 98765 43210" },
];

const TIP_PRESETS = [0, 2000, 5000, 10000];

export default function Checkout() {
  const navigate = useNavigate();
  const { items, subtotal, clear } = useCart();
  const { addOrder } = useOrders();
  const [selectedAddress, setSelectedAddress] = useState("addr-1");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);
  const [applyCredits, setApplyCredits] = useState(true);
  const [preorderTomorrow, setPreorderTomorrow] = useState(false);

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
  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
  const discountedSubtotal = subtotal - preorderDiscount;
  const grossTotal = discountedSubtotal + deliveryFee + effectiveTip;
  // Server only redeems against the (discounted) meal subtotal; cap here too
  // so the UI total matches the server final total exactly.
  const creditApplied =
    applyCredits && creditBalance > 0
      ? Math.min(creditBalance, discountedSubtotal)
      : 0;
  const razorpayTotal = Math.max(0, grossTotal - creditApplied);

  const activeAddr = SAVED_ADDRESSES.find((a) => a.id === selectedAddress);

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-clinical-gold mx-auto" />
        <h1 className="text-2xl font-bold text-white">Your plan is empty</h1>
        <p className="text-sm text-clinical-zinc">Add meals to your plan before checking out.</p>
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
    const etaAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();

    // Server-owned atomic finalize: persists the order in the database,
    // redeems credits, and awards any pending referral inside one
    // transaction. The server computes the gross from item prices
    // (client-supplied amounts cannot underprice the order).
    let finalTotal = grossTotal;
    let referralAwarded = false;
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
      });
      // Add delivery + tip on top of the server-validated meal total.
      finalTotal = out.finalPaise + deliveryFee + effectiveTip;
      setCreditBalance(out.balancePaise);
      referralAwarded = out.referral.awarded;
    } catch {
      toast.error("Could not finalize order — please try again");
      setIsProcessing(false);
      return;
    }

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
    <div className="max-w-4xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-5 gap-6 animate-in fade-in duration-500">
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
            <div className="p-3 rounded-lg border border-clinical-gold/30 bg-clinical-gold/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-clinical-gold/20 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-clinical-gold" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">Razorpay Secure Checkout</p>
                <p className="text-[10px] text-clinical-zinc">UPI · Cards · Net Banking · Wallets</p>
              </div>
              <ShieldCheck className="w-4 h-4 text-clinical-sage ml-auto" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-2 space-y-4">
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
              <div className="flex justify-between text-xs">
                <span className="text-clinical-zinc">Delivery</span>
                <span className={deliveryFee === 0 ? "text-clinical-sage text-xs" : "tabular-nums text-white"}>
                  {deliveryFee === 0 ? "FREE" : formatPrice(deliveryFee)}
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
              className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 shadow-clinical gap-2"
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
