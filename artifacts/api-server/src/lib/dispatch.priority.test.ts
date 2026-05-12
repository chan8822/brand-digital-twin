/**
 * Task #4 — STAT priority + SLA-breach tests for the dispatcher.
 *
 *   1. Saturated-queue test: STAT order placed *last* dispatches *first*.
 *   2. Batching refusal: a STAT order is never paired with another order.
 *   3. SLA breach emit: a stale STAT order produces exactly one
 *      `sla_breach` delivery_event, even if the dispatch loop runs twice.
 *
 * Hits the real dev DB via DATABASE_URL.
 *
 * Run with:
 *   GOOGLE_API_KEY=dummy node --test --import tsx \
 *     ./src/lib/dispatch.priority.test.ts
 */

import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import {
  db,
  deliveryEventsTable,
  opsActionsTable,
  ordersTable,
  ridersTable,
  usersTable,
} from "@workspace/db";

import {
  dispatchReadyOrders,
  setOrderPriority,
  STAT_DISPATCH_SLA_MIN,
} from "./dispatch";

const CREATED_USER_IDS: string[] = [];
const CREATED_ORDER_IDS: number[] = [];
const CREATED_RIDER_IDS: number[] = [];

after(async () => {
  if (CREATED_ORDER_IDS.length > 0) {
    await db
      .delete(deliveryEventsTable)
      .where(inArray(deliveryEventsTable.orderId, CREATED_ORDER_IDS));
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
});

async function makeUser(): Promise<string> {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: `dispatch-prio-${id}@example.test`,
    firstName: "STAT",
    lastName: "Test",
  });
  CREATED_USER_IDS.push(id);
  return id;
}

async function makeRider(): Promise<number> {
  const [row] = await db
    .insert(ridersTable)
    .values({
      name: `Rider ${randomUUID().slice(0, 6)}`,
      phone: `+91${Math.floor(1e9 + Math.random() * 1e9)}`,
      zone: "560",
      status: "online",
      activeOrderCount: 0,
      lat: 12.97,
      lng: 77.59,
      rating: 5,
    })
    .returning({ id: ridersTable.id });
  const id = row!.id;
  CREATED_RIDER_IDS.push(id);
  return id;
}

interface MakeOrderOpts {
  userId: string;
  priority?: "routine" | "stat";
  ageMin?: number;
  riderId?: number | null;
  status?: string;
  pincode?: string;
}

async function makeOrder(opts: MakeOrderOpts): Promise<number> {
  const createdAt = new Date(Date.now() - (opts.ageMin ?? 0) * 60_000);
  const [row] = await db
    .insert(ordersTable)
    .values({
      userId: opts.userId,
      externalOrderId: `prio-${randomUUID()}`,
      status: opts.status ?? "ready",
      totalPaise: 30000,
      addressLine: "1 Test Lane",
      city: "Bengaluru",
      pincode: opts.pincode ?? "560001",
      phone: "+910000000000",
      items: [{ id: 1, name: "Bowl", qty: 1, price: 30000 }],
      fulfillmentType: "delivery",
      priority: opts.priority ?? "routine",
      riderId: opts.riderId ?? null,
      createdAt,
    })
    .returning({ id: ordersTable.id });
  const id = row!.id;
  CREATED_ORDER_IDS.push(id);
  return id;
}

test("STAT preemption: STAT order placed last is dispatched before older routine orders", async () => {
  const userId = await makeUser();
  // Exactly one rider — so we can prove ordering by which order he gets.
  const riderId = await makeRider();
  // Three routine orders, oldest first. Then a single STAT order created
  // *now* (i.e. last). FIFO would dispatch the oldest routine; STAT
  // preemption must dispatch the STAT one first.
  const oldRoutine = await makeOrder({ userId, ageMin: 30 });
  const midRoutine = await makeOrder({ userId, ageMin: 20 });
  const newRoutine = await makeOrder({ userId, ageMin: 10 });
  const stat = await makeOrder({ userId, priority: "stat", ageMin: 0 });

  const out = await dispatchReadyOrders({ operatorId: null });
  assert.ok(out.attempted >= 4);

  const [statRow] = await db
    .select({ riderId: ordersTable.riderId, status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, stat));
  assert.equal(
    statRow!.riderId,
    riderId,
    "STAT order should have grabbed the rider on the first pass",
  );
  assert.equal(statRow!.status, "rider_assigned");

  // Preemption is about *order of attempts*, not rider exclusivity. Verify
  // the STAT order was attempted before any of the older routine orders by
  // inspecting the dispatch result sequence.
  const ourOrderIds = new Set([oldRoutine, midRoutine, newRoutine, stat]);
  const seq = out.results
    .map((r) => r.orderId)
    .filter((id) => ourOrderIds.has(id));
  assert.equal(
    seq[0],
    stat,
    `STAT (#${stat}) must be the first of our orders dispatched, got sequence ${seq.join(", ")}`,
  );
});

test("batching refusal: a STAT order is never paired with another order, even when a partner exists nearby", async () => {
  const userId = await makeUser();
  const riderA = await makeRider();
  // Pre-existing nearby routine order already assigned to riderA — this
  // is exactly the kind of partner the batching code would otherwise
  // attach the new order to.
  const partner = await makeOrder({
    userId,
    priority: "routine",
    ageMin: 5,
    riderId: riderA,
    status: "rider_assigned",
  });
  // A second rider so the STAT order has somewhere else to land.
  await makeRider();
  const stat = await makeOrder({
    userId,
    priority: "stat",
    ageMin: 0,
  });

  const out = await dispatchReadyOrders({ operatorId: null });
  const statResult = out.results.find((r) => r.orderId === stat);
  assert.ok(statResult, "expected dispatch result for STAT order");
  assert.equal(statResult!.ok, true, "STAT dispatch should succeed");
  assert.equal(
    statResult!.batched,
    false,
    "STAT order must dispatch un-batched even when a partner is nearby",
  );

  // Partner's rider unchanged — the batching pass did not steal it.
  const [partnerRow] = await db
    .select({ riderId: ordersTable.riderId })
    .from(ordersTable)
    .where(eq(ordersTable.id, partner));
  assert.equal(partnerRow!.riderId, riderA);
});

test("SLA breach emit: stale STAT order produces exactly one sla_breach event, idempotent across loops", async () => {
  const userId = await makeUser();
  // No rider available so the STAT order stays unassigned through the loop.
  const stat = await makeOrder({
    userId,
    priority: "stat",
    ageMin: STAT_DISPATCH_SLA_MIN + 2,
  });

  const out1 = await dispatchReadyOrders({ operatorId: null });
  assert.ok(out1.slaBreaches >= 1, "first loop should record at least one breach");

  const events1 = await db
    .select()
    .from(deliveryEventsTable)
    .where(
      eq(deliveryEventsTable.orderId, stat),
    );
  const breachCount1 = events1.filter((e) => e.event === "sla_breach").length;
  assert.equal(breachCount1, 1, "exactly one sla_breach event after first loop");

  // Second loop must NOT double-emit, even though the row is still
  // unassigned and still past the SLA.
  const out2 = await dispatchReadyOrders({ operatorId: null });
  const events2 = await db
    .select()
    .from(deliveryEventsTable)
    .where(eq(deliveryEventsTable.orderId, stat));
  const breachCount2 = events2.filter((e) => e.event === "sla_breach").length;
  assert.equal(breachCount2, 1, "no double-emit on second loop");
  // The breach counter on the second loop should be zero for THIS order;
  // dispatchReadyOrders returns a global count so we just assert it was
  // not incremented for our row by re-reading the events.
  assert.ok(out2.slaBreaches >= 0);
});

test("no-rider STAT backlog blocks routine batching: routine cannot piggy-back while a STAT waits", async () => {
  const userId = await makeUser();
  // Unique pincode so this test's batching candidates don't collide
  // with leftovers from sibling tests.
  const pin = `8${Math.floor(Math.random() * 90 + 10)}001`;
  // Take every other rider offline so the only online candidate in
  // the system is `partnerRider` below, who is already saturated.
  await db
    .update(ridersTable)
    .set({ status: "offline" })
    .where(eq(ridersTable.status, "online"));
  // Pre-existing routine order already assigned to a rider. The
  // routine batching pass would normally piggy-back our new routine
  // order onto this rider via findBatchPartner. Bump activeOrderCount
  // so smart-dispatch's rider scorer sees the rider as busy and won't
  // hand the STAT order to him.
  const partnerRider = await makeRider();
  // Offline partnerRider too — the dispatcher must see ZERO online
  // riders so the STAT order returns NO_RIDERS and the preemption gate
  // engages. The pre-existing partner assignment doesn't require an
  // online rider; only new dispatches do.
  await db
    .update(ridersTable)
    .set({ status: "offline", activeOrderCount: 1 })
    .where(eq(ridersTable.id, partnerRider));
  const partner = await makeOrder({
    userId,
    priority: "routine",
    ageMin: 30,
    riderId: partnerRider,
    status: "rider_assigned",
    pincode: pin,
  });
  // STAT order pending — but no further online riders, so it cannot
  // be dispatched. The routine pass must NOT run at all.
  const stat = await makeOrder({
    userId,
    priority: "stat",
    ageMin: 0,
    pincode: pin,
  });
  const newRoutine = await makeOrder({
    userId,
    priority: "routine",
    ageMin: 5,
    pincode: pin,
  });

  const out = await dispatchReadyOrders({ operatorId: null });

  const [statRow] = await db
    .select({ riderId: ordersTable.riderId })
    .from(ordersTable)
    .where(eq(ordersTable.id, stat));
  assert.equal(statRow!.riderId, null, "STAT correctly stayed unassigned (no rider)");

  const [routineRow] = await db
    .select({ riderId: ordersTable.riderId })
    .from(ordersTable)
    .where(eq(ordersTable.id, newRoutine));
  assert.equal(
    routineRow!.riderId,
    null,
    "routine MUST NOT be dispatched (or batched) while any STAT remains pending",
  );
  // Partner state untouched.
  const [partnerRow] = await db
    .select({ riderId: ordersTable.riderId })
    .from(ordersTable)
    .where(eq(ordersTable.id, partner));
  assert.equal(partnerRow!.riderId, partnerRider);
  // Result list must contain the STAT attempt but no routine result.
  const orderedIds = out.results.map((r) => r.orderId);
  assert.ok(orderedIds.includes(stat), "STAT was at least attempted");
  assert.ok(
    !orderedIds.includes(newRoutine),
    "routine pass must be skipped entirely while STAT remains pending",
  );
});

test("STAT backlog >50: routine orders are never dispatched while any STAT remains", async () => {
  const userId = await makeUser();
  const STAT_COUNT = 60; // > the 50-row page size
  const ROUTINE_COUNT = 5;
  // Online rider supply: enough so STAT keeps making progress and the
  // outer page loop fully drains the STAT queue. Each rider takes one
  // order before becoming busy, so we need at least STAT_COUNT riders.
  const riderIds: number[] = [];
  for (let i = 0; i < STAT_COUNT + ROUTINE_COUNT; i++) {
    riderIds.push(await makeRider());
  }
  const statIds: number[] = [];
  for (let i = 0; i < STAT_COUNT; i++) {
    // Older STAT orders first so FIFO is meaningful.
    statIds.push(
      await makeOrder({ userId, priority: "stat", ageMin: STAT_COUNT - i }),
    );
  }
  const routineIds: number[] = [];
  for (let i = 0; i < ROUTINE_COUNT; i++) {
    // Routine orders are *older* than every STAT — pure FIFO would
    // pick them first. Strict preemption must override that.
    routineIds.push(
      await makeOrder({ userId, priority: "routine", ageMin: 1000 + i }),
    );
  }

  const out = await dispatchReadyOrders({ operatorId: null });
  // Every STAT must appear in results before any routine appears.
  const ourIds = new Set([...statIds, ...routineIds]);
  const ordered = out.results
    .map((r) => r.orderId)
    .filter((id) => ourIds.has(id));
  const firstRoutineIdx = ordered.findIndex((id) => routineIds.includes(id));
  if (firstRoutineIdx !== -1) {
    const statsBefore = ordered.slice(0, firstRoutineIdx);
    assert.equal(
      statsBefore.length,
      STAT_COUNT,
      `expected all ${STAT_COUNT} STAT orders to dispatch before any routine, ` +
        `but only ${statsBefore.length} STATs preceded the first routine`,
    );
  }
  // Every STAT order ended up assigned (we provisioned enough riders).
  const statRows = await db
    .select({ id: ordersTable.id, riderId: ordersTable.riderId })
    .from(ordersTable)
    .where(inArray(ordersTable.id, statIds));
  const unassignedStat = statRows.filter((r) => r.riderId == null);
  assert.equal(
    unassignedStat.length,
    0,
    `expected all STAT orders dispatched, ${unassignedStat.length} still unassigned`,
  );
});

test("symmetric batching refusal: a routine order does not batch onto a STAT partner", async () => {
  const userId = await makeUser();
  // STAT order already assigned to riderA (acting as the would-be
  // batch partner). The dispatcher MUST NOT pair a fresh routine order
  // with this rider via batching. Use a unique pincode so leftover
  // orders from sibling tests are out of the candidate set.
  // Use a 3-char prefix that no other test in this file uses, since
  // findBatchPartner matches on pincode.slice(0,3).
  const pin = `7${Math.floor(Math.random() * 90 + 10)}001`;
  const riderA = await makeRider();
  const statPartner = await makeOrder({
    userId,
    priority: "stat",
    ageMin: 5,
    riderId: riderA,
    status: "rider_assigned",
    pincode: pin,
  });
  // Second rider available so the routine has somewhere else to go.
  await makeRider();
  const routine = await makeOrder({
    userId,
    priority: "routine",
    ageMin: 0,
    pincode: pin,
  });

  const out = await dispatchReadyOrders({ operatorId: null });
  const routineResult = out.results.find((r) => r.orderId === routine);
  assert.ok(routineResult, "expected dispatch result for routine order");
  assert.equal(
    routineResult!.batched,
    false,
    "routine order must not be batched onto a STAT partner",
  );
  // STAT partner is untouched.
  const [partnerRow] = await db
    .select({ riderId: ordersTable.riderId, priority: ordersTable.priority })
    .from(ordersTable)
    .where(eq(ordersTable.id, statPartner));
  assert.equal(partnerRow!.riderId, riderA);
  assert.equal(partnerRow!.priority, "stat");
});

test("setOrderPriority: writes ops_actions audit row with before/after snapshot", async () => {
  const userId = await makeUser();
  const orderId = await makeOrder({ userId, priority: "routine" });
  const operatorId = `op-${randomUUID()}`;

  const out = await setOrderPriority({
    orderId,
    priority: "stat",
    operatorId,
    reason: "post-op patient",
  });
  assert.equal(out.ok, true);

  const audits = await db
    .select()
    .from(opsActionsTable)
    .where(eq(opsActionsTable.operatorId, operatorId));
  const row = audits.find((a) => a.action === "set_order_priority");
  assert.ok(row, "expected ops_actions row for set_order_priority");
  assert.deepEqual(row!.params, { orderId, priority: "stat" });
  assert.deepEqual(row!.beforeState, { priority: "routine" });
  assert.deepEqual(row!.afterState, { priority: "stat" });
  assert.equal(row!.status, "success");
});

test("setOrderPriority: writes priority transition and clears stale breach flag on demotion", async () => {
  const userId = await makeUser();
  const orderId = await makeOrder({
    userId,
    priority: "stat",
    ageMin: STAT_DISPATCH_SLA_MIN + 2,
  });
  // Trip the breach so slaBreachAt is stamped.
  await dispatchReadyOrders({ operatorId: null });
  const [beforeRow] = await db
    .select({ slaBreachAt: ordersTable.slaBreachAt })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  assert.ok(beforeRow!.slaBreachAt, "expected breach to be stamped");

  const out = await setOrderPriority({
    orderId,
    priority: "routine",
    operatorId: "test-operator",
    reason: "false alarm",
  });
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.before, "stat");
    assert.equal(out.after, "routine");
  }

  const [afterRow] = await db
    .select({
      priority: ordersTable.priority,
      slaBreachAt: ordersTable.slaBreachAt,
    })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  assert.equal(afterRow!.priority, "routine");
  assert.equal(
    afterRow!.slaBreachAt,
    null,
    "demoting from STAT should clear the breach flag",
  );
});
