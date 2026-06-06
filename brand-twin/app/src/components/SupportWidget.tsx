"use client";

import { useState } from "react";
import { useSupportTicket } from "@/lib/queries";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SupportWidget({ open, onClose }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const ticket = useSupportTicket();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    ticket.mutate(
      { subject: subject.trim(), body: body.trim() },
      {
        onSuccess: () => {
          setSubject("");
          setBody("");
        },
      },
    );
  }

  function handleClose() {
    ticket.reset();
    setSubject("");
    setBody("");
    onClose();
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="fixed bottom-0 right-0 z-50 h-full max-h-screen w-full overflow-y-auto border-l border-border bg-surface shadow-2xl sm:max-w-sm">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-bold tracking-tight">Support</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close support panel"
            className="rounded-md px-2 py-1 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-6">
          {ticket.isSuccess ? (
            <div className="rounded-xl border border-success/20 bg-success/10 p-5">
              <h3 className="text-sm font-semibold text-success">
                Ticket submitted
              </h3>
              <p className="mt-2 text-xs text-text-muted">
                We got it — expect a reply by email within one business day.
              </p>
              <button
                type="button"
                onClick={() => ticket.reset()}
                className="mt-4 text-xs text-accent hover:underline"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-muted">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What's the issue?"
                  className="w-full rounded-md border border-border bg-bg/60 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-muted">
                  Details
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder="Describe what happened, what you expected, and any relevant context."
                  className="w-full resize-none rounded-md border border-border bg-bg/60 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                />
              </div>

              {ticket.isError && (
                <p className="text-xs text-danger">
                  {(ticket.error as Error).message ?? "Something went wrong — try again."}
                </p>
              )}

              <button
                type="submit"
                disabled={!subject.trim() || !body.trim() || ticket.isPending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ticket.isPending ? "Sending…" : "Send ticket"}
              </button>

              <p className="text-[11px] text-text-muted">
                Replies go to the email on your account.
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
