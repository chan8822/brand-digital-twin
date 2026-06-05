"use client";

/**
 * Live updates via SSE (`GET /api/v1/stream`, event_bus.ts). On a relevant
 * event the matching React Query cache is invalidated so the UI refreshes
 * without polling. Event types observed: 'connected', 'phase_update',
 * 'risk_alert', 'recommendation'.
 *
 * No-op in MOCK mode. EventSource is GET-only and cannot send the
 * `Authorization` header, so the stream authenticates with a single-use ticket
 * (A2.5) appended as `?ticket=` — fetched via the Bearer-authed `getTicket()`.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, USE_MOCK, getTicket } from "./api";

const EVENT_TO_QUERY: Record<string, string[]> = {
  risk_alert: ["risks", "sweep"],
  recommendation: ["recommendations", "healing"],
  phase_update: ["recommendations", "sweep", "profit-readiness"],
};

export function useStream() {
  const qc = useQueryClient();

  useEffect(() => {
    if (USE_MOCK || typeof window === "undefined") return;

    let es: EventSource | null = null;
    let cancelled = false;

    // Exchange the access token for a single-use ticket, then open the stream.
    void (async () => {
      const ticket = await getTicket().catch(() => null);
      if (cancelled) return;
      const q = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
      es = new EventSource(`${API_BASE}/api/v1/stream${q}`);
      wire(es);
    })();

    function wire(stream: EventSource) {
      stream.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type?: string };
        const keys = data.type ? EVENT_TO_QUERY[data.type] : undefined;
        if (keys) {
          for (const key of keys) {
            qc.invalidateQueries({ queryKey: [key] });
          }
        }
      } catch {
        // Ignore non-JSON keepalive frames.
      }
      };

      stream.onerror = () => {
        // Browser auto-reconnects; nothing to do.
      };
    }

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [qc]);
}
