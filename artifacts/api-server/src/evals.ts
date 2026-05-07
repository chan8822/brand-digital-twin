/**
 * Tanmatra agent eval harness.
 *
 * Usage:
 *   pnpm run evals                                          # all agents (root)
 *   pnpm --filter @workspace/api-server run evals           # all agents
 *   pnpm --filter @workspace/api-server run evals support   # one agent
 *
 * Loads golden cases from artifacts/api-server/src/lib/ai/agents/<name>.evals.ts,
 * runs them through the gateway in non-streaming mode, and reports pass/fail.
 */
import { runAgent } from "./lib/ai";
import { supportEvals, type EvalCase } from "./lib/ai/agents/support.evals";
import { opsEvals } from "./lib/ai/agents/ops.evals";
import { reorderEvals } from "./lib/ai/agents/reorder.evals";

interface AgentEval {
  agent: string;
  cases: EvalCase[];
}

const ALL: AgentEval[] = [
  { agent: "support", cases: supportEvals },
  { agent: "ops", cases: opsEvals },
  { agent: "reorder", cases: reorderEvals },
];

interface CaseResult {
  agent: string;
  name: string;
  passed: boolean;
  reasons: string[];
  ms: number;
}

async function runCase(agent: string, c: EvalCase): Promise<CaseResult> {
  const start = Date.now();
  const reasons: string[] = [];
  try {
    const result = await runAgent({
      agent,
      userId: "eval-user",
      messages: [{ role: "user", content: c.message }],
      stream: false,
    });

    if (c.expect.refusalReason) {
      if (result.refusalReason !== c.expect.refusalReason) {
        reasons.push(
          `expected refusalReason=${c.expect.refusalReason}, got ${result.refusalReason ?? "none"}`,
        );
      }
    }
    if (typeof c.expect.escalated === "boolean") {
      if (result.escalated !== c.expect.escalated) {
        reasons.push(
          `expected escalated=${c.expect.escalated}, got ${result.escalated}`,
        );
      }
    }
    if (c.expect.containsAny && c.expect.containsAny.length > 0) {
      const lower = result.text.toLowerCase();
      const ok = c.expect.containsAny.some((s) =>
        lower.includes(s.toLowerCase()),
      );
      if (!ok) {
        reasons.push(
          `expected output to contain any of [${c.expect.containsAny.join(", ")}]`,
        );
      }
    }
    if (c.expect.toolUsed) {
      const used = result.toolCalls.some((t) => t.name === c.expect.toolUsed);
      if (!used) reasons.push(`expected tool ${c.expect.toolUsed} to be called`);
    }
  } catch (err) {
    reasons.push(`threw: ${(err as Error).message}`);
  }
  return {
    agent,
    name: c.name,
    passed: reasons.length === 0,
    reasons,
    ms: Date.now() - start,
  };
}

async function main() {
  const filter = process.argv[2];
  const targets = filter ? ALL.filter((a) => a.agent === filter) : ALL;
  if (targets.length === 0) {
    console.error(`No eval suite found for agent: ${filter}`);
    process.exit(2);
  }

  const results: CaseResult[] = [];
  for (const t of targets) {
    for (const c of t.cases) {
      const r = await runCase(t.agent, c);
      results.push(r);
      const tag = r.passed ? "PASS" : "FAIL";
      console.log(`[${tag}] ${r.agent} :: ${r.name} (${r.ms}ms)`);
      for (const reason of r.reasons) console.log(`       - ${reason}`);
    }
  }
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
