import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CartItem } from "./cartContext";

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
  address: {
    label: string;
    line1: string;
    line2?: string;
    city: string;
    pincode: string;
    phone: string;
  };
}

interface OrdersContextValue {
  orders: PastOrder[];
  addOrder: (order: PastOrder) => void;
  updateStatus: (orderId: string, status: PastOrder["status"]) => void;
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
    setOrders((prev) => prev.map((o) => (o.orderId === orderId ? { ...o, status } : o)));
  };

  const getOrder = (orderId: string) => orders.find((o) => o.orderId === orderId);
  const latest = () => orders[0];

  return (
    <OrdersContext.Provider value={{ orders, addOrder, updateStatus, getOrder, latest }}>
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
