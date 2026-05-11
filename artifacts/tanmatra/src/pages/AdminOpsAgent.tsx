import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_BASE } from "@/lib/apiBase";

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

interface ToolCall {
  name: string;
  args: unknown;
  result: unknown;
  ok: boolean;
  ms: number;
}

interface Msg {
  id: string;
  role: "user" | "agent";
  text: string;
  toolCalls?: ToolCall[];
  ts: string;
}

interface AuditRow {
  id: number;
  operatorId: string | null;
  agent: string;
  action: string;
  params: unknown;
  beforeState: unknown;
  afterState: unknown;
  status: string;
  reasoning: string | null;
  createdAt: string;
}

interface LiveQueueOrder {
  id: number;
  status: string;
  totalPaise: number;
  riderId: number | null;
  addressLabel: string | null;
  createdAt: string;
}

interface LiveQueue {
  counts: Record<string, number>;
  orders: LiveQueueOrder[];
}

const QUICK_ACTIONS: Array<{ label: string; message: string }> = [
  { label: "Show live queue", message: "Show me the live queue right now." },
  { label: "Refund last order", message: "I need to refund the most recent delivered order. Walk me through it." },
  { label: "Mark item 86", message: "Mark a menu item as unavailable — ask me which one." },
  { label: "Reassign rider", message: "I need to reassign a rider on an order; ask me which." },
];

function newId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminOpsAgent() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: newId(),
      role: "agent",
      text: 'Ops Agent ready. Try "show the live queue", "mark paneer-tikka 86 because we ran out", or "assign rider 3 to order 12".',
      ts: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [liveQueue, setLiveQueue] = useState<LiveQueue | null>(null);
  const [adminToken, setAdminToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const persistToken = (val: string) => {
    setAdminToken(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem(ADMIN_TOKEN_KEY, val);
      else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  };

  const authedHeaders = (): HeadersInit => {
    const h: HeadersInit = {};
    if (adminToken) h["x-admin-token"] = adminToken;
    return h;
  };

  const loadAudit = async () => {
    try {
      const res = await fetch(`${API_BASE}/ops-agent/audit?limit=20`, {
        credentials: "include",
        headers: authedHeaders(),
      });
      if (res.status === 403) {
        setError("Ops scope required — set an admin token below.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { actions: AuditRow[] };
      setAudit(json.actions);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadLiveQueue = async () => {
    try {
      const res = await fetch(`${API_BASE}/ops-agent/live-queue`, {
        credentials: "include",
        headers: authedHeaders(),
      });
      if (!res.ok) return;
      const json = (await res.json()) as LiveQueue;
      setLiveQueue(json);
    } catch {
      // ignore — surfaced via audit error already
    }
  };

  useEffect(() => {
    void loadAudit();
    void loadLiveQueue();
    const t = setInterval(() => void loadLiveQueue(), 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const sendText = async (text: string) => {
    if (!text || busy) return;
    setInput(text);
    await Promise.resolve();
    await sendInner(text);
  };

  const send = async () => {
    const text = input.trim();
    await sendInner(text);
  };

  const sendInner = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", text, ts: new Date().toISOString() },
    ]);
    setInput("");
    setBusy(true);
    setError(null);

    const agentMsg: Msg = {
      id: newId(),
      role: "agent",
      text: "",
      toolCalls: [],
      ts: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, agentMsg]);

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (adminToken) headers["x-admin-token"] = adminToken;
      const res = await fetch(`${API_BASE}/ops-agent/chat`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ message: text, history }),
      });
      if (res.status === 403) {
        setError("Ops scope required — set an admin token.");
        setBusy(false);
        return;
      }
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "text-delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsg.id ? { ...m, text: m.text + event.delta } : m,
              ),
            );
          } else if (event.type === "tool-call" || event.type === "tool-result") {
            // tool-call shows pending; finish replaces with final list
          } else if (event.type === "finish") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsg.id
                  ? { ...m, text: event.text, toolCalls: event.toolCalls }
                  : m,
              ),
            );
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
      void loadAudit();
      void loadLiveQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container mx-auto py-8 grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Ops Agent</h1>
          <p className="text-sm text-muted-foreground">
            Operator chat for kitchen + dispatch. Every action is audit-logged.
            Destructive actions (refunds, cancellations, "86" markings) require
            explicit confirmation.
          </p>
        </div>

        <Card>
          <CardContent className="pt-4 space-y-2">
            <label className="text-sm font-medium">Admin token</label>
            <Input
              type="password"
              placeholder="x-admin-token (or rely on OPS_USER_IDS allowlist)"
              value={adminToken}
              onChange={(e) => persistToken(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live queue</CardTitle>
          </CardHeader>
          <CardContent>
            {!liveQueue ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(liveQueue.counts).map(([status, count]) => (
                    <Badge key={status} variant="secondary">
                      {status}: {count}
                    </Badge>
                  ))}
                  {Object.keys(liveQueue.counts).length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      No active orders.
                    </span>
                  )}
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
                  {liveQueue.orders.map((o) => (
                    <div
                      key={o.id}
                      className="flex justify-between border-b py-1"
                    >
                      <span>
                        #{o.id} · {o.status}
                        {o.riderId != null ? ` · rider ${o.riderId}` : ""}
                      </span>
                      <span className="text-muted-foreground">
                        ₹{(o.totalPaise / 100).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((a) => (
              <Button
                key={a.label}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void sendText(a.message)}
              >
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="flex flex-col h-[600px]">
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col gap-3">
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md p-3 text-sm ${
                    m.role === "user"
                      ? "bg-primary/10 ml-12"
                      : "bg-muted mr-12"
                  }`}
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {m.role === "user" ? "You" : "Ops Agent"}
                  </div>
                  <div className="whitespace-pre-wrap">{m.text || "…"}</div>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.toolCalls.map((t, i) => (
                        <Badge
                          key={i}
                          variant={t.ok ? "secondary" : "destructive"}
                        >
                          {t.name} ({t.ms}ms)
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder='e.g. "show me the live queue"'
                disabled={busy}
              />
              <Button onClick={() => void send()} disabled={busy}>
                {busy ? "…" : "Send"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="h-[700px] flex flex-col">
        <CardHeader>
          <CardTitle>Recent ops actions</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2">
              {audit.map((a) => (
                <div key={a.id} className="border rounded-md p-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={a.status === "success" ? "default" : "destructive"}
                    >
                      {a.action}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(a.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    operator: {a.operatorId ?? "—"}
                  </div>
                  {a.reasoning && (
                    <div className="mt-1 italic text-muted-foreground">
                      “{a.reasoning}”
                    </div>
                  )}
                  <pre className="mt-1 text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(a.params, null, 2)}
                  </pre>
                </div>
              ))}
              {audit.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No ops actions yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
