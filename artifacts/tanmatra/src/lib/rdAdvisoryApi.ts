import type {
  AppointmentKind,
  AppointmentStatus,
} from "./rdBookingData";

export interface RdAppointment {
  id: number;
  userId: string;
  rdSlug: string;
  kind: AppointmentKind;
  status: AppointmentStatus;
  startAt: string;
  endAt: string;
  pricePaise: number;
  joinUrl: string | null;
  userQuestion: string | null;
  rdNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RdMessage {
  id: number;
  userId: string;
  rdSlug: string;
  senderRole: "user" | "rd";
  body: string;
  createdAt: string;
}

export interface RdProgressLog {
  id: number;
  userId: string;
  loggedAt: string;
  weightKg: string | null;
  energyScore: number | null;
  adherenceScore: number | null;
  note: string | null;
  createdAt: string;
}

export interface RdLabUpload {
  id: number;
  userId: string;
  sharedWithRdSlug: string | null;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  note: string | null;
  createdAt: string;
}

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

export interface BookInput {
  rdSlug: string;
  kind: AppointmentKind;
  startAt: string;
  endAt: string;
  pricePaise: number;
  userQuestion?: string;
}

export interface ProgressInput {
  weightKg?: number | null;
  energyScore?: number | null;
  adherenceScore?: number | null;
  note?: string;
}

export interface LabInput {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  sharedWithRdSlug?: string;
  note?: string;
}

export const rdAdvisoryApi = {
  myAppointments: () =>
    request<{ appointments: RdAppointment[] }>("/rd/appointments"),
  availability: (rdSlug: string) =>
    request<{ taken: Array<{ startAt: string; endAt: string }> }>(
      `/rd/availability?rdSlug=${encodeURIComponent(rdSlug)}`,
    ),
  book: (input: BookInput) =>
    request<{ appointment: RdAppointment }>("/rd/appointments", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  cancel: (id: number) =>
    request<{ appointment: RdAppointment }>(
      `/rd/appointments/${id}/cancel`,
      { method: "POST" },
    ),

  messages: (rdSlug: string) =>
    request<{ messages: RdMessage[] }>(
      `/rd/messages?rdSlug=${encodeURIComponent(rdSlug)}`,
    ),
  sendMessage: (rdSlug: string, body: string) =>
    request<{ message: RdMessage }>("/rd/messages", {
      method: "POST",
      body: JSON.stringify({ rdSlug, body }),
    }),
  sendMessageAsRd: (rdSlug: string, threadUserId: string, body: string) =>
    request<{ message: RdMessage }>("/rd/messages", {
      method: "POST",
      body: JSON.stringify({ rdSlug, body, asRole: "rd", threadUserId }),
    }),

  progress: () => request<{ logs: RdProgressLog[] }>("/rd/progress"),
  logProgress: (input: ProgressInput) =>
    request<{ log: RdProgressLog }>("/rd/progress", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  labs: () => request<{ labs: RdLabUpload[] }>("/rd/labs"),
  addLab: (input: LabInput) =>
    request<{ lab: RdLabUpload }>("/rd/labs", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteLab: (id: number) =>
    request<{ lab: RdLabUpload }>(`/rd/labs/${id}`, { method: "DELETE" }),

  // RD console
  consoleAppointments: (rdSlug: string) =>
    request<{ appointments: RdAppointment[] }>(
      `/rd/console/appointments?rdSlug=${encodeURIComponent(rdSlug)}`,
    ),
  consoleUserDetail: (rdSlug: string, userId: string) =>
    request<{
      appointments: RdAppointment[];
      messages: RdMessage[];
      progress: RdProgressLog[];
      labs: RdLabUpload[];
    }>(
      `/rd/console/user/${encodeURIComponent(userId)}?rdSlug=${encodeURIComponent(rdSlug)}`,
    ),
  consoleSaveNotes: (
    rdSlug: string,
    apptId: number,
    rdNotes: string,
    joinUrl?: string | null,
  ) =>
    request<{ appointment: RdAppointment }>(
      `/rd/console/appointments/${apptId}/notes?rdSlug=${encodeURIComponent(rdSlug)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ rdNotes, joinUrl }),
      },
    ),
};
