// Lightweight event tracker. Calls window.gtag if available; logs in dev.
// Replace with your analytics provider (Posthog, Mixpanel, etc.) by
// swapping the implementation here — the call sites don't need to change.

type EventName =
  | "cart_open"
  | "upsell_focus"
  | "upsell_add"
  | "free_delivery_unlocked"
  | "checkout_start"
  | "upi_intent_initiated"
  | "upi_intent_completed"
  | "order_created";

export function track(event: EventName, props?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.debug(`[analytics] ${event}`, props);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gtag?.("event", event, props);
  } catch {
    // never let analytics crash the app
  }
}
