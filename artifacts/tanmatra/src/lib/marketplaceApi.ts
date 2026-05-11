import { API_BASE as API_BASE } from "./apiBase";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export type AddonCategory = "drink" | "snack" | "supplement" | "juice";

export interface Addon {
  id: number;
  slug: string;
  name: string;
  description: string;
  category: AddonCategory;
  pricePaise: number;
  image: string | null;
  rdVerified: boolean;
  premiumOnly: boolean;
  recommendedFor: string[];
  recommendedScore: number;
  macros: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  isActive: boolean;
}

export interface PremiumMembership {
  id: number;
  userId: string;
  status: "active" | "cancelled" | "expired";
  monthlyPricePaise: number;
  startedAt: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  rdConsultsUsedThisPeriod: number;
  rdConsultsPerPeriod: number;
}

export interface PremiumStatus {
  membership: PremiumMembership | null;
  isPremium: boolean;
  pricePaise: number;
}

export type MarketplaceCategory =
  | "oils"
  | "sauces"
  | "supplements"
  | "pantry"
  | "snacks";

export interface MarketplaceItem {
  id: number;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  category: MarketplaceCategory;
  pricePaise: number;
  weightLabel: string | null;
  supplierName: string | null;
  image: string | null;
  badges: string[];
  rdVerified: boolean;
  stockQty: number;
  isActive: boolean;
}

export interface MarketplaceOrderLine {
  itemId: number;
  slug: string;
  name: string;
  qty: number;
  unitPricePaise: number;
}

export interface MarketplaceOrder {
  id: number;
  status: "placed" | "packed" | "shipped" | "delivered" | "cancelled";
  deliveryMode: "ship" | "bundle_with_meal";
  items: MarketplaceOrderLine[];
  totalPaise: number;
  bundleWithOrderId: number | null;
  createdAt: string;
}

export const addonsApi = {
  list: (tags?: string[]) =>
    request<{ addons: Addon[]; isPremium: boolean }>(
      `/addons${tags?.length ? `?tags=${encodeURIComponent(tags.join(","))}` : ""}`,
    ),
  attach: (
    orderId: number,
    items: Array<{ addonId: number; qty: number }>,
  ) =>
    request<{ addons: unknown[]; addedPaise: number }>(`/addons/attach`, {
      method: "POST",
      body: JSON.stringify({ orderId, items }),
    }),
  forOrder: (orderId: number) =>
    request<{
      addons: Array<{
        id: number;
        addonId: number;
        qty: number;
        unitPricePaise: number;
        slug: string;
        name: string;
        image: string | null;
      }>;
    }>(`/orders/${orderId}/addons`),
};

export const premiumApi = {
  me: () => request<PremiumStatus>(`/premium/me`),
  subscribe: () =>
    request<{ membership: PremiumMembership; isPremium: true }>(
      `/premium/subscribe`,
      { method: "POST" },
    ),
  cancel: () =>
    request<{ membership: PremiumMembership }>(`/premium/cancel`, {
      method: "POST",
    }),
  useRdConsult: () =>
    request<{ membership: PremiumMembership; remaining: number }>(
      `/premium/use-rd-consult`,
      { method: "POST" },
    ),
  meals: () =>
    request<{ slugs: string[]; meals: Array<{ dishSlug: string; reason: string | null }> }>(
      `/premium/meals`,
    ),
};

export const marketplaceApi = {
  listItems: (category?: string) =>
    request<{ items: MarketplaceItem[] }>(
      `/marketplace/items${category && category !== "all" ? `?category=${encodeURIComponent(category)}` : ""}`,
    ),
  getItem: (slug: string) =>
    request<{ item: MarketplaceItem }>(
      `/marketplace/items/${encodeURIComponent(slug)}`,
    ),
  checkout: (args: {
    items: Array<{ itemId: number; qty: number }>;
    deliveryMode: "ship" | "bundle_with_meal";
    bundleWithOrderId?: number | null;
    address?: {
      label?: string;
      line?: string;
      city?: string;
      pincode?: string;
      phone?: string;
    };
  }) =>
    request<{ order: MarketplaceOrder }>(`/marketplace/checkout`, {
      method: "POST",
      body: JSON.stringify(args),
    }),
  myOrders: () =>
    request<{ orders: MarketplaceOrder[] }>(`/marketplace/orders`),
};
