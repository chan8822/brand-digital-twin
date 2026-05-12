import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { CartItem } from "./cartContext";
import { API_BASE } from "./apiBase";
import { getSocket } from "./socket";

export interface PastOrder {
  orderId: string;
  placedAt: string;
  etaAt: string;
  status: "placed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  tip: number;
  total: number;
  scheduledFor?: string;
  preorderDiscount?: number;
  pickupDiscount?: number;
  fulfillmentType?: "delivery" | "pickup";
  pickupLocationName?: string;
  deliverySlotLabel?: string;
  ecoPackagingOptIn?: boolean;
  deliveryInstructions?: string;
  serverOrderId?: number;
  patientName?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  preparingAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  cancelPriority?: "stat" | "routine";
  address: {
    label: string;
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    phone: string;
  };
}

interface CancelOrderArgs {
  orderId: string;
  reason: string;
  priority?: "stat" | "routine";
}

interface OrdersContextValue {
  orders: PastOrder[];
  addOrder: (order: PastOrder) => void;
  updateStatus: (orderId: string, status: PastOrder["status"]) => void;
  cancelOrder: (args: CancelOrderArgs) => Promise<void>;
  getOrder: (orderId: string) => PastOrder | undefined;
  latest: () => PastOrder | undefined;
}

const STORAGE_KEY = "tanmatra:orders:v1";

const OrdersContext = createContext<OrdersContextValue | null>(null);

function loadOrders(): PastOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PastOrder[];
  } catch {
    return [];
  }
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<PastOrder[]>(() => loadOrders());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch {}
  }, [orders]);

  const addOrder: OrdersContextValue["addOrder"] = (order) => {
    setOrders((prev) => [order, ...prev]);
  };

  const updateStatus: OrdersContextValue["updateStatus"] = (orderId, status) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.orderId !== orderId) return o;
        const next: PastOrder = { ...o, status };
        const now = new Date().toISOString();
        // Stamp the verified-at timestamp the first time the order leaves the
        // submitted state. We do NOT fabricate a verifier identity — the actor
        // is only shown when the API/socket payload supplies one (see the
        // delivery:event listener below).
        if ((status === "preparing" || status === "ready" || status === "out_for_delivery" || status === "delivered") && !o.verifiedAt) {
          next.verifiedAt = now;
        }
        if (status === "preparing" && !o.preparingAt) next.preparingAt = now;
        if (status === "out_for_delivery" && !o.outForDeliveryAt) next.outForDeliveryAt = now;
        if (status === "delivered" && !o.deliveredAt) next.deliveredAt = now;
        return next;
      }),
    );
  };

  const cancelOrder: OrdersContextValue["cancelOrder"] = useCallback(
    async ({ orderId, reason, priority = "routine" }) => {
      let snapshot: PastOrder | undefined;
      const cancelledAt = new Date().toISOString();
      setOrders((prev) =>
        prev.map((o) => {
          if (o.orderId !== orderId) return o;
          snapshot = o;
          return {
            ...o,
            status: "cancelled",
            cancelReason: reason,
            cancelPriority: priority,
            cancelledAt,
          };
        }),
      );
      if (!snapshot) {
        throw new Error("Order not found");
      }
      try {
        const r = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}/cancel`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, priority }),
        });
        if (!r.ok) {
          // 404 is acceptable for client-only orders that never persisted to
          // the DB (loyalty checkouts) — the local cancel is canonical there.
          // Any other non-2xx (including 404 for orders that DO have a
          // serverOrderId) is a real failure and we roll back.
          if (r.status === 404 && !snapshot.serverOrderId) {
            return;
          }
          const text = await r.text().catch(() => "");
          throw new Error(`Cancel failed (${r.status}): ${text || r.statusText}`);
        }
      } catch (err) {
        // Roll back the optimistic update so the UI never quietly drifts from the server.
        const prior = snapshot;
        setOrders((prev) => prev.map((o) => (o.orderId === orderId && prior ? prior : o)));
        throw err instanceof Error ? err : new Error("Cancel failed");
      }
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Real-time lifecycle propagation
  //
  // Subscribe to the socket room for every active order so that delivery /
  // cancel events broadcast by the server flow into ordersContext, and from
  // there into Track, Orders, and RdConsole consistently. Without this, the
  // stepper could read an active connection ("Live") while still showing a
  // stale lifecycle stage if the user happens to be on the Orders or RdConsole
  // surface (which previously had no socket subscription of their own).
  // -------------------------------------------------------------------------
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  const subscribedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const socket = getSocket();
    const activeServerIds = new Set<number>();
    for (const o of orders) {
      if (
        o.serverOrderId &&
        o.status !== "delivered" &&
        o.status !== "cancelled"
      ) {
        activeServerIds.add(o.serverOrderId);
      }
    }
    // Subscribe to any newly active orders.
    for (const id of activeServerIds) {
      if (!subscribedRef.current.has(id)) {
        socket.emit("subscribe:order", id);
        subscribedRef.current.add(id);
      }
    }
    // Unsubscribe from orders that are no longer active.
    for (const id of Array.from(subscribedRef.current)) {
      if (!activeServerIds.has(id)) {
        socket.emit("unsubscribe:order", id);
        subscribedRef.current.delete(id);
      }
    }
  }, [orders]);

  useEffect(() => {
    const socket = getSocket();
    interface DeliveryEventPayload {
      orderId: number;
      event: string;
      meta?: {
        verifiedByName?: string;
        verifiedAt?: string;
        reason?: string;
        priority?: "stat" | "routine";
      };
    }
    const onEvent = (payload: DeliveryEventPayload) => {
      const target = ordersRef.current.find(
        (o) => o.serverOrderId === payload.orderId,
      );
      if (!target) return;
      const now = new Date().toISOString();
      setOrders((prev) =>
        prev.map((o) => {
          if (o.serverOrderId !== payload.orderId) return o;
          const next: PastOrder = { ...o };
          // Map server event names to lifecycle transitions. The queue
          // worker emits canonical names (`order_preparing`,
          // `rider_at_kitchen`, `order_picked_up`, `delivered`); the
          // ops agent emits `status_<status>` shorthand. Handle both.
          const ev = payload.event;
          const advanceTo = (
            target: PastOrder["status"],
            stamp: keyof Pick<
              PastOrder,
              "preparingAt" | "outForDeliveryAt" | "deliveredAt"
            > | null,
          ) => {
            if (next.status === "cancelled") return;
            next.status = target;
            // Backfill earlier stage timestamps so the stepper always has
            // a current-stage timestamp even when the kitchen skips a
            // step (e.g. server jumps straight to rider_at_kitchen).
            if (
              (target === "ready" ||
                target === "out_for_delivery" ||
                target === "delivered") &&
              !next.preparingAt
            ) {
              next.preparingAt = now;
            }
            if (
              (target === "out_for_delivery" || target === "delivered") &&
              !next.outForDeliveryAt
            ) {
              next.outForDeliveryAt = now;
            }
            if (target === "delivered" && !next.deliveredAt) {
              next.deliveredAt = now;
            }
            if (stamp && !next[stamp]) {
              (next[stamp] as string | undefined) = now;
            }
          };
          switch (ev) {
            case "order_preparing":
            case "preparing":
            case "status_preparing":
              advanceTo("preparing", "preparingAt");
              break;
            case "rider_at_kitchen":
            case "ready":
            case "status_ready":
              advanceTo("ready", null);
              break;
            case "order_picked_up":
            case "rider_en_route_to_customer":
            case "out_for_delivery":
            case "status_out_for_delivery":
              advanceTo("out_for_delivery", "outForDeliveryAt");
              break;
            case "delivered":
            case "status_delivered":
              advanceTo("delivered", "deliveredAt");
              break;
            case "order_cancelled":
              next.status = "cancelled";
              if (!next.cancelledAt) next.cancelledAt = now;
              if (payload.meta?.reason) next.cancelReason = payload.meta.reason;
              if (payload.meta?.priority)
                next.cancelPriority = payload.meta.priority;
              break;
          }
          // Carry through verifier metadata if the server provided it.
          if (payload.meta?.verifiedByName && !next.verifiedByName) {
            next.verifiedByName = payload.meta.verifiedByName;
          }
          if (payload.meta?.verifiedAt && !next.verifiedAt) {
            next.verifiedAt = payload.meta.verifiedAt;
          }
          if (
            !next.verifiedAt &&
            (next.status === "preparing" ||
              next.status === "ready" ||
              next.status === "out_for_delivery" ||
              next.status === "delivered")
          ) {
            next.verifiedAt = now;
          }
          return next;
        }),
      );
    };
    socket.on("delivery:event", onEvent);
    return () => {
      socket.off("delivery:event", onEvent);
    };
  }, []);

  const getOrder = (orderId: string) => orders.find((o) => o.orderId === orderId);
  const latest = () => orders[0];

  return (
    <OrdersContext.Provider value={{ orders, addOrder, updateStatus, cancelOrder, getOrder, latest }}>
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used inside OrdersProvider");
  return ctx;
}

export function generateOrderId(): string {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `TAN-${yyyymm}-${seq}`;
}

/**
 * Mints a fresh `Idempotency-Key` (UUID). The caller is responsible
 * for reusing the same returned value across retries of ONE submit
 * attempt (e.g. by holding it in a `useRef` until the request
 * terminates) and for minting a new value for a new click.
 */
export function submitOrderIdempotencyKey(_orderId: string): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
