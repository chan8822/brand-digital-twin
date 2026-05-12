import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import StatCancelDialog from "./StatCancelDialog";
import { useOrders } from "@/lib/ordersContext";
import { toast } from "sonner";

interface Props {
  orderId: string;
  patientName?: string;
  size?: "sm" | "default";
  variant?: "solid" | "outline";
  fullWidth?: boolean;
  className?: string;
  /**
   * Optional override for the cancel call. When provided (e.g. from
   * RdConsole's server-sourced patient orders panel), the button bypasses
   * the local `ordersContext` and runs this callback instead. The button
   * still surfaces success/error toasts the same way.
   */
  onCancel?: (args: { reason: string; priority: "stat" }) => Promise<void>;
}

/**
 * One-tap STAT cancel control. Opens a two-tap confirmation sheet
 * (reason + Confirm), runs an optimistic cancel through ordersContext,
 * and surfaces a blocking error toast if the cancel call fails.
 */
export function StatCancelButton({
  orderId,
  patientName,
  size = "sm",
  variant = "solid",
  fullWidth,
  className = "",
  onCancel,
}: Props) {
  const [open, setOpen] = useState(false);
  const { cancelOrder, getOrder } = useOrders();
  const order = getOrder(orderId);
  const resolvedPatient = patientName ?? order?.patientName;

  const base =
    variant === "solid"
      ? "bg-red-500 text-white hover:bg-red-600 border-red-500"
      : "border-red-500/60 text-red-300 hover:bg-red-500/10";

  return (
    <>
      <Button
        type="button"
        size={size}
        onClick={() => setOpen(true)}
        className={`${base} font-semibold gap-1.5 ${fullWidth ? "w-full" : ""} ${className}`}
        aria-label={`STAT cancel order ${orderId}`}
      >
        <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
        STAT Cancel
      </Button>
      <StatCancelDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
        }}
        orderDisplayId={orderId}
        patientName={resolvedPatient}
        onConfirm={async (reasonLabel) => {
          try {
            if (onCancel) {
              await onCancel({ reason: reasonLabel, priority: "stat" });
            } else {
              await cancelOrder({ orderId, reason: reasonLabel, priority: "stat" });
            }
            toast.success(`Order ${orderId} cancelled`, {
              description: `Reason: ${reasonLabel}`,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Cancel failed";
            // Blocking-style error toast — not silently swallowed.
            toast.error("STAT cancel failed", {
              description: msg,
              duration: 10_000,
            });
            throw err;
          }
        }}
      />
    </>
  );
}
