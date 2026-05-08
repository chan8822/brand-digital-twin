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

export interface Company {
  id: number;
  slug: string;
  name: string;
  ownerUserId: string;
  perEmployeeMonthlyBudgetPaise: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMember {
  id: number;
  companyId: number;
  userId: string | null;
  email: string;
  role: "admin" | "member";
  status: "invited" | "active" | "removed";
  inviteToken: string | null;
  perEmployeeBudgetPaiseOverride: number | null;
  invitedAt: string;
  joinedAt: string | null;
  spentThisMonthPaise?: number;
}

export interface OfficeOrderAddress {
  label?: string;
  line: string;
  city: string;
  pincode: string;
  phone?: string;
}

export interface OfficeOrderPick {
  userId: string;
  userName: string;
  pickedAt: string;
  items: Array<{
    dishId: number;
    name: string;
    image: string;
    unitPrice: number;
    quantity: number;
  }>;
  totalPaise: number;
}

export interface OfficeOrder {
  id: number;
  companyId: number;
  createdByUserId: string;
  title: string;
  address: OfficeOrderAddress;
  perEmployeeBudgetPaise: number;
  scheduledFor: string;
  windowClosesAt: string;
  status: "open" | "closed" | "delivered" | "cancelled";
  picks: OfficeOrderPick[];
  totalPaise: number;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Voucher {
  id: number;
  code: string;
  amountPaise: number;
  purchasedByUserId: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  message: string | null;
  status: "active" | "redeemed" | "cancelled";
  redeemedByUserId: string | null;
  redeemedAt: string | null;
  createdAt: string;
}

export interface CompanySubsidy {
  active: boolean;
  company?: { id: number; slug: string; name: string };
  monthlyBudgetPaise?: number;
  spentThisMonthPaise?: number;
  remainingPaise?: number;
  subsidyPaise?: number;
}

export const corporateApi = {
  createCompany: (name: string, perEmployeeMonthlyBudgetPaise: number) =>
    request<{ company: Company }>("/companies", {
      method: "POST",
      body: JSON.stringify({ name, perEmployeeMonthlyBudgetPaise }),
    }),
  listMine: () =>
    request<{
      companies: Array<{
        company: Company;
        role: "admin" | "member";
        status: "invited" | "active" | "removed";
      }>;
    }>("/companies/mine"),
  getCompany: (slug: string) =>
    request<{
      company: Company;
      membership: CompanyMember;
      members: CompanyMember[];
      period: string;
    }>(`/companies/${encodeURIComponent(slug)}`),
  updateBudget: (slug: string, perEmployeeMonthlyBudgetPaise: number) =>
    request<{ company: Company }>(
      `/companies/${encodeURIComponent(slug)}/budget`,
      {
        method: "PUT",
        body: JSON.stringify({ perEmployeeMonthlyBudgetPaise }),
      },
    ),
  invite: (slug: string, email: string, role: "admin" | "member" = "member") =>
    request<{ member: CompanyMember; inviteUrl: string }>(
      `/companies/${encodeURIComponent(slug)}/invite`,
      {
        method: "POST",
        body: JSON.stringify({ email, role }),
      },
    ),
  removeMember: (slug: string, memberId: number) =>
    request<{ ok: true }>(
      `/companies/${encodeURIComponent(slug)}/members/${memberId}/remove`,
      { method: "POST" },
    ),
  getInvite: (token: string) =>
    request<{ invite: CompanyMember; company: Company }>(
      `/companies/invites/${encodeURIComponent(token)}`,
    ),
  acceptInvite: (token: string) =>
    request<{ member: CompanyMember; company: Company; already?: boolean }>(
      `/companies/invites/${encodeURIComponent(token)}/accept`,
      { method: "POST" },
    ),
  getSubsidy: (subtotal: number) =>
    request<CompanySubsidy>(
      `/me/company-subsidy?subtotal=${encodeURIComponent(subtotal)}`,
    ),
  chargeSubsidy: (companyId: number, paise: number, orderRef?: string) =>
    request<{ chargedPaise: number; remainingPaise: number }>(
      "/me/company-subsidy/charge",
      {
        method: "POST",
        body: JSON.stringify({ companyId, paise, orderRef }),
      },
    ),
  createOfficeOrder: (input: {
    companySlug: string;
    title: string;
    scheduledFor: string;
    windowClosesAt: string;
    perEmployeeBudgetPaise: number;
    address: OfficeOrderAddress;
  }) =>
    request<{ officeOrder: OfficeOrder }>("/office-orders", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listOfficeOrders: (slug: string) =>
    request<{ officeOrders: OfficeOrder[] }>(
      `/companies/${encodeURIComponent(slug)}/office-orders`,
    ),
  getOfficeOrder: (id: number) =>
    request<{ officeOrder: OfficeOrder; membership: CompanyMember }>(
      `/office-orders/${id}`,
    ),
  pickOfficeOrder: (
    id: number,
    items: Array<{ dishId: number; quantity: number }>,
  ) =>
    request<{ officeOrder: OfficeOrder }>(`/office-orders/${id}/pick`, {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  closeOfficeOrder: (id: number) =>
    request<{ officeOrder: OfficeOrder }>(`/office-orders/${id}/close`, {
      method: "POST",
    }),
  purchaseVoucher: (input: {
    amountPaise: number;
    recipientEmail?: string;
    recipientName?: string;
    message?: string;
  }) =>
    request<{ voucher: Voucher }>("/vouchers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  myVouchers: () =>
    request<{ purchased: Voucher[]; redeemed: Voucher[] }>("/vouchers/mine"),
  previewVoucher: (code: string) =>
    request<{
      code: string;
      amountPaise: number;
      status: string;
      redeemed: boolean;
    }>("/vouchers/preview", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  redeemVoucher: (code: string) =>
    request<{ voucher: Voucher; creditedPaise: number }>("/vouchers/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};
