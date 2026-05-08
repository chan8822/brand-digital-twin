import { Link, useLocation } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ShoppingCart, ArrowRight } from "@phosphor-icons/react";
import { useCart } from "@/lib/cartContext";
import { formatCurrency } from "@/lib/utils";
import { DURATION, EASE } from "@/lib/motion";

const HIDE_ON = [
  /^\/cart\/?$/,
  /^\/checkout(\/.*)?$/,
  /^\/track(\/.*)?$/,
  /^\/admin(\/.*)?$/,
  /^\/rd-console(\/.*)?$/,
  /^\/dish\/.+/,
  /^\/marketplace\/.+/,
];

export default function StickyCheckoutBar() {
  const { items, totalQuantity, subtotal } = useCart();
  const { pathname } = useLocation();
  const prefersReducedMotion = useReducedMotion();

  const visible =
    items.length > 0 && !HIDE_ON.some((re) => re.test(pathname));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="sticky-checkout"
          initial={prefersReducedMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : DURATION.base,
            ease: EASE.standard,
          }}
          role="region"
          aria-label="Cart summary"
          className="fixed inset-x-0 z-30 px-3 sm:px-6 bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-6 pointer-events-none"
        >
          <div className="mx-auto max-w-3xl pointer-events-auto">
            <div className="flex items-center gap-3 rounded-2xl border border-clinical-gold/30 bg-clinical-surface-elevated/95 backdrop-blur-xl shadow-clinical px-4 py-3">
              <div className="relative shrink-0 grid place-items-center w-10 h-10 rounded-full bg-clinical-gold/15 text-clinical-gold">
                <ShoppingCart className="w-5 h-5" weight="fill" aria-hidden />
                <span
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-clinical-gold text-[#050505] text-[10px] font-bold leading-none grid place-items-center"
                  aria-label={`${totalQuantity} items in cart`}
                >
                  {totalQuantity}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-clinical-label text-clinical-zinc">
                  {totalQuantity === 1 ? "1 item" : `${totalQuantity} items`} ·
                  ready to order
                </p>
                <p className="text-body-sm text-white font-semibold leading-tight">
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(subtotal)}
                  </span>
                  <span className="text-clinical-zinc font-normal">
                    {" "}
                    · subtotal
                  </span>
                </p>
              </div>
              <Link
                to="/checkout"
                aria-label={`Checkout · ${formatCurrency(subtotal)} subtotal`}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-clinical-gold px-4 py-2.5 text-sm font-semibold text-[#050505] shadow transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Checkout
                <ArrowRight className="w-4 h-4" weight="bold" aria-hidden />
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
