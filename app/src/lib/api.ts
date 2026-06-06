/**
 * Typed fetch client. Wires the two headers the engine expects for tenant
 * isolation (server.ts:148): `x-tenant-id` + `Authorization: Bearer`.
 * Unwraps the success envelope (server.ts:119) so callers get `data` directly.
 *
 * When NEXT_PUBLIC_API_URL is unset, the app runs in MOCK mode (see queries.ts)
 * so the UI is demoable with no backend.
 */
import type { ApiEnvelope } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
export const USE_MOCK = API_BASE === "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Access token getter — swap for cookie/session store later if needed. */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem("bt_access_token");
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem("bt_access_token", token);
  else window.sessionStorage.removeItem("bt_access_token");
}

export function setRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem("bt_refresh_token", token);
  else window.sessionStorage.removeItem("bt_refresh_token");
}

/** Active tenant (brand) id — set after brand selection. */
export function getTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem("bt_tenant_id");
}

export function setTenantId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.sessionStorage.setItem("bt_tenant_id", id);
  else window.sessionStorage.removeItem("bt_tenant_id");
}

export function isAuthed(): boolean {
  return USE_MOCK || getAccessToken() !== null;
}

/** Mock-mode brand switcher — cycles between the 3 beta brand presets (0, 1, 2). */
export function getMockBrandIndex(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(window.sessionStorage.getItem("bt_mock_brand") ?? "0", 10);
}

export function setMockBrandIndex(i: number): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("bt_mock_brand", String(i));
}

/**
 * Fetch a short-lived, single-use auth ticket (A2.5). Used to authenticate the
 * two flows that cannot carry an `Authorization: Bearer` header — the OAuth
 * redirect (a top-level navigation) and the SSE stream (EventSource is GET-only
 * and header-less). The Bearer-authed `fetch` exchanges the access token for a
 * ~60s HMAC ticket bound to {userId, orgId}; the server verifies and burns it.
 *
 * Returns null in MOCK mode (no backend) so callers degrade gracefully.
 */
export async function getTicket(): Promise<string | null> {
  if (USE_MOCK) return null;
  const { ticket } = await apiFetch<{ ticket: string }>("/api/v1/auth/ticket");
  return ticket;
}

/**
 * URL that kicks off the OAuth flow for a platform (A2 — `GET /connect/:platform`
 * 302-redirects to the provider's consent screen).
 *
 * This is a top-level browser navigation and cannot carry the `Authorization`
 * header, so it authenticates with a single-use ticket (A2.5) appended as
 * `?ticket=`. No long-lived token ever lands in a URL / log / referrer.
 */
export async function connectUrl(platform: string): Promise<string> {
  const ticket = await getTicket();
  const q = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
  return `${API_BASE}/api/v1/connect/${platform}${q}`;
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { tenantId?: string } = {},
): Promise<T> {
  const token = getAccessToken();
  const { tenantId, ...init } = opts;
  const tenant = tenantId ?? getTenantId() ?? undefined;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(tenant && { "x-tenant-id": tenant }),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  const envelope = (await res.json()) as ApiEnvelope<T>;
  return envelope.data;
}
