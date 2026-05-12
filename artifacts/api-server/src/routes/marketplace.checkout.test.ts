/**
 * Reserve-and-create saga regression tests (Task #6) for the
 * marketplace checkout path.
 *
 * Verifies:
 *   1. Happy path — stock is decremented exactly by the order qty.
 *   2. Mid-flow abort — when the order INSERT inside the saga
 *      transaction throws, the prior stock decrement is rolled back
 *      so capacity is NOT permanently consumed.
 *   3. Concurrent oversell guard — N parallel checkouts on a single
 *      remaining unit of stock yield exactly one success and N-1
 *      "out of stock" 409s; final stock_qty is 0, never negative.
 *   4. Sweeper — orphan slot reservations whose owning order row was
 *      deleted are reclaimed and the parent slot's reserved_count is
 *      decremented (never below 0).
 */

import assert from "node:assert/strict";
import { test, after, before } from "node:test";
import { randomUUID } from "node:crypto";
import { type AddressInfo } from "node:net";
import http from "node:http";

import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  deliverySlotsTable,
  marketplaceItemsTable,
  marketplaceOrdersTable,
  slotReservationsTable,
  usersTable,
} from "@workspace/db";

import marketplaceRouter from "./marketplace";
import { reserveSlot, sweepOrphanSlotReservations } from "./fulfillment";
import { ordersTable } from "@workspace/db";

interface TestUser {
  id: string;
}

let server: http.Server;
let baseUrl = "";
const CREATED_USER_IDS: string[] = [];
const CREATED_ITEM_IDS: number[] = [];
const CREATED_SLOT_IDS: number[] = [];
const USER_REGISTRY = new Map<string, TestUser>();

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as unknown as {
      user?: unknown;
      log: Record<string, (...a: unknown[]) => void>;
      isAuthenticated: () => boolean;
    };
    const headerId = req.header("x-test-user-id");
    const u = headerId ? USER_REGISTRY.get(headerId) : undefined;
    if (u) r.user = u;
    r.isAuthenticated = () => r.user != null;
    r.log = {
      error: () => {},
      info: () => {},
      warn: () => {},
      debug: () => {},
      trace: () => {},
      fatal: () => {},
    };
    next();
  });
  app.use(marketplaceRouter);
  return app;
}

async function makeUser(): Promise<TestUser> {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: `mkt-${id}@example.test`,
    firstName: "MktTest",
  });
  CREATED_USER_IDS.push(id);
  const u: TestUser = { id };
  USER_REGISTRY.set(id, u);
  return u;
}

async function makeItem(stock: number): Promise<{ id: number; price: number }> {
  const slug = `mkt-test-${randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(marketplaceItemsTable)
    .values({
      slug,
      name: `Test Item ${slug}`,
      category: "pantry",
      pricePaise: 19900,
      stockQty: stock,
      isActive: true,
    })
    .returning();
  CREATED_ITEM_IDS.push(row!.id);
  return { id: row!.id, price: row!.pricePaise };
}

async function api(
  method: string,
  path: string,
  body: unknown,
  user: TestUser,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-test-user-id": user.id,
      "idempotency-key": randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

before(async () => {
  const app = makeApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  if (CREATED_USER_IDS.length > 0) {
    await db
      .delete(marketplaceOrdersTable)
      .where(inArray(marketplaceOrdersTable.userId, CREATED_USER_IDS));
    await db
      .delete(slotReservationsTable)
      .where(inArray(slotReservationsTable.userId, CREATED_USER_IDS));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, CREATED_USER_IDS));
  }
  for (const id of CREATED_ITEM_IDS) {
    await db.delete(marketplaceItemsTable).where(eq(marketplaceItemsTable.id, id));
  }
  for (const id of CREATED_SLOT_IDS) {
    await db
      .delete(slotReservationsTable)
      .where(eq(slotReservationsTable.slotId, id));
    await db.delete(deliverySlotsTable).where(eq(deliverySlotsTable.id, id));
  }
});

test("marketplace checkout happy path decrements stock by qty", async () => {
  const user = await makeUser();
  const item = await makeItem(10);
  const r = await api(
    "POST",
    "/marketplace/checkout",
    { items: [{ itemId: item.id, qty: 3 }], deliveryMode: "ship" },
    user,
  );
  assert.equal(r.status, 201);
  const [after] = await db
    .select({ q: marketplaceItemsTable.stockQty })
    .from(marketplaceItemsTable)
    .where(eq(marketplaceItemsTable.id, item.id));
  assert.equal(after.q, 7);
});

test("marketplace checkout returns 409 with stock unchanged when over-requested", async () => {
  const user = await makeUser();
  const item = await makeItem(2);
  const r = await api(
    "POST",
    "/marketplace/checkout",
    { items: [{ itemId: item.id, qty: 5 }], deliveryMode: "ship" },
    user,
  );
  assert.equal(r.status, 409);
  const [after] = await db
    .select({ q: marketplaceItemsTable.stockQty })
    .from(marketplaceItemsTable)
    .where(eq(marketplaceItemsTable.id, item.id));
  assert.equal(after.q, 2, "rollback must restore stock");
  // No order persisted.
  const orders = await db
    .select({ id: marketplaceOrdersTable.id })
    .from(marketplaceOrdersTable)
    .where(eq(marketplaceOrdersTable.userId, user.id));
  assert.equal(orders.length, 0);
});

test("marketplace checkout rolls back the FIRST item's stock when the SECOND item is out", async () => {
  // Crash-injection style: first decrement succeeds, second fails because
  // it has zero stock. The reserve-and-create saga must roll back item A
  // so capacity for it isn't permanently consumed by a failed order.
  const user = await makeUser();
  const itemA = await makeItem(10);
  const itemB = await makeItem(0);
  const r = await api(
    "POST",
    "/marketplace/checkout",
    {
      items: [
        { itemId: itemA.id, qty: 4 },
        { itemId: itemB.id, qty: 1 },
      ],
      deliveryMode: "ship",
    },
    user,
  );
  assert.equal(r.status, 409);
  const rows = await db
    .select({ id: marketplaceItemsTable.id, q: marketplaceItemsTable.stockQty })
    .from(marketplaceItemsTable)
    .where(inArray(marketplaceItemsTable.id, [itemA.id, itemB.id]));
  const map = new Map(rows.map((x) => [x.id, x.q]));
  assert.equal(map.get(itemA.id), 10, "item A stock must be restored");
  assert.equal(map.get(itemB.id), 0, "item B stock unchanged");
  const orders = await db
    .select({ id: marketplaceOrdersTable.id })
    .from(marketplaceOrdersTable)
    .where(eq(marketplaceOrdersTable.userId, user.id));
  assert.equal(orders.length, 0, "no orphan order persisted");
});

test("concurrent checkouts on a single unit oversell exactly zero times", async () => {
  const item = await makeItem(1);
  const N = 8;
  const users = await Promise.all(
    Array.from({ length: N }, () => makeUser()),
  );
  const results = await Promise.all(
    users.map((u) =>
      api(
        "POST",
        "/marketplace/checkout",
        { items: [{ itemId: item.id, qty: 1 }], deliveryMode: "ship" },
        u,
      ),
    ),
  );
  const ok = results.filter((r) => r.status === 201).length;
  const conflicts = results.filter((r) => r.status === 409).length;
  assert.equal(ok, 1, "exactly one success");
  assert.equal(conflicts, N - 1, "everyone else 409");
  const [after] = await db
    .select({ q: marketplaceItemsTable.stockQty })
    .from(marketplaceItemsTable)
    .where(eq(marketplaceItemsTable.id, item.id));
  assert.equal(after.q, 0, "stock floors at 0, never negative");
});

test("orphan slot reservation sweeper reclaims capacity", async () => {
  // Stand up a slot at capacity=2 with reservedCount=2 and two
  // reservation rows. Delete one underlying order, age the row past
  // the grace window, then sweep — capacity must come back.
  const user = await makeUser();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const [slot] = await db
    .insert(deliverySlotsTable)
    .values({
      slotDate: start.toISOString().slice(0, 10),
      startsAt: start,
      endsAt: end,
      zone: `mkt-sweeper-${randomUUID().slice(0, 8)}`,
      capacity: 2,
      reservedCount: 2,
    })
    .returning();
  CREATED_SLOT_IDS.push(slot!.id);

  const ancient = new Date(Date.now() - 60 * 60 * 1000);
  // (a) reservation pointing at a non-existent order id (orphan).
  await db
    .insert(slotReservationsTable)
    .values({
      slotId: slot!.id,
      userId: user.id,
      orderId: 2_000_000_000, // guaranteed not to exist
      kind: "order",
      createdAt: ancient,
    });
  // Backdate via UPDATE because defaultNow() overrode the insert value.
  await db
    .update(slotReservationsTable)
    .set({ createdAt: ancient })
    .where(eq(slotReservationsTable.userId, user.id));
  // (b) reservation with NULL orderId (orphan).
  await db
    .insert(slotReservationsTable)
    .values({
      slotId: slot!.id,
      userId: user.id,
      orderId: null,
      kind: "order",
      createdAt: ancient,
    });
  await db
    .update(slotReservationsTable)
    .set({ createdAt: ancient })
    .where(eq(slotReservationsTable.userId, user.id));

  const reclaimed = await sweepOrphanSlotReservations({ graceMs: 60_000 });
  assert.ok(reclaimed >= 2, `expected >=2 reclaimed, got ${reclaimed}`);

  const [after] = await db
    .select({ rc: deliverySlotsTable.reservedCount })
    .from(deliverySlotsTable)
    .where(eq(deliverySlotsTable.id, slot!.id));
  assert.equal(after.rc, 0, "reservedCount must be decremented twice");

  const remaining = await db
    .select({ id: slotReservationsTable.id })
    .from(slotReservationsTable)
    .where(eq(slotReservationsTable.slotId, slot!.id));
  assert.equal(remaining.length, 0, "orphan rows must be deleted");
});

test("reserveSlot rejects null orderId and rolls back atomically when slot full", async () => {
  const user = await makeUser();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const [slot] = await db
    .insert(deliverySlotsTable)
    .values({
      slotDate: start.toISOString().slice(0, 10),
      startsAt: start,
      endsAt: end,
      zone: `mkt-reserve-${randomUUID().slice(0, 8)}`,
      capacity: 1,
      reservedCount: 0,
    })
    .returning();
  CREATED_SLOT_IDS.push(slot!.id);

  // Insert a fake order row to satisfy the orderId invariant.
  const [order] = await db
    .insert(ordersTable)
    .values({
      userId: user.id,
      status: "placed",
      totalPaise: 0,
      items: [],
      fulfillmentType: "delivery",
    })
    .returning();

  // Invariant: orderId is required.
  await assert.rejects(
    () =>
      reserveSlot({
        slotId: slot!.id,
        userId: user.id,
        // @ts-expect-error - intentional: testing runtime guard.
        orderId: null,
      }),
    /orderId is required/,
  );

  // First reserve succeeds.
  const ok1 = await reserveSlot({
    slotId: slot!.id,
    userId: user.id,
    orderId: order!.id,
  });
  assert.equal(ok1, true);

  // Insert a second order so the second attempt has a valid orderId.
  const [order2] = await db
    .insert(ordersTable)
    .values({
      userId: user.id,
      status: "placed",
      totalPaise: 0,
      items: [],
      fulfillmentType: "delivery",
    })
    .returning();

  // Second reserve fails because slot is full — and crucially, NO
  // reservation row should be inserted (atomic rollback).
  const ok2 = await reserveSlot({
    slotId: slot!.id,
    userId: user.id,
    orderId: order2!.id,
  });
  assert.equal(ok2, false);
  const rows = await db
    .select({ id: slotReservationsTable.id })
    .from(slotReservationsTable)
    .where(eq(slotReservationsTable.slotId, slot!.id));
  assert.equal(rows.length, 1, "second attempt must not insert a row");
  const [s] = await db
    .select({ rc: deliverySlotsTable.reservedCount })
    .from(deliverySlotsTable)
    .where(eq(deliverySlotsTable.id, slot!.id));
  assert.equal(s.rc, 1, "reservedCount must remain at 1");

  // Cleanup orders we just inserted.
  await db
    .delete(slotReservationsTable)
    .where(eq(slotReservationsTable.slotId, slot!.id));
  await db
    .delete(ordersTable)
    .where(inArray(ordersTable.id, [order!.id, order2!.id]));
});

// Sanity: ensure we can't poison the slots table by sweeping fresh rows.
test("sweeper leaves in-flight (recent) orphan rows alone", async () => {
  const user = await makeUser();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const [slot] = await db
    .insert(deliverySlotsTable)
    .values({
      slotDate: start.toISOString().slice(0, 10),
      startsAt: start,
      endsAt: end,
      zone: `mkt-sweeper-recent-${randomUUID().slice(0, 8)}`,
      capacity: 2,
      reservedCount: 1,
    })
    .returning();
  CREATED_SLOT_IDS.push(slot!.id);

  await db.insert(slotReservationsTable).values({
    slotId: slot!.id,
    userId: user.id,
    orderId: null,
    kind: "order",
  });

  const reclaimed = await sweepOrphanSlotReservations({ graceMs: 60 * 60 * 1000 });
  assert.equal(reclaimed, 0, "recent orphan rows must be left alone");
  const [after] = await db
    .select({ rc: deliverySlotsTable.reservedCount })
    .from(deliverySlotsTable)
    .where(eq(deliverySlotsTable.id, slot!.id));
  assert.equal(after.rc, 1);
});
