import { generateText } from "ai";
import { getModel } from "./ai/model";
import { logger } from "./logger";

export interface ExplainArgs {
  metric: string;
  label: string;
  severity: "low" | "medium" | "high";
  value: number;
  baseline: number | null;
  threshold: number;
  sampleSize: number;
  windowStart: Date;
  windowEnd: Date;
  templateSummary: string;
  templateAction: string;
}

export interface Explanation {
  summary: string;
  suggestedAction: string;
}

const TIMEOUT_MS = 6_000;

// AI-backed explainer: takes the deterministic template summary/action and
// asks the model to rewrite them in clearer plain language with a single
// concrete next step. Wrapped in a tight timeout and a try/catch — any
// failure falls back to the original template (returns null).
export async function explainAnomalyWithAI(
  args: ExplainArgs,
): Promise<Explanation | null> {
  if (process.env["ANOMALY_AI_EXPLAINER_DISABLED"] === "1") return null;
  if (!process.env["GEMINI_API_KEY"] && !process.env["AI_INTEGRATIONS_GEMINI_API_KEY"]) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const prompt = `You are the Tanmatra ops anomaly explainer.
Rewrite the alert below into TWO short paragraphs for a kitchen/dispatch ops lead.
1) "summary": one sentence stating WHAT happened with the most important number, in plain language.
2) "action": one sentence with a SINGLE concrete next step they can take in the next 10 minutes.

Constraints:
- Do not invent metrics, dish names, rider names, or zones not in the input.
- Keep each paragraph under 240 characters.
- Output ONLY a JSON object {"summary": "...", "action": "..."} — no prose, no markdown.

Alert:
- metric: ${args.label} (${args.metric})
- severity: ${args.severity}
- value: ${args.value}
- baseline: ${args.baseline ?? "n/a"}
- threshold: ${args.threshold}
- sample size: ${args.sampleSize}
- window: ${args.windowStart.toISOString()} → ${args.windowEnd.toISOString()}
- template summary: ${args.templateSummary}
- template action: ${args.templateAction}`;

    const result = await generateText({
      model: getModel(),
      prompt,
      abortSignal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = result.text.trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      summary?: unknown;
      action?: unknown;
    };
    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const action =
      typeof parsed.action === "string" ? parsed.action.trim() : "";
    if (!summary || !action) return null;
    return { summary, suggestedAction: action };
  } catch (err) {
    clearTimeout(timer);
    logger.warn(
      { err, metric: args.metric },
      "anomaly AI explainer failed, falling back to template",
    );
    return null;
  }
}
