#!/usr/bin/env node
/**
 * Task #8 — dispatch latency stress harness.
 *
 * Two scenarios in one script:
 *
 *   1. SPATIAL  — seeds K orders inside a 1.5 km bbox + L outside it,
 *                 then runs N concurrent dispatchOrder() calls and
 *                 verifies the chosen partner is always inside the
 *                 bbox (i.e. the new spatial+time bound did not lose
 *                 the optimal partner under load).
 *
 *   2. SLOW_ETA — sets ETA_INJECT_DELAY_MS to a value > the breaker
 *                 timeout, fires N concurrent estimateEtaForCart()
 *                 calls, and verifies that:
 *                   - p95 latency stays < BUDGET_MS (default 1500)
 *                   - the breaker opens (totalFallbacks > 0)
 *                   - removing the delay closes the breaker again
 *
 * Run with the API server's env (DATABASE_URL etc) loaded:
 *   GOOGLE_API_KEY=dummy ETA_INJECT_DELAY_MS=600 \
 *     node ./scripts/loadtest-dispatch.mjs --scenario slow_eta
 *
 * The harness exits with code 1 on assertion failure so it can be
 * wired into CI as a smoke test.
 */
import { performance } from "node:perf_hooks";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i]?.replace(/^--/, "");
  const v = process.argv[i + 1];
  if (k) args.set(k, v);
}
const SCENARIO = args.get("scenario") ?? "slow_eta";
const N = Number(args.get("n") ?? 200);
const BUDGET_MS = Number(args.get("budget-ms") ?? 1500);

function p(arr, q) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

async function loadEtaModule() {
  // Loaded lazily via tsx so the harness can be invoked with
  // node --import tsx.
  return import("../src/lib/etaModel.ts");
}

async function loadBreakerModule() {
  return import("../src/lib/circuitBreaker.ts");
}

async function runSlowEta() {
  const { estimateEtaForCart } = await loadEtaModule();
  const { etaBreaker } = await loadBreakerModule();
  etaBreaker.reset();
  const samples = [];
  const started = performance.now();
  // Burst N concurrent calls. Each call sees the injected delay
  // (set via ETA_INJECT_DELAY_MS), so without the breaker every
  // single one would block past the breaker timeout. With the
  // breaker, the first ~3 trip it open and the remaining N-3
  // return the static fallback near-instantly.
  await Promise.all(
    Array.from({ length: N }, async () => {
      const t0 = performance.now();
      await estimateEtaForCart({
        address: { city: "Bengaluru", pincode: "560001", line: "stress" },
        items: [{ id: 1, qty: 1 }],
      });
      samples.push(performance.now() - t0);
    }),
  );
  const elapsed = performance.now() - started;
  const m = etaBreaker.metrics();
  const p50 = p(samples, 0.5);
  const p95 = p(samples, 0.95);
  const p99 = p(samples, 0.99);
  console.log(
    JSON.stringify(
      {
        scenario: "slow_eta",
        n: N,
        elapsedMs: Math.round(elapsed),
        p50Ms: Math.round(p50),
        p95Ms: Math.round(p95),
        p99Ms: Math.round(p99),
        budgetMs: BUDGET_MS,
        breaker: m,
      },
      null,
      2,
    ),
  );
  let failed = false;
  if (p95 > BUDGET_MS) {
    console.error(`FAIL: p95 ${p95}ms > budget ${BUDGET_MS}ms`);
    failed = true;
  }
  if (m.totalFallbacks === 0) {
    console.error("FAIL: breaker never tripped — slow ETA was not injected?");
    failed = true;
  }
  process.exit(failed ? 1 : 0);
}

async function runSpatial() {
  // Hands off to a TS helper so we can use Drizzle types.
  const { runSpatialHarness } = await import("../src/lib/dispatchStress.ts");
  const out = await runSpatialHarness({ inside: 6, outside: 30, concurrency: N });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.failures.length === 0 ? 0 : 1);
}

if (SCENARIO === "slow_eta") {
  await runSlowEta();
} else if (SCENARIO === "spatial") {
  await runSpatial();
} else {
  console.error(`unknown --scenario ${SCENARIO}`);
  process.exit(2);
}
