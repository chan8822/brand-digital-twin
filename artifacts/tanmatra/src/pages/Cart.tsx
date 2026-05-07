import { Link, useNavigate } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
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

interface CartItem {
  id: number;
  name: string;
  slug: string;
  image: string;
  price: number;
  quantity: number;
  kitchen: string;
  rdVerified: boolean;
  macros: { protein: number; carbs: number; fat: number; fiber: number; calories: number };
  customizations: string[];
}

const DEMO_CART: CartItem[] = [
  {
    id: 1,
    name: "Grilled Atlantic Salmon",
    slug: "grilled-salmon",
    image: "/dishes/salmon-quinoa.jpg",
    price: 48500,
    quantity: 2,
    kitchen: "continental",
    rdVerified: true,
    macros: { protein: 34, carbs: 28, fat: 18, fiber: 6, calories: 420 },
    customizations: ["Wild Sea Bass (+Rs.35)", "Extra Salmon Portion (+Rs.25)"],
  },
  {
    id: 2,
    name: "Performance Power Bowl",
    slug: "power-bowl",
    image: "/dishes/buddha-bowl.jpg",
    price: 39500,
    quantity: 1,
    kitchen: "continental",
    rdVerified: true,
    macros: { protein: 42, carbs: 55, fat: 22, fiber: 9, calories: 580 },
    customizations: ["Brown Jasmine Rice (+Rs.5)"],
  },
  {
    id: 3,
    name: "Keto Prime Ribeye",
    slug: "keto-ribeye",
    image: "/dishes/steak-keto.jpg",
    price: 62500,
    quantity: 1,
    kitchen: "continental",
    rdVerified: true,
    macros: { protein: 48, carbs: 8, fat: 38, fiber: 5, calories: 540 },
    customizations: ["Avocado Slices (+Rs.12)"],
  },
];

export default function Cart() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>(DEMO_CART);

  const updateQty = (id: number, delta: number) => {
    setItems((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    toast.success("Item removed from Nutrition Plan");
  };

  const subtotal = items.reduce((s, item) => s + item.price * item.quantity, 0);
  const deliveryFee = subtotal > 50000 ? 0 : 5000;
  const total = subtotal + deliveryFee;
  const totalItems = items.reduce((t, item) => t + item.quantity, 0);

  if (items.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-clinical-surface border border-clinical-slate/20 flex items-center justify-center mx-auto">
          <ShoppingBag className="w-7 h-7 text-clinical-zinc" />
        </div>
        <div className="space-y-2">
          <h1 className="text-clinical-h2 text-white">Your Nutrition Plan is Empty</h1>
          <p className="text-sm text-clinical-zinc">Browse our clinical menu and add precision-formulated meals.</p>
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
    <div className="max-w-5xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
      {/* LEFT: Cart Items */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-clinical-h2 text-white">Nutrition Plan</h1>
            <p className="text-xs text-clinical-zinc mt-1">{totalItems} item(s) · Clinical-grade precision meals</p>
          </div>
          <Link to="/menu" className="text-xs text-clinical-gold hover:underline flex items-center gap-1">
            <Utensils className="w-3 h-3" /> Add more
          </Link>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="bg-clinical-surface border-clinical-slate/20 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex gap-4">
                  {/* Dish image */}
                  <Link to={`/dish/${item.slug}`} className="shrink-0 w-28 h-28 sm:w-32 sm:h-32">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </Link>

                  {/* Details */}
                  <div className="flex-1 py-3 pr-4 space-y-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/dish/${item.slug}`}>
                          <h3 className="text-sm font-semibold text-white hover:text-clinical-gold transition-colors truncate">
                            {item.name}
                          </h3>
                        </Link>
                        <p className="text-[10px] text-clinical-zinc capitalize mt-0.5">{item.kitchen}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-clinical-zinc hover:text-red-400 shrink-0"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* Customizations */}
                    {item.customizations.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.customizations.map((c) => (
                          <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-clinical-slate/20 text-clinical-zinc">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Macro compact + quantity */}
                    <div className="flex items-end justify-between gap-3">
                      <MacroOverlay macros={item.macros} rdVerified={item.rdVerified} compact />

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 border-clinical-slate/30 text-clinical-zinc"
                          onClick={() => updateQty(item.id, -1)}
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="tabular-nums text-sm font-semibold text-white w-5 text-center">
                          {item.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 border-clinical-slate/30 text-clinical-zinc"
                          onClick={() => updateQty(item.id, 1)}
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Price */}
                    <p className="tabular-nums text-sm font-bold text-clinical-gold text-right">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* RIGHT: Order Summary */}
      <div className="space-y-4">
        <Card className="bg-clinical-surface border-clinical-slate/20 sticky top-20">
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-clinical-gold" />
              Order Summary
            </h2>

            <div className="space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-clinical-zinc">Subtotal ({totalItems} items)</span>
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

            <Button
              onClick={() => navigate("/checkout")}
              className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 shadow-clinical gap-2"
            >
              Proceed to Checkout
              <ArrowRight className="w-4 h-4" />
            </Button>

            <p className="text-[10px] text-clinical-zinc text-center">
              Secured by Razorpay · SSL encrypted
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
