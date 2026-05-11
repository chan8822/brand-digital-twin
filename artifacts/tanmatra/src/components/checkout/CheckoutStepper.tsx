import { motion } from "framer-motion";
import { Check } from "lucide-react";

export type CheckoutStep = "review" | "address" | "payment";

type CheckoutStepperProps = {
  current: CheckoutStep;
  reviewComplete?: boolean;
  addressComplete?: boolean;
};

const STEPS: Array<{ id: CheckoutStep; label: string; index: number }> = [
  { id: "review", label: "Review", index: 1 },
  { id: "address", label: "Delivery", index: 2 },
  { id: "payment", label: "Payment", index: 3 },
];

export default function CheckoutStepper({
  current,
  reviewComplete = true,
  addressComplete = false,
}: CheckoutStepperProps) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  const completion: Record<CheckoutStep, boolean> = {
    review: reviewComplete,
    address: addressComplete,
    payment: false,
  };

  return (
    <div className="rounded-xl border border-clinical-slate/20 bg-clinical-surface p-4">
      <div className="flex items-center justify-between gap-3">
        {STEPS.map((step, i) => {
          const active = step.id === current;
          const done = completion[step.id] && !active;
          return (
            <div key={step.id} className="flex items-center gap-3 flex-1">
              <div className="flex items-center gap-2.5 min-w-0">
                <motion.div
                  initial={false}
                  animate={{
                    backgroundColor: done
                      ? "rgba(154,176,143,0.15)"
                      : active
                        ? "rgba(212,175,55,0.15)"
                        : "rgba(45,45,45,0.4)",
                    borderColor: done
                      ? "rgba(154,176,143,0.5)"
                      : active
                        ? "rgba(212,175,55,0.6)"
                        : "rgba(64,64,64,0.4)",
                  }}
                  transition={{ duration: 0.25 }}
                  className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0"
                  aria-current={active ? "step" : undefined}
                >
                  {done ? (
                    <Check className="w-3.5 h-3.5 text-clinical-sage" />
                  ) : (
                    <span
                      className={`text-[11px] font-bold tabular-nums ${
                        active ? "text-clinical-gold" : "text-clinical-zinc"
                      }`}
                    >
                      {step.index}
                    </span>
                  )}
                </motion.div>
                <span
                  className={`text-[11px] uppercase tracking-[0.12em] font-semibold truncate ${
                    active
                      ? "text-clinical-gold"
                      : done
                        ? "text-clinical-sage"
                        : "text-clinical-zinc"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="relative flex-1 h-px bg-clinical-slate/20 overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{
                      width: i < currentIdx ? "100%" : "0%",
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="absolute inset-y-0 left-0 bg-clinical-gold/60"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
