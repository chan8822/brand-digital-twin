import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  rdAdvisoryApi,
  type RdAppointment,
  type RdLabUpload,
  type RdMessage,
  type RdProgressLog,
} from "@/lib/rdAdvisoryApi";
import { RdCopilotPanel } from "@/components/rd/RdCopilotPanel";
import { StatCancelButton } from "@/components/track/StatCancelButton";
import { useSocketStatus } from "@/lib/useSocketStatus";
import {
  statusToClinicalStage,
  CLINICAL_STAGES,
  clinicalStageIndex,
  type ClinicalStage,
} from "@/lib/clinicalLifecycle";
import { API_BASE } from "@/lib/apiBase";
import { getSocket } from "@/lib/socket";
import {
  APPOINTMENT_KIND_META,
  formatRupees,
  getRdMember,
  listRds,
} from "@/lib/rdBookingData";
import { toast } from "sonner";
import {
  CalendarDays,
  ExternalLink,
  FileText,
  MessageCircle,
  Save,
  Send,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RdConsole() {
  const rds = listRds();
  const [rdSlug, setRdSlug] = useState<string>("");
  const [appts, setAppts] = useState<RdAppointment[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [unauth, setUnauth] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [loadingMe, setLoadingMe] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimSlug, setClaimSlug] = useState<string>(
    rds[0]?.profile.slug ?? "",
  );
  const [adminToken, setAdminToken] = useState("");

  // On mount, ask the server which RD slug the signed-in user is bound to.
  useEffect(() => {
    rdAdvisoryApi
      .consoleMe()
      .then((r) => {
        setUnauth(false);
        if (r.rdSlug) setRdSlug(r.rdSlug);
      })
      .catch((e) => {
        if (String(e).includes("401")) setUnauth(true);
      })
      .finally(() => setLoadingMe(false));
  }, []);

  const refresh = useCallback(async () => {
    if (!rdSlug) return;
    try {
      const r = await rdAdvisoryApi.consoleAppointments(rdSlug);
      setAppts(r.appointments);
      setForbidden(false);
      if (!selectedUserId && r.appointments[0]) {
        setSelectedUserId(r.appointments[0].userId);
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes("401")) setUnauth(true);
      else if (msg.includes("403")) setForbidden(true);
    }
  }, [rdSlug, selectedUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function claim() {
    if (!claimSlug || !adminToken.trim()) return;
    setClaiming(true);
    try {
      const r = await rdAdvisoryApi.consoleClaim(claimSlug, adminToken.trim());
      setRdSlug(r.rdSlug);
      toast.success("RD role claimed", { description: r.rdSlug });
    } catch (e) {
      const msg = String(e);
      if (msg.includes("503"))
        toast.error("RD provisioning disabled", {
          description: "Operator must set RD_ADMIN_TOKEN.",
        });
      else if (msg.includes("403"))
        toast.error("Invalid admin token");
      else if (msg.includes("409"))
        toast.error("Already claimed by another account");
      else toast.error("Could not claim", { description: msg });
    } finally {
      setClaiming(false);
    }
  }

  const userIds = useMemo(
    () => Array.from(new Set(appts.map((a) => a.userId))),
    [appts],
  );
  const upcoming = appts.filter(
    (a) => a.status === "scheduled" && new Date(a.endAt) > new Date(),
  );
  const member = getRdMember(rdSlug);

  if (unauth) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-clinical-zinc text-sm">
        Sign in to view the RD console.
      </div>
    );
  }

  if (loadingMe) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-clinical-zinc text-sm">
        Loading…
      </div>
    );
  }

  if (!rdSlug) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 space-y-4">
        <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
          RD Console
        </Badge>
        <h1 className="font-serif text-2xl text-white">Claim your RD seat</h1>
        <p className="text-xs text-clinical-zinc">
          Each RD slug binds to one account. Provisioning is privileged —
          enter the operator-issued admin token alongside your RD slug.
        </p>
        <select
          value={claimSlug}
          onChange={(e) => setClaimSlug(e.target.value)}
          className="bg-clinical-surface border border-clinical-border text-xs rounded-md px-3 h-9 text-white w-full"
        >
          {rds.map(({ profile, member: m }) => (
            <option key={profile.slug} value={profile.slug}>
              I am {m.name} ({profile.slug})
            </option>
          ))}
        </select>
        <input
          type="password"
          placeholder="Admin token"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          className="bg-clinical-surface border border-clinical-border text-xs rounded-md px-3 h-9 text-white w-full"
        />
        <Button
          onClick={claim}
          disabled={claiming || !adminToken.trim()}
          className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs h-9 w-full"
        >
          Claim this RD seat
        </Button>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-clinical-zinc text-sm">
        You are signed in as a different RD account. Sign in with the right
        account to view this console.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px] mb-2">
            RD Console
          </Badge>
          <h1 className="font-serif text-3xl text-white">
            {member?.name ?? rdSlug}
          </h1>
          <p className="text-xs text-clinical-zinc mt-1">
            Internal view — appointment list, per-user notes, and inbox.
          </p>
        </div>
      </header>

      <ActivePatientOrdersPanel />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        {/* Appointment column */}
        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-clinical-gold" />
              <p className="text-xs text-white font-medium">
                Upcoming ({upcoming.length})
              </p>
            </div>
            {upcoming.length === 0 && (
              <p className="text-[11px] text-clinical-zinc">
                No scheduled sessions.
              </p>
            )}
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {upcoming.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedUserId(a.userId)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    selectedUserId === a.userId
                      ? "border-clinical-gold/50 bg-clinical-gold/10"
                      : "border-clinical-border hover:border-clinical-gold/30"
                  }`}
                >
                  <p className="text-xs text-white tabular-nums">
                    {fmtDateTime(a.startAt)}
                  </p>
                  <p className="text-[11px] text-clinical-zinc">
                    {APPOINTMENT_KIND_META[a.kind].label} · user{" "}
                    {a.userId.slice(0, 8)}…
                  </p>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-clinical-border">
              <p className="text-[10px] uppercase tracking-widest text-clinical-zinc mb-2">
                All clients
              </p>
              <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
                {userIds.map((uid) => (
                  <button
                    key={uid}
                    type="button"
                    onClick={() => setSelectedUserId(uid)}
                    className={`w-full text-left text-[11px] rounded px-2 py-1.5 ${
                      selectedUserId === uid
                        ? "bg-clinical-gold/15 text-clinical-gold"
                        : "text-clinical-zinc hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    user {uid.slice(0, 12)}…
                  </button>
                ))}
                {userIds.length === 0 && (
                  <p className="text-[11px] text-clinical-zinc">
                    No clients yet.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detail column */}
        <div className="space-y-4">
          {selectedUserId ? (
            <>
              <RdCopilotPanel
                key={`copilot:${rdSlug}:${selectedUserId}`}
                rdSlug={rdSlug}
                userId={selectedUserId}
              />
              <UserDetail
                key={`${rdSlug}:${selectedUserId}`}
                rdSlug={rdSlug}
                userId={selectedUserId}
                onChange={refresh}
              />
            </>
          ) : (
            <Card className="bg-clinical-surface border-clinical-border">
              <CardContent className="p-6 text-center text-xs text-clinical-zinc">
                Pick a session or client to see their full record.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

interface ActivePatientOrder {
  serverOrderId: number;
  externalOrderId: string;
  status: string;
  totalPaise: number;
  addressLabel: string | null;
  createdAt: string;
  patientUserId: string | null;
}

interface ActiveOrdersResponse {
  callerIsClinician: boolean;
  orders: ActivePatientOrder[];
}

const ACTIVE_STATUS_SET = new Set([
  "placed",
  "preparing",
  "ready",
  "out_for_delivery",
]);

/**
 * Server-sourced "Active patient orders" panel for the RD console.
 *
 * This panel intentionally does NOT read from the patient-side
 * `ordersContext` (which is localStorage-backed for the signed-in
 * patient). Instead it queries `/api/orders/active`, which returns every
 * order in an active lifecycle stage across all patients when the caller
 * is a clinician. STAT cancels here go through a clinician-targeted POST
 * that runs against the canonical server row.
 */
interface DeliveryEventPayload {
  orderId: number;
  event: string;
  meta?: { reason?: string; priority?: "stat" | "routine" };
}

function ActivePatientOrdersPanel() {
  const { connected } = useSocketStatus();
  const [data, setData] = useState<ActiveOrdersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/orders/active`, {
        credentials: "include",
      });
      if (!r.ok) {
        // 401 / 403 → caller is not a clinician (or not signed in). Hide
        // panel quietly rather than render an error to non-RD users.
        if (r.status === 401 || r.status === 403) {
          setData({ callerIsClinician: false, orders: [] });
          return;
        }
        throw new Error(`Failed to load active orders (${r.status})`);
      }
      const body = (await r.json()) as ActiveOrdersResponse;
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + periodic safety-net polling. Live updates come from
  // the socket subscription effect below.
  useEffect(() => {
    void fetchOrders();
    const t = setInterval(fetchOrders, 30_000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  // -----------------------------------------------------------------------
  // Live updates
  //
  // Subscribe to the socket room of every visible active order so the panel
  // updates the moment the kitchen / dispatcher emits an event, instead of
  // waiting on the 30-second poll. Apply the transition optimistically to
  // local state and fall back to a refetch only when we don't recognise
  // the event (e.g. unrelated meta updates).
  // -----------------------------------------------------------------------
  const subscribedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!data?.callerIsClinician) return;
    const socket = getSocket();
    const desired = new Set(data.orders.map((o) => o.serverOrderId));
    for (const id of desired) {
      if (!subscribedRef.current.has(id)) {
        socket.emit("subscribe:order", id);
        subscribedRef.current.add(id);
      }
    }
    for (const id of Array.from(subscribedRef.current) as number[]) {
      if (!desired.has(id)) {
        socket.emit("unsubscribe:order", id);
        subscribedRef.current.delete(id);
      }
    }
  }, [data]);

  useEffect(() => {
    const socket = getSocket();
    const onEvent = (payload: DeliveryEventPayload) => {
      // Map the canonical event name to the new status. Unknown events
      // (rider position, ETA, sla_breach, etc.) are ignored.
      let nextStatus: string | null = null;
      switch (payload.event) {
        case "order_preparing":
        case "preparing":
        case "status_preparing":
          nextStatus = "preparing";
          break;
        case "rider_at_kitchen":
        case "ready":
        case "status_ready":
          nextStatus = "ready";
          break;
        case "order_picked_up":
        case "rider_en_route_to_customer":
        case "out_for_delivery":
        case "status_out_for_delivery":
          nextStatus = "out_for_delivery";
          break;
        case "delivered":
        case "status_delivered":
        case "order_cancelled":
          nextStatus = payload.event === "order_cancelled" ? "cancelled" : "delivered";
          break;
        default:
          return;
      }
      setData((prev) => {
        if (!prev) return prev;
        // Cancelled / delivered orders drop out of the active feed.
        if (nextStatus && !ACTIVE_STATUS_SET.has(nextStatus)) {
          return {
            ...prev,
            orders: prev.orders.filter(
              (o) => o.serverOrderId !== payload.orderId,
            ),
          };
        }
        return {
          ...prev,
          orders: prev.orders.map((o) =>
            o.serverOrderId === payload.orderId
              ? { ...o, status: nextStatus ?? o.status }
              : o,
          ),
        };
      });
    };
    socket.on("delivery:event", onEvent);
    return () => {
      socket.off("delivery:event", onEvent);
    };
  }, []);

  if (loading) return null;
  if (!data || !data.callerIsClinician) return null;

  const active = data.orders;

  const handleRowCancelled = useCallback(
    async (
      args:
        | { kind: "optimistic-remove"; serverOrderId: number }
        | { kind: "rollback"; serverOrderId: number }
        | { kind: "refetch" },
    ) => {
      if (args.kind === "optimistic-remove") {
        setData((prev) =>
          prev
            ? {
                ...prev,
                orders: prev.orders.filter(
                  (o) => o.serverOrderId !== args.serverOrderId,
                ),
              }
            : prev,
        );
        return;
      }
      // Rollback or refetch both re-pull canonical state from the server.
      await fetchOrders();
    },
    [fetchOrders],
  );

  return (
    <Card className="bg-clinical-surface border-clinical-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 alert-allergen-text" />
            <p className="text-xs text-white font-medium">
              Active patient orders ({active.length})
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!connected && (
              <span className="text-[10px] alert-stat-text">
                Live updates paused — reconnecting…
              </span>
            )}
            <p className="text-[10px] text-clinical-zinc">
              STAT cancel notifies kitchen and rider instantly.
            </p>
          </div>
        </div>
        {error && (
          <p className="text-[11px] alert-allergen-text">{error}</p>
        )}
        {active.length === 0 ? (
          <p className="text-[11px] text-clinical-zinc">
            No active patient orders right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {active.map((order) => (
              <ActivePatientOrderRow
                key={order.serverOrderId}
                order={order}
                onCancelled={handleRowCancelled}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivePatientOrderRow({
  order,
  onCancelled,
}: {
  order: ActivePatientOrder;
  onCancelled: (
    args:
      | { kind: "optimistic-remove"; serverOrderId: number }
      | { kind: "rollback"; serverOrderId: number }
      | { kind: "refetch" },
  ) => void | Promise<void>;
}) {
  // The server feed doesn't carry the patient-side `verifiedAt` flag, so
  // treat anything past "placed" as verified for stepper purposes.
  const stage: ClinicalStage = statusToClinicalStage(
    order.status as Parameters<typeof statusToClinicalStage>[0],
    order.status !== "placed",
  );
  const stageIndex = clinicalStageIndex(stage);

  const handleCancel = useCallback(
    async ({
      reason,
      priority,
    }: {
      reason: string;
      priority: "stat";
    }) => {
      // Optimistically remove the order from the active panel so the
      // clinician sees immediate feedback. We roll back if the server
      // rejects the cancel.
      await onCancelled({
        kind: "optimistic-remove",
        serverOrderId: order.serverOrderId,
      });
      try {
        const r = await fetch(
          `${API_BASE}/orders/${encodeURIComponent(order.externalOrderId)}/cancel`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, priority }),
          },
        );
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(`Cancel failed (${r.status}): ${text || r.statusText}`);
        }
        // Refetch to pick up any side-effects (e.g. fresh patientUserId).
        await onCancelled({ kind: "refetch" });
      } catch (err) {
        await onCancelled({
          kind: "rollback",
          serverOrderId: order.serverOrderId,
        });
        throw err;
      }
    },
    [order.externalOrderId, order.serverOrderId, onCancelled],
  );

  return (
    <div className="rounded-md border border-clinical-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="font-mono text-[11px] text-clinical-gold">
            {order.externalOrderId}
          </p>
          <p className="text-[10px] text-clinical-zinc">
            Patient ID: {order.patientUserId ?? "unknown"}
          </p>
          {order.addressLabel && (
            <p className="text-[10px] text-clinical-zinc">
              Drop: {order.addressLabel}
            </p>
          )}
        </div>
        <StatCancelButton
          orderId={order.externalOrderId}
          size="sm"
          onCancel={handleCancel}
        />
      </div>
      <div className="flex items-center gap-1.5 text-[10px]">
        {CLINICAL_STAGES.map((s, i) => (
          <span
            key={s.key}
            className={
              i <= stageIndex
                ? "text-clinical-gold"
                : "text-clinical-zinc-muted"
            }
          >
            {s.shortLabel}
            {i < CLINICAL_STAGES.length - 1 ? " ›" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function UserDetail({
  rdSlug,
  userId,
  onChange,
}: {
  rdSlug: string;
  userId: string;
  onChange: () => void;
}) {
  const [data, setData] = useState<{
    appointments: RdAppointment[];
    messages: RdMessage[];
    progress: RdProgressLog[];
    labs: RdLabUpload[];
  } | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await rdAdvisoryApi.consoleUserDetail(rdSlug, userId);
      setData(r);
    } catch (e) {
      toast.error("Could not load", { description: String(e) });
    }
  }, [rdSlug, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!data) {
    return (
      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-6 text-xs text-clinical-zinc">
          Loading…
        </CardContent>
      </Card>
    );
  }

  async function sendReply() {
    const t = reply.trim();
    if (!t) return;
    setSending(true);
    try {
      await rdAdvisoryApi.sendMessageAsRd(rdSlug, userId, t);
      setReply("");
      refresh();
    } catch (e) {
      toast.error("Could not send", { description: String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-white font-medium">
            Sessions with user {userId.slice(0, 12)}…
          </p>
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {data.appointments.map((a) => (
              <ApptEditor
                key={a.id}
                appt={a}
                rdSlug={rdSlug}
                onSaved={() => {
                  refresh();
                  onChange();
                }}
              />
            ))}
            {data.appointments.length === 0 && (
              <p className="text-[11px] text-clinical-zinc">
                No appointments with this user.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-clinical-sage" />
              <p className="text-xs text-white font-medium">Progress</p>
            </div>
            {data.progress.length === 0 ? (
              <p className="text-[11px] text-clinical-zinc">No logs.</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {data.progress.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-md border border-clinical-border p-2 text-[11px] text-clinical-zinc"
                  >
                    <p className="text-white text-xs tabular-nums">
                      {new Date(l.loggedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {l.weightKg && (
                        <span>
                          Weight{" "}
                          <span className="text-white">{l.weightKg} kg</span>
                        </span>
                      )}
                      {l.energyScore != null && (
                        <span>
                          Energy{" "}
                          <span className="text-white">
                            {l.energyScore}/5
                          </span>
                        </span>
                      )}
                      {l.adherenceScore != null && (
                        <span>
                          Adherence{" "}
                          <span className="text-white">
                            {l.adherenceScore}/5
                          </span>
                        </span>
                      )}
                    </div>
                    {l.note && (
                      <p className="italic mt-1 text-clinical-zinc">
                        {l.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-clinical-surface border-clinical-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-clinical-gold" />
              <p className="text-xs text-white font-medium">Labs shared</p>
            </div>
            {data.labs.length === 0 ? (
              <p className="text-[11px] text-clinical-zinc">
                Nothing shared.
              </p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {data.labs.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-md border border-clinical-border p-2 text-[11px] text-clinical-zinc"
                  >
                    <a
                      href={l.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-white hover:text-clinical-gold inline-flex items-center gap-1"
                    >
                      {l.fileName}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <p className="text-[10px] text-clinical-zinc mt-0.5 tabular-nums">
                      {new Date(l.createdAt).toLocaleDateString("en-IN")}
                      {" · "}
                      {l.mimeType}
                    </p>
                    {l.note && <p className="italic mt-1">{l.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-clinical-sage" />
            <p className="text-xs text-white font-medium">Conversation</p>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-y-auto rounded-md border border-clinical-border bg-[#050505] p-3">
            {data.messages.length === 0 ? (
              <p className="text-[11px] text-clinical-zinc text-center py-6">
                No messages yet.
              </p>
            ) : (
              data.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.senderRole === "rd" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-lg px-3 py-2 text-xs whitespace-pre-line ${
                      m.senderRole === "rd"
                        ? "bg-clinical-gold/15 text-white border border-clinical-gold/30"
                        : "bg-clinical-sage/10 text-white border border-clinical-sage/30"
                    }`}
                  >
                    <p>{m.body}</p>
                    <p className="text-[10px] text-clinical-zinc mt-1 tabular-nums">
                      {m.senderRole.toUpperCase()} ·{" "}
                      {new Date(m.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Reply as RD…"
              className="bg-[#050505] border-clinical-border text-xs"
            />
            <Button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 self-end h-9"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function ApptEditor({
  appt,
  rdSlug,
  onSaved,
}: {
  appt: RdAppointment;
  rdSlug: string;
  onSaved: () => void;
}) {
  const [notes, setNotes] = useState(appt.rdNotes ?? "");
  const [joinUrl, setJoinUrl] = useState(appt.joinUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await rdAdvisoryApi.consoleSaveNotes(
        rdSlug,
        appt.id,
        notes,
        joinUrl.trim() || null,
      );
      toast.success("Saved");
      onSaved();
    } catch (e) {
      toast.error("Could not save", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-clinical-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-white tabular-nums">
            {fmtDateTime(appt.startAt)}
          </p>
          <p className="text-[11px] text-clinical-zinc">
            {APPOINTMENT_KIND_META[appt.kind].label} ·{" "}
            {formatRupees(appt.pricePaise)}
          </p>
        </div>
        <Badge
          className={`text-[10px] uppercase ${
            appt.status === "scheduled"
              ? "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30"
              : "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30"
          }`}
        >
          {appt.status}
        </Badge>
      </div>
      {appt.userQuestion && (
        <p className="text-[11px] text-clinical-zinc italic">
          “{appt.userQuestion}”
        </p>
      )}
      <Input
        value={joinUrl}
        onChange={(e) => setJoinUrl(e.target.value)}
        placeholder="Video room URL (paste from Zoom/Meet/etc.)"
        className="bg-[#050505] border-clinical-border text-[11px] h-8"
      />
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Private RD notes for this session — visible to the user."
        rows={3}
        maxLength={4000}
        className="bg-[#050505] border-clinical-border text-[11px]"
      />
      <Button
        onClick={save}
        disabled={saving}
        size="sm"
        className="h-7 text-[11px] bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
      >
        <Save className="w-3 h-3 mr-1" />
        Save
      </Button>
    </div>
  );
}
