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

/** Access token getter — swap for cookie/session store when A1 auth UI lands. */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem("bt_access_token");
}

/** Active tenant (brand) id — set after brand selection. */
export function getTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem("bt_tenant_id");
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
