import { useMemo } from "react";
import { Link } from "react-router";
import { Minus, Plus, ShoppingBag, Trash2, X, Leaf, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  useCart,
  useCartDrawer,
  useCartTotals,
  type CartItem,
} from "@/lib/cartContext";
import { useMenuCatalog, type DishData } from "@/lib/menuData";
import { formatPrice } from "@/lib/api/adapter";
import { cn } from "@/lib/utils";
import AddToCartButton from "./AddToCartButton";

/**
 * Slide-out cart drawer (Sweetgreen-style) with an Uber Eats-style horizontal
 * upsell carousel. Single global instance mounted in root.tsx; opened by
 * Header cart icon, AddToCartButton, or any caller of useCartDrawer().open().
 */
export default function CartDrawer() {
  const { isOpen, close } = useCartDrawer();
  const { items, updateQty, removeItem } = useCart();
  const totals = useCartTotals();
  const { dishes } = useMenuCatalog();

  const upsells = useMemo(() => pickUpsells(dishes, items), [dishes, items]);
  const isEmpty = items.length === 0;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => (o ? null : close())}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 bg-clinical-dark border-l border-clinical-zinc/20 text-white flex flex-col"
      >
        <SheetHeader className="px-5 py-4 border-b border-clinical-zinc/15 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-clinical-gold" aria-hidden />
            <SheetTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-white">
              Your Cart
            </SheetTitle>
            {totals.totalQuantity > 0 && (
              <Badge className="bg-clinical-gold text-[#050505] border-0 h-5 px-1.5 text-[10px] font-bold">
                {totals.totalQuantity}
              </Badge>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close cart"
            className="text-clinical-zinc hover:text-white transition-colors"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </SheetHeader>

        {isEmpty ? (
          <EmptyState onClose={close} />
        ) : (
          <>
            <FreeDeliveryBar
              amountToFreeDelivery={totals.amountToFreeDelivery}
              progress={totals.freeDeliveryProgress}
              unlocked={totals.hasFreeDelivery}
            />

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {items.map((item) => (
                <CartLine
                  key={item.lineId}
                  item={item}
                  onInc={() => updateQty(item.lineId, +1)}
                  onDec={() => updateQty(item.lineId, -1)}
                  onRemove={() => removeItem(item.lineId)}
                />
              ))}

              {upsells.length > 0 && <UpsellCarousel dishes={upsells} />}
            </div>

            <FooterTotals totals={totals} onClose={close} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------------------------- pieces ---------------------------- */

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-4">
      <div className="w-16 h-16 rounded-full bg-clinical-gold/10 flex items-center justify-center">
        <ShoppingBag className="w-7 h-7 text-clinical-gold" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-white">Your cart is empty</h3>
        <p className="text-xs text-clinical-zinc max-w-[240px]">
          Browse the menu and add dishes designed by registered dietitians.
        </p>
      </div>
      <Link
        to="/menu"
        onClick={onClose}
        className="inline-flex items-center justify-center h-10 px-5 rounded-md bg-clinical-gold text-[#050505] text-xs font-semibold uppercase tracking-[0.12em] hover:bg-clinical-gold/90 transition-colors"
      >
        Browse menu
      </Link>
    </div>
  );
}

function FreeDeliveryBar({
  amountToFreeDelivery,
  progress,
  unlocked,
}: {
  amountToFreeDelivery: number;
  progress: number;
  unlocked: boolean;
}) {
  return (
    <div className="px-5 pt-3 pb-2 border-b border-clinical-zinc/10 bg-clinical-dark/60">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-clinical-zinc">
          Free Delivery
        </span>
        <span
          className={cn(
            "text-[11px] tabular-nums",
            unlocked ? "text-clinical-sage" : "text-white",
          )}
        >
          {unlocked
            ? "Unlocked"
            : `Add ${formatPrice(amountToFreeDelivery)} more`}
        </span>
      </div>
      <Progress
        value={progress}
        className="h-1 bg-clinical-zinc/15 [&>div]:bg-clinical-gold"
      />
    </div>
  );
}

function CartLine({
  item,
  onInc,
  onDec,
  onRemove,
}: {
  item: CartItem;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
}) {
  const lineTotal = item.unitPrice * item.quantity;
  return (
    <div className="flex gap-3 rounded-lg border border-clinical-zinc/15 bg-clinical-zinc/[0.04] p-3">
      <img
        src={item.image}
        alt=""
        loading="lazy"
        className="w-16 h-16 rounded-md object-cover shrink-0 bg-clinical-zinc/10"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white leading-tight truncate">
              {item.name}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-clinical-zinc">
              {item.isVeg && <Leaf className="w-3 h-3 text-clinical-sage" aria-label="Vegetarian" />}
              {item.rdVerified && (
                <ShieldCheck className="w-3 h-3 text-clinical-gold" aria-label="RD-verified" />
              )}
              <span className="tabular-nums">
                {item.macros.calories} kcal · P{item.macros.protein}g
              </span>
            </div>
            {item.customizations.length > 0 && (
              <p className="text-[10px] text-clinical-zinc/80 mt-1 line-clamp-1">
                {item.customizations.join(" · ")}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${item.name}`}
            className="text-clinical-zinc hover:text-red-400 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>

        <div className="flex items-center justify-between mt-2.5">
          <QtyStepper
            quantity={item.quantity}
            onInc={onInc}
            onDec={onDec}
            name={item.name}
          />
          <span className="text-sm font-semibold tabular-nums text-white">
            {formatPrice(lineTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

function QtyStepper({
  quantity,
  onInc,
  onDec,
  name,
}: {
  quantity: number;
  onInc: () => void;
  onDec: () => void;
  name: string;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-clinical-zinc/25 bg-clinical-dark">
      <button
        type="button"
        onClick={onDec}
        aria-label={`Decrease ${name} quantity`}
        className="w-7 h-7 inline-flex items-center justify-center text-clinical-zinc hover:text-clinical-gold transition-colors"
      >
        <Minus className="w-3 h-3" aria-hidden />
      </button>
      <span
        aria-live="polite"
        className="w-6 text-center text-xs font-semibold tabular-nums text-white"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={onInc}
        aria-label={`Increase ${name} quantity`}
        className="w-7 h-7 inline-flex items-center justify-center text-clinical-zinc hover:text-clinical-gold transition-colors"
      >
        <Plus className="w-3 h-3" aria-hidden />
      </button>
    </div>
  );
}

function UpsellCarousel({ dishes }: { dishes: DishData[] }) {
  return (
    <section aria-label="Frequently added together" className="pt-2">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-clinical-gold">
          Add to your order
        </h3>
        <span className="text-[10px] text-clinical-zinc">RD picks</span>
      </div>
      <div
        className="-mx-1 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin"
        role="list"
      >
        {dishes.map((d) => (
          <UpsellCard key={d.id} dish={d} />
        ))}
      </div>
    </section>
  );
}

function UpsellCard({ dish }: { dish: DishData }) {
  return (
    <article
      role="listitem"
      className="snap-start shrink-0 w-[156px] rounded-lg border border-clinical-zinc/15 bg-clinical-zinc/[0.04] overflow-hidden"
    >
      <div className="relative aspect-[4/3] bg-clinical-zinc/10">
        <img
          src={dish.image}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
        {dish.isVeg && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center justify-center w-4 h-4 rounded-sm border border-clinical-sage/70 bg-clinical-dark/70">
            <Leaf className="w-2.5 h-2.5 text-clinical-sage" aria-label="Vegetarian" />
          </span>
        )}
      </div>
      <div className="p-2 space-y-1.5">
        <p className="text-[11px] font-medium leading-tight text-white line-clamp-2 min-h-[28px]">
          {dish.name}
        </p>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold tabular-nums text-clinical-gold">
            {formatPrice(dish.price)}
          </span>
          <AddToCartButton
            className="!h-7 !px-2 !text-[10px]"
            label="Add"
            openDrawerOnAdd={false}
            item={{
              dishId: dish.id,
              slug: dish.slug,
              name: dish.name,
              image: dish.image,
              basePrice: dish.price,
              unitPrice: dish.price,
              quantity: 1,
              kitchen: dish.kitchen,
              isVeg: dish.isVeg,
              rdVerified: dish.rdVerified,
              macros: dish.macros,
              customizations: [],
            }}
          />
        </div>
      </div>
    </article>
  );
}

function FooterTotals({
  totals,
  onClose,
}: {
  totals: ReturnType<typeof useCartTotals>;
  onClose: () => void;
}) {
  return (
    <div className="border-t border-clinical-zinc/15 bg-clinical-dark/95 px-5 py-4 space-y-3">
      <dl className="space-y-1.5 text-xs">
        <Row label="Subtotal" value={formatPrice(totals.subtotal)} />
        <Row label="GST (5%)" value={formatPrice(totals.tax)} muted />
        <Row
          label="Delivery"
          value={totals.hasFreeDelivery ? "FREE" : formatPrice(totals.deliveryFee)}
          valueClass={totals.hasFreeDelivery ? "text-clinical-sage" : undefined}
        />
        <div className="h-px bg-clinical-zinc/15 my-2" />
        <Row
          label="Total"
          value={formatPrice(totals.total)}
          large
        />
      </dl>
      <Link
        to="/checkout"
        onClick={onClose}
        className="flex items-center justify-center h-11 rounded-md bg-clinical-gold text-[#050505] text-xs font-semibold uppercase tracking-[0.14em] hover:bg-clinical-gold/90 transition-colors"
      >
        Checkout · {formatPrice(totals.total)}
      </Link>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  large,
  valueClass,
}: {
  label: string;
  value: string;
  muted?: boolean;
  large?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt
        className={cn(
          muted ? "text-clinical-zinc" : "text-clinical-zinc/90",
          large && "text-white font-semibold uppercase tracking-[0.12em] text-[11px]",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          large ? "text-base font-bold text-clinical-gold" : "text-white",
          valueClass,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* --------------------------- helpers --------------------------- */

/**
 * Pick up to 6 upsell candidates: dishes not already in cart, biased toward
 * the same kitchen as items already added. Falls back to RD-verified picks.
 */
function pickUpsells(all: DishData[], items: CartItem[]): DishData[] {
  if (all.length === 0) return [];
  const inCart = new Set(items.map((i) => i.dishId));
  const kitchens = new Set(items.map((i) => i.kitchen));
  const candidates = all.filter((d) => !inCart.has(d.id));
  const sameKitchen = candidates.filter((d) => kitchens.has(d.kitchen));
  const pool = sameKitchen.length >= 4 ? sameKitchen : candidates;
  // RD-verified first, then everything else.
  const sorted = [...pool].sort((a, b) => Number(b.rdVerified) - Number(a.rdVerified));
  return sorted.slice(0, 6);
}
