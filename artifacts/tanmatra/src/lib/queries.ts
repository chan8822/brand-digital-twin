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
    // Updates pushed via Socket.IO; React Query cache is invalidated on `delivery:event`.
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
export interface SupportToolCall {
  name: string;
  args?: unknown;
  result?: unknown;
}
export interface SupportChatResponse {
  text: string;
  toolCalls?: SupportToolCall[];
  escalated?: boolean;
  refusalReason?: string;
}

/**
 * NDJSON streaming events emitted by POST /support-agent/chat.
 * The client reads them line-by-line; `text-delta` events drive
 * incremental rendering while `finish` carries the final tool-call
 * metadata that Admin Ops uses for risk gating.
 */
export type SupportStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; name: string; args?: unknown }
  | { type: "tool-result"; name: string; result?: unknown }
  | {
      type: "finish";
      text: string;
      toolCalls: SupportToolCall[];
      escalated: boolean;
      refusalReason?: string;
    }
  | { type: "error"; message: string };

export interface SupportStreamHandlers {
  onDelta?: (delta: string) => void;
  onToolCall?: (call: { name: string; args?: unknown }) => void;
  onToolResult?: (call: { name: string; result?: unknown }) => void;
  signal?: AbortSignal;
}

/**
 * POST a chat turn and stream the agent's reply. Resolves with the
 * final `finish` payload once the stream ends.
 */
export async function streamSupportAgentChat(
  vars: SupportChatRequest,
  handlers: SupportStreamHandlers = {},
): Promise<SupportChatResponse> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/support-agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
    credentials: "include",
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`support-agent stream failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: SupportChatResponse | null = null;
  const dispatch = (line: string): void => {
    if (!line) return;
    let evt: SupportStreamEvent;
    try {
      evt = JSON.parse(line) as SupportStreamEvent;
    } catch {
      return;
    }
    switch (evt.type) {
      case "text-delta":
        handlers.onDelta?.(evt.delta);
        break;
      case "tool-call":
        handlers.onToolCall?.({ name: evt.name, args: evt.args });
        break;
      case "tool-result":
        handlers.onToolResult?.({ name: evt.name, result: evt.result });
        break;
      case "finish":
        final = {
          text: evt.text,
          toolCalls: evt.toolCalls,
          escalated: evt.escalated,
          refusalReason: evt.refusalReason,
        };
        break;
      case "error":
        throw new Error(evt.message);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
      dispatch(line);
    }
  }
  // Flush the decoder and process any trailing line that was not
  // newline-terminated (server should always end with a newline, but
  // be defensive against chunk-boundary truncation).
  buf += decoder.decode();
  for (const line of buf.split("\n")) dispatch(line.trim());
  if (!final) {
    throw new Error("support-agent stream ended without finish event");
  }
  return final;
}
