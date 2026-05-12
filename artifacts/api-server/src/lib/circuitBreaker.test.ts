/**
 * Task #8 — circuit breaker FSM unit tests.
 *
 * Pure unit tests; no DB, no I/O. Validates that the breaker:
 *
 *   1. CLOSED → counts consecutive failures → OPENs at threshold.
 *   2. OPEN   → fails fast (returns fallback within ~0 ms, never
 *               calls the primary).
 *   3. OPEN  → HALF after cooldown; on probe success → CLOSED;
 *              on probe failure → OPEN immediately.
 *   4. Times out the primary at `timeoutMs` and counts that as a
 *      failure, even if the primary eventually resolves.
 *   5. A transient error followed by a success resets the
 *      consecutive-failure counter (does NOT open prematurely).
 *
 * Run with:
 *   node --test --import tsx ./src/lib/circuitBreaker.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { CircuitBreaker } from "./circuitBreaker";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newBreaker(overrides: Partial<{ failureThreshold: number; cooldownMs: number; timeoutMs: number }> = {}) {
  return new CircuitBreaker({
    name: "test",
    failureThreshold: overrides.failureThreshold ?? 3,
    cooldownMs: overrides.cooldownMs ?? 50,
    timeoutMs: overrides.timeoutMs ?? 50,
  });
}

test("CLOSED: passes through values from primary", async () => {
  const b = newBreaker();
  const r = await b.call(
    async () => 42,
    () => -1,
  );
  assert.equal(r.value, 42);
  assert.equal(r.source, "primary");
  assert.equal(r.state, "closed");
});

test("opens after N consecutive failures", async () => {
  const b = newBreaker({ failureThreshold: 3, cooldownMs: 1000 });
  for (let i = 0; i < 3; i++) {
    const r = await b.call<number>(
      async () => {
        throw new Error("boom");
      },
      () => -1,
    );
    assert.equal(r.source, "fallback");
    assert.equal(r.reason, "error");
  }
  assert.equal(b.metrics().state, "open");
  // OPEN: fails fast — primary never called.
  let primaryCalled = 0;
  const r2 = await b.call<number>(
    async () => {
      primaryCalled++;
      return 1;
    },
    () => -2,
  );
  assert.equal(primaryCalled, 0);
  assert.equal(r2.value, -2);
  assert.equal(r2.reason, "open");
});

test("HALF_OPEN → CLOSED on probe success; HALF_OPEN → OPEN on probe failure", async () => {
  const b = newBreaker({ failureThreshold: 1, cooldownMs: 20 });
  // Trip the breaker.
  await b.call<number>(async () => { throw new Error("x"); }, () => 0);
  assert.equal(b.metrics().state, "open");
  await sleep(30);
  // Next call should HALF-open then probe; success → CLOSED.
  const r = await b.call<number>(async () => 9, () => 0);
  assert.equal(r.value, 9);
  assert.equal(r.source, "primary");
  assert.equal(b.metrics().state, "closed");
  // Trip again, wait, but probe fails → re-OPEN.
  await b.call<number>(async () => { throw new Error("x"); }, () => 0);
  assert.equal(b.metrics().state, "open");
  await sleep(30);
  const r2 = await b.call<number>(async () => { throw new Error("x"); }, () => 0);
  assert.equal(r2.source, "fallback");
  assert.equal(b.metrics().state, "open");
});

test("times out a slow primary at timeoutMs", async () => {
  const b = newBreaker({ failureThreshold: 5, cooldownMs: 1000, timeoutMs: 30 });
  const started = Date.now();
  const r = await b.call<number>(
    async () => {
      await sleep(500);
      return 1;
    },
    () => 7,
  );
  const elapsed = Date.now() - started;
  assert.equal(r.value, 7);
  assert.equal(r.reason, "timeout");
  assert.ok(elapsed < 200, `should fall back near timeoutMs, got ${elapsed}ms`);
  assert.equal(b.metrics().totalTimeouts, 1);
});

test("transient failure does NOT open the breaker prematurely", async () => {
  const b = newBreaker({ failureThreshold: 3 });
  await b.call<number>(async () => { throw new Error("x"); }, () => 0);
  await b.call<number>(async () => 1, () => 0); // success resets counter
  await b.call<number>(async () => { throw new Error("x"); }, () => 0);
  await b.call<number>(async () => { throw new Error("x"); }, () => 0);
  assert.equal(b.metrics().state, "closed");
});
