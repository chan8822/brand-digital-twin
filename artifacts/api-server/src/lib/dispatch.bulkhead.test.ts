/**
 * Task #7 — Manual Mode bulkhead tests.
 *
 *   1. Auto-dispatcher uses SKIP LOCKED: a held row lock does NOT
 *      block dispatchOrder; it returns reason='lock_busy' immediately.
 *   2. Override uses NOWAIT + retry: when the auto-dispatcher holds the
 *      row briefly, override RETRIES and succeeds within the SLO. When
 *      the lock is held longer than the budget, override returns
 *      code='lock_busy' WITHOUT waiting forever.
 *   3. Audit decoupling: override commits with no row in ops_actions,
 *      but a row in ops_audit_outbox. After draining, ops_actions has
 *      the row, the outbox row is marked processed, and a second drain
 *      is a no-op (consumer-side dedupe).
 *   4. Producer dedupe: enqueueing the same dedupeKey twice yields one
 *      outbox row.
 *   5. End-to-end SLO: under simulated dispatcher contention, override
 *      p95 wall-clock < 2_000 ms.
 *
 * Hits the real dev DB via DATABASE_URL.
 *
 * Run with:
 *   GOOGLE_API_KEY=dummy node --test --import tsx \
 *     ./src/lib/dispatch.bulkhead.test.ts
 */

import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  pool,
  deliveryEventsTable,
  dispatchDecisionsTable,
  opsActionsTable,
  opsAuditOutboxTable,
  ordersTable,
  ridersTable,
  usersTable,
} from "@workspace/db";

import { dispatchOrder, overrideAssignment } from "./dispatch";
import {
  drainOpsAuditOutbox,
  enqueueOpsAuditOutbox,
  __resetOpsAuditOutboxMetricsForTests,
  getOpsAuditOutboxMetrics,
} from "./opsAudit";

const CREATED_USER_IDS: string[] = [];
const CREATED_ORDER_IDS: number[] = [];
const CREATED_RIDER_IDS: number[] = [];
const CREATED_OUTBOX_KEYS: string[] = [];

after(async () => {
  if (CREATED_ORDER_IDS.length > 0) {
    await db
      .delete(deliveryEventsTable)
      .where(inArray(deliveryEventsTable.orderId, CREATED_ORDER_IDS));
    await db
      .delete(dispatchDecisionsTable)
      .where(inArray(dispatchDecisionsTable.orderId, CREATED_ORDER_IDS));
    await db
      .delete(ordersTable)
      .where(inArray(ordersTable.id, CREATED_ORDER_IDS));
  }
  if (CREATED_RIDER_IDS.length > 0) {
    await db
      .delete(ridersTable)
      .where(inArray(ridersTable.id, CREATED_RIDER_IDS));
  }
  if (CREATED_USER_IDS.length > 0) {
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, CREATED_USER_IDS));
  }
  if (CREATED_OUTBOX_KEYS.length > 0) {
    await db
      .delete(opsAuditOutboxTable)
      .where(inArray(opsAuditOutboxTable.dedupeKey, CREATED_OUTBOX_KEYS));
    await db
      .delete(opsActionsTable)
      .where(
        inArray(
          opsActionsTable.action,
          ["override_dispatch", "test_outbox_action"],
        ),
      );
  }
});

async function makeUser(): Promise<{ id: string }> {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: `bh-${id}@test.local`,
    firstName: "BH",
    lastName: "Test",
  });
  CREATED_USER_IDS.push(id);
  return { id };
}

async function makeRider(name: string): Promise<{ id: number; name: string }> {
  const [r] = await db
    .insert(ridersTable)
    .values({
      name,
      phone: "+910000000000",
      zone: "560001",
      status: "online",
      activeOrderCount: 0,
      rating: 5,
      lat: 12.97,
      lng: 77.59,
    })
    .returning();
  CREATED_RIDER_IDS.push(r!.id);
  return { id: r!.id, name: r!.name };
}

async function makeOrder(userId: string): Promise<{ id: number }> {
  const [o] = await db
    .insert(ordersTable)
    .values({
      userId,
      status: "ready",
      totalPaise: 0,
      items: [],
      fulfillmentType: "delivery",
      pincode: "560001",
      addressLine: "test",
      city: "Bengaluru",
      phone: "+910000000000",
      priority: "routine",
    })
    .returning();
  CREATED_ORDER_IDS.push(o!.id);
  return { id: o!.id };
}

// Hold a row-level FOR UPDATE lock on `orders.id = orderId` for `holdMs`
// using a raw pg client — bypasses drizzle so the lock is unambiguous.
async function holdOrderLock(orderId: number, holdMs: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM orders WHERE id = $1 FOR UPDATE", [
      orderId,
    ]);
    await new Promise((r) => setTimeout(r, holdMs));
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

test("auto-dispatcher SKIP LOCKED: held row → lock_busy, no waiting", async () => {
  const user = await makeUser();
  const order = await makeOrder(user.id);
  await makeRider(`bh_rider_${randomUUID().slice(0, 6)}`);

  // Hold for 800 ms in the background.
  const holder = holdOrderLock(order.id, 800);
  // Give the holder time to actually grab the lock.
  await new Promise((r) => setTimeout(r, 50));

  const t0 = Date.now();
  const result = await dispatchOrder(order.id);
  const elapsed = Date.now() - t0;

  // Must NOT have waited for the holder.
  assert.ok(
    elapsed < 200,
    `dispatchOrder waited ${elapsed}ms — SKIP LOCKED not in effect`,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "lock_busy");

  await holder;
});

test("override NOWAIT retry: succeeds when lock released within budget", async () => {
  const user = await makeUser();
  const order = await makeOrder(user.id);
  const rider = await makeRider(`bh_rider_${randomUUID().slice(0, 6)}`);

  // Hold for 150ms — well under the 500ms NOWAIT budget. Override
  // must back off, retry, then succeed.
  const holder = holdOrderLock(order.id, 150);
  await new Promise((r) => setTimeout(r, 20));

  const t0 = Date.now();
  const out = await overrideAssignment({
    orderId: order.id,
    riderId: rider.id,
    operatorId: "test_op",
  });
  const elapsed = Date.now() - t0;

  await holder;
  assert.equal(out.ok, true, `override failed: ${JSON.stringify(out)}`);
  assert.ok(elapsed < 2_000, `override too slow: ${elapsed}ms`);
});

test("override NOWAIT retry: returns lock_busy when holder exceeds budget", async () => {
  const user = await makeUser();
  const order = await makeOrder(user.id);
  const rider = await makeRider(`bh_rider_${randomUUID().slice(0, 6)}`);

  // Hold for 1500ms — far longer than the 500ms NOWAIT budget.
  const holder = holdOrderLock(order.id, 1500);
  await new Promise((r) => setTimeout(r, 20));

  const t0 = Date.now();
  const out = await overrideAssignment({
    orderId: order.id,
    riderId: rider.id,
    operatorId: "test_op",
  });
  const elapsed = Date.now() - t0;

  // Must give up well INSIDE the 2s SLO, even though the holder
  // is still going.
  assert.equal(out.ok, false);
  assert.equal(out.code, "lock_busy");
  assert.ok(
    elapsed < 1_200,
    `override exceeded NOWAIT budget: ${elapsed}ms (holder still running)`,
  );

  await holder;
});

test("audit decoupling: override commits with no ops_actions row, drainer flushes it", async () => {
  __resetOpsAuditOutboxMetricsForTests();
  const user = await makeUser();
  const order = await makeOrder(user.id);
  const rider = await makeRider(`bh_rider_${randomUUID().slice(0, 6)}`);
  const operatorId = `op_${randomUUID().slice(0, 8)}`;

  const out = await overrideAssignment({
    orderId: order.id,
    riderId: rider.id,
    operatorId,
    notes: "audit-decouple-test",
  });
  assert.equal(out.ok, true);

  // Right after the override returns, the audit row MUST NOT yet
  // be in ops_actions (it lives in the outbox).
  const opsActionsBefore = await db
    .select()
    .from(opsActionsTable)
    .where(eq(opsActionsTable.operatorId, operatorId));
  assert.equal(
    opsActionsBefore.length,
    0,
    "ops_actions must be empty pre-drain (audit must be off the critical path)",
  );

  const outboxBefore = await db
    .select()
    .from(opsAuditOutboxTable)
    .where(sql`payload->>'operatorId' = ${operatorId}`);
  assert.equal(outboxBefore.length, 1, "outbox row must exist");
  assert.equal(outboxBefore[0]!.processedAt, null);
  CREATED_OUTBOX_KEYS.push(outboxBefore[0]!.dedupeKey);

  // Drain.
  const drained = await drainOpsAuditOutbox(50);
  assert.ok(drained >= 1, `expected >=1 drained, got ${drained}`);

  const opsActionsAfter = await db
    .select()
    .from(opsActionsTable)
    .where(eq(opsActionsTable.operatorId, operatorId));
  assert.equal(opsActionsAfter.length, 1, "audit row must materialise");
  assert.equal(opsActionsAfter[0]!.action, "override_dispatch");

  const outboxAfter = await db
    .select()
    .from(opsAuditOutboxTable)
    .where(sql`payload->>'operatorId' = ${operatorId}`);
  assert.notEqual(outboxAfter[0]!.processedAt, null);

  // Second drain: idempotent, no extra ops_actions rows.
  const drainedAgain = await drainOpsAuditOutbox(50);
  assert.equal(drainedAgain, 0);
  const opsActionsFinal = await db
    .select()
    .from(opsActionsTable)
    .where(eq(opsActionsTable.operatorId, operatorId));
  assert.equal(opsActionsFinal.length, 1, "consumer dedupe failed");
});

test("producer dedupe: enqueueing twice with same dedupeKey is one row", async () => {
  const dedupeKey = `dedupe_test_${randomUUID()}`;
  CREATED_OUTBOX_KEYS.push(dedupeKey);
  const payload = {
    operatorId: "test_op_dedupe",
    agent: "ops_console" as const,
    action: "test_outbox_action",
    params: { x: 1 },
    status: "success",
  };
  await db.transaction(async (tx) => {
    await enqueueOpsAuditOutbox(payload, tx, dedupeKey);
    await enqueueOpsAuditOutbox(payload, tx, dedupeKey);
  });
  const rows = await db
    .select()
    .from(opsAuditOutboxTable)
    .where(eq(opsAuditOutboxTable.dedupeKey, dedupeKey));
  assert.equal(rows.length, 1);
});

test("SLO: override p95 < 2s under simulated auto-dispatcher contention", async () => {
  // Spin up N orders + a rider. Run a background "auto-dispatcher"
  // that constantly takes short FOR UPDATE locks on each order while
  // we fire override requests against them in parallel. p95 must
  // stay under 2s.
  const N = 12;
  const user = await makeUser();
  const orders: { id: number }[] = [];
  for (let i = 0; i < N; i++) orders.push(await makeOrder(user.id));
  const rider = await makeRider(`bh_rider_slo_${randomUUID().slice(0, 6)}`);

  // Background contention: a dispatcher-like loop that holds each
  // order lock for 60-150ms in a rolling pattern.
  let stop = false;
  const contender = (async () => {
    while (!stop) {
      for (const o of orders) {
        if (stop) break;
        // 80ms hold each — well under the 500ms NOWAIT budget so
        // overrides can usually retry through, simulating a real
        // saturated dispatcher.
        try {
          await holdOrderLock(o.id, 80);
        } catch {
          // ignore — pool may be under pressure
        }
      }
    }
  })();

  // Fire overrides in parallel.
  const latencies: number[] = [];
  await Promise.all(
    orders.map(async (o) => {
      const t0 = Date.now();
      const out = await overrideAssignment({
        orderId: o.id,
        riderId: rider.id,
        operatorId: "slo_test",
      });
      const dt = Date.now() - t0;
      latencies.push(dt);
      // Either ok or lock_busy is acceptable for the SLO test —
      // what matters is that NEITHER outcome takes >2s.
      assert.ok(
        out.ok === true || out.code === "lock_busy",
        `unexpected outcome: ${JSON.stringify(out)}`,
      );
    }),
  );
  stop = true;
  await contender;

  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const max = latencies[latencies.length - 1] ?? 0;
  assert.ok(
    p95 < 2_000,
    `override p95=${p95}ms exceeded 2s SLO (max=${max}ms, samples=${JSON.stringify(latencies)})`,
  );
});

test("poison-row resilience: a malformed outbox row does not block siblings", async () => {
  __resetOpsAuditOutboxMetricsForTests();
  // Row 1: malformed payload — `action` is required NOT NULL on
  // ops_actions, so the per-row insert tx will abort. The drainer
  // MUST roll that single tx back, mark the row, and continue.
  const badKey = `poison_bad_${randomUUID()}`;
  const goodKey = `poison_good_${randomUUID()}`;
  CREATED_OUTBOX_KEYS.push(badKey, goodKey);
  await db.insert(opsAuditOutboxTable).values({
    dedupeKey: badKey,
    payload: {
      operatorId: "poison_op",
      agent: "ops_console",
      // action: MISSING on purpose — violates NOT NULL on ops_actions
      params: {},
      status: "success",
    } as unknown as Record<string, unknown>,
  });
  // Row 2: valid payload, enqueued AFTER the poison row so it's
  // selected in the same batch but processed second. Under the old
  // single-batch-tx implementation this row would be rolled back
  // when the poison row aborted the tx; under per-row tx it commits.
  await db.insert(opsAuditOutboxTable).values({
    dedupeKey: goodKey,
    payload: {
      operatorId: `poison_${randomUUID().slice(0, 8)}`,
      agent: "ops_console",
      action: "test_outbox_action",
      params: { ok: true },
      status: "success",
    } as unknown as Record<string, unknown>,
  });

  const drained = await drainOpsAuditOutbox(50);
  assert.ok(drained >= 1, `expected >=1 drained sibling, got ${drained}`);

  // Bad row: still unprocessed, attempts incremented, last_error set.
  const [badAfter] = await db
    .select()
    .from(opsAuditOutboxTable)
    .where(eq(opsAuditOutboxTable.dedupeKey, badKey));
  assert.equal(badAfter!.processedAt, null, "poison row must NOT be marked processed");
  assert.ok((badAfter!.attempts ?? 0) >= 1, "poison row attempts must increment");
  assert.ok(badAfter!.lastError, "poison row must record lastError");

  // Good row: processed.
  const [goodAfter] = await db
    .select()
    .from(opsAuditOutboxTable)
    .where(eq(opsAuditOutboxTable.dedupeKey, goodKey));
  assert.notEqual(
    goodAfter!.processedAt,
    null,
    "sibling row must drain even though a peer poisoned",
  );

  const m = getOpsAuditOutboxMetrics();
  assert.ok(m.drainFailuresTotal >= 1, "drainFailuresTotal must increment");
});

test("multi-drainer concurrency: two parallel drainers produce ONE ops_actions row per dedupeKey", async () => {
  __resetOpsAuditOutboxMetricsForTests();
  // Pre-populate the outbox with a known set of dedupe keys, then run
  // two drainers concurrently. The Phase-A atomic claim + Phase-B
  // ON CONFLICT(dedupe_key) DO NOTHING combo must guarantee exactly
  // one ops_actions row per dedupe key, never zero, never two.
  const N = 8;
  const keys: string[] = [];
  for (let i = 0; i < N; i++) {
    const k = `concurrent_${randomUUID()}`;
    keys.push(k);
    CREATED_OUTBOX_KEYS.push(k);
    await db.insert(opsAuditOutboxTable).values({
      dedupeKey: k,
      payload: {
        operatorId: `concurrent_op_${i}`,
        agent: "ops_console",
        action: "test_outbox_action",
        params: { i },
        status: "success",
      } as unknown as Record<string, unknown>,
    });
  }

  // Two drainers in parallel — same process, same DB pool, but each
  // call is a separate transaction. With the lease + atomic claim
  // they must NOT both grab the same row.
  const [a, b] = await Promise.all([
    drainOpsAuditOutbox(50),
    drainOpsAuditOutbox(50),
  ]);
  // The two drainers between them must have processed every row
  // exactly once. Either drainer may see 0..N depending on timing,
  // but the SUM must equal N (no row may be processed twice — that's
  // enforced separately below — and none may be skipped).
  assert.equal(a + b, N, `expected ${N} drained total, got ${a}+${b}`);

  // Hard invariant: exactly one ops_actions row per dedupe key.
  for (const k of keys) {
    const rows = await db
      .select()
      .from(opsActionsTable)
      .where(eq(opsActionsTable.dedupeKey, k));
    assert.equal(
      rows.length,
      1,
      `dedupe key ${k} produced ${rows.length} ops_actions rows`,
    );
  }

  // Every outbox row should be marked processed.
  const outboxRows = await db
    .select()
    .from(opsAuditOutboxTable)
    .where(inArray(opsAuditOutboxTable.dedupeKey, keys));
  for (const o of outboxRows) {
    assert.notEqual(
      o.processedAt,
      null,
      `outbox row ${o.dedupeKey} not marked processed after concurrent drain`,
    );
  }
});

test("metrics: outbox enqueued/drained counters increment", async () => {
  __resetOpsAuditOutboxMetricsForTests();
  const dedupeKey = `metrics_test_${randomUUID()}`;
  CREATED_OUTBOX_KEYS.push(dedupeKey);
  await db.transaction(async (tx) => {
    await enqueueOpsAuditOutbox(
      {
        operatorId: "metrics_op",
        agent: "ops_console",
        action: "test_outbox_action",
        params: {},
        status: "success",
      },
      tx,
      dedupeKey,
    );
  });
  const m1 = getOpsAuditOutboxMetrics();
  assert.equal(m1.enqueuedTotal, 1);

  await drainOpsAuditOutbox(50);
  const m2 = getOpsAuditOutboxMetrics();
  assert.ok(m2.drainedTotal >= 1, `drainedTotal=${m2.drainedTotal}`);
});
