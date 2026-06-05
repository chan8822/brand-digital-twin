"use client";

/**
 * One approval awaiting a human. Data: ApprovalRequest (agency_os_types.ts).
 * Approve → POST /api/v1/approvals/:id/approve (resumes execution).
 */
import { motion } from "framer-motion";
import { useApprove } from "@/lib/queries";
import type { ApprovalRequest } from "@/lib/types";

function ago(ms: number) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function ApprovalRow({ approval }: { approval: ApprovalRequest }) {
  const approve = useApprove();
  const done = approve.isSuccess || approval.status !== "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: done ? 0.5 : 1, y: 0 }}
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
          {approval.entityType.replace(/_/g, " ")}
        </span>
        <span className="text-[11px] text-text-muted">{approval.entityId}</span>
        <span className="ml-auto text-[11px] text-text-muted">
          {ago(approval.createdAt)}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-text-primary">
        {approval.reason ?? "Action requires approval."}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-text-muted">
          {approval.requestedBy} → {approval.assignedTo}
        </span>
        <button
          type="button"
          disabled={done || approve.isPending}
          onClick={() => approve.mutate(approval.approvalId)}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {done ? "Approved" : approve.isPending ? "Approving…" : "Approve"}
        </button>
      </div>
    </motion.div>
  );
}
