import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { API_BASE } from "@/lib/apiBase";

type Status = "new" | "contacted" | "approved" | "rejected";
interface Application {
  id: number;
  path: "partner" | "advisory" | "both";
  fullName: string;
  email: string;
  credentials: string;
  registrationBody: string | null;
  registrationNumber: string | null;
  yearsExperience: number;
  specializations: string[];
  cityRegion: string;
  languages: string[];
  practiceSetting: string;
  clientVolumeBucket: string | null;
  interests: string[];
  bio: string | null;
  whatsappCountryCode: string | null;
  whatsappPhone: string | null;
  whatsappOptIn: boolean;
  whatsappVerifiedAt: string | null;
  notifyPref: string;
  status: Status;
  adminNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  linkedUserId: string | null;
  linkedRdSlug: string | null;
  createdAt: string;
}

const TOKEN_KEY = "tanmatra:admin-token:v1";

const STATUS_FILTERS: { id: "all" | Status; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const STATUS_STYLES: Record<Status, string> = {
  new: "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/40",
  contacted: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  approved: "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/40",
  rejected: "bg-red-500/15 text-red-300 border-red-500/40",
};

export default function AdminRdApplications() {
  const [token, setToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(TOKEN_KEY) ?? "",
  );
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [rows, setRows] = useState<Application[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);

  const headers = useMemo<HeadersInit>(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h["x-admin-token"] = token;
    return h;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${API_BASE}/admin/rd-applications`, window.location.origin);
      if (filter !== "all") url.searchParams.set("status", filter);
      const res = await fetch(url.toString(), {
        credentials: "include",
        headers,
      });
      if (res.status === 403) {
        setError("Admin access required. Paste the ops token below.");
        setRows([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        rows: Application[];
        counts: { status: Status; n: number }[];
      };
      setRows(j.rows);
      const m: Record<string, number> = {};
      for (const c of j.counts) m[c.status] = c.n;
      setCounts(m);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, headers]);

  useEffect(() => {
    void load();
  }, [load]);

  function saveToken(v: string) {
    setToken(v);
    if (typeof window !== "undefined") {
      if (v) window.localStorage.setItem(TOKEN_KEY, v);
      else window.localStorage.removeItem(TOKEN_KEY);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
            Partner Ops
          </Badge>
          <h1 className="font-serif text-3xl text-white mt-2">RD applications</h1>
          <p className="text-xs text-clinical-zinc mt-1">
            Review onboarding submissions, capture call notes, and provision RD
            seats once approved.
          </p>
        </div>
        <Input
          type="password"
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          placeholder="x-admin-token"
          className="bg-clinical-surface border-clinical-slate/40 text-xs h-9 w-full sm:w-64"
        />
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`text-xs px-3 h-8 rounded-full border ${
              filter === f.id
                ? "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/40"
                : "border-clinical-slate/30 text-clinical-zinc hover:border-clinical-gold/30"
            }`}
          >
            {f.label}
            <span className="ml-2 text-[10px] text-clinical-zinc">
              {f.id === "all"
                ? Object.values(counts).reduce((s, n) => s + n, 0)
                : counts[f.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
        <Card className="bg-clinical-surface border-clinical-slate/30">
          <CardContent className="p-0">
            {loading && rows.length === 0 ? (
              <div className="p-8 text-center text-xs text-clinical-zinc">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-xs text-clinical-zinc">
                No applications yet.
              </div>
            ) : (
              <div className="divide-y divide-clinical-slate/30">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className={`w-full text-left p-4 transition-colors ${
                      selected?.id === r.id
                        ? "bg-clinical-gold/5"
                        : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-white font-medium truncate">
                        {r.fullName}
                      </p>
                      <Badge
                        className={`${STATUS_STYLES[r.status]} text-[10px] uppercase`}
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-clinical-zinc truncate">
                      {r.credentials} · {r.cityRegion} · {r.path}
                    </p>
                    <p className="text-[10px] text-clinical-zinc tabular-nums mt-1">
                      {new Date(r.createdAt).toLocaleString("en-IN")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <ApplicationDetail
            key={selected.id}
            application={selected}
            headers={headers}
            onChange={(patched) => {
              setSelected(patched);
              setRows((rs) =>
                rs.map((r) => (r.id === patched.id ? patched : r)),
              );
            }}
          />
        ) : (
          <Card className="bg-clinical-surface border-clinical-slate/30">
            <CardContent className="p-8 text-center text-xs text-clinical-zinc">
              Select an application to review.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ApplicationDetail({
  application,
  headers,
  onChange,
}: {
  application: Application;
  headers: HeadersInit;
  onChange: (a: Application) => void;
}) {
  const [notes, setNotes] = useState(application.adminNotes ?? "");
  const [provisionSlug, setProvisionSlug] = useState(
    application.linkedRdSlug ?? "",
  );
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setNotes(application.adminNotes ?? "");
    setProvisionSlug(application.linkedRdSlug ?? "");
  }, [application.id, application.adminNotes, application.linkedRdSlug]);

  async function patch(
    payload: Record<string, unknown>,
    label: string,
  ): Promise<void> {
    setBusy(label);
    try {
      const res = await fetch(
        `/api/admin/rd-applications/${application.id}`,
        {
          method: "PATCH",
          headers,
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { ok: boolean; row: Application };
      onChange(j.row);
      toast.success(label);
    } catch (err) {
      toast.error(`${label} failed`, { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const wa =
    application.whatsappPhone &&
    `${application.whatsappCountryCode}${application.whatsappPhone}`;

  return (
    <Card className="bg-clinical-surface border-clinical-slate/30">
      <CardContent className="p-5 space-y-5">
        <div>
          <h2 className="font-serif text-2xl text-white">
            {application.fullName}
          </h2>
          <p className="text-xs text-clinical-zinc">
            {application.credentials} · {application.yearsExperience}y ·{" "}
            {application.cityRegion}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
            <a
              href={`mailto:${application.email}`}
              className="inline-flex items-center gap-1 text-clinical-gold hover:underline"
            >
              <Mail className="w-3.5 h-3.5" />
              {application.email}
            </a>
            {wa && (
              <span className="inline-flex items-center gap-1 text-clinical-zinc">
                <Phone className="w-3.5 h-3.5" />
                {wa}{" "}
                {application.whatsappVerifiedAt && (
                  <CheckCircle2 className="w-3 h-3 text-clinical-sage" />
                )}
              </span>
            )}
            {application.whatsappOptIn && (
              <span className="inline-flex items-center gap-1 text-clinical-sage">
                <MessageCircle className="w-3.5 h-3.5" />
                {application.notifyPref}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <KV k="Path" v={application.path} />
          <KV k="Setting" v={application.practiceSetting} />
          <KV k="Volume" v={application.clientVolumeBucket ?? "—"} />
          <KV
            k="Reg."
            v={
              application.registrationBody
                ? `${application.registrationBody} ${application.registrationNumber ?? ""}`
                : "—"
            }
          />
          <KV
            k="Languages"
            v={application.languages.join(", ") || "—"}
            full
          />
          <KV
            k="Specializations"
            v={application.specializations.join(", ") || "—"}
            full
          />
          <KV k="Interests" v={application.interests.join(", ") || "—"} full />
          {application.bio && <KV k="About" v={application.bio} full />}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
            Internal notes
          </p>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="bg-[#050505] border-clinical-slate/40 text-xs"
            placeholder="Call summary, references, follow-ups…"
          />
          <Button
            size="sm"
            onClick={() => patch({ adminNotes: notes }, "Notes saved")}
            disabled={busy === "Notes saved"}
            className="bg-clinical-gold/15 text-clinical-gold hover:bg-clinical-gold/25 text-xs h-8"
          >
            Save notes
          </Button>
        </div>

        <div className="space-y-2 border-t border-clinical-slate/30 pt-4">
          <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
            Status
          </p>
          <div className="flex flex-wrap gap-2">
            {(["contacted", "approved", "rejected"] as Status[]).map((s) => (
              <Button
                key={s}
                size="sm"
                onClick={() => patch({ status: s }, `Marked ${s}`)}
                disabled={application.status === s || busy === `Marked ${s}`}
                variant="outline"
                className="border-clinical-slate/30 text-xs h-8"
              >
                Mark {s}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-clinical-slate/30 pt-4">
          <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
            Provision RD seat (on approve)
          </p>
          {application.linkedUserId ? (
            <p className="text-[11px] text-clinical-zinc">
              Linked to user{" "}
              <span className="font-mono text-white">
                {application.linkedUserId.slice(0, 12)}…
              </span>
            </p>
          ) : (
            <p className="text-[11px] text-clinical-zinc">
              Applicant has not attached an account yet — share the wizard
              "Attach my account" link in your reply, then provision below.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={provisionSlug}
              onChange={(e) => setProvisionSlug(e.target.value)}
              placeholder="rd-slug-here"
              className="bg-[#050505] border-clinical-slate/40 text-xs h-8 w-48"
            />
            <Button
              size="sm"
              disabled={
                !provisionSlug ||
                !application.linkedUserId ||
                busy === "Approved & provisioned"
              }
              onClick={() =>
                patch(
                  { status: "approved", provisionRdSlug: provisionSlug },
                  "Approved & provisioned",
                )
              }
              className="bg-clinical-sage text-[#050505] hover:bg-clinical-sage/90 text-xs h-8"
            >
              Approve &amp; provision
            </Button>
          </div>
          {application.linkedRdSlug && (
            <p className="text-[11px] text-clinical-sage">
              Provisioned as{" "}
              <span className="font-mono">{application.linkedRdSlug}</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KV({ k, v, full }: { k: string; v: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[10px] uppercase tracking-widest text-clinical-zinc">
        {k}
      </p>
      <p className="text-white whitespace-pre-line break-words">{v}</p>
    </div>
  );
}
