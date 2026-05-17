import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE } from "@/lib/apiBase";
import type {
  ModerationAppealDTO,
  ModerationDecisionDTO,
} from "@/lib/contentApi";

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

interface AppealRow {
  appeal: ModerationAppealDTO;
  decision: ModerationDecisionDTO;
}

async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
  token: string,
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers ?? {}),
  };
  if (token) (headers as Record<string, string>)["x-admin-token"] = token;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json() as Promise<T>;
}

export default function AdminCommunityModeration() {
  const [tab, setTab] = useState<"queue" | "appeals" | "challenges">("queue");
  const [decisions, setDecisions] = useState<ModerationDecisionDTO[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [challenges, setChallenges] = useState<
    Array<{ id: number; title: string; weekStartDate: string; status: string }>
  >([]);
  const [cohorts, setCohorts] = useState<
    Array<{ id: number; slug: string; name: string; memberCount: number }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? ""),
  );
  const [notes, setNotes] = useState<Record<number, string>>({});

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, a, ch, co] = await Promise.all([
        adminFetch<{ decisions: ModerationDecisionDTO[] }>(
          "/community/moderation/queue",
          {},
          token,
        ),
        adminFetch<{ appeals: AppealRow[] }>(
          "/community/moderation/appeals",
          {},
          token,
        ),
        adminFetch<{
          challenges: Array<{
            id: number;
            title: string;
            weekStartDate: string;
            status: string;
          }>;
        }>("/community/challenges", {}, token),
        adminFetch<{
          cohorts: Array<{
            id: number;
            slug: string;
            name: string;
            memberCount: number;
          }>;
        }>("/community/cohorts", {}, token),
      ]);
      setDecisions(q.decisions);
      setAppeals(a.appeals);
      setChallenges(ch.challenges);
      setCohorts(co.cohorts);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resolve = async (
    id: number,
    outcome: "upheld" | "overturned",
  ) => {
    try {
      await adminFetch(
        `/community/moderation/appeals/${id}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({
            outcome,
            reviewerNote: notes[id] ?? "",
          }),
        },
        token,
      );
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const generate = async (slug: string) => {
    try {
      await adminFetch(
        `/community/cohorts/${encodeURIComponent(slug)}/generate-challenge`,
        { method: "POST", body: "{}" },
        token,
      );
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveToken = (val: string) => {
    setToken(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem(ADMIN_TOKEN_KEY, val);
      else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="font-serif text-3xl text-white">
          Community moderation
        </h1>
        <p className="text-sm text-clinical-zinc">
          Review AI-flagged content, decide appeals, and generate cohort
          challenges.
        </p>
      </header>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-clinical-zinc">Admin token</label>
          <input
            value={token}
            onChange={(e) => saveToken(e.target.value)}
            placeholder="x-admin-token"
            className="bg-clinical-dark border border-clinical-border rounded px-2 py-1 text-sm text-white flex-1 min-w-[200px]"
          />
          <Button onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-rose-400">Error: {error}</p>
      )}

      <div className="flex gap-2">
        {(["queue", "appeals", "challenges"] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t)}
          >
            {t === "queue"
              ? `Queue (${decisions.length})`
              : t === "appeals"
                ? `Appeals (${appeals.filter((a) => a.appeal.status === "open").length})`
                : `Cohorts (${cohorts.length})`}
          </Button>
        ))}
      </div>

      {tab === "queue" && (
        <div className="space-y-3">
          {decisions.length === 0 && (
            <p className="text-sm text-clinical-zinc">Queue is clear.</p>
          )}
          {decisions.map((d) => (
            <Card
              key={d.id}
              className="bg-clinical-surface border-clinical-border"
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      d.decision === "hidden"
                        ? "bg-rose-500/20 text-rose-300 border-0"
                        : "bg-amber-500/20 text-amber-300 border-0"
                    }
                  >
                    {d.decision} · sev {d.severity}
                  </Badge>
                  <Badge className="bg-clinical-surface-elevated text-clinical-zinc border-0 text-[10px]">
                    {d.contentType} #{d.contentId}
                  </Badge>
                  <Badge className="bg-clinical-surface-elevated text-clinical-zinc border-0 text-[10px]">
                    {d.actor === "ai" ? d.model ?? "ai" : "human"}
                  </Badge>
                  <span className="text-[10px] text-clinical-zinc ml-auto">
                    {new Date(d.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-white whitespace-pre-wrap">
                  {d.snapshot}
                </p>
                <p className="text-xs text-clinical-zinc">
                  <span className="font-semibold">Categories:</span>{" "}
                  {d.categories.join(", ") || "—"}
                </p>
                <p className="text-xs text-clinical-zinc">
                  <span className="font-semibold">Rationale:</span>{" "}
                  {d.rationale || "—"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "appeals" && (
        <div className="space-y-3">
          {appeals.length === 0 && (
            <p className="text-sm text-clinical-zinc">No appeals filed.</p>
          )}
          {appeals.map(({ appeal, decision }) => (
            <Card
              key={appeal.id}
              className="bg-clinical-surface border-clinical-border"
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      appeal.status === "open"
                        ? "bg-amber-500/20 text-amber-300 border-0"
                        : appeal.status === "overturned"
                          ? "bg-emerald-500/20 text-emerald-300 border-0"
                          : "bg-rose-500/20 text-rose-300 border-0"
                    }
                  >
                    Appeal · {appeal.status}
                  </Badge>
                  <Badge className="bg-clinical-surface-elevated text-clinical-zinc border-0 text-[10px]">
                    Decision #{decision.id} ({decision.decision})
                  </Badge>
                  <span className="text-[10px] text-clinical-zinc ml-auto">
                    {new Date(appeal.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs uppercase text-clinical-zinc-muted mb-1">
                      User reason
                    </p>
                    <p className="text-sm text-white whitespace-pre-wrap">
                      {appeal.reason}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-clinical-zinc-muted mb-1">
                      Original content
                    </p>
                    <p className="text-sm text-clinical-zinc whitespace-pre-wrap">
                      {decision.snapshot}
                    </p>
                  </div>
                </div>
                {appeal.status === "open" && (
                  <div className="space-y-2">
                    <Textarea
                      value={notes[appeal.id] ?? ""}
                      onChange={(e) =>
                        setNotes((n) => ({
                          ...n,
                          [appeal.id]: e.target.value,
                        }))
                      }
                      placeholder="Reviewer note (optional)"
                      className="bg-clinical-dark border-clinical-border text-white text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void resolve(appeal.id, "overturned")}
                        className="bg-emerald-600 hover:bg-emerald-500"
                      >
                        Overturn (restore)
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void resolve(appeal.id, "upheld")}
                      >
                        Uphold AI decision
                      </Button>
                    </div>
                  </div>
                )}
                {appeal.reviewerNote && (
                  <p className="text-xs text-clinical-zinc">
                    <span className="font-semibold">Reviewer note:</span>{" "}
                    {appeal.reviewerNote}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "challenges" && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            {cohorts.map((c) => (
              <Card
                key={c.id}
                className="bg-clinical-surface border-clinical-border"
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">{c.name}</p>
                    <p className="text-xs text-clinical-zinc">
                      {c.memberCount} members · slug {c.slug}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => void generate(c.slug)}>
                    Generate this week
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <div>
            <p className="text-xs uppercase text-clinical-zinc-muted mb-2">
              Recent challenges
            </p>
            <div className="space-y-2">
              {challenges.map((c) => (
                <Card
                  key={c.id}
                  className="bg-clinical-surface border-clinical-border"
                >
                  <CardContent className="p-3 text-sm flex items-center gap-3">
                    <Badge className="bg-clinical-surface-elevated text-clinical-zinc border-0 text-[10px]">
                      {c.weekStartDate}
                    </Badge>
                    <span className="text-white">{c.title}</span>
                    <Badge className="ml-auto bg-clinical-blue/20 text-clinical-blue border-0 text-[10px]">
                      {c.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
