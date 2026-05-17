/**
 * RD copilot panel — surfaces AI-drafted client summary, plan proposal
 * lifecycle (draft → review → approve/reject), and the adherence drift
 * dashboard with one-tap nudge sending. Renders inside the RD console
 * for the currently-selected client.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  rdCopilotApi,
  type AdherenceEvent,
  type AdherenceResponse,
  type RdAuditEntry,
  type RdClientSummary,
  type RdPlanProposal,
} from "@/lib/rdCopilotApi";

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = ((8 - day) % 7) || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const DRIFT_LABEL: Record<AdherenceEvent["kind"], string> = {
  skipped_delivery: "Skipped delivery",
  over_calories: "Over calories",
  missed_protein: "Missed protein",
  outside_plan: "Off-plan order",
};

export function RdCopilotPanel({
  rdSlug,
  userId,
}: {
  rdSlug: string;
  userId: string;
}) {
  const [summary, setSummary] = useState<RdClientSummary | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [proposal, setProposal] = useState<RdPlanProposal | null>(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [rdNotes, setRdNotes] = useState("");
  const [adherence, setAdherence] = useState<AdherenceResponse | null>(null);
  const [audit, setAudit] = useState<RdAuditEntry[]>([]);
  const [weekStart, setWeekStart] = useState(nextMonday());

  const loadAll = useCallback(async () => {
    try {
      const [s, p, a, au] = await Promise.all([
        rdCopilotApi.getSummary(rdSlug, userId),
        rdCopilotApi.latestProposal(rdSlug, userId),
        rdCopilotApi.getAdherence(rdSlug, userId),
        rdCopilotApi.getAudit(rdSlug, userId),
      ]);
      setSummary(s.summary);
      setProposal(p.proposal);
      setRdNotes(p.proposal?.rdNotes ?? "");
      if (p.proposal?.weekStartDate) setWeekStart(p.proposal.weekStartDate);
      setAdherence(a);
      setAudit(au.entries);
    } catch (e) {
      toast.error("Could not load copilot data", { description: String(e) });
    }
  }, [rdSlug, userId]);

  useEffect(() => {
    setSummary(null);
    setProposal(null);
    setRdNotes("");
    setAdherence(null);
    setAudit([]);
    loadAll();
  }, [loadAll]);

  async function refreshSummary() {
    setSummaryBusy(true);
    try {
      const r = await rdCopilotApi.refreshSummary(rdSlug, userId);
      setSummary(r.summary);
      toast.success("Client summary refreshed");
      const au = await rdCopilotApi.getAudit(rdSlug, userId);
      setAudit(au.entries);
    } catch (e) {
      toast.error("Refresh failed", { description: String(e) });
    } finally {
      setSummaryBusy(false);
    }
  }

  async function draftPlan() {
    setProposalBusy(true);
    try {
      const r = await rdCopilotApi.draftProposal(rdSlug, userId, {
        weekStartDate: weekStart,
      });
      setProposal(r.proposal);
      setRdNotes(r.proposal.rdNotes ?? "");
      toast.success("AI plan drafted — review before approving");
      const au = await rdCopilotApi.getAudit(rdSlug, userId);
      setAudit(au.entries);
    } catch (e) {
      toast.error("Could not draft plan", { description: String(e) });
    } finally {
      setProposalBusy(false);
    }
  }

  async function saveNotes() {
    if (!proposal) return;
    try {
      const r = await rdCopilotApi.editProposal(rdSlug, proposal.id, {
        rdNotes: rdNotes || null,
      });
      setProposal(r.proposal);
      toast.success("Notes saved");
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    }
  }

  async function approve() {
    if (!proposal) return;
    setProposalBusy(true);
    try {
      const r = await rdCopilotApi.approveProposal(rdSlug, proposal.id);
      setProposal(r.proposal);
      toast.success("Plan approved — surfaced to client for scheduling");
      await loadAll();
    } catch (e) {
      toast.error("Approve failed", { description: String(e) });
    } finally {
      setProposalBusy(false);
    }
  }

  async function reject() {
    if (!proposal) return;
    setProposalBusy(true);
    try {
      const r = await rdCopilotApi.rejectProposal(
        rdSlug,
        proposal.id,
        rdNotes || "rejected by RD",
      );
      setProposal(r.proposal);
      toast.success("Plan rejected — won't reach client");
      await loadAll();
    } catch (e) {
      toast.error("Reject failed", { description: String(e) });
    } finally {
      setProposalBusy(false);
    }
  }

  async function sendNudge(ev: AdherenceEvent) {
    try {
      await rdCopilotApi.sendNudge(rdSlug, userId, { eventId: ev.id });
      toast.success("Nudge sent to client");
      await loadAll();
    } catch (e) {
      toast.error("Nudge failed", { description: String(e) });
    }
  }

  const driftCounts = adherence?.scan?.countsByKind;
  const totalDrift = useMemo(
    () =>
      driftCounts
        ? Object.values(driftCounts).reduce((a, b) => a + b, 0)
        : 0,
    [driftCounts],
  );

  return (
    <div className="space-y-4">
      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
                AI Client Summary
              </Badge>
              {summary && (
                <p className="text-[10px] text-clinical-zinc mt-1">
                  Drafted {fmtDate(summary.draftedAt)} · model{" "}
                  {summary.model ?? "—"}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={refreshSummary}
              disabled={summaryBusy}
              className="text-xs h-8"
            >
              {summary ? "Refresh" : "Generate"}
            </Button>
          </div>
          {summary ? (
            <pre className="text-[12px] text-clinical-zinc whitespace-pre-wrap font-sans">
              {summary.summary}
            </pre>
          ) : (
            <p className="text-[11px] text-clinical-zinc">
              No summary yet — generate one before the next consult.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
              Plan Proposal
            </Badge>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
                className="bg-clinical-bg border border-clinical-border text-xs rounded-md px-2 h-8 text-white"
              />
              <Button
                size="sm"
                onClick={draftPlan}
                disabled={proposalBusy}
                className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs h-8"
              >
                Draft AI plan
              </Button>
            </div>
          </div>

          {proposal ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] text-clinical-zinc">
                <Badge className="bg-clinical-bg border-clinical-border text-clinical-zinc">
                  {proposal.status}
                </Badge>
                <span>Week of {proposal.weekStartDate}</span>
                {proposal.totals && (
                  <span>
                    · avg {proposal.totals.avgCalories} kcal · ₹
                    {(proposal.totals.totalPaise / 100).toFixed(0)}
                  </span>
                )}
              </div>

              {proposal.aiRationale && (
                <p className="text-[12px] text-clinical-zinc italic">
                  {proposal.aiRationale}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {proposal.days.map((d) => (
                  <div
                    key={d.date}
                    className="rounded-md border border-clinical-border p-2 text-[11px] text-clinical-zinc"
                  >
                    <div className="text-white text-xs mb-1">{d.date}</div>
                    <div>B: {d.breakfast?.name ?? "—"}</div>
                    <div>L: {d.lunch?.name ?? "—"}</div>
                    <div>D: {d.dinner?.name ?? "—"}</div>
                  </div>
                ))}
              </div>

              <Textarea
                value={rdNotes}
                onChange={(e) => setRdNotes(e.target.value)}
                placeholder="RD notes — clinical reasoning, edits to discuss with client…"
                className="bg-clinical-bg border-clinical-border text-xs"
                rows={3}
              />

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveNotes}
                  disabled={
                    proposalBusy ||
                    proposal.status === "rd_approved" ||
                    proposal.status === "rejected"
                  }
                  className="text-xs h-8"
                >
                  Save notes
                </Button>
                <Button
                  size="sm"
                  onClick={approve}
                  disabled={proposalBusy || proposal.status === "rd_approved"}
                  className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 text-xs h-8"
                >
                  Approve & send to client
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reject}
                  disabled={
                    proposalBusy ||
                    proposal.status === "rd_approved" ||
                    proposal.status === "rejected"
                  }
                  className="text-xs h-8 border-red-400/40 text-red-300"
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-clinical-zinc">
              Pick a week and let the planner draft a proposal for your
              review.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
              Plan Adherence
            </Badge>
            {adherence?.escalateRecommended && (
              <Badge className="bg-red-500/15 text-red-300 border-red-400/30 text-[10px]">
                Escalate
              </Badge>
            )}
          </div>

          {!adherence?.mealPlanId && (
            <p className="text-[11px] text-clinical-zinc">
              No RD-approved plan in flight — adherence tracking starts after
              you approve a proposal.
            </p>
          )}

          {adherence?.mealPlanId && (
            <>
              <p className="text-[11px] text-clinical-zinc">
                Tracking week {adherence.weekStartDate} ·{" "}
                {adherence.scan?.daysScanned ?? 0}/
                {adherence.scan?.totalDays ?? 0} days scanned · {totalDrift}{" "}
                drift event{totalDrift === 1 ? "" : "s"}
              </p>
              {driftCounts && (
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {(
                    Object.entries(driftCounts) as Array<
                      [AdherenceEvent["kind"], number]
                    >
                  ).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2 py-1 rounded border border-clinical-border text-clinical-zinc"
                    >
                      {DRIFT_LABEL[k]}: {v}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {adherence.events.length === 0 && (
                  <p className="text-[11px] text-clinical-zinc">
                    No drift detected yet — client is on plan.
                  </p>
                )}
                {adherence.events.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-md border border-clinical-border p-2 flex items-start justify-between gap-2"
                  >
                    <div className="text-[11px] text-clinical-zinc">
                      <div className="text-white text-xs">
                        {DRIFT_LABEL[ev.kind]} · {ev.dayDate}
                      </div>
                      <div>severity {ev.severity}</div>
                      {ev.nudgeSentAt && (
                        <div className="text-clinical-gold/80">
                          nudge sent {fmtDate(ev.nudgeSentAt)}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => sendNudge(ev)}
                      disabled={!!ev.nudgeSentAt}
                      className="text-[10px] h-7"
                    >
                      {ev.nudgeSentAt ? "Sent" : "Nudge"}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-5 space-y-2">
          <Badge className="bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30 uppercase tracking-widest text-[10px]">
            AI Audit Log
          </Badge>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {audit.length === 0 && (
              <p className="text-[11px] text-clinical-zinc">
                No copilot activity for this client yet.
              </p>
            )}
            {audit.map((e) => (
              <div
                key={e.id}
                className="text-[11px] text-clinical-zinc flex justify-between gap-2"
              >
                <span>
                  <span className="text-white">{e.kind}</span> · {e.actor}
                </span>
                <span className="text-clinical-zinc-muted">
                  {new Date(e.createdAt).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
