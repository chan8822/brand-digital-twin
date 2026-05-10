import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  rdAdvisoryApi,
  type RdAppointment,
  type RdLabUpload,
  type RdMessage,
  type RdProgressLog,
} from "@/lib/rdAdvisoryApi";
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
  Send,
  Trash2,
  TrendingUp,
  Upload,
  X,
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

export default function Appointments() {
  const [appointments, setAppointments] = useState<RdAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauth, setUnauth] = useState(false);

  const refreshAppts = useCallback(async () => {
    try {
      const r = await rdAdvisoryApi.myAppointments();
      setAppointments(r.appointments);
      setUnauth(false);
    } catch (e) {
      if (String(e).includes("401")) setUnauth(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAppts();
  }, [refreshAppts]);

  const upcoming = appointments.filter(
    (a) => a.status === "scheduled" && new Date(a.endAt) > new Date(),
  );
  const past = appointments.filter(
    (a) => a.status !== "scheduled" || new Date(a.endAt) <= new Date(),
  );

  // pick the active RD = most recent appointment's RD, fallback to first bookable
  const activeRdSlug = useMemo(() => {
    if (appointments[0]) return appointments[0].rdSlug;
    return listRds()[0]?.profile.slug ?? "";
  }, [appointments]);

  if (unauth) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-3">
        <p className="text-clinical-zinc text-sm">
          Sign in to see your appointments and message your dietitian.
        </p>
        <Link to="/login">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <Badge className="bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30 uppercase tracking-widest text-[10px] mb-2">
            Care
          </Badge>
          <h1 className="font-serif text-3xl text-white">My RD appointments</h1>
        </div>
        <Link to="/rd">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs h-9 gap-1">
            <CalendarDays className="w-3.5 h-3.5" />
            Book a session
          </Button>
        </Link>
      </header>

      <Tabs defaultValue="schedule">
        <TabsList className="bg-clinical-surface border border-clinical-slate/30">
          <TabsTrigger value="schedule" className="text-xs">
            Schedule
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-xs">
            Chat
          </TabsTrigger>
          <TabsTrigger value="progress" className="text-xs">
            Progress
          </TabsTrigger>
          <TabsTrigger value="labs" className="text-xs">
            Labs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="pt-4">
          <ScheduleTab
            loading={loading}
            upcoming={upcoming}
            past={past}
            onCancel={async (id) => {
              try {
                await rdAdvisoryApi.cancel(id);
                toast.success("Appointment cancelled");
                refreshAppts();
              } catch (e) {
                toast.error("Could not cancel", { description: String(e) });
              }
            }}
          />
        </TabsContent>

        <TabsContent value="chat" className="pt-4">
          {activeRdSlug ? (
            <ChatTab rdSlug={activeRdSlug} />
          ) : (
            <p className="text-xs text-clinical-zinc">
              Book a session to start a conversation.
            </p>
          )}
        </TabsContent>

        <TabsContent value="progress" className="pt-4">
          <ProgressTab />
        </TabsContent>

        <TabsContent value="labs" className="pt-4">
          <LabsTab activeRdSlug={activeRdSlug} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ScheduleTab({
  loading,
  upcoming,
  past,
  onCancel,
}: {
  loading: boolean;
  upcoming: RdAppointment[];
  past: RdAppointment[];
  onCancel: (id: number) => void;
}) {
  if (loading) {
    return <p className="text-xs text-clinical-zinc">Loading…</p>;
  }
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs uppercase tracking-widest text-clinical-zinc mb-2">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <Card className="bg-clinical-surface border-clinical-slate/30">
            <CardContent className="p-5 text-xs text-clinical-zinc">
              You have no upcoming sessions. Browse our{" "}
              <Link
                to="/rd"
                className="text-clinical-gold underline underline-offset-2"
              >
                dietitians
              </Link>{" "}
              to book.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcoming.map((a) => (
              <ApptCard key={a.id} appt={a} onCancel={onCancel} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-clinical-zinc mb-2">
            Past & cancelled
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {past.map((a) => (
              <ApptCard key={a.id} appt={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ApptCard({
  appt,
  onCancel,
}: {
  appt: RdAppointment;
  onCancel?: (id: number) => void;
}) {
  const member = getRdMember(appt.rdSlug);
  const meta = APPOINTMENT_KIND_META[appt.kind];
  return (
    <Card className="bg-clinical-surface border-clinical-slate/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">
              {member?.name ?? appt.rdSlug}
            </p>
            <p className="text-[11px] text-clinical-zinc">{meta.label}</p>
          </div>
          <Badge
            className={`text-[10px] uppercase ${
              appt.status === "scheduled"
                ? "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30"
                : appt.status === "completed"
                  ? "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30"
                  : "bg-red-500/10 text-red-300 border-red-500/30"
            }`}
          >
            {appt.status}
          </Badge>
        </div>
        <div className="text-xs text-clinical-zinc">
          {fmtDateTime(appt.startAt)} · {meta.durationMin}m ·{" "}
          <span className="tabular-nums">{formatRupees(appt.pricePaise)}</span>
        </div>
        {appt.userQuestion && (
          <p className="text-[11px] text-clinical-zinc italic line-clamp-3">
            “{appt.userQuestion}”
          </p>
        )}
        {appt.rdNotes && (
          <div className="rounded-md border border-clinical-gold/20 bg-clinical-gold/5 p-2">
            <p className="text-[10px] uppercase tracking-widest text-clinical-gold mb-1">
              RD notes
            </p>
            <p className="text-[11px] text-clinical-zinc whitespace-pre-line">
              {appt.rdNotes}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          {appt.joinUrl && appt.status === "scheduled" && (
            <a
              href={appt.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-clinical-gold hover:underline"
            >
              Join call <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {onCancel && appt.status === "scheduled" && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-clinical-zinc/70 hidden sm:inline">
                Free cancellation up to 12h before
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onCancel(appt.id)}
                aria-label="Cancel appointment (free up to 12h before)"
                className="min-h-9 text-[11px] text-clinical-zinc hover:text-red-300"
              >
                <X className="w-3 h-3 mr-1" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChatTab({ rdSlug }: { rdSlug: string }) {
  const [messages, setMessages] = useState<RdMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const member = getRdMember(rdSlug);

  const refresh = useCallback(async () => {
    try {
      const r = await rdAdvisoryApi.messages(rdSlug);
      setMessages(r.messages);
    } catch {
      /* ignore */
    }
  }, [rdSlug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const t = body.trim();
    if (!t) return;
    setSending(true);
    try {
      await rdAdvisoryApi.sendMessage(rdSlug, t);
      setBody("");
      refresh();
    } catch (e) {
      toast.error("Could not send", { description: String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="bg-clinical-surface border-clinical-slate/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-clinical-sage" />
          <p className="text-xs text-white font-medium">
            Chat with {member?.name ?? rdSlug}
          </p>
        </div>
        <div className="h-[360px] overflow-y-auto space-y-2 rounded-md border border-clinical-slate/30 bg-[#050505] p-3">
          {messages.length === 0 ? (
            <p className="text-[11px] text-clinical-zinc text-center pt-12">
              No messages yet. Say hi!
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.senderRole === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-lg px-3 py-2 text-xs whitespace-pre-line ${
                    m.senderRole === "user"
                      ? "bg-clinical-gold/15 text-white border border-clinical-gold/30"
                      : "bg-clinical-sage/10 text-white border border-clinical-sage/30"
                  }`}
                >
                  <p>{m.body}</p>
                  <p className="text-[10px] text-clinical-zinc mt-1 tabular-nums">
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
          <div ref={endRef} />
        </div>
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ask a question between sessions…"
            rows={2}
            maxLength={4000}
            className="bg-[#050505] border-clinical-slate/30 text-xs"
          />
          <Button
            onClick={send}
            disabled={sending || !body.trim()}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 self-end h-9"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressTab() {
  const [logs, setLogs] = useState<RdProgressLog[]>([]);
  const [weight, setWeight] = useState("");
  const [energy, setEnergy] = useState<number | null>(null);
  const [adherence, setAdherence] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await rdAdvisoryApi.progress();
      setLogs(r.logs);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save() {
    const w = weight.trim() ? Number(weight) : null;
    if (w == null && energy == null && adherence == null && !note.trim()) {
      toast.error("Add something to log", {
        description: "Weight, energy, adherence, or a note.",
      });
      return;
    }
    setSaving(true);
    try {
      await rdAdvisoryApi.logProgress({
        weightKg: w,
        energyScore: energy,
        adherenceScore: adherence,
        note: note.trim() || undefined,
      });
      setWeight("");
      setEnergy(null);
      setAdherence(null);
      setNote("");
      toast.success("Logged");
      refresh();
    } catch (e) {
      toast.error("Could not save", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-clinical-sage" />
            <p className="text-xs text-white font-medium">Log today</p>
          </div>
          <div className="space-y-2">
            <label className="text-[11px] text-clinical-zinc">
              Weight (kg)
            </label>
            <Input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              type="number"
              step="0.1"
              placeholder="e.g. 68.4"
              className="bg-[#050505] border-clinical-slate/30 text-xs h-9"
            />
          </div>
          <Score
            label="Energy (1–5)"
            value={energy}
            onChange={setEnergy}
          />
          <Score
            label="Plan adherence (1–5)"
            value={adherence}
            onChange={setAdherence}
          />
          <div className="space-y-2">
            <label className="text-[11px] text-clinical-zinc">Note</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="How are you feeling? Any cravings, sleep changes…"
              className="bg-[#050505] border-clinical-slate/30 text-xs"
            />
          </div>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs h-8"
          >
            Save log
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-white font-medium">Recent logs</p>
          {logs.length === 0 ? (
            <p className="text-[11px] text-clinical-zinc">
              No logs yet. Your RD will see entries before your next session.
            </p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className="rounded-md border border-clinical-slate/30 p-3 text-[11px] text-clinical-zinc space-y-1"
                >
                  <p className="text-white text-xs tabular-nums">
                    {new Date(l.loggedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {l.weightKg && (
                      <span>
                        <span className="text-clinical-zinc">Weight</span>{" "}
                        <span className="text-white tabular-nums">
                          {l.weightKg} kg
                        </span>
                      </span>
                    )}
                    {l.energyScore != null && (
                      <span>
                        <span className="text-clinical-zinc">Energy</span>{" "}
                        <span className="text-white">{l.energyScore}/5</span>
                      </span>
                    )}
                    {l.adherenceScore != null && (
                      <span>
                        <span className="text-clinical-zinc">Adherence</span>{" "}
                        <span className="text-white">
                          {l.adherenceScore}/5
                        </span>
                      </span>
                    )}
                  </div>
                  {l.note && (
                    <p className="italic text-clinical-zinc">{l.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Score({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-clinical-zinc">{label}</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`w-8 h-8 rounded-md border text-xs font-semibold ${
              value === n
                ? "bg-clinical-gold text-[#050505] border-clinical-gold"
                : "border-clinical-slate/30 text-clinical-zinc hover:border-clinical-gold/40"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function LabsTab({ activeRdSlug }: { activeRdSlug: string }) {
  const [labs, setLabs] = useState<RdLabUpload[]>([]);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [mimeType, setMimeType] = useState("application/pdf");
  const [note, setNote] = useState("");
  const [shareWith, setShareWith] = useState(activeRdSlug);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setShareWith(activeRdSlug);
  }, [activeRdSlug]);

  const refresh = useCallback(async () => {
    try {
      const r = await rdAdvisoryApi.labs();
      setLabs(r.labs);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function save() {
    if (!fileUrl.trim() || !fileName.trim()) {
      toast.error("Need URL and name", {
        description: "Paste a hosted file URL and give it a name.",
      });
      return;
    }
    setSaving(true);
    try {
      await rdAdvisoryApi.addLab({
        fileUrl: fileUrl.trim(),
        fileName: fileName.trim(),
        mimeType,
        sharedWithRdSlug: shareWith || undefined,
        note: note.trim() || undefined,
      });
      setFileUrl("");
      setFileName("");
      setNote("");
      toast.success("Lab added");
      refresh();
    } catch (e) {
      toast.error("Could not save", { description: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    try {
      await rdAdvisoryApi.deleteLab(id);
      refresh();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-clinical-sage" />
            <p className="text-xs text-white font-medium">Add a lab result</p>
          </div>
          <p className="text-[11px] text-clinical-zinc">
            Paste a hosted file link (PDF / image). Visible only to you and the
            RD you share with.
          </p>
          <Input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="File name (e.g. CBC – Apr 2026.pdf)"
            className="bg-[#050505] border-clinical-slate/30 text-xs h-9"
          />
          <Input
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://… (file URL)"
            className="bg-[#050505] border-clinical-slate/30 text-xs h-9"
          />
          <div className="flex gap-2">
            <select
              value={mimeType}
              onChange={(e) => setMimeType(e.target.value)}
              className="bg-[#050505] border border-clinical-slate/30 text-xs rounded-md px-2 h-9 text-clinical-zinc"
            >
              <option value="application/pdf">PDF</option>
              <option value="image/jpeg">JPEG</option>
              <option value="image/png">PNG</option>
              <option value="image/webp">WebP</option>
            </select>
            <select
              value={shareWith}
              onChange={(e) => setShareWith(e.target.value)}
              className="bg-[#050505] border border-clinical-slate/30 text-xs rounded-md px-2 h-9 text-clinical-zinc flex-1"
            >
              <option value="">Share with: nobody yet</option>
              {listRds().map((r) => (
                <option key={r.profile.slug} value={r.profile.slug}>
                  Share with {r.member.name}
                </option>
              ))}
            </select>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Note (optional)"
            className="bg-[#050505] border-clinical-slate/30 text-xs"
          />
          <Button
            onClick={save}
            disabled={saving}
            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs h-8"
          >
            Save lab
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-slate/30">
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-white font-medium">Your labs</p>
          {labs.length === 0 ? (
            <p className="text-[11px] text-clinical-zinc">
              Nothing uploaded yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {labs.map((l) => (
                <div
                  key={l.id}
                  className="rounded-md border border-clinical-slate/30 p-3 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-clinical-gold shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <a
                          href={l.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-white hover:text-clinical-gold underline-offset-2 hover:underline truncate block"
                        >
                          {l.fileName}
                        </a>
                        <p className="text-[10px] text-clinical-zinc">
                          {new Date(l.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          · {l.mimeType}
                          {l.sharedWithRdSlug
                            ? ` · shared with ${getRdMember(l.sharedWithRdSlug)?.name ?? l.sharedWithRdSlug}`
                            : " · private"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(l.id)}
                      className="text-clinical-zinc hover:text-red-300"
                      aria-label="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {l.note && (
                    <p className="text-[11px] text-clinical-zinc italic">
                      {l.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
