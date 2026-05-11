import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE } from "@/lib/apiBase";

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

interface Ticket {
  id: number;
  userId: string | null;
  orderId: number | null;
  channel: string;
  subject: string;
  body: string;
  status: string;
  category: string | null;
  priority: string | null;
  team: string | null;
  triageReason: string | null;
  triagedAt: string | null;
  draftReply: string | null;
  draftCitations: string[];
  draftedAt: string | null;
  sentReply: string | null;
  sentBy: string | null;
  sentAt: string | null;
  humanCategory: string | null;
  humanPriority: string | null;
  humanTeam: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  "delivery",
  "refund",
  "modification",
  "allergen",
  "subscription",
  "billing",
  "feedback",
  "other",
] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const TEAMS = ["care", "ops", "kitchen", "rd", "billing"] as const;

interface Metrics {
  windowDays: number;
  totalTickets: number;
  triaged: number;
  drafted: number;
  sent: number;
  rejected: number;
  acceptanceRate: number;
  triageAccuracy: {
    judged: number;
    categoryMatches: number;
    priorityMatches: number;
    teamMatches: number;
    allThreeMatches: number;
    overallPct: number;
  };
  byCategory: Array<{ category: string; n: number }>;
  byTeam: Array<{ team: string; n: number }>;
  byPriority: Array<{ priority: string; n: number }>;
}

function inlineDiff(
  baseline: string,
  edited: string,
): Array<{ kind: "same" | "added" | "removed"; text: string }> {
  // Word-level LCS diff — small, no deps. Good enough for review UI.
  const a = baseline.split(/(\s+)/);
  const b = edited.split(/(\s+)/);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: Array<{ kind: "same" | "added" | "removed"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: "removed", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "added", text: b[j]! });
      j++;
    }
  }
  while (i < m) out.push({ kind: "removed", text: a[i++]! });
  while (j < n) out.push({ kind: "added", text: b[j++]! });
  return out;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "bg-rose-500 text-white",
  high: "bg-amber-500 text-white",
  normal: "bg-sky-500 text-white",
  low: "bg-slate-400 text-white",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-slate-500 text-white",
  triaged: "bg-sky-500 text-white",
  awaiting_human: "bg-amber-500 text-white",
  sent: "bg-emerald-500 text-white",
  rejected: "bg-rose-500 text-white",
  resolved: "bg-emerald-700 text-white",
};

export default function AdminSupportTickets() {
  const [adminToken, setAdminToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? ""),
  );
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [editedReply, setEditedReply] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [overrideCategory, setOverrideCategory] = useState<string>("");
  const [overridePriority, setOverridePriority] = useState<string>("");
  const [overrideTeam, setOverrideTeam] = useState<string>("");
  const [rejectReason, setRejectReason] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (adminToken) window.localStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  }, [adminToken]);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (adminToken) h["x-admin-token"] = adminToken;
    return h;
  }, [adminToken]);

  const refresh = useCallback(async () => {
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const [tRes, mRes] = await Promise.all([
        fetch(`${API_BASE}/support-tickets${qs}`, {
          credentials: "include",
          headers: headers(),
        }),
        fetch(`${API_BASE}/support-tickets/metrics?days=7`, {
          credentials: "include",
          headers: headers(),
        }),
      ]);
      if (tRes.ok) {
        const data = (await tRes.json()) as { tickets: Ticket[] };
        setTickets(data.tickets);
        if (selected) {
          const fresh = data.tickets.find((t) => t.id === selected.id);
          if (fresh) {
            setSelected(fresh);
            setEditedReply(fresh.draftReply ?? "");
          }
        }
      } else {
        setMsg(`Load failed: ${tRes.status}`);
      }
      if (mRes.ok) setMetrics((await mRes.json()) as Metrics);
    } catch (err) {
      setMsg(`Error: ${(err as Error).message}`);
    }
  }, [headers, statusFilter, selected]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, statusFilter]);

  function selectTicket(t: Ticket): void {
    setSelected(t);
    setEditedReply(t.draftReply ?? "");
    setOverrideCategory(t.category ?? "");
    setOverridePriority(t.priority ?? "");
    setOverrideTeam(t.team ?? "");
    setRejectReason("");
    setShowDiff(false);
  }

  async function callAction(
    path: string,
    body: Record<string, unknown> | null,
  ): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`${API_BASE}/support-tickets/${selected.id}/${path}`, {
        method: "POST",
        credentials: "include",
        headers: headers(),
        body: body ? JSON.stringify(body) : "{}",
      });
      if (!res.ok) {
        setMsg(`${path} failed: ${await res.text()}`);
      } else {
        setMsg(`${path} ok`);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tickets) m.set(t.status, (m.get(t.status) ?? 0) + 1);
    return m;
  }, [tickets]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Support inbox</h1>
          <p className="text-sm text-muted-foreground">
            AI-triaged tickets with drafted replies. Review, edit, and send.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="password"
            placeholder="Admin token"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            className="w-56"
          />
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </header>

      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Last {metrics.windowDays} days
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
              <Stat label="Total" value={metrics.totalTickets} />
              <Stat label="Triaged" value={metrics.triaged} />
              <Stat label="Drafted" value={metrics.drafted} />
              <Stat label="Sent" value={metrics.sent} />
              <Stat label="Rejected" value={metrics.rejected} />
              <Stat
                label="Draft acceptance"
                value={`${metrics.acceptanceRate}%`}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Triage accuracy (vs human-confirmed labels at send time, n=
                {metrics.triageAccuracy.judged})
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Stat
                  label="All three"
                  value={`${metrics.triageAccuracy.overallPct}%`}
                />
                <Stat
                  label="Category"
                  value={`${metrics.triageAccuracy.categoryMatches}/${metrics.triageAccuracy.judged}`}
                />
                <Stat
                  label="Priority"
                  value={`${metrics.triageAccuracy.priorityMatches}/${metrics.triageAccuracy.judged}`}
                />
                <Stat
                  label="Team"
                  value={`${metrics.triageAccuracy.teamMatches}/${metrics.triageAccuracy.judged}`}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {metrics.byCategory.map((c) => (
                <Badge key={c.category} variant="outline">
                  {c.category}: {c.n}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 flex-wrap">
        {["", "new", "triaged", "awaiting_human", "sent", "rejected"].map(
          (s) => (
            <Button
              key={s || "all"}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
            >
              {s || "all"}
              {s ? ` (${counts.get(s) ?? 0})` : ""}
            </Button>
          ),
        )}
      </div>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">
              Tickets ({tickets.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {tickets.length === 0 && (
              <p className="text-sm text-muted-foreground">No tickets.</p>
            )}
            {tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTicket(t)}
                className={`w-full text-left p-3 rounded border transition ${
                  selected?.id === t.id
                    ? "border-primary bg-muted"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">
                    #{t.id} · {t.subject}
                  </span>
                  <Badge
                    className={STATUS_COLOR[t.status] ?? "bg-slate-400"}
                  >
                    {t.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {t.priority && (
                    <Badge
                      className={
                        PRIORITY_COLOR[t.priority] ?? "bg-slate-400 text-white"
                      }
                    >
                      {t.priority}
                    </Badge>
                  )}
                  {t.team && <Badge variant="outline">{t.team}</Badge>}
                  {t.category && (
                    <Badge variant="outline">{t.category}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                  {t.body}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {selected ? `Ticket #${selected.id}` : "Select a ticket"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && (
              <p className="text-sm text-muted-foreground">
                Pick a ticket from the inbox to review.
              </p>
            )}
            {selected && (
              <>
                <div>
                  <h3 className="font-medium text-sm">{selected.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selected.userId ?? "anon"} ·{" "}
                    {new Date(selected.createdAt).toLocaleString()}
                    {selected.orderId
                      ? ` · order #${selected.orderId}`
                      : " · no order"}
                  </p>
                  <p className="mt-2 text-sm whitespace-pre-wrap">
                    {selected.body}
                  </p>
                </div>

                <div className="rounded border p-3 bg-muted/40">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      className={
                        PRIORITY_COLOR[selected.priority ?? ""] ??
                        "bg-slate-400 text-white"
                      }
                    >
                      {selected.priority ?? "—"}
                    </Badge>
                    <Badge variant="outline">{selected.team ?? "—"}</Badge>
                    <Badge variant="outline">{selected.category ?? "—"}</Badge>
                  </div>
                  {selected.triageReason && (
                    <p className="text-xs text-muted-foreground mt-2">
                      <strong>AI triage:</strong> {selected.triageReason}
                    </p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void callAction("triage", null)}
                    >
                      Re-triage
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void callAction("draft", null)}
                    >
                      Re-draft
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">
                      Drafted reply (editable)
                      {selected.draftedAt
                        ? ` · drafted ${new Date(selected.draftedAt).toLocaleString()}`
                        : ""}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowDiff((v) => !v)}
                      disabled={!selected.draftReply}
                    >
                      {showDiff ? "Hide diff" : "Show diff vs AI draft"}
                    </Button>
                  </div>
                  <Textarea
                    value={editedReply}
                    onChange={(e) => setEditedReply(e.target.value)}
                    rows={8}
                    className="font-mono text-sm"
                  />
                  {showDiff && selected.draftReply && (
                    <div className="mt-2 rounded border p-3 bg-muted/40">
                      <p className="text-xs text-muted-foreground mb-1">
                        AI draft baseline → your edit (red = removed, green = added)
                      </p>
                      <p className="text-sm font-mono whitespace-pre-wrap leading-relaxed">
                        {inlineDiff(selected.draftReply, editedReply).map(
                          (seg, i) =>
                            seg.kind === "same" ? (
                              <span key={i}>{seg.text}</span>
                            ) : seg.kind === "added" ? (
                              <span
                                key={i}
                                className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                              >
                                {seg.text}
                              </span>
                            ) : (
                              <span
                                key={i}
                                className="bg-rose-500/20 text-rose-700 dark:text-rose-400 line-through"
                              >
                                {seg.text}
                              </span>
                            ),
                        )}
                      </p>
                    </div>
                  )}
                  {selected.draftCitations.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <strong>Cited facts:</strong>
                      <ul className="list-disc ml-5">
                        {selected.draftCitations.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Confirm or override AI triage (saved with the send for the
                    weekly accuracy report).
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <LabelSelect
                      label="Category"
                      value={overrideCategory}
                      onChange={setOverrideCategory}
                      options={CATEGORIES}
                      aiValue={selected.category}
                    />
                    <LabelSelect
                      label="Priority"
                      value={overridePriority}
                      onChange={setOverridePriority}
                      options={PRIORITIES}
                      aiValue={selected.priority}
                    />
                    <LabelSelect
                      label="Team"
                      value={overrideTeam}
                      onChange={setOverrideTeam}
                      options={TEAMS}
                      aiValue={selected.team}
                    />
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    disabled={busy || !editedReply.trim()}
                    onClick={() =>
                      void callAction("send", {
                        reply: editedReply,
                        category: overrideCategory || undefined,
                        priority: overridePriority || undefined,
                        team: overrideTeam || undefined,
                      })
                    }
                  >
                    Approve & send
                  </Button>
                  <Input
                    placeholder="Why reject? (feeds evals)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="flex-1 min-w-[200px]"
                  />
                  <Button
                    variant="destructive"
                    disabled={busy || !rejectReason.trim()}
                    onClick={() =>
                      void callAction("reject", { reason: rejectReason })
                    }
                  >
                    Reject
                  </Button>
                </div>

                {selected.sentReply && (
                  <div className="rounded border-2 border-emerald-500 p-3">
                    <p className="text-xs font-medium text-emerald-600">
                      Sent {selected.sentAt ? new Date(selected.sentAt).toLocaleString() : ""} by {selected.sentBy ?? "—"}
                    </p>
                    <p className="text-sm whitespace-pre-wrap mt-1">
                      {selected.sentReply}
                    </p>
                  </div>
                )}

                {selected.rejectionReason && (
                  <div className="rounded border-2 border-rose-500 p-3">
                    <p className="text-xs font-medium text-rose-600">
                      Rejected{" "}
                      {selected.rejectedAt
                        ? new Date(selected.rejectedAt).toLocaleString()
                        : ""}
                    </p>
                    <p className="text-sm mt-1">{selected.rejectionReason}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function LabelSelect({
  label,
  value,
  onChange,
  options,
  aiValue,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  aiValue: string | null;
}) {
  const overridden = aiValue && value && value !== aiValue;
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">
        {label}
        {overridden ? " · overridden" : ""}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
            {o === aiValue ? " (AI)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
