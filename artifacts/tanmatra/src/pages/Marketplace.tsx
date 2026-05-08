import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingBag, Sparkles, Package, ChevronRight } from "lucide-react";
import { marketplaceApi, type MarketplaceCategory } from "@/lib/marketplaceApi";
import { formatPrice } from "@/lib/api/adapter";

const CATEGORIES: Array<{ value: "all" | MarketplaceCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "oils", label: "Oils" },
  { value: "sauces", label: "Sauces" },
  { value: "supplements", label: "Supplements" },
  { value: "snacks", label: "Snacks" },
  { value: "pantry", label: "Pantry" },
];

export default function Marketplace() {
  const [category, setCategory] = useState<"all" | MarketplaceCategory>("all");
  const q = useQuery({
    queryKey: ["marketplace", "items", category],
    queryFn: () => marketplaceApi.listItems(category),
    staleTime: 60_000,
  });
  const items = q.data?.items ?? [];

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-300">
      <header className="space-y-3">
        <Badge className="bg-clinical-sage/15 text-clinical-sage border border-clinical-sage/40 text-[11px] tracking-widest">
          <Sparkles className="w-3 h-3 mr-1.5" /> RD-CURATED PANTRY
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-serif text-white">
          The Tanmatra Marketplace
        </h1>
        <p className="text-sm text-clinical-zinc max-w-2xl">
          Single-origin oils, small-batch sauces, third-party-tested supplements.
          Hand-picked by our registered dietitians. Ship to you, or bundle with
          your next meal delivery to skip a trip.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              category === c.value
                ? "bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30"
                : "text-clinical-zinc hover:text-white border border-clinical-slate/30 hover:border-clinical-slate/60"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {q.isLoading && (
        <p className="text-xs text-clinical-zinc">Loading pantry…</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => (
          <Card
            key={item.id}
            className="bg-clinical-surface border-clinical-slate/20 overflow-hidden hover:border-clinical-gold/40 transition-colors"
          >
            <Link to={`/marketplace/${item.slug}`} className="block">
              <div className="relative h-44 bg-clinical-slate/20">
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
                {item.rdVerified && (
                  <Badge className="absolute top-2 left-2 bg-clinical-sage text-[#050505] border-0 text-[10px]">
                    RD-curated
                  </Badge>
                )}
                {item.stockQty < 10 && item.stockQty > 0 && (
                  <Badge className="absolute top-2 right-2 bg-clinical-rose text-white border-0 text-[10px]">
                    Only {item.stockQty} left
                  </Badge>
                )}
              </div>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white leading-snug">
                    {item.name}
                  </h3>
                  <span className="text-sm text-clinical-gold tabular-nums shrink-0">
                    {formatPrice(item.pricePaise)}
                  </span>
                </div>
                <p className="text-[11px] text-clinical-zinc line-clamp-2">
                  {item.description}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-clinical-zinc">
                  {item.weightLabel && <span>{item.weightLabel}</span>}
                  {item.supplierName && (
                    <>
                      <span>·</span>
                      <span>{item.supplierName}</span>
                    </>
                  )}
                </div>
                {item.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.badges.slice(0, 3).map((b) => (
                      <span
                        key={b}
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-clinical-slate/30 text-clinical-zinc"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>

      {!q.isLoading && items.length === 0 && (
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-10 text-center text-sm text-clinical-zinc">
            <Package className="w-6 h-6 mx-auto mb-2 text-clinical-gold" />
            No items in this category yet.
          </CardContent>
        </Card>
      )}

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-5 flex items-center gap-3">
          <ShoppingBag className="w-5 h-5 text-clinical-gold" />
          <p className="text-xs text-clinical-zinc flex-1">
            Got a meal order coming? Bundle pantry items with your next delivery
            and skip the shipping fee.
          </p>
          <Button asChild variant="outline" className="border-clinical-slate/40 text-clinical-gold">
            <Link to="/orders">
              My orders <ChevronRight className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
