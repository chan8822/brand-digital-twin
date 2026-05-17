import { API_BASE } from "./apiBase";

// ── Types ────────────────────────────────────────────────────────────────────

export type OrderStatus = "pending" | "confirmed" | "prep" | "out_for_delivery" | "delivered" | "cancelled" | "failed";

export type UpiApp = "gpay" | "phonepe" | "paytm" | "generic";

export interface CreateOrderPayload {
  items: Array<{ dishId: number; quantity: number; unitPrice: number; customizations: string[] }>;
  deliveryAddress: string;
  phone: string;
  notes?: string;
  tipAmount?: number;
  voucherCode?: string;
}

export interface CreateOrderResponse {
  orderId: string;
  status: OrderStatus;
  etaMinutes: number;
  total: number;
}

export interface UpiIntentPayload {
  orderId: string;
  total: number;
  app?: UpiApp;
  vpa?: string;
}

export interface UpiIntentResponse {
  intentId: string;
  status: "pending" | "completed" | "failed" | "expired";
  upiUrl?: string;
}

export interface OrderStatusResponse {
  orderId: string;
  status: OrderStatus;
  etaMinutes: number;
  riderName?: string;
  riderPhone?: string;
  updatedAt: string;
}

// ── Feature flag ──────────────────────────────────────────────────────────────

// Set VITE_MOCK_ORDERS=true in .env.local to use the mock adapter.
const USE_MOCK = import.meta.env.VITE_MOCK_ORDERS === "true";

// ── Mock adapter ──────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

const MOCK_STATUS_PROGRESSION: OrderStatus[] = [
  "confirmed",
  "prep",
  "prep",
  "out_for_delivery",
  "delivered",
];

// Module-level mock state (not persisted — resets on reload).
const mockOrders = new Map<string, { status: OrderStatus; createdAt: number; etaMinutes: number }>();

async function mockCreateOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
  await delay(600);
  const orderId = `MOCK-${Date.now().toString(36).toUpperCase()}`;
  mockOrders.set(orderId, { status: "confirmed", createdAt: Date.now(), etaMinutes: 20 });
  void payload;
  return { orderId, status: "confirmed", etaMinutes: 20, total: 0 };
}

async function mockCreateUpiIntent(payload: UpiIntentPayload): Promise<UpiIntentResponse> {
  await delay(800);
  const intentId = `INT-${Date.now().toString(36).toUpperCase()}`;
  // Simulate auto-completion after 6 s.
  setTimeout(() => {
    const order = mockOrders.get(payload.orderId);
    if (order) order.status = "prep";
  }, 6000);
  void payload;
  return { intentId, status: "pending" };
}

async function mockGetOrderStatus(orderId: string): Promise<OrderStatusResponse> {
  await delay(300);
  const order = mockOrders.get(orderId);
  if (!order) {
    return {
      orderId,
      status: "prep",
      etaMinutes: 18,
      updatedAt: new Date().toISOString(),
    };
  }
  // Advance status every 8 s for demo purposes.
  const elapsedSeconds = (Date.now() - order.createdAt) / 1000;
  const stepIndex = Math.min(
    Math.floor(elapsedSeconds / 8),
    MOCK_STATUS_PROGRESSION.length - 1,
  );
  order.status = MOCK_STATUS_PROGRESSION[stepIndex];
  const etaMinutes = Math.max(0, order.etaMinutes - Math.floor(elapsedSeconds / 60));
  return {
    orderId,
    status: order.status,
    etaMinutes,
    riderName: "Arjun K.",
    riderPhone: "+919876543210",
    updatedAt: new Date().toISOString(),
  };
}

// ── Real adapter ──────────────────────────────────────────────────────────────

async function realCreateOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /orders ${res.status}`);
  return res.json() as Promise<CreateOrderResponse>;
}

async function realCreateUpiIntent(payload: UpiIntentPayload): Promise<UpiIntentResponse> {
  const res = await fetch(`${API_BASE}/payments/upi/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /payments/upi/intent ${res.status}`);
  return res.json() as Promise<UpiIntentResponse>;
}

async function realGetOrderStatus(orderId: string): Promise<OrderStatusResponse> {
  const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`GET /orders/${orderId}/status ${res.status}`);
  return res.json() as Promise<OrderStatusResponse>;
}

// ── Public API (flag-switched) ────────────────────────────────────────────────

export const ordersApi = {
  createOrder: USE_MOCK ? mockCreateOrder : realCreateOrder,
  createUpiIntent: USE_MOCK ? mockCreateUpiIntent : realCreateUpiIntent,
  getOrderStatus: USE_MOCK ? mockGetOrderStatus : realGetOrderStatus,
} as const;
