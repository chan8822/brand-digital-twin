/** Lightweight client-side funnel logger for the RD partners wizard.
 * Posts to `/api/rd-partners/events` so ops can see drop-off without
 * pulling in a third-party analytics SDK. Failures are swallowed —
 * analytics must never break the wizard. */

const SESSION_KEY = "tanmatra:rd-partners:session";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  }
  return Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
}

export function getRdPartnersSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = newId();
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

interface EventPayload {
  step?: number;
  applicationId?: number;
  extra?: Record<string, unknown>;
}

export async function trackRdPartnersEvent(
  eventName: string,
  payload: EventPayload = {},
): Promise<void> {
  try {
    await fetch("/api/rd-partners/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getRdPartnersSessionId(),
        eventName,
        ...payload,
      }),
      credentials: "include",
    });
  } catch {
    // intentionally swallow
  }
}
