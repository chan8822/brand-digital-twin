import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, Trash2, X, Leaf, ShieldCheck, Loader2, Check, Zap, Crown } from "lucide-react";
import { toast } from "sonner";
import {
  useCart,
  useCartDrawer,
  useCartTotals,
  FREE_DELIVERY_THRESHOLD,
  DELIVERY_FEE,
  useAddToCartStatus,
  type CartItem,
} from "@/lib/cartContext";
import { useMenuCatalog, type DishData } from "@/lib/menuData";
import { addressesApi } from "@/lib/userAddressesApi";
import { API_BASE } from "@/lib/apiBase";
import { formatPrice } from "@/lib/api/adapter";
import { track } from "@/lib/analytics";
import { PANEL_SLIDE, BACKDROP, PULSE_OPACITY } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { unsplashSrcset } from "@/lib/imgSrcset";
import { usePremiumStatus } from "@/lib/usePremium";

// Suppress unused-import warning — DELIVERY_FEE is used in the comment context only,
// the actual constant is pulled from cartContext which re-exports it.
void DELIVERY_FEE;

const UPSELL_CATEGORIES = new Set<string>(["beverages", "soups", "snacks", "breakfast"]);

/**
 * Slide-out cart drawer built with Framer Motion.
 * Ghost-Math: hovering an upsell card shows a projected fill on the
 * free-delivery progress bar before the user commits to adding it.
 */
export default function CartDrawer() {
  const { isOpen, close } = useCartDrawer();
  const { items, addItem, updateQty, removeItem, clear } = useCart();
  const totals = useCartTotals();
  const { dishes } = useMenuCatalog();
  const navigate = useNavigate();
  const { isPremium } = usePremiumStatus();
  const [expressLoading, setExpressLoading] = useState(false);

  // Ghost-math state
  const [ghostItem, setGhostItemState] = useState<DishData | null>(null);
  const ghostTimerRef = useRef<number | null>(null);

  const setGhost = useCallback((dish: DishData | null) => {
    if (ghostTimerRef.current) window.clearTimeout(ghostTimerRef.current);
    if (dish === null) {
      ghostTimerRef.current = window.setTimeout(() => setGhostItemState(null), 80);
    } else {
      setGhostItemState(dish);
      track("upsell_focus", { dishId: dish.id, dishName: dish.name });
    }
  }, []);

  // Projected fill for ghost-math
  const subtotal = totals.subtotal;
  const currentFill = Math.min(1, subtotal / FREE_DELIVERY_THRESHOLD);
  const projectedFill =
    ghostItem && !totals.hasFreeDelivery
      ? Math.min(1, (subtotal + ghostItem.price) / FREE_DELIVERY_THRESHOLD)
      : null;
  const ghostUnlocksDelivery =
    projectedFill !== null && projectedFill >= 1 && !totals.hasFreeDelivery;

  // Upsell handler with analytics
  const addUpsell = useCallback(
    (dish: DishData) => {
      addItem({
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
      });
      track("upsell_add", { dishId: dish.id, dishName: dish.name, price: dish.price });
      const wouldUnlock =
        projectedFill !== null && projectedFill >= 1 && !totals.hasFreeDelivery;
      if (wouldUnlock) {
        track("free_delivery_unlocked", { via: "upsell" });
      }
      setGhost(null);
    },
    [addItem, projectedFill, totals.hasFreeDelivery, setGhost],
  );

  const upsells = useMemo(
    () => pickUpsells(dishes, items, totals.amountToFreeDelivery),
    [dishes, items, totals.amountToFreeDelivery],
  );

  // Express UPI checkout: resolve default address, create Razorpay order,
  // open modal inline — bypasses the full checkout page for impulse orders.
  // Falls back silently to /checkout if any step fails (no error toast).
  const handleExpressUPI = useCallback(async () => {
    const rpKey = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;
    if (!rpKey) { navigate("/checkout"); return; }
    // Cancel any previous in-flight request before starting a new one.
    expressAbortRef.current?.abort();
    expressAbortRef.current = new AbortController();
    const { signal } = expressAbortRef.current;
    setExpressLoading(true);
    try {
      // 1. Resolve default address
      const { addresses } = await addressesApi.list();
      const addr = addresses.find((a) => a.isDefault) ?? addresses[0];
      if (!addr) { navigate("/checkout"); return; }

      // 2. Create server-side Razorpay order
      const rpRes = await fetch(`${API_BASE}/payments/razorpay/order`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountPaise: totals.total }),
        signal,
      });
      if (!rpRes.ok) { navigate("/checkout"); return; }
      const { razorpayOrderId } = (await rpRes.json()) as { razorpayOrderId: string };

      // 3. Load Razorpay script lazily (5 s timeout → fallback to /checkout)
      await new Promise<void>((resolve, reject) => {
        if ((window as { Razorpay?: unknown }).Razorpay) { resolve(); return; }
        const timer = window.setTimeout(() => reject(new Error("timeout")), 5000);
        if (!document.getElementById("__rzp_script")) {
          const s = document.createElement("script");
          s.id = "__rzp_script";
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.async = true;
          s.onload = () => { window.clearTimeout(timer); resolve(); };
          s.onerror = () => { window.clearTimeout(timer); reject(new Error("load-failed")); };
          document.head.appendChild(s);
        } else {
          window.clearTimeout(timer);
          resolve();
        }
      });

      // 4. Open modal
      const localOrderId = `TAN-${Date.now()}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RazorpayClass = (window as any).Razorpay;
      if (!RazorpayClass) { navigate("/checkout"); return; }
      const rzp = new RazorpayClass({
        key: rpKey,
        amount: totals.total,
        currency: "INR",
        order_id: razorpayOrderId,
        name: "Tanmatra",
        description: `${totals.totalQuantity} item${totals.totalQuantity === 1 ? "" : "s"}`,
        theme: { color: "#D4AF37" },
        prefill: { contact: addr.phone },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            await fetch(`${API_BASE}/payments/razorpay/verify`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: localOrderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
          } catch { /* non-fatal; order recorded server-side */ }
          clear();
          close();
          navigate(`/track/${localOrderId}`);
        },
        modal: {
          ondismiss: () => setExpressLoading(false),
        },
      });
      rzp.open();
    } catch {
      navigate("/checkout");
    } finally {
      setExpressLoading(false);
    }
  }, [totals, navigate, close, clear]);
  const isEmpty = items.length === 0;

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [isOpen]);

  // Analytics: cart_open
  useEffect(() => {
    if (isOpen) {
      track("cart_open");
    }
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Focus trap refs
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Abort any in-flight express-checkout fetch when the component unmounts
  // (e.g., user navigates away while the order-creation request is pending).
  const expressAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { expressAbortRef.current?.abort(); }, []);

  // Focus the close button when drawer opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Manual focus trap
  const handlePanelKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    const els = Array.from(focusable);
    if (els.length === 0) return;
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cart-backdrop"
            variants={BACKDROP}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={close}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="cart-panel"
            ref={panelRef}
            variants={PANEL_SLIDE}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            onKeyDown={handlePanelKeyDown}
            className="fixed right-0 top-0 z-50 h-[100dvh] w-full max-w-[min(420px,100vw)] bg-clinical-dark border-l border-clinical-zinc/20 text-white flex flex-col shadow-2xl"
          >
            <DrawerHeader
              totalQuantity={totals.totalQuantity}
              onClose={close}
              closeButtonRef={closeButtonRef}
            />

            {isEmpty ? (
              <EmptyState onClose={close} />
            ) : (
              <>
                <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y px-5 py-4 space-y-3">
                  {/* FreeDeliveryBar inside scroll so it stays visible on long carts */}
                  <FreeDeliveryBar
                    subtotal={subtotal}
                    currentFill={currentFill}
                    projectedFill={projectedFill}
                    ghostUnlocksDelivery={ghostUnlocksDelivery}
                    ghostItem={ghostItem}
                    hasFreeDelivery={totals.hasFreeDelivery}
                    amountToFreeDelivery={totals.amountToFreeDelivery}
                  />
                  <CartLineList
                    items={items}
                    updateQty={updateQty}
                    removeItem={removeItem}
                    addItem={addItem}
                  />

                  {upsells.length > 0 && (
                    <UpsellCarousel
                      dishes={upsells}
                      onGhost={setGhost}
                      onAdd={addUpsell}
                    />
                  )}

                  {!isPremium && (
                    <button
                      type="button"
                      onClick={() => { close(); navigate("/premium"); }}
                      className="w-full text-left rounded-xl border border-clinical-gold/25 bg-clinical-gold/[0.06] hover:bg-clinical-gold/10 transition-colors p-3.5 flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-clinical-gold/15 flex items-center justify-center shrink-0">
                        <Crown className="w-4 h-4 text-clinical-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-white">Unlock Tanmatra Premium</p>
                        <p className="text-[10px] text-clinical-zinc leading-snug mt-0.5">
                          Priority delivery · free RD consult · exclusive dishes
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-clinical-gold shrink-0">₹999/mo →</span>
                    </button>
                  )}
                </div>


                <FooterTotals
                  totals={totals}
                  items={items}
                  onClose={close}
                  onExpressUPI={handleExpressUPI}
                  expressLoading={expressLoading}
                />
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* DrawerHeader                                                          */
/* ------------------------------------------------------------------ */

function DrawerHeader({
  totalQuantity,
  onClose,
  closeButtonRef,
}: {
  totalQuantity: number;
  onClose: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="px-5 py-4 border-b border-clinical-zinc/15 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-4 h-4 text-clinical-gold" aria-hidden />
        <span className="text-sm font-semibold uppercase tracking-[0.14em] text-white">
          Your Cart
        </span>
        {totalQuantity > 0 && (
          <span className="inline-flex items-center justify-center bg-clinical-gold text-[#050505] rounded-full h-5 min-w-[20px] px-1.5 text-[10px] font-bold">
            {totalQuantity}
          </span>
        )}
      </div>
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Close cart"
        className="w-11 h-11 -mr-2 inline-flex items-center justify-center text-clinical-zinc hover:text-white transition-colors"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyState                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* FreeDeliveryBar                                                       */
/* ------------------------------------------------------------------ */

function FreeDeliveryBar({
  currentFill,
  projectedFill,
  ghostUnlocksDelivery,
  ghostItem,
  hasFreeDelivery,
  amountToFreeDelivery,
}: {
  subtotal: number;
  currentFill: number;
  projectedFill: number | null;
  ghostUnlocksDelivery: boolean;
  ghostItem: DishData | null;
  hasFreeDelivery: boolean;
  amountToFreeDelivery: number;
}) {
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false,
    [],
  );

  const showGhostLayer = projectedFill !== null && !hasFreeDelivery;
  const ghostWidth =
    showGhostLayer && projectedFill !== null
      ? Math.max(0, projectedFill - currentFill) * 100
      : 0;

  // Copy logic
  let label: string;
  if (hasFreeDelivery) {
    label = "Free delivery unlocked ✓";
  } else if (ghostUnlocksDelivery) {
    label = "→ Unlocks free delivery";
  } else if (ghostItem !== null) {
    label = `Would add ${ghostItem.name} · ${formatPrice(ghostItem.price)}`;
  } else {
    label = `Add ${formatPrice(amountToFreeDelivery)} more for free delivery`;
  }

  return (
    <div className="rounded-lg px-3 pt-3 pb-2 border border-clinical-zinc/10 bg-clinical-dark/60">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-clinical-zinc">
          Free Delivery
        </span>
        <span
          className={cn(
            "text-[11px] tabular-nums transition-colors duration-200",
            hasFreeDelivery
              ? "text-clinical-sage"
              : ghostUnlocksDelivery
              ? "text-matcha"
              : "text-white",
          )}
        >
          {label}
        </span>
      </div>

      {/* Progress track */}
      <div className="relative h-1.5 rounded-full bg-clinical-zinc/15 overflow-hidden">
        {/* Filled (real) track */}
        <div
          className="absolute inset-y-0 left-0 bg-clinical-gold rounded-full transition-all duration-300"
          style={{ width: `${currentFill * 100}%` }}
        />

        {/* Ghost layer — uses only transform (GPU-composited, zero layout cost).
            translateX moves by a percentage of the element's own width (= 100%
            of the bar), then scaleX shrinks it to ghostWidth% from the left. */}
        {showGhostLayer && ghostWidth > 0 && (
          <motion.div
            className={cn(
              "absolute inset-y-0 left-0 w-full rounded-full origin-left",
              prefersReducedMotion ? "bg-matcha/25" : "bg-matcha/40",
            )}
            style={{
              transform: `translateX(${currentFill * 100}%) scaleX(${ghostWidth / 100})`,
            }}
            variants={prefersReducedMotion ? undefined : PULSE_OPACITY}
            initial={prefersReducedMotion ? undefined : "idle"}
            animate={prefersReducedMotion ? undefined : "pulse"}
          />
        )}

        {/* Micro-label above bar when ghost unlocks delivery */}
        {ghostUnlocksDelivery && (
          <span
            className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-matcha whitespace-nowrap pointer-events-none"
            aria-hidden="true"
          >
            Unlocks free delivery
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CartLineList                                                          */
/* ------------------------------------------------------------------ */

function CartLineList({
  items,
  updateQty,
  removeItem,
  addItem,
}: {
  items: CartItem[];
  updateQty: (lineId: string, delta: number) => void;
  removeItem: (lineId: string) => void;
  addItem: (item: Omit<CartItem, "lineId">) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <CartLine
          key={item.lineId}
          item={item}
          onInc={() => updateQty(item.lineId, +1)}
          onDec={() => updateQty(item.lineId, -1)}
          onRemove={() => removeItem(item.lineId)}
          addItem={addItem}
        />
      ))}
    </div>
  );
}

function CartLine({
  item,
  onInc,
  onDec,
  onRemove,
  addItem,
}: {
  item: CartItem;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
  addItem: (item: Omit<CartItem, "lineId">) => void;
}) {
  const lineTotal = item.unitPrice * item.quantity;

  const handleRemove = () => {
    onRemove();
    toast(`Removed ${item.name}`, {
      action: {
        label: "Undo",
        onClick: () => addItem({
          dishId: item.dishId,
          slug: item.slug,
          name: item.name,
          image: item.image,
          basePrice: item.basePrice,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          kitchen: item.kitchen,
          isVeg: item.isVeg,
          rdVerified: item.rdVerified,
          macros: item.macros,
          customizations: item.customizations,
        }),
      },
      duration: 4000,
    });
  };

  return (
    <div className="flex gap-3 rounded-lg border border-clinical-zinc/15 bg-clinical-zinc/[0.04] p-3">
      <img
        src={item.image}
        srcSet={unsplashSrcset(item.image)}
        sizes="64px"
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
              {item.isVeg && (
                <Leaf className="w-3 h-3 text-clinical-sage" aria-label="Vegetarian" />
              )}
              {item.rdVerified && (
                <ShieldCheck
                  className="w-3 h-3 text-clinical-gold"
                  aria-label="RD-verified"
                />
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
            onClick={handleRemove}
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
            onDec={item.quantity === 1 ? handleRemove : onDec}
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
        className="w-11 h-11 inline-flex items-center justify-center text-clinical-zinc hover:text-clinical-gold transition-colors"
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
        className="w-11 h-11 inline-flex items-center justify-center text-clinical-zinc hover:text-clinical-gold transition-colors"
      >
        <Plus className="w-3 h-3" aria-hidden />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* UpsellCarousel                                                        */
/* ------------------------------------------------------------------ */

function UpsellCarousel({
  dishes,
  onGhost,
  onAdd,
}: {
  dishes: DishData[];
  onGhost: (dish: DishData | null) => void;
  onAdd: (dish: DishData) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    const SCROLL_AMOUNT = 160;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollRef.current.scrollBy({ left: SCROLL_AMOUNT, behavior: "smooth" });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollRef.current.scrollBy({ left: -SCROLL_AMOUNT, behavior: "smooth" });
    }
  }, []);

  return (
    <section aria-label="Frequently added together" className="pt-2">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-clinical-gold">
          Add to your order
        </h3>
        <span className="text-[10px] text-clinical-zinc">RD picks</span>
      </div>
      <div
        ref={scrollRef}
        role="list"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="-mx-1 flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin focus:outline-none"
        aria-label="Upsell items, use arrow keys to scroll"
      >
        {dishes.map((d) => (
          <UpsellCard key={d.id} dish={d} onGhost={onGhost} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}

function UpsellCard({
  dish,
  onGhost,
  onAdd,
}: {
  dish: DishData;
  onGhost: (dish: DishData | null) => void;
  onAdd: (dish: DishData) => void;
}) {
  const { status, setStatus } = useAddToCartStatus(dish.id);
  const timerRef = useRef<number | null>(null);
  // Track whether ghost preview is active (for tap-to-preview on touch devices)
  const [ghostActive, setGhostActive] = useState(false);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const handleAdd = () => {
    if (status !== "idle") return;
    // On touch: first tap shows ghost preview; second tap confirms add.
    // On pointer: hover already triggered ghost, so always add immediately.
    if (!ghostActive) {
      setGhostActive(true);
      onGhost(dish);
      return;
    }
    setGhostActive(false);
    onGhost(null);
    setStatus("loading");
    timerRef.current = window.setTimeout(() => {
      onAdd(dish);
      setStatus("success");
      timerRef.current = window.setTimeout(() => setStatus("idle"), 1200);
    }, 180);
  };

  return (
    <article
      role="group"
      aria-label={dish.name}
      className="snap-start shrink-0 w-[156px] rounded-lg border border-clinical-zinc/15 bg-upsell-accent overflow-hidden"
      onPointerEnter={() => { setGhostActive(true); onGhost(dish); }}
      onPointerLeave={() => { setGhostActive(false); onGhost(null); }}
      onFocus={() => onGhost(dish)}
      onBlur={() => { setGhostActive(false); onGhost(null); }}
    >
      <div className="relative aspect-[4/3] bg-clinical-zinc/10">
        <img
          src={dish.image}
          srcSet={unsplashSrcset(dish.image)}
          sizes="156px"
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
          <button
            type="button"
            onClick={handleAdd}
            disabled={status === "loading"}
            aria-label={ghostActive ? `Confirm add ${dish.name}` : `Preview ${dish.name}`}
            className={cn(
              "h-11 px-2 text-[10px] font-semibold text-[#050505] rounded-md transition-colors uppercase tracking-[0.08em] shrink-0 inline-flex items-center gap-1",
              status === "success" ? "bg-clinical-sage" : "bg-clinical-gold hover:bg-clinical-gold/90",
            )}
          >
            {status === "idle" && <><Plus className="w-3 h-3" /> Add</>}
            {status === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
            {status === "success" && <Check className="w-3 h-3" />}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* FooterTotals                                                          */
/* ------------------------------------------------------------------ */

function FooterTotals({
  totals,
  items,
  onClose,
  onExpressUPI,
  expressLoading,
}: {
  totals: ReturnType<typeof useCartTotals>;
  items: CartItem[];
  onClose: () => void;
  onExpressUPI: () => void;
  expressLoading: boolean;
}) {
  const cartMacros = useMemo(
    () =>
      items.reduce(
        (acc, it) => ({
          calories: acc.calories + Math.round(it.macros.calories * it.quantity),
          protein: acc.protein + Math.round(it.macros.protein * it.quantity),
          carbs: acc.carbs + Math.round(it.macros.carbs * it.quantity),
          fat: acc.fat + Math.round(it.macros.fat * it.quantity),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [items],
  );

  const hasExpressUPI = Boolean(import.meta.env.VITE_RAZORPAY_KEY_ID);

  return (
    <div className="border-t border-clinical-zinc/15 bg-clinical-dark/95 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 shrink-0">
      <dl className="space-y-1.5 text-xs">
        <TotalsRow label="Subtotal" value={formatPrice(totals.subtotal)} />
        <TotalsRow label="GST 5%" value={formatPrice(totals.tax)} muted />
        <TotalsRow
          label="Delivery"
          value={totals.hasFreeDelivery ? "FREE" : formatPrice(totals.deliveryFee)}
          valueClass={totals.hasFreeDelivery ? "text-clinical-sage font-semibold" : undefined}
        />
        <div className="h-px bg-clinical-zinc/15 my-2" />
        <TotalsRow label="Total" value={formatPrice(totals.total)} large />
      </dl>

      {/* Aggregated cart macros — clinical differentiator */}
      <div className="flex items-center justify-between text-[10px] text-clinical-zinc/70 py-1.5 px-2 rounded-lg bg-clinical-surface/50">
        <span className="tabular-nums">{cartMacros.calories} kcal</span>
        <span className="tabular-nums text-clinical-zinc/50">·</span>
        <span className="tabular-nums"><span className="text-clinical-zinc/90">{cartMacros.protein}g</span> protein</span>
        <span className="tabular-nums text-clinical-zinc/50">·</span>
        <span className="tabular-nums"><span className="text-clinical-zinc/90">{cartMacros.carbs}g</span> carbs</span>
        <span className="tabular-nums text-clinical-zinc/50">·</span>
        <span className="tabular-nums"><span className="text-clinical-zinc/90">{cartMacros.fat}g</span> fat</span>
      </div>

      <p className="text-[10px] text-clinical-zinc/70 text-center">
        Discounts &amp; credits applied at checkout
      </p>

      {/* Express UPI — bypasses checkout entirely when Razorpay key is set */}
      {hasExpressUPI && (
        <button
          type="button"
          onClick={onExpressUPI}
          disabled={expressLoading}
          className="flex items-center justify-center gap-2 h-11 w-full rounded-md bg-clinical-surface border border-clinical-gold/30 text-clinical-gold text-xs font-semibold hover:bg-clinical-gold/10 transition-colors disabled:opacity-60"
        >
          {expressLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              Pay now · UPI / Cards
            </>
          )}
        </button>
      )}

      <Link
        to="/checkout"
        onClick={onClose}
        className="flex items-center justify-center h-11 rounded-md bg-clinical-gold text-[#050505] text-xs font-semibold uppercase tracking-[0.14em] hover:bg-clinical-gold/90 transition-colors"
      >
        {hasExpressUPI ? "Checkout →" : `Checkout · ${formatPrice(totals.total)}`}
      </Link>
    </div>
  );
}

function TotalsRow({
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

/* ------------------------------------------------------------------ */
/* Helpers                                                               */
/* ------------------------------------------------------------------ */

/**
 * Pick up to 8 upsell candidates with three layers of intelligence:
 * 1. Dietary coherence — if cart is keto/protein-dominant, bias toward
 *    matching add-ons so suggestions stay within the user's protocol.
 * 2. Threshold bridging — when the user is within ₹200 of free delivery,
 *    surface the item whose price most precisely bridges the gap first.
 * 3. RD-verified default sort when neither condition fires.
 */
function pickUpsells(
  all: DishData[],
  items: CartItem[],
  amountToFreeDelivery: number,
): DishData[] {
  if (all.length === 0) return [];
  const inCart = new Set(items.map((i) => i.dishId));
  let candidates = all.filter(
    (d) =>
      UPSELL_CATEGORIES.has(d.category) && !inCart.has(d.id) && d.isAvailable,
  );

  // Layer 1: dietary coherence
  if (items.length > 0) {
    const totalCals = items.reduce((s, it) => s + it.macros.calories * it.quantity, 0);
    const totalFat  = items.reduce((s, it) => s + it.macros.fat * it.quantity, 0);
    const totalCarbs = items.reduce((s, it) => s + it.macros.carbs * it.quantity, 0);
    const totalProtein = items.reduce((s, it) => s + it.macros.protein * it.quantity, 0);

    const fatCalFraction = totalCals > 0 ? (totalFat * 9) / totalCals : 0;
    const proteinCalFraction = totalCals > 0 ? (totalProtein * 4) / totalCals : 0;

    const isKeto = fatCalFraction > 0.4 && totalCarbs < 30;
    const isProteinFirst = !isKeto && proteinCalFraction > 0.35;

    if (isKeto) {
      const ketoOpts = candidates.filter((d) => d.macros.carbs < 10);
      if (ketoOpts.length >= 3) candidates = ketoOpts;
    } else if (isProteinFirst) {
      candidates = [...candidates].sort(
        (a, b) =>
          b.macros.protein / (b.macros.calories || 1) -
          a.macros.protein / (a.macros.calories || 1),
      );
    }
  }

  // Layer 2: bridge the free-delivery gap when within ₹200
  if (amountToFreeDelivery > 0 && amountToFreeDelivery <= 20000) {
    return [...candidates]
      .sort(
        (a, b) =>
          Math.abs(a.price - amountToFreeDelivery) -
          Math.abs(b.price - amountToFreeDelivery),
      )
      .slice(0, 8);
  }

  // Layer 3: RD-verified default
  return [...candidates]
    .sort((a, b) => Number(b.rdVerified) - Number(a.rdVerified))
    .slice(0, 8);
}
