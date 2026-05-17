import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Package, Plus, Check, X } from "lucide-react";
import { ordersApi, type OrderStatus } from "@/lib/ordersApi";
import { useCart, useAddToCartStatus } from "@/lib/cartContext";
import { DISHES } from "@/lib/menuData";
import { formatCurrency } from "@/lib/utils";
import { FADE, DURATION, EASE } from "@/lib/motion";

// ── SVG Ring ─────────────────────────────────────────────────────────────────
// Uses stroke-dasharray/stroke-dashoffset to animate a circular progress arc.
// Matcha green (#4E7A5C) track foreground on a dark (#1A2E20) background ring.

const RING_RADIUS = 88;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const DELIVERY_WINDOW_MINUTES = 20;

function ZenRing({
  progressFraction,
  reducedMotion,
}: {
  progressFraction: number; // 0 → 1
  reducedMotion: boolean;
}) {
  const offset = RING_CIRCUMFERENCE * (1 - progressFraction);
  return (
    <svg
      viewBox="0 0 200 200"
      className="w-56 h-56"
      aria-hidden="true"
      style={{ transform: "rotate(-90deg)" }}
    >
      {/* Background track */}
      <circle
        cx="100"
        cy="100"
        r={RING_RADIUS}
        fill="none"
        stroke="#1A2E20"
        strokeWidth="8"
      />
      {/* Foreground arc */}
      <circle
        cx="100"
        cy="100"
        r={RING_RADIUS}
        fill="none"
        stroke="#4E7A5C"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={
          reducedMotion
            ? undefined
            : { transition: `stroke-dashoffset ${DURATION.slower}s ${EASE.standard.join(",")}` }
        }
      />
    </svg>
  );
}

// ── Status copy ───────────────────────────────────────────────────────────────

function statusCopy(status: OrderStatus, isLate: boolean): { headline: string; sub: string } {
  if (isLate) {
    return {
      headline: "Running a little late",
      sub: "We're working on it. Your meal will be with you shortly.",
    };
  }
  switch (status) {
    case "confirmed":
    case "prep":
      return {
        headline: "Whisking your dressings and chopping fresh greens",
        sub: "Your meal is being prepared with care.",
      };
    case "out_for_delivery":
      return {
        headline: "Freshness is on the move",
        sub: "Arriving shortly.",
      };
    case "delivered":
      return {
        headline: "Delivered",
        sub: "Enjoy your meal. Your body will thank you.",
      };
    default:
      return {
        headline: "Your order is on the way",
        sub: "",
      };
  }
}

// ── Post-purchase snack upsell ────────────────────────────────────────────────

const UPSELL_DISHES = DISHES.filter(
  (d) => (d.category === "snacks" || d.category === "beverages") && d.isAvailable,
).slice(0, 4);

function SnackCard({ dish, onAdd }: { dish: (typeof DISHES)[number]; onAdd: () => void }) {
  const { status } = useAddToCartStatus(dish.id);
  return (
    <div className="flex-shrink-0 w-32 rounded-xl overflow-hidden border border-clinical-border bg-clinical-surface flex flex-col">
      <img
        src={dish.image}
        alt={dish.name}
        className="w-full h-20 object-cover"
        loading="lazy"
      />
      <div className="p-2 flex flex-col gap-1.5 flex-1">
        <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">
          {dish.name}
        </p>
        <p className="text-[10px] text-clinical-zinc">{formatCurrency(dish.price)}</p>
        <button
          type="button"
          onClick={onAdd}
          disabled={status === "loading"}
          className={`mt-auto w-full h-7 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors ${
            status === "success"
              ? "bg-matcha/20 text-matcha"
              : "bg-clinical-gold/15 text-clinical-gold hover:bg-clinical-gold/25"
          }`}
        >
          {status === "success" ? (
            <Check className="w-3.5 h-3.5" />
          ) : status === "loading" ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-clinical-gold/30 border-t-clinical-gold animate-spin" />
          ) : (
            <>
              <Plus className="w-3 h-3" />
              Add
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function PostPurchaseUpsell() {
  const [dismissed, setDismissed] = useState(false);
  const { addItem } = useCart();

  if (dismissed || UPSELL_DISHES.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: DURATION.slow, ease: EASE.standard }}
      className="w-full max-w-sm"
    >
      <div className="relative rounded-2xl border border-clinical-border bg-clinical-surface p-4 space-y-3">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute top-3 right-3 text-clinical-zinc hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <p className="text-xs font-semibold text-white pr-5">
          Add a little extra to your delivery
        </p>
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 scrollbar-none">
          {UPSELL_DISHES.map((dish) => (
            <SnackCard
              key={dish.id}
              dish={dish}
              onAdd={() =>
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
                  rdVerified: dish.rdVerified ?? true,
                  macros: dish.macros,
                  customizations: [],
                })
              }
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ZenTracker() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<OrderStatus>("prep");
  const [etaMinutes, setEtaMinutes] = useState(DELIVERY_WINDOW_MINUTES);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [apiAvailable, setApiAvailable] = useState(true);

  const startTimeRef = useRef(Date.now());
  const pollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Guard: empty cart → redirect
  useEffect(() => {
    if (!orderId) navigate("/menu", { replace: true });
  }, [orderId, navigate]);

  // Client elapsed ticker (1 s interval)
  useEffect(() => {
    tickRef.current = window.setInterval(() => {
      setElapsedMinutes(Math.floor((Date.now() - startTimeRef.current) / 60000));
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, []);

  // Poll server status
  const poll = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await ordersApi.getOrderStatus(orderId);
      setStatus(res.status);
      setEtaMinutes(res.etaMinutes);
      setApiAvailable(true);
      if (res.status === "delivered" || res.status === "cancelled" || res.status === "failed") {
        if (pollRef.current) window.clearInterval(pollRef.current);
      }
    } catch {
      setApiAvailable(false);
    }
  }, [orderId]);

  // Exponential back-off: 5 s, 8 s, 12 s, 20 s, then every 30 s
  useEffect(() => {
    const INTERVALS = [5000, 8000, 12000, 20000];
    let idx = 0;

    function scheduleNext() {
      const ms = idx < INTERVALS.length ? INTERVALS[idx++] : 30000;
      pollRef.current = window.setTimeout(async () => {
        await poll();
        scheduleNext();
      }, ms);
    }

    void poll(); // immediate first fetch
    scheduleNext();

    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); };
  }, [poll]);

  const isLate = status !== "delivered" && elapsedMinutes > DELIVERY_WINDOW_MINUTES;

  // Progress: based on elapsed time vs window when API available, else client timer
  const progressFraction = apiAvailable
    ? status === "delivered"
      ? 1
      : status === "out_for_delivery"
        ? 0.65 + Math.min(0.35, elapsedMinutes / DELIVERY_WINDOW_MINUTES * 0.35)
        : Math.min(0.6, elapsedMinutes / DELIVERY_WINDOW_MINUTES)
    : Math.min(0.99, elapsedMinutes / DELIVERY_WINDOW_MINUTES);

  const copy = statusCopy(status, isLate);

  // Delivered → show for 3 s then link to full track
  const isDelivered = status === "delivered";

  return (
    <div className="min-h-screen bg-clinical-dark flex flex-col">
      {/* Minimal header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-clinical-zinc/10">
        <Link
          to="/menu"
          className="inline-flex items-center gap-1.5 text-xs text-clinical-zinc hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          Menu
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-clinical-gold">
          Tanmatra
        </span>
        <Link
          to={`/track?orderId=${orderId ?? ""}`}
          className="text-xs text-clinical-zinc hover:text-white transition-colors"
        >
          Details
        </Link>
      </header>

      {/* Main centred content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-8">
        {/* Order ID */}
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-clinical-zinc/60">
          {orderId ?? "—"}
        </p>

        {/* Ring */}
        <div className="relative flex items-center justify-center">
          <ZenRing progressFraction={progressFraction} reducedMotion={reducedMotion} />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-1">
            {isDelivered ? (
              <Package className="w-8 h-8 text-matcha" aria-hidden />
            ) : (
              <>
                <span className="text-2xl font-bold tabular-nums text-white">
                  {apiAvailable ? `${etaMinutes}` : `${Math.max(0, DELIVERY_WINDOW_MINUTES - elapsedMinutes)}`}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-clinical-zinc">
                  min
                </span>
              </>
            )}
          </div>
        </div>

        {/* Crossfading status text */}
        <AnimatePresence mode="wait">
          <motion.div
            key={copy.headline}
            {...FADE}
            className="text-center space-y-2 max-w-xs"
          >
            <h1 className="text-xl font-semibold text-white leading-tight">
              {copy.headline}
            </h1>
            {copy.sub && (
              <p className="text-sm text-clinical-zinc leading-relaxed">
                {copy.sub}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Post-purchase upsell — only while kitchen is still preparing */}
        <AnimatePresence>
          {(status === "prep" || status === "confirmed") && (
            <PostPurchaseUpsell />
          )}
        </AnimatePresence>

        {/* API unavailable fallback note */}
        {!apiAvailable && (
          <p className="text-[11px] text-clinical-zinc/50 text-center">
            Live status unavailable — showing estimated time
          </p>
        )}

        {/* Delivered CTA */}
        {isDelivered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.slow, ease: EASE.standard }}
            className="flex flex-col items-center gap-3"
          >
            <Link
              to="/orders"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-md bg-clinical-gold text-[#050505] text-xs font-semibold uppercase tracking-[0.12em] hover:bg-clinical-gold/90 transition-colors"
            >
              View order history
            </Link>
            <Link to="/menu" className="text-xs text-clinical-zinc hover:text-white transition-colors">
              Order again
            </Link>
          </motion.div>
        )}
      </main>

      {/* Bottom status bar */}
      <footer className="px-5 py-4 border-t border-clinical-zinc/10">
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            {...FADE}
            className="text-center text-[11px] text-clinical-zinc uppercase tracking-[0.14em]"
          >
            {status === "prep" && "Kitchen is preparing your order"}
            {status === "confirmed" && "Order confirmed"}
            {status === "out_for_delivery" && "Rider is on the way"}
            {status === "delivered" && "Delivered"}
            {status === "failed" && "Order failed — contact support"}
          </motion.p>
        </AnimatePresence>
      </footer>
    </div>
  );
}
