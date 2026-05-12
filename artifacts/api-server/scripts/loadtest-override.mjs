#!/usr/bin/env node
/**
 * Task #7 smoke load test for the Manual-Mode bulkhead.
 *
 * Pegs the server with N concurrent auto-dispatcher runs while firing
 * a parallel stream of /delivery/dispatch/override requests, then
 * asserts override p95 latency < 2_000 ms.
 *
 * This is the in-repo CI-smoke version. Run a heavier soak test out
 * of band when validating production capacity.
 *
 * Usage:
 *   BASE_URL=http://localhost:8080 OPS_TOKEN=... \
 *     node ./scripts/loadtest-override.mjs --orders 20 --duration-ms 8000
 *
 * Env / flags:
 *   BASE_URL          (default http://localhost:8080)
 *   RD_ADMIN_TOKEN    sent as `x-admin-token` to satisfy isOpsRequest()
 *                     (this matches the server's adminGate.ts contract)
 *   OPS_TOKEN         legacy alias for RD_ADMIN_TOKEN (also accepted)
 *   ORDER_IDS         comma-separated list of seeded order ids
 *   RIDER_ID          rider id for override (default 1)
 *   --orders N        number of orders to seed (default 20)
 *   --duration-ms M   how long to run the dispatcher contention loop
 *   --p95-budget-ms B SLO assertion (default 2000)
 */
import { performance } from "node:perf_hooks";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const BASE = process.env.BASE_URL ?? "http://localhost:8080";
// Server-side ops gate (adminGate.ts) checks `x-admin-token` against
// process.env.RD_ADMIN_TOKEN. We deliberately do NOT send a Bearer
// token: bearer maps to a session SID lookup, which would defeat the
// bulkhead by routing through the main DB pool's session store.
const ADMIN_TOKEN =
  process.env.RD_ADMIN_TOKEN ?? process.env.OPS_TOKEN ?? "";
const N = Number(args.get("orders") ?? 20);
const DURATION_MS = Number(args.get("duration-ms") ?? 8_000);
const P95_BUDGET = Number(args.get("p95-budget-ms") ?? 2_000);

if (!ADMIN_TOKEN) {
  console.error(
    "[loadtest] FAIL: set RD_ADMIN_TOKEN (or OPS_TOKEN) — required for isOpsRequest()",
  );
  process.exit(2);
}

const headers = {
  "content-type": "application/json",
  "x-admin-token": ADMIN_TOKEN,
};

async function fireOverride(orderId, riderId) {
  const t0 = performance.now();
  let status = 0;
  let body = null;
  try {
    const r = await fetch(`${BASE}/api/delivery/dispatch/override`, {
      method: "POST",
      headers,
      body: JSON.stringify({ orderId, riderId, notes: "loadtest" }),
    });
    status = r.status;
    body = await r.json().catch(() => null);
  } catch (err) {
    status = -1;
    body = { error: String(err) };
  }
  return { latencyMs: performance.now() - t0, status, body };
}

async function fireDispatcher() {
  // Pegs the auto-dispatcher path; should NOT block override.
  try {
    await fetch(`${BASE}/api/delivery/dispatch/run`, {
      method: "POST",
      headers,
    });
  } catch {
    /* ignore */
  }
}

async function main() {
  const ordersIds = (process.env.ORDER_IDS ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  const riderId = Number(process.env.RIDER_ID ?? 1);
  if (ordersIds.length === 0) {
    console.error(
      "Set ORDER_IDS=1,2,3 (and RIDER_ID) to point at seeded test orders.",
    );
    process.exit(2);
  }
  console.log(
    `[loadtest] base=${BASE} orders=${ordersIds.length} duration=${DURATION_MS}ms p95Budget=${P95_BUDGET}ms`,
  );

  let stop = false;
  const dispatcherLoop = (async () => {
    while (!stop) {
      await Promise.all(Array.from({ length: 4 }, fireDispatcher));
      await new Promise((r) => setTimeout(r, 25));
    }
  })();

  const samples = [];
  const overrideLoop = (async () => {
    while (!stop) {
      const orderId = ordersIds[Math.floor(Math.random() * ordersIds.length)];
      const s = await fireOverride(orderId, riderId);
      samples.push(s);
    }
  })();

  await new Promise((r) => setTimeout(r, DURATION_MS));
  stop = true;
  await Promise.all([dispatcherLoop, overrideLoop]);

  const lats = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const pct = (p) => lats[Math.min(lats.length - 1, Math.floor(lats.length * p))];
  const counts = samples.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});
  const summary = {
    samples: samples.length,
    p50: Math.round(pct(0.5)),
    p95: Math.round(pct(0.95)),
    p99: Math.round(pct(0.99)),
    max: Math.round(lats[lats.length - 1] ?? 0),
    statusCounts: counts,
  };
  console.log("[loadtest]", JSON.stringify(summary, null, 2));

  // Defense in depth: if the route 404s the latency would be near zero
  // and the SLO would FALSELY pass. Reject any run whose responses are
  // not predominantly the contract (200 success, 409 conflict, 503
  // lock_busy). 404/0 must never be a majority.
  const ok = (counts[200] ?? 0) + (counts[409] ?? 0) + (counts[503] ?? 0);
  if (ok < samples.length * 0.95) {
    console.error(
      `[loadtest] FAIL: only ${ok}/${samples.length} responses were on-contract (200/409/503). statusCounts=${JSON.stringify(counts)}. The endpoint is likely not being reached.`,
    );
    process.exit(1);
  }
  if (samples.length === 0) {
    console.error("[loadtest] FAIL: no override samples collected");
    process.exit(1);
  }

  // Stronger assertion: the loadtest is meaningless if every response
  // is a fast 409 rider_unavailable / not_found, because those bail
  // out *before* the lock + commit path that the bulkhead protects.
  // A real run must show that we exercised the slow path: either
  // successful assignments (200) or the contention signal (503).
  const exercised = (counts[200] ?? 0) + (counts[503] ?? 0);
  const unavailable409 = samples.filter(
    (s) => s.status === 409 && s.body && /unavailable|not_found/i.test(JSON.stringify(s.body)),
  ).length;
  if (exercised < Math.max(1, Math.floor(samples.length * 0.5))) {
    console.error(
      `[loadtest] FAIL: only ${exercised}/${samples.length} responses exercised the lock/commit path (200 or 503). ` +
        `${unavailable409} were rider_unavailable/not_found short-circuits. ` +
        `Check that seeded rider is 'online' and that ORDER_IDS point at non-terminal orders. statusCounts=${JSON.stringify(counts)}`,
    );
    process.exit(1);
  }
  if (summary.p95 > P95_BUDGET) {
    console.error(
      `[loadtest] FAIL: override p95=${summary.p95}ms exceeded ${P95_BUDGET}ms`,
    );
    process.exit(1);
  }
  console.log(`[loadtest] PASS: p95 ${summary.p95}ms <= ${P95_BUDGET}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
