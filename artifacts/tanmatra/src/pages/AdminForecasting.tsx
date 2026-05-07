import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

interface ForecastRow {
  zone: string;
  dishSlug: string;
  dishName: string;
  bucket: string;
  daypart: string;
  hour?: number;
  forecastQty: number;
  observedDays: number;
}

interface StockRow {
  stockId: number;
  zone: string;
  product: string;
  onHandQty: number;
  parLevel: number;
  reorderQty: number;
  unit: string;
  leadTimeDays: number;
  supplierName: string | null;
  buyingPricePaise: number | null;
  inventoryItemId: number;
}

interface PORow {
  id: number;
  supplierName: string;
  status: string;
  totalPaise: number;
  zone: string;
  etaDate: string | null;
  createdAt: string;
}

interface MapeRow {
  zone: string;
  dishSlug: string;
  mape: number;
  n: number;
}

interface Msg {
  id: string;
  role: "user" | "agent";
  text: string;
}

function newId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminForecasting() {
  const [adminToken, setAdminToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
  );
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [granularity, setGranularity] = useState<"daypart" | "hour">("daypart");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [pos, setPos] = useState<PORow[]>([]);
  const [mape, setMape] = useState<MapeRow[]>([]);
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: newId(),
      role: "agent",
      text: 'Reorder Agent ready. Try "what\'s running low?" or "draft a PO for chickpeas".',
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistToken = (val: string) => {
    setAdminToken(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem(ADMIN_TOKEN_KEY, val);
      else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  };

  const headers = (): HeadersInit => {
    const h: HeadersInit = {};
    if (adminToken) h["x-admin-token"] = adminToken;
    return h;
  };

  const loadAll = async () => {
    try {
      const [f, s, p, a] = await Promise.all([
        fetch(`/api/forecasting/forecast?granularity=${granularity}`, { credentials: "include", headers: headers() }),
        fetch("/api/forecasting/stock", { credentials: "include", headers: headers() }),
        fetch("/api/forecasting/purchase-orders", { credentials: "include", headers: headers() }),
        fetch("/api/forecasting/accuracy", { credentials: "include", headers: headers() }),
      ]);
      if (f.status === 403) {
        setError("Ops scope required — set an admin token below.");
        return;
      }
      setError(null);
      if (f.ok) setForecast((await f.json()).forecast);
      if (s.ok) setStock((await s.json()).stock);
      if (p.ok) setPos((await p.json()).purchaseOrders);
      if (a.ok) setMape((await a.json()).mape);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, granularity]);

  const downloadPoCsv = async (id: number) => {
    try {
      const res = await fetch(
        `/api/forecasting/purchase-orders/${id}/export.csv`,
        { credentials: "include", headers: headers() },
      );
      if (!res.ok) {
        setError(`CSV export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const filename =
        /filename="?([^";]+)"?/.exec(
          res.headers.get("content-disposition") ?? "",
        )?.[1] ?? `po-${id}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const sendMessage = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { id: newId(), role: "user", text }]);
    setInput("");
    setBusy(true);
    const agentMsg: Msg = { id: newId(), role: "agent", text: "" };
    setMessages((prev) => [...prev, agentMsg]);
    try {
      const res = await fetch("/api/forecasting/agent/chat", {
        method: "POST",
        credentials: "include",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
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
          if (event.type === "tool-result" && event.result?.requiresConfirmation) {
            const summary = event.result.summary ?? "Confirmation required.";
            setMessages((prev) => [
              ...prev,
              {
                id: newId(),
                role: "agent",
                text: `[${event.name}] ${summary}`,
              },
            ]);
          } else if (event.type === "text-delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsg.id ? { ...m, text: m.text + event.delta } : m,
              ),
            );
          } else if (event.type === "finish") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsg.id ? { ...m, text: event.text } : m,
              ),
            );
          }
        }
      }
      void loadAll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Demand Forecasting & Reorder</h1>
        <p className="text-sm text-muted-foreground">
          Per-dish demand forecast, stock levels, and PO drafts.
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
      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Today's forecast</CardTitle>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={granularity === "daypart" ? "default" : "outline"}
                onClick={() => setGranularity("daypart")}
              >
                Daypart
              </Button>
              <Button
                size="sm"
                variant={granularity === "hour" ? "default" : "outline"}
                onClick={() => setGranularity("hour")}
              >
                Hourly
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {forecast.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No history yet. Once orders accumulate, the rolling-average
                  baseline will populate.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1">Dish</th>
                      <th>{granularity === "hour" ? "Hour" : "Daypart"}</th>
                      <th>Zone</th>
                      <th className="text-right">Forecast qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.slice(0, 25).map((f) => (
                      <tr
                        key={`${f.zone}-${f.bucket}-${f.dishSlug}`}
                        className="border-b"
                      >
                        <td className="py-1">{f.dishName || f.dishSlug}</td>
                        <td>{f.bucket}</td>
                        <td>{f.zone}</td>
                        <td className="text-right">
                          {f.forecastQty.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock vs par</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {stock.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No kitchen stock rows yet. Seed via the API or DB to start
                  tracking.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-muted-foreground">
                      <th>Product</th>
                      <th>Zone</th>
                      <th className="text-right">On hand</th>
                      <th className="text-right">Par</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.map((s) => {
                      const low = s.onHandQty <= s.parLevel;
                      return (
                        <tr key={s.stockId} className="border-b">
                          <td className="py-1">{s.product}</td>
                          <td>{s.zone}</td>
                          <td className="text-right">
                            {s.onHandQty} {s.unit}
                          </td>
                          <td className="text-right">
                            {s.parLevel} {s.unit}
                          </td>
                          <td>
                            <Badge variant={low ? "destructive" : "secondary"}>
                              {low ? "low" : "ok"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Purchase orders</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {pos.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No POs yet. Ask the Reorder Agent to draft one.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-muted-foreground">
                      <th>#</th>
                      <th>Supplier</th>
                      <th>Status</th>
                      <th>ETA</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">CSV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pos.map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="py-1">#{p.id}</td>
                        <td>{p.supplierName}</td>
                        <td>
                          <Badge
                            variant={
                              p.status === "approved" ? "default" : "secondary"
                            }
                          >
                            {p.status}
                          </Badge>
                        </td>
                        <td>{p.etaDate ?? "—"}</td>
                        <td className="text-right">
                          ₹{(p.totalPaise / 100).toFixed(0)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="underline text-xs"
                            onClick={() => void downloadPoCsv(p.id)}
                          >
                            export CSV
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forecast accuracy (MAPE, last 30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {mape.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No actuals recorded yet — accuracy will populate as
                  forecasts mature.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left text-muted-foreground">
                      <th>Dish</th>
                      <th>Zone</th>
                      <th className="text-right">MAPE</th>
                      <th className="text-right">N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mape.map((m) => (
                      <tr
                        key={`${m.zone}-${m.dishSlug}`}
                        className="border-b"
                      >
                        <td className="py-1">{m.dishSlug}</td>
                        <td>{m.zone}</td>
                        <td className="text-right">
                          {(m.mape * 100).toFixed(1)}%
                        </td>
                        <td className="text-right">{m.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reorder Agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void sendMessage("What ingredients are running low right now?")
              }
            >
              What's low?
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void sendMessage("Show today's demand forecast for default zone.")
              }
            >
              Show forecast
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void sendMessage("List all draft purchase orders.")}
            >
              List drafts
            </Button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto border rounded-md p-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`text-sm ${
                  m.role === "user"
                    ? "bg-primary/10 rounded-md p-2 ml-12"
                    : "bg-muted rounded-md p-2 mr-12"
                }`}
              >
                <div className="text-[10px] uppercase text-muted-foreground mb-1">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap">{m.text || "…"}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage(input);
                }
              }}
              placeholder='e.g. "draft a PO for 10kg chickpeas at ₹120/kg"'
              disabled={busy}
            />
            <Button onClick={() => void sendMessage(input)} disabled={busy}>
              {busy ? "…" : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
