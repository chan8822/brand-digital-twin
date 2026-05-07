import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MenuComboWithAvailability } from "./api/adapter";

const API_BASE = `${import.meta.env.BASE_URL}api`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const STATIC_MENU: MenuComboWithAvailability[] = [
  { id: 1, name: "Grilled Atlantic Salmon", category: "wellness", kitchen: "continental", price: 48500, isAvailable: true, ingredients: ["Salmon", "Quinoa", "Broccoli"], imageUrl: "/dishes/salmon-quinoa.jpg", rdVerified: true },
  { id: 2, name: "Performance Power Bowl", category: "performance", kitchen: "continental", price: 39500, isAvailable: true, ingredients: ["Chicken", "Brown Rice", "Sweet Potato", "Avocado"], imageUrl: "/dishes/buddha-bowl.jpg", rdVerified: true },
  { id: 3, name: "Keto Prime Ribeye", category: "clinical", kitchen: "continental", price: 62500, isAvailable: true, ingredients: ["Ribeye", "Cauliflower", "Asparagus"], imageUrl: "/dishes/steak-keto.jpg", rdVerified: true },
  { id: 4, name: "Miso Glazed Black Cod", category: "clinical", kitchen: "continental", price: 54500, isAvailable: true, ingredients: ["Black Cod", "Bok Choy", "Shiitake"], imageUrl: "/dishes/miso-cod.jpg", rdVerified: true },
  { id: 5, name: "Superfood Smoothie Bowl", category: "wellness", kitchen: "continental", price: 28500, isAvailable: true, ingredients: ["Acai", "Berries", "Chia", "Almonds"], imageUrl: "/dishes/smoothie-bowl.jpg", rdVerified: true },
  { id: 6, name: "Mediterranean Grain Salad", category: "wellness", kitchen: "continental", price: 32500, isAvailable: true, ingredients: ["Chickpeas", "Feta", "Olives"], imageUrl: "/dishes/mediterranean-salad.jpg", rdVerified: false },
];

export function usePublicMenu(category?: string) {
  return useQuery<MenuComboWithAvailability[]>({
    queryKey: ["menu", "public", category ?? "all"],
    queryFn: async () => {
      try {
        return await api<MenuComboWithAvailability[]>(`/menu${category ? `?category=${encodeURIComponent(category)}` : ""}`);
      } catch {
        return category ? STATIC_MENU.filter((m) => m.category === category) : STATIC_MENU;
      }
    },
    staleTime: 1000 * 60,
  });
}

export interface DeliveryEvent {
  id: number;
  orderId: number;
  event: string;
  createdAt: string | null;
}

export function useDeliveryTimeline(orderId: number) {
  return useQuery<DeliveryEvent[]>({
    queryKey: ["delivery", "timeline", orderId],
    queryFn: () => api<DeliveryEvent[]>(`/delivery/${orderId}/timeline`),
    enabled: !!orderId,
    refetchInterval: 5000,
  });
}

export function useRecordDeliveryEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { orderId: number; riderId: number; event: string }) =>
      api<{ ok: true }>(`/delivery/events`, { method: "POST", body: JSON.stringify(vars) }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["delivery", "timeline", vars.orderId] }),
  });
}

export interface SupportChatRequest {
  message: string;
  history: Array<{ role: "user" | "agent"; text: string }>;
}
export interface SupportChatResponse {
  text: string;
  toolCalls?: Array<{ name: string; args?: unknown; result?: unknown }>;
  escalated?: boolean;
}

export function useSupportAgentChat() {
  return useMutation({
    mutationFn: (vars: SupportChatRequest) =>
      api<SupportChatResponse>(`/support-agent/chat`, {
        method: "POST",
        body: JSON.stringify(vars),
      }),
  });
}
