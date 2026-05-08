const API_BASE = `${import.meta.env.BASE_URL}api`;

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

export interface DeliverySlotOption {
  id: number;
  slotDate: string;
  startsAt: string;
  endsAt: string;
  zone: string;
  capacity: number;
  reservedCount: number;
  remaining: number;
  full: boolean;
}

export interface PickupLocationOption {
  id: number;
  name: string;
  partnerName: string | null;
  addressLine: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  hours: string | null;
  discountPaise: number;
  distanceKm: number | null;
}

export interface PackagingReturnRow {
  id: number;
  userId: string;
  orderId: number;
  status: "opted_in" | "returned" | "credited";
  creditPaise: number;
  returnedAt: string | null;
  creditedAt: string | null;
  createdAt: string;
}

export interface AddressInstructionEntry {
  addressLabel: string;
  instructions: string;
  updatedAt: string;
}

export const fulfillmentApi = {
  listSlots: (zone = "default") =>
    request<{ slots: DeliverySlotOption[] }>(
      `/delivery/slots?zone=${encodeURIComponent(zone)}`,
    ),
  listPickupLocations: (lat?: number, lng?: number) => {
    const qs = new URLSearchParams();
    if (typeof lat === "number") qs.set("lat", String(lat));
    if (typeof lng === "number") qs.set("lng", String(lng));
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ locations: PickupLocationOption[] }>(
      `/delivery/pickup-locations${suffix}`,
    );
  },
  listPackagingReturns: () =>
    request<{ returns: PackagingReturnRow[] }>("/packaging-returns"),
  confirmPackagingReturn: (orderId: number) =>
    request<{ ok: boolean; alreadyCredited?: boolean; packagingReturn: PackagingReturnRow }>(
      "/packaging-returns/confirm",
      {
        method: "POST",
        body: JSON.stringify({ orderId }),
      },
    ),
  listInstructions: () =>
    request<{ instructions: AddressInstructionEntry[] }>(
      "/addresses/instructions",
    ),
  upsertInstructions: (addressLabel: string, instructions: string) =>
    request<{ instructions: AddressInstructionEntry }>(
      "/addresses/instructions",
      {
        method: "PUT",
        body: JSON.stringify({ addressLabel, instructions }),
      },
    ),
  setSubscriptionPreferredSlot: (subscriptionId: number, slotId: number | null) =>
    request<{ subscription: unknown }>(
      "/subscriptions/preferred-slot",
      {
        method: "PUT",
        body: JSON.stringify({ subscriptionId, slotId }),
      },
    ),
};
