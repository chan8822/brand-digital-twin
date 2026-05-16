import { Link } from "react-router";
import { useEffect, useState } from "react";
import { apiPath } from "@/lib/apiBase";
import { CheckCircle2, AlertCircle, RefreshCw, Bot as BotIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bot,
  Brain,
  ClipboardList,
  FileText,
  LineChart,
  LifeBuoy,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Store,
  Users,
  UtensilsCrossed,
} from "lucide-react";

type AdminLink = {
  path: string;
  title: string;
  description: string;
  icon: typeof Activity;
};

const ADMIN_LINKS: Array<{ section: string; items: AdminLink[] }> = [
  {
    section: "Operations",
    items: [
      {
        path: "/admin/ops",
        title: "Ops Dashboard",
        description: "Live order flow, dispatch, ETA accuracy, anomalies.",
        icon: Activity,
      },
      {
        path: "/admin/forecasting",
        title: "Demand Forecasting",
        description: "Predicted volumes per dish, kitchen, and slot.",
        icon: LineChart,
      },
      {
        path: "/admin/menu-engineering",
        title: "Menu Engineering",
        description: "Margin × velocity matrix to prune and promote dishes.",
        icon: UtensilsCrossed,
      },
    ],
  },
  {
    section: "Analytics & AI",
    items: [
      {
        path: "/admin/analytics",
        title: "Analytics",
        description: "Revenue, retention, cohort and protocol metrics.",
        icon: BarChart3,
      },
      {
        path: "/admin/ai-runs",
        title: "AI Runs",
        description: "Telemetry of every agent invocation, latency and cost.",
        icon: Brain,
      },
      {
        path: "/admin/ops-agent",
        title: "Ops Agent",
        description: "Conversational console for the ops support agent.",
        icon: Bot,
      },
      {
        path: "/admin/cms-agent",
        title: "CMS Agent",
        description: "Generate and edit menu copy, photos, and protocols.",
        icon: Sparkles,
      },
    ],
  },
  {
    section: "Trust & Safety",
    items: [
      {
        path: "/admin/moderation",
        title: "Review Moderation",
        description: "Queue of flagged dish reviews awaiting decision.",
        icon: ShieldAlert,
      },
      {
        path: "/admin/community-moderation",
        title: "Community Moderation",
        description: "Cohort posts, comments, and member reports.",
        icon: MessageSquare,
      },
      {
        path: "/admin/support-tickets",
        title: "Support Tickets",
        description: "Customer support queue with agent suggestions.",
        icon: LifeBuoy,
      },
    ],
  },
  {
    section: "Partners & B2B",
    items: [
      {
        path: "/admin/rd-applications",
        title: "RD Applications",
        description: "Registered Dietitian onboarding applications.",
        icon: FileText,
      },
      {
        path: "/admin/sales-console",
        title: "B2B Sales Console",
        description: "Corporate accounts pipeline and per-company drilldown.",
        icon: Store,
      },
      {
        path: "/rd-console",
        title: "RD Console",
        description: "Dietitian workspace (RD or admin only).",
        icon: ClipboardList,
      },
    ],
  },
];

export default function AdminIndex() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-clinical-gold font-semibold">
          Internal
        </p>
        <h1 className="text-3xl font-serif font-medium text-white">
          Admin Console
        </h1>
        <p className="text-sm text-clinical-zinc max-w-2xl">
          Operational, analytical, and trust &amp; safety surfaces for the
          Tanmatra team. Pages requiring server data also need
          {" "}
          <code className="text-clinical-gold">RD_ADMIN_TOKEN</code> set on the
          server and matched in browser localStorage as{" "}
          <code className="text-clinical-gold">tanmatra:admin-token:v1</code>.
        </p>
        <div className="flex items-center gap-2 pt-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-clinical-sage/40 bg-clinical-sage/10 text-clinical-sage text-[10px] uppercase tracking-[0.12em] font-semibold">
            <Users className="w-3 h-3" />
            Admin mode active
          </span>
        </div>
      </header>

      <StatusPanel />

      {ADMIN_LINKS.map((group) => (
        <section key={group.section} className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-clinical-zinc font-semibold">
            {group.section}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="group rounded-xl border border-clinical-slate/20 bg-clinical-surface p-4 hover:border-clinical-gold/50 hover:bg-clinical-surface-elevated transition-all"
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-9 h-9 rounded-lg bg-clinical-gold/10 border border-clinical-gold/30 flex items-center justify-center group-hover:bg-clinical-gold/15">
                      <Icon className="w-4 h-4 text-clinical-gold" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white group-hover:text-clinical-gold transition-colors">
                        {item.title}
                      </p>
                      <p className="text-xs text-clinical-zinc mt-1 leading-relaxed">
                        {item.description}
                      </p>
                      <p className="text-[10px] text-clinical-zinc/60 mt-2 font-mono">
                        {item.path}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusPanel — fetches /admin/_status on mount, surfaces:
//   • required env vars missing on this deployment
//   • Postgres + Redis dependency health
//   • per-agent 24h roll-up (runs, failures, last success)
// So an operator landing on /admin sees "what's working" without
// drilling into individual pages.
// ---------------------------------------------------------------------------

interface EnvCheck {
  name: string;
  required: boolean;
  set: boolean;
  hint: string;
}
interface AgentRow {
  name: string;
  totalRuns: number;
  failures: number;
  failureRate: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
}
interface AdminStatus {
  ok: boolean;
  summary: {
    missingRequiredEnv: string[];
    dbHealthy: boolean;
    redisConfigured: boolean;
    redisState: "ok" | "down" | "disabled";
    agentsLast24h: number;
  };
  env: EnvCheck[];
  dependencies: {
    db: { healthy: boolean };
    redis: { state: "ok" | "down" | "disabled" };
  };
  agents: AgentRow[];
}

function StatusPanel() {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const adminToken =
        typeof window !== "undefined"
          ? window.localStorage.getItem("tanmatra:admin-token:v1")
          : null;
      const r = await fetch(apiPath("/admin/_status"), {
        credentials: "include",
        headers: adminToken ? { "x-admin-token": adminToken } : undefined,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus((await r.json()) as AdminStatus);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (loading && !status) {
    return (
      <section className="rounded-xl border border-clinical-slate/20 bg-clinical-surface p-4 text-xs text-clinical-zinc">
        Loading status…
      </section>
    );
  }
  if (error || !status) {
    return (
      <section className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 text-xs text-orange-300">
        Could not load admin status: {error ?? "unknown error"}.{" "}
        <button onClick={() => void refresh()} className="underline hover:text-white">
          Retry
        </button>
      </section>
    );
  }

  const pill = (good: boolean, label: string) => (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
        good
          ? "bg-clinical-sage/15 text-clinical-sage border border-clinical-sage/30"
          : "bg-red-500/15 text-red-300 border border-red-500/30"
      }`}
    >
      {good ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
      {label}
    </span>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-clinical-zinc font-semibold">
          Deployment status
        </h2>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[10px] text-clinical-zinc hover:text-white min-h-7 px-2"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Dependencies */}
        <div className="rounded-xl border border-clinical-slate/20 bg-clinical-surface p-4 space-y-2">
          <p className="text-xs font-semibold text-white">Dependencies</p>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {pill(status.dependencies.db.healthy, "Postgres")}
            {pill(
              status.dependencies.redis.state === "ok",
              status.dependencies.redis.state === "disabled"
                ? "Redis (dev: disabled)"
                : "Redis",
            )}
            {pill(
              status.summary.missingRequiredEnv.length === 0,
              status.summary.missingRequiredEnv.length === 0
                ? "All required env set"
                : `${status.summary.missingRequiredEnv.length} env missing`,
            )}
          </div>
          {status.summary.missingRequiredEnv.length > 0 && (
            <ul className="text-[11px] text-clinical-zinc space-y-0.5 pt-1">
              {status.summary.missingRequiredEnv.map((name) => {
                const hint = status.env.find((e) => e.name === name)?.hint;
                return (
                  <li key={name}>
                    <span className="font-mono text-orange-300">{name}</span>
                    {hint && <span className="text-clinical-zinc/70"> — {hint}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Agents */}
        <div className="rounded-xl border border-clinical-slate/20 bg-clinical-surface p-4 space-y-2">
          <p className="text-xs font-semibold text-white flex items-center gap-1.5">
            <BotIcon className="w-3 h-3 text-clinical-gold" />
            AI agents · last 24h
          </p>
          <div className="space-y-1.5">
            {status.agents.map((a) => {
              const healthy = a.failures === 0 || a.failureRate < 0.1;
              return (
                <div
                  key={a.name}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-white capitalize">{a.name}</span>
                  <span className="text-clinical-zinc tabular-nums">
                    {a.totalRuns === 0 ? (
                      <span className="text-clinical-zinc/60">no runs</span>
                    ) : (
                      <>
                        <span className={healthy ? "text-clinical-sage" : "text-red-300"}>
                          {a.totalRuns} runs · {(100 * (1 - a.failureRate)).toFixed(0)}% ok
                        </span>
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Full env-var checklist (collapsed by default) */}
      <details className="rounded-xl border border-clinical-slate/20 bg-clinical-surface group">
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-white">
          Environment variables ({status.env.filter((e) => e.set).length}/
          {status.env.length} set)
        </summary>
        <div className="px-4 pb-3 space-y-1 text-[11px]">
          {status.env.map((e) => (
            <div key={e.name} className="flex items-start gap-2 py-0.5">
              {e.set ? (
                <CheckCircle2 className="w-3 h-3 text-clinical-sage shrink-0 mt-0.5" />
              ) : (
                <AlertCircle
                  className={`w-3 h-3 shrink-0 mt-0.5 ${
                    e.required ? "text-red-300" : "text-clinical-zinc/60"
                  }`}
                />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-mono text-white">{e.name}</span>
                {e.required && !e.set && (
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider text-red-300">required</span>
                )}
                {!e.required && (
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider text-clinical-zinc/60">optional</span>
                )}
                <p className="text-clinical-zinc leading-snug">{e.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
