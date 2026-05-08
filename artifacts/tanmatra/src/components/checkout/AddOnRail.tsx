import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Sparkles, Crown } from "lucide-react";
import { addonsApi, type Addon } from "@/lib/marketplaceApi";
import { formatPrice } from "@/lib/api/adapter";

interface Props {
  cartTags: string[];
  selected: Map<number, number>;
  onChange: (next: Map<number, number>) => void;
}

export default function AddOnRail({ cartTags, selected, onChange }: Props) {
  const tagsKey = useMemo(() => cartTags.slice().sort().join(","), [cartTags]);
  const q = useQuery({
    queryKey: ["addons", tagsKey],
    queryFn: () => addonsApi.list(cartTags),
    staleTime: 60_000,
  });

  const setQty = (id: number, qty: number) => {
    const next = new Map(selected);
    if (qty <= 0) next.delete(id);
    else next.set(id, qty);
    onChange(next);
  };

  if (q.isLoading) {
    return (
      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-4 text-xs text-clinical-zinc">
          Loading add-ons…
        </CardContent>
      </Card>
    );
  }
  const addons = q.data?.addons ?? [];
  if (addons.length === 0) return null;

  const totalPaise = Array.from(selected.entries()).reduce((sum, [id, qty]) => {
    const a = addons.find((x) => x.id === id);
    return sum + (a ? a.pricePaise * qty : 0);
  }, 0);

  return (
    <Card className="bg-clinical-surface border-clinical-slate/20">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-clinical-gold" />
            Add a little extra
          </h2>
          {totalPaise > 0 && (
            <span className="text-[11px] text-clinical-gold tabular-nums">
              +{formatPrice(totalPaise)}
            </span>
          )}
        </div>
        <p className="text-[11px] text-clinical-zinc">
          RD-curated drinks, snacks &amp; supplements that pair with your meal.
        </p>
        <div className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-1">
          {addons.map((a) => (
            <AddonTile
              key={a.id}
              addon={a}
              qty={selected.get(a.id) ?? 0}
              onQty={(qty) => setQty(a.id, qty)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AddonTile({
  addon,
  qty,
  onQty,
}: {
  addon: Addon;
  qty: number;
  onQty: (qty: number) => void;
}) {
  return (
    <div className="w-44 shrink-0 rounded-lg border border-clinical-slate/30 bg-[#0b0b0b] overflow-hidden">
      <div className="relative h-24 bg-clinical-slate/20">
        {addon.image && (
          <img
            src={addon.image}
            alt={addon.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {addon.premiumOnly && (
          <Badge className="absolute top-1.5 left-1.5 bg-clinical-gold text-[#050505] border-0 text-[9px] font-bold flex items-center gap-1">
            <Crown className="w-2.5 h-2.5" /> PREMIUM
          </Badge>
        )}
        {addon.rdVerified && !addon.premiumOnly && (
          <Badge className="absolute top-1.5 left-1.5 bg-clinical-sage/90 text-[#050505] border-0 text-[9px]">
            RD
          </Badge>
        )}
      </div>
      <div className="p-2.5 space-y-1.5">
        <p className="text-[11px] text-white font-medium leading-snug line-clamp-2 h-8">
          {addon.name}
        </p>
        {addon.macros && (
          <p className="text-[9px] text-clinical-zinc">
            {addon.macros.kcal} kcal · {addon.macros.proteinG}g protein
          </p>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-clinical-gold tabular-nums">
            {formatPrice(addon.pricePaise)}
          </span>
          {qty === 0 ? (
            <button
              type="button"
              onClick={() => onQty(1)}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
            >
              ADD
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onQty(qty - 1)}
                aria-label="Decrease"
                className="w-5 h-5 rounded bg-clinical-slate/40 text-white flex items-center justify-center hover:bg-clinical-slate/60"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-[11px] text-white tabular-nums w-4 text-center">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => onQty(qty + 1)}
                aria-label="Increase"
                className="w-5 h-5 rounded bg-clinical-gold text-[#050505] flex items-center justify-center hover:bg-clinical-gold/90"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
