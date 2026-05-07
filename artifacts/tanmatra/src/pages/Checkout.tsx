import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatPrice } from "@/lib/api/adapter";
import {
  MapPin,
  CreditCard,
  Bike,
  Plus,
  Home,
  Building2,
  ChevronRight,
  ShieldCheck,
  ClipboardList,
  IndianRupee,
} from "lucide-react";

/* ── Saved addresses ──────────────────────────────────────────────── */
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

interface CheckoutItem {
  id: number;
  name: string;
  image: string;
  price: number;
  quantity: number;
}

const DEMO_ITEMS: CheckoutItem[] = [
  { id: 1, name: "Grilled Atlantic Salmon", image: "/dishes/salmon-quinoa.jpg", price: 48500, quantity: 2 },
  { id: 2, name: "Performance Power Bowl", image: "/dishes/buddha-bowl.jpg", price: 39500, quantity: 1 },
  { id: 3, name: "Keto Prime Ribeye", image: "/dishes/steak-keto.jpg", price: 62500, quantity: 1 },
];

export default function Checkout() {
  const navigate = useNavigate();
  const [selectedAddress, setSelectedAddress] = useState("addr-1");
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // New address form state
  const [newAddr, setNewAddr] = useState({ label: "", line1: "", line2: "", city: "", pincode: "", phone: "" });

  const effectiveTip = tipAmount === -1 ? Math.round((parseFloat(customTip) || 0) * 100) : tipAmount;

  const subtotal = DEMO_ITEMS.reduce((s, item) => s + item.price * item.quantity, 0);
  const deliveryFee = subtotal > 50000 ? 0 : 5000;
  const razorpayTotal = subtotal + deliveryFee + effectiveTip;

  const handlePayment = async () => {
    setIsProcessing(true);
    // Simulate Razorpay flow
    await new Promise((r) => setTimeout(r, 1500));
    toast.success("Payment successful! Order confirmed.", {
      description: `Rs.${(razorpayTotal / 100).toFixed(2)} charged · Rider tipped Rs.${(effectiveTip / 100).toFixed(0)}`,
    });
    setIsProcessing(false);
    navigate("/track");
  };

  const activeAddr = SAVED_ADDRESSES.find((a) => a.id === selectedAddress);

  return (
    <div className="max-w-4xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-5 gap-6 animate-in fade-in duration-500">
      {/* LEFT: Address + Tip + Payment */}
      <div className="lg:col-span-3 space-y-5">
        {/* ── Address Selector ── */}
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-sm font-semibold text-white">Delivery Address</h2>
            </div>

            <RadioGroup value={selectedAddress} onValueChange={(v) => { setSelectedAddress(v); setShowNewAddress(false); }}>
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
                      <p className="text-[10px] text-clinical-zinc">{addr.phone}</p>
                    </div>
                  </Label>
                ))}

                {/* Add new address toggle */}
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 text-xs text-clinical-gold hover:bg-clinical-gold/10 h-10"
                  onClick={() => { setShowNewAddress(true); setSelectedAddress("new"); }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New Address
                </Button>
              </div>
            </RadioGroup>

            {/* New address form */}
            {showNewAddress && (
              <div className="space-y-3 p-3 rounded-lg bg-clinical-dark border border-clinical-slate/20">
                <p className="text-xs font-medium text-white">New Address</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Label (e.g., Home)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} className="h-9 text-xs bg-clinical-surface border-clinical-slate/30" />
                  <Input placeholder="Phone" value={newAddr.phone} onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })} className="h-9 text-xs bg-clinical-surface border-clinical-slate/30" />
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

        {/* ── Rider Tip ── */}
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
                  onClick={() => { setTipAmount(tip); setCustomTip(""); }}
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

        {/* ── Payment Method ── */}
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

      {/* RIGHT: Order Summary */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="bg-clinical-surface border-clinical-slate/20 sticky top-20">
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-clinical-gold" />
              Order Summary
            </h2>

            {/* Items with thumbnails */}
            <div className="space-y-3">
              {DEMO_ITEMS.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-clinical-slate/20" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-white truncate">{item.name}</p>
                    <p className="text-[10px] text-clinical-zinc">Qty: {item.quantity}</p>
                  </div>
                  <span className="tabular-nums text-xs text-white font-medium shrink-0">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            <Separator className="bg-clinical-slate/20" />

            {/* Delivery address summary */}
            {activeAddr && (
              <div className="flex items-start gap-2 text-[10px] text-clinical-zinc">
                <MapPin className="w-3 h-3 text-clinical-gold shrink-0 mt-0.5" />
                <span>
                  {activeAddr.label} · {activeAddr.line1} · {activeAddr.city}
                </span>
              </div>
            )}

            <Separator className="bg-clinical-slate/20" />

            {/* Breakdown */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-clinical-zinc">Subtotal</span>
                <span className="tabular-nums text-white">{formatPrice(subtotal)}</span>
              </div>
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
              onClick={handlePayment}
              disabled={isProcessing}
              className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 shadow-clinical gap-2"
            >
              {isProcessing ? (
                <>Processing...</>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Pay {formatPrice(razorpayTotal)}
                </>
              )}
            </Button>

            <p className="text-[9px] text-clinical-zinc text-center flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3 text-clinical-sage" />
              256-bit SSL encryption · Razorpay secure
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
