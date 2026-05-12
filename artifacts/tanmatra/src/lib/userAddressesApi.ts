import { API_BASE } from "./apiBase";

export interface UserAddress {
  id: string;
  label: string;
  type: "home" | "work" | "other";
  line1: string;
  line2: string;
  city: string;
  pincode: string;
  phone: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressInput {
  label: string;
  type?: "home" | "work" | "other";
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  phone: string;
  isDefault?: boolean;
}

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

export const addressesApi = {
  list: () => request<{ addresses: UserAddress[] }>("/addresses"),
  create: (body: AddressInput) =>
    request<{ address: UserAddress }>("/addresses", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<AddressInput>) =>
    request<{ address: UserAddress }>(`/addresses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    request<{ ok: boolean }>(`/addresses/${id}`, { method: "DELETE" }),
};
