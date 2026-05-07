import { useState } from "react";
import { usePublicMenu } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import MacroOverlay from "@/components/dish/MacroOverlay";
import { formatPrice } from "@/lib/api/adapter";
import { Link } from "react-router";
import { AlertTriangle, ChefHat, Utensils } from "lucide-react";

/* ── Static menu data with descriptions and unique images ─────────── */
const MENU_ITEMS = [
  {
    id: 1, name: "Grilled Atlantic Salmon", slug: "grilled-salmon",
    description: "Omega-3 rich Atlantic salmon with quinoa pilaf and steamed broccoli. Cardiovascular wellness protocol.",
    image: "/dishes/salmon-quinoa.jpg", price: 48500, kitchen: "continental", category: "wellness", rdVerified: true,
    macros: { protein: 34, carbs: 28, fat: 18, fiber: 6, calories: 420 }, isAvailable: true,
  },
  {
    id: 2, name: "Performance Power Bowl", slug: "power-bowl",
    description: "Grilled chicken, brown rice, sweet potato, avocado — engineered for athletic recovery and muscle synthesis.",
    image: "/dishes/buddha-bowl.jpg", price: 39500, kitchen: "continental", category: "performance", rdVerified: true,
    macros: { protein: 42, carbs: 55, fat: 22, fiber: 9, calories: 580 }, isAvailable: true,
  },
  {
    id: 3, name: "Keto Prime Ribeye", slug: "keto-ribeye",
    description: "Grass-fed ribeye with cauliflower puree and grilled asparagus. Ketogenic macro ratio for metabolic efficiency.",
    image: "/dishes/steak-keto.jpg", price: 62500, kitchen: "continental", category: "clinical", rdVerified: true,
    macros: { protein: 48, carbs: 8, fat: 38, fiber: 5, calories: 540 }, isAvailable: true,
  },
  {
    id: 4, name: "Miso Glazed Black Cod", slug: "miso-cod",
    description: "Sustainably sourced black cod with bok choy and shiitake. Anti-inflammatory clinical nutrition protocol.",
    image: "/dishes/miso-cod.jpg", price: 54500, kitchen: "continental", category: "clinical", rdVerified: true,
    macros: { protein: 32, carbs: 18, fat: 16, fiber: 4, calories: 360 }, isAvailable: true,
  },
  {
    id: 5, name: "Superfood Smoothie Bowl", slug: "smoothie-bowl",
    description: "Antioxidant-dense acai with berries, chia, and almonds. Micronutrient-optimized for cellular health.",
    image: "/dishes/smoothie-bowl.jpg", price: 28500, kitchen: "continental", category: "wellness", rdVerified: true,
    macros: { protein: 12, carbs: 45, fat: 14, fiber: 11, calories: 340 }, isAvailable: true,
  },
  {
    id: 6, name: "Mediterranean Grain Salad", slug: "mediterranean-salad",
    description: "Chickpeas, feta, olives, and fresh herbs with olive oil. Heart-healthy Mediterranean protocol.",
    image: "/dishes/mediterranean-salad.jpg", price: 32500, kitchen: "continental", category: "wellness", rdVerified: false,
    macros: { protein: 18, carbs: 38, fat: 20, fiber: 10, calories: 380 }, isAvailable: true,
  },
];

const KITCHEN_TABS = ["continental", "chinese"];

export default function Menu() {
  const [activeTab, setActiveTab] = useState("continental");

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-white">Clinical Menu</h1>
        <p className="text-muted-foreground font-mono text-sm">
          Kitchen-synced · Inventory-aware · RD-verified
        </p>
      </div>

      {/* Kitchen line tabs */}
      <div className="flex gap-2">
        {KITCHEN_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-[#D4AF37] text-[#050505]"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MENU_ITEMS.map((item) => (
          <Link to={`/dish/${item.slug}`} key={item.id}>
            <Card
              className={`relative overflow-hidden transition-opacity ${
                !item.isAvailable ? "opacity-50 grayscale" : ""
              } bg-clinical-surface border-clinical-slate/20 hover:border-clinical-gold/30 transition-all duration-300 hover:shadow-clinical group`}
            >
              <CardContent className="p-0">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/80 via-transparent to-transparent" />
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    {item.rdVerified && (
                      <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 bg-green-500/10">
                        RD Verified
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] capitalize">
                      <ChefHat className="w-3 h-3 mr-1" />
                      {item.kitchen}
                    </Badge>
                  </div>
                  <div className="absolute top-3 right-3">
                    <Badge className="bg-clinical-gold/90 text-[#050505] border-0 font-bold tabular-nums text-xs">
                      {formatPrice(item.price)}
                    </Badge>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <MacroOverlay macros={item.macros} compact />
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="font-semibold text-sm text-white group-hover:text-clinical-gold transition-colors">
                    {item.name}
                  </h3>
                  <p className="text-xs text-clinical-zinc line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </CardContent>

              {!item.isAvailable && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl pointer-events-none">
                  <Badge variant="destructive" className="text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Out of Stock
                  </Badge>
                </div>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
