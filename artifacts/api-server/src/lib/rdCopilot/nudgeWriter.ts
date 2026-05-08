/**
 * AI rewrite for adherence nudges.
 *
 * `buildNudgeText` (in adherence.ts) gives us a deterministic, audit-safe
 * baseline per drift kind. That copy reads like a template after a few
 * weeks, so this module asks Gemini to rewrite the same baseline as a
 * short, warm coach-style message using the cached client summary and
 * the specific drift detail as context.
 *
 * Always returns *something*. If the model is slow, errors, or returns
 * empty/oversized text, we fall back to the deterministic baseline so
 * the RD console keeps working.
 */

import { generateText } from "ai";
import type { AdherenceEvent } from "@workspace/db";
import { getModel, DEFAULT_MODEL_ID } from "../ai/model";
import { logger } from "../logger";
import { buildNudgeText } from "./adherence";

const NUDGE_TIMEOUT_MS = 8_000;
const MAX_NUDGE_CHARS = 600;

export interface RewriteNudgeInput {
  event: AdherenceEvent;
  /** Cached RD client summary text (5-bullet brief). Optional. */
  clientSummary?: string | null;
  /** Display name / slug of the RD sending the nudge — used as signature hint. */
  rdSlug: string;
}

export interface RewriteNudgeResult {
  /** Final text to send to the user. */
  text: string;
  /** Deterministic baseline that was used as the rewrite seed. Always present. */
  baseline: string;
  /** Model id that produced `text`, or "deterministic" when fallback. */
  model: string;
  usedFallback: boolean;
  /** Reason for falling back, when applicable — useful for the audit log. */
  fallbackReason?: string;
}

const KIND_HINTS: Record<AdherenceEvent["kind"], string> = {
  skipped_delivery:
    "A delivery was skipped. Acknowledge the skip without guilt-tripping; offer a concrete next step (swap day, reschedule).",
  over_calories:
    "Calories ran high vs plan. Be matter-of-fact about the numbers; suggest one small rebalance (lighter meal, walk).",
  missed_protein:
    "Protein under target. Recommend one specific high-protein swap or snack the client can act on today.",
  outside_plan:
    "An off-plan order happened. No judgement — invite a quick check-in about whether the plan needs adjusting.",
};

export async function rewriteNudge(
  input: RewriteNudgeInput,
): Promise<RewriteNudgeResult> {
  const baseline = buildNudgeText(input.event);
  const detail = (input.event.detail ?? {}) as Record<string, unknown>;

  const promptParts = [
    "You are a Registered Dietitian's coaching voice writing a single direct chat message to a client.",
    "Tone: warm, specific, no jargon, no emojis, no bullet lists, 2–3 short sentences max.",
    "DO NOT invent numbers, foods, weights, or events that aren't in the data below. If unsure, stay vague.",
    "DO NOT start with 'Hi' / greetings / sign-offs — the client already sees this in an existing chat thread.",
    `Drift kind: ${input.event.kind}. Hint: ${KIND_HINTS[input.event.kind]}`,
    `Day: ${input.event.dayDate}. Severity (1–3): ${input.event.severity}.`,
    `Drift detail (JSON): ${JSON.stringify(detail)}`,
    input.clientSummary
      ? `Client summary (RD's notes, for context only — do not quote verbatim):\n${input.clientSummary}`
      : "Client summary: not on file.",
    `Deterministic baseline to rewrite (keep the same intent and any concrete numbers):\n${baseline}`,
    "Return ONLY the rewritten message body, no quotes, no preamble.",
  ];
  const prompt = promptParts.join("\n\n");

  try {
    const { text } = await Promise.race([
      generateText({
        model: getModel(),
        prompt,
        temperature: 0.6,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), NUDGE_TIMEOUT_MS),
      ),
    ]);
    const cleaned = text.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
    if (cleaned.length === 0) {
      throw new Error("empty");
    }
    if (cleaned.length > MAX_NUDGE_CHARS) {
      // Refuse oversized output rather than silently truncating mid-sentence.
      throw new Error(`oversize:${cleaned.length}`);
    }
    return {
      text: cleaned,
      baseline,
      model: DEFAULT_MODEL_ID,
      usedFallback: false,
    };
  } catch (err) {
    const reason = (err as Error).message || "unknown";
    logger.warn(
      {
        err: reason,
        userId: input.event.userId,
        rdSlug: input.rdSlug,
        eventId: input.event.id,
        kind: input.event.kind,
      },
      "rd-copilot: nudge rewrite fallback",
    );
    return {
      text: baseline,
      baseline,
      model: "deterministic",
      usedFallback: true,
      fallbackReason: reason,
    };
  }
}
