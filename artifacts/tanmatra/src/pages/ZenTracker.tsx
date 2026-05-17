import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Package } from "lucide-react";
import { ordersApi, type OrderStatus } from "@/lib/ordersApi";
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
