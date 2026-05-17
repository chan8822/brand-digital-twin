import { useEffect, useRef } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCart,
  useAddToCartStatus,
  useCartDrawer,
  type CartItem,
} from "@/lib/cartContext";

interface Props {
  item: Omit<CartItem, "lineId">;
  className?: string;
  label?: string;
  openDrawerOnAdd?: boolean;
  fullWidth?: boolean;
}

/**
 * Add-to-cart button with strict state lifecycle:
 *   idle → loading (spinner) → success (check) → idle
 *
 * The store keeps status keyed by dishId, so the same dish renders the
 * same state everywhere it appears (card, dish page, upsell carousel).
 */
export default function AddToCartButton({
  item,
  className,
  label = "Add",
  openDrawerOnAdd = true,
  fullWidth = false,
}: Props) {
  const { addItem } = useCart();
  const { status, setStatus } = useAddToCartStatus(item.dishId);
  const { open: openDrawer } = useCartDrawer();
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const onClick = () => {
    if (status !== "idle") return;
    setStatus("loading");
    // Add on next tick so the loading state is visible even on very fast machines.
    timerRef.current = window.setTimeout(() => {
      addItem(item);
      setStatus("success");
      if (openDrawerOnAdd) openDrawer();
      timerRef.current = window.setTimeout(() => setStatus("idle"), 1200);
    }, 180);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "loading"}
      aria-live="polite"
      aria-label={
        status === "success" ? `${item.name} added to cart` : `Add ${item.name} to cart`
      }
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 h-9 text-xs font-semibold uppercase tracking-wider transition-all",
        "bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 active:scale-[0.98]",
        "disabled:cursor-not-allowed",
        status === "success" && "bg-clinical-sage text-[#050505]",
        fullWidth && "w-full",
        className,
      )}
    >
      {status === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
      {status === "success" && <Check className="w-3.5 h-3.5" aria-hidden />}
      {status === "idle" && <Plus className="w-3.5 h-3.5" aria-hidden />}
      <span>{status === "success" ? "Added" : label}</span>
    </button>
  );
}
