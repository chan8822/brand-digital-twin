import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Gift, X, ArrowRight } from "lucide-react";
import { useOrders } from "@/lib/ordersContext";

/**
 * First-order welcome banner.
 *
 * Surfaces a flat-amount discount on the first order to anonymous /
 * never-purchased visitors. Indian D2C food competitors lead with a
 * 30-50% first-order coupon — having zero is a known top-of-funnel
 * conversion killer (audit P0 #11).
 *
 * The visible UX ships here. Backend voucher needs:
 *   1. Create a voucher with code `WELCOME150` (or whatever the ops
 *      team picks below) in the loyalty engine, with constraints:
 *        - first-order-only (server-side check on userId.orderCount)
 *        - min cart subtotal e.g. ₹600
 *        - ₹150 flat off, capped to subtotal
 *        - no expiry / 90d expiry
 *   2. Optionally auto-apply via Checkout: read a deep-link param
 *      `?promo=WELCOME150` and pass to `corporateApi.redeemVoucher`.
 *
 * Today this component just shows the offer + the deep-link. If the
 * voucher doesn't exist server-side, Checkout's existing voucher input
 * surfaces a "Voucher not found" toast — no harder failure mode.
 */

const DISMISS_KEY = "tanmatra:welcome-banner-dismissed-at:v1";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Single source of truth for the offer copy + code. Update both when
// ops creates a different voucher.
const WELCOME_CODE = "WELCOME150";
const WELCOME_AMOUNT_LABEL = "₹150 off";
const WELCOME_MIN_LABEL = "min order ₹600";

function isDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS;
}

export default function WelcomeOfferBanner() {
  const { orders } = useOrders();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (orders.length > 0) {
      setVisible(false);
      return;
    }
    setVisible(!isDismissed());
  }, [orders.length]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
  };

  return (
    <div className="relative bg-gradient-to-r from-clinical-gold/15 via-clinical-gold/10 to-clinical-sage/10 border-b border-clinical-gold/30">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs">
        <Gift className="w-4 h-4 text-clinical-gold shrink-0" aria-hidden />
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold text-white">
            First order? {WELCOME_AMOUNT_LABEL} with code{" "}
            <span className="font-mono tracking-wider text-clinical-gold">
              {WELCOME_CODE}
            </span>
          </span>
          <span className="text-clinical-zinc hidden sm:inline">
            · {WELCOME_MIN_LABEL} · auto-applied at checkout
          </span>
        </div>
        <Link
          to={`/menu`}
          className="hidden sm:inline-flex items-center gap-1 text-clinical-gold hover:text-white font-semibold whitespace-nowrap min-h-9"
        >
          Browse menu <ArrowRight className="w-3 h-3" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss welcome offer"
          className="shrink-0 w-9 h-9 -mr-2 rounded-md text-clinical-zinc hover:text-white hover:bg-white/5 flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
