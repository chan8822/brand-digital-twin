import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MenuComboWithAvailability } from "./api/adapter";

import { API_BASE as API_BASE } from "./apiBase";

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

export interface BundleDTO {
  id: number;
  slug: string;
  name: string;
  description: string;
  badge: string | null;
  pricePaise: number;
  originalPricePaise: number;
  dishIds: number[];
  image: string | null;
}

export function useBundles() {
  return useQuery<BundleDTO[]>({
    queryKey: ["bundles"],
    queryFn: async () => {
      const r = await api<{ bundles: BundleDTO[] }>(`/bundles`);
      return r.bundles;
    },
    staleTime: 1000 * 60 * 10,
  });
}

export interface GroupOrderLine {
  lineId: string;
  dishId: number;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
  customizations: string[];
  addedBy: string;
  addedByName: string;
}

export interface GroupOrderDTO {
  id: number;
  code: string;
  hostUserId: string | null;
  hostName: string;
  status: "open" | "closed";
  items: GroupOrderLine[];
  participants: Array<{ id: string; name: string }>;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export const groupOrdersApi = {
  create: (hostName?: string) =>
    api<{ group: GroupOrderDTO }>(`/group-orders`, {
      method: "POST",
      body: JSON.stringify({ hostName }),
    }),
  get: (code: string) =>
    api<{ group: GroupOrderDTO }>(`/group-orders/${encodeURIComponent(code)}`),
  addItem: (
    code: string,
    item: {
      dishId: number;
      quantity: number;
      customizations?: string[];
    },
  ) =>
    api<{ group: GroupOrderDTO }>(
      `/group-orders/${encodeURIComponent(code)}/items`,
      { method: "POST", body: JSON.stringify(item) },
    ),
  removeLine: (code: string, lineId: string) =>
    api<{ group: GroupOrderDTO }>(
      `/group-orders/${encodeURIComponent(code)}/remove-line`,
      { method: "POST", body: JSON.stringify({ lineId }) },
    ),
  close: (code: string) =>
    api<{ group: GroupOrderDTO }>(
      `/group-orders/${encodeURIComponent(code)}/close`,
      { method: "POST" },
    ),
};

export function useGroupOrder(code: string | null | undefined) {
  return useQuery<GroupOrderDTO>({
    queryKey: ["group-order", code],
    queryFn: async () => {
      const r = await groupOrdersApi.get(code!);
      return r.group;
    },
    enabled: !!code,
    refetchInterval: 3000,
  });
}

// Public menu combos are sourced exclusively from the API/database.
// On error, we return an empty list and let the UI render its empty state.
export function usePublicMenu(category?: string) {
  return useQuery<MenuComboWithAvailability[]>({
    queryKey: ["menu", "public", category ?? "all"],
    queryFn: async () => {
      try {
        return await api<MenuComboWithAvailability[]>(`/menu${category ? `?category=${encodeURIComponent(category)}` : ""}`);
      } catch {
        return [];
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
  const res = await fetch(`${API_BASE}/support-agent/chat`, {
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

export interface CoachChatRequest {
  message: string;
  history: Array<{ role: "user" | "agent"; text: string }>;
  dishSlug?: string;
}

export interface CoachActionAddToCart {
  kind: "add_to_cart";
  slug: string;
  name: string;
  image: string;
  quantity: number;
  target: "cart" | "next_delivery" | "replace_in_cart";
  pricePaise: number;
  priceLabel: string;
  macros: { protein: number; carbs: number; fat: number; fiber: number; calories: number };
  reasoning: string;
  /** Slug of the existing cart line to drop when target === "replace_in_cart". */
  replaceSlug?: string | null;
}

export interface CoachActionBookRd {
  kind: "book_rd";
  href: string;
  appointmentsHref: string;
  reason: string;
  urgency: "routine" | "soon";
  premiumConsultsRemaining: number | null;
}

export type CoachAction = CoachActionAddToCart | CoachActionBookRd;

export interface CoachToolCall {
  name: string;
  args?: unknown;
  result?: unknown;
}

export interface CoachChatResponse {
  text: string;
  toolCalls: CoachToolCall[];
  escalated: boolean;
  refusalReason?: string;
  actions: CoachAction[];
}

type CoachStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; name: string; args?: unknown }
  | { type: "tool-result"; name: string; result?: unknown }
  | {
      type: "finish";
      text: string;
      toolCalls: CoachToolCall[];
      escalated: boolean;
      refusalReason?: string;
    }
  | { type: "error"; message: string };

export interface CoachStreamHandlers {
  onDelta?: (delta: string) => void;
  onAction?: (action: CoachAction) => void;
  signal?: AbortSignal;
}

function extractAction(result: unknown): CoachAction | null {
  if (!result || typeof result !== "object") return null;
  const r = result as { success?: boolean; action?: unknown };
  if (!r.success || !r.action || typeof r.action !== "object") return null;
  const action = r.action as { kind?: string };
  if (action.kind === "add_to_cart" || action.kind === "book_rd") {
    return action as unknown as CoachAction;
  }
  return null;
}

export async function streamCoachAgentChat(
  vars: CoachChatRequest,
  handlers: CoachStreamHandlers = {},
): Promise<CoachChatResponse> {
  const res = await fetch(`${API_BASE}/coach-agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
    credentials: "include",
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`coach-agent stream failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: CoachChatResponse | null = null;
  const actions: CoachAction[] = [];

  const dispatch = (line: string): void => {
    if (!line) return;
    let evt: CoachStreamEvent;
    try {
      evt = JSON.parse(line) as CoachStreamEvent;
    } catch {
      return;
    }
    switch (evt.type) {
      case "text-delta":
        handlers.onDelta?.(evt.delta);
        break;
      case "tool-result": {
        const action = extractAction(evt.result);
        if (action) {
          actions.push(action);
          handlers.onAction?.(action);
        }
        break;
      }
      case "finish":
        final = {
          text: evt.text,
          toolCalls: evt.toolCalls,
          escalated: evt.escalated,
          refusalReason: evt.refusalReason,
          actions: [...actions],
        };
        break;
      case "error":
        throw new Error(evt.message);
      default:
        break;
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
  buf += decoder.decode();
  for (const line of buf.split("\n")) dispatch(line.trim());
  if (!final) {
    throw new Error("coach-agent stream ended without finish event");
  }
  return final;
}
