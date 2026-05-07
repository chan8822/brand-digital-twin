import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AiRunRow {
  id: number;
  agent: string;
  userId: string | null;
  model: string;
  promptVersion: string | null;
  status: string;
  escalated: number;
  refusalReason: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicroUsd: number;
  latencyMs: number;
  createdAt: string;
  output: string | null;
  toolCalls: Array<{ name: string; ok: boolean; ms: number }>;
}

function fmtCost(micro: number): string {
  if (micro === 0) return "$0";
  return `$${(micro / 1_000_000).toFixed(6)}`;
}

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

export default function AdminAiRuns() {
  const [rows, setRows] = useState<AiRunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"self" | "admin">("self");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [adminToken, setAdminToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/ai/runs", window.location.origin);
      url.searchParams.set("limit", "50");
      if (agentFilter) url.searchParams.set("agent", agentFilter);
      if (userFilter) url.searchParams.set("userId", userFilter);
      const headers: HeadersInit = {};
      if (adminToken) headers["x-admin-token"] = adminToken;
      const res = await fetch(url.toString(), {
        credentials: "include",
        headers,
      });
      if (res.status === 401) {
        setError("Sign in required to view AI runs.");
        setRows([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        runs: AiRunRow[];
        scope: "self" | "admin";
      };
      setRows(json.runs);
      setScope(json.scope);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFilter, userFilter, adminToken]);

  const saveAdminToken = (val: string) => {
    setAdminToken(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem(ADMIN_TOKEN_KEY, val);
      else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  };

  const totalCost = rows.reduce((s, r) => s + r.costMicroUsd, 0);
  const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI Runs</h1>
          <p className="text-sm text-muted-foreground">
            {scope === "admin"
              ? "Admin view — recent AI gateway runs across all users and agents."
              : "Recent AI gateway runs for the signed-in user."}{" "}
            Telemetry is written to the <code>ai_runs</code> table by the
            gateway.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={scope === "admin" ? "default" : "outline"}>
            scope: {scope}
          </Badge>
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="text-sm font-medium">
            Admin token (optional — unlocks system-wide telemetry)
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              className="flex-1 rounded-md border px-3 py-2 text-sm bg-background"
              placeholder="x-admin-token"
              value={adminToken}
              onChange={(e) => saveAdminToken(e.target.value)}
            />
            {adminToken && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => saveAdminToken("")}
              >
                Clear
              </Button>
            )}
          </div>
          {scope === "admin" && (
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border px-3 py-2 text-sm bg-background"
                placeholder="Filter by userId (optional)"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Runs shown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Total tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {totalTokens.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Estimated cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fmtCost(totalCost)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        {["", "support"].map((a) => (
          <Button
            key={a || "all"}
            size="sm"
            variant={agentFilter === a ? "default" : "outline"}
            onClick={() => setAgentFilter(a)}
          >
            {a || "All agents"}
          </Button>
        ))}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="border rounded-md p-3 text-sm space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{r.agent}</Badge>
                    <Badge variant="secondary">{r.model}</Badge>
                    {r.promptVersion && (
                      <Badge variant="outline">prompt {r.promptVersion}</Badge>
                    )}
                    <Badge
                      variant={
                        r.status === "ok"
                          ? "default"
                          : r.status === "refused"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {r.status}
                    </Badge>
                    {r.escalated === 1 && (
                      <Badge variant="destructive">escalated</Badge>
                    )}
                    {r.refusalReason && (
                      <Badge variant="outline">refusal: {r.refusalReason}</Badge>
                    )}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground">
                    <div>tokens: {r.totalTokens}</div>
                    <div>latency: {r.latencyMs}ms</div>
                    <div>cost: {fmtCost(r.costMicroUsd)}</div>
                    <div>tools: {r.toolCalls?.length ?? 0}</div>
                    <div>user: {r.userId ?? "—"}</div>
                  </div>
                  {r.output && (
                    <p className="text-sm whitespace-pre-wrap line-clamp-3">
                      {r.output}
                    </p>
                  )}
                  {r.toolCalls && r.toolCalls.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {r.toolCalls.map((t, i) => (
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
              {rows.length === 0 && !loading && !error && (
                <p className="text-sm text-muted-foreground">No AI runs yet.</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
