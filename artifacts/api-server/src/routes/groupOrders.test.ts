/**
 * Integration tests for the group-order route safety contract.
 *
 *   POST /group-orders/:code/items   — must reject tampered name/image/
 *                                       unitPrice and unknown / unavailable
 *                                       dishes, persisting only canonical
 *                                       catalog values.
 *   POST /group-orders/:code/close   — under concurrent /items adds, the
 *                                       close response must contain the
 *                                       authoritative final item list.
 *
 * Run with:
 *   node --test --import tsx ./src/routes/groupOrders.test.ts
 *
 * Tests stand up a tiny express app on a random port, mounting the real
 * router with a stubbed auth middleware so a synthetic user is injected
 * per request.
 */

import assert from "node:assert/strict";
import { test, after, before } from "node:test";
import { randomUUID } from "node:crypto";
import { type AddressInfo } from "node:net";
import http from "node:http";

import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, groupOrdersTable, menuItemsTable, usersTable } from "@workspace/db";
import { DISHES } from "@workspace/menu-catalog";

const SYNTHETIC_ID_OFFSET = 100000;

import groupOrdersRouter from "./groupOrders";

interface TestUser {
  id: string;
  firstName: string;
  email: string;
}

let server: http.Server;
let baseUrl = "";
const CREATED_USER_IDS: string[] = [];
const CREATED_GROUP_CODES: string[] = [];
const CREATED_MENU_ITEM_IDS: number[] = [];
// Registry of test users keyed by id, populated by makeUser. The auth
// middleware looks up the per-request `x-test-user-id` header against this
// map, so concurrent requests are isolated and there is no shared mutable
// "current user" global to race on.
const USER_REGISTRY = new Map<string, TestUser>();

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  // Minimal stand-in for the real auth + pino-http middlewares. Each
  // request carries its own identity via `x-test-user-id`, so parallel
  // requests cannot clobber each other.
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
    // groupOrders error path calls req.log.error — stub the whole logger.
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
  app.use(groupOrdersRouter);
  return app;
}

async function makeUser(label: string): Promise<TestUser> {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: `group-test-${label}-${id}@example.test`,
    firstName: label,
  });
  CREATED_USER_IDS.push(id);
  const user: TestUser = { id, firstName: label, email: `group-test-${label}@example.test` };
  USER_REGISTRY.set(id, user);
  return user;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  user?: TestUser,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (user) headers["x-test-user-id"] = user.id;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
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

async function createGroup(host: TestUser): Promise<string> {
  const r = await api("POST", "/group-orders", { hostName: host.firstName }, host);
  assert.equal(r.status, 200, `create group: ${JSON.stringify(r.json)}`);
  const code = r.json.group.code as string;
  CREATED_GROUP_CODES.push(code);
  return code;
}

function pickAvailableDishes(n: number) {
  const pool = DISHES.filter((d) => d.isAvailable && d.price > 0);
  if (pool.length < n) throw new Error(`not enough dishes`);
  return pool.slice(0, n);
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
  if (CREATED_GROUP_CODES.length > 0) {
    await db
      .delete(groupOrdersTable)
      .where(inArray(groupOrdersTable.code, CREATED_GROUP_CODES));
  }
  if (CREATED_MENU_ITEM_IDS.length > 0) {
    await db
      .delete(menuItemsTable)
      .where(inArray(menuItemsTable.id, CREATED_MENU_ITEM_IDS));
  }
  if (CREATED_USER_IDS.length > 0) {
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, CREATED_USER_IDS));
  }
});

test("POST /group-orders/:code/items overrides tampered name/image/unitPrice", async () => {
  const host = await makeUser("Host");
  const guest = await makeUser("Guest");
  const code = await createGroup(host);
  const [dish] = pickAvailableDishes(1);

  const tampered = {
    dishId: dish!.id,
    quantity: 1,
    customizations: [],
    // The route schema strips unknown fields, but even if a participant
    // managed to inject these, the canonical line that lands in the DB
    // must echo the catalog — never the participant's overrides.
    name: "FREE BURGER",
    image: "https://attacker.example/x.png",
    unitPrice: 1,
  };
  const r = await api("POST", `/group-orders/${code}/items`, tampered, guest);
  assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.json)}`);
  const items = r.json.group.items as Array<{
    dishId: number;
    name: string;
    image: string;
    unitPrice: number;
  }>;
  assert.equal(items.length, 1);
  assert.equal(items[0]!.dishId, dish!.id);
  assert.equal(items[0]!.name, dish!.name, "name must come from catalog");
  assert.equal(items[0]!.image, dish!.image, "image must come from catalog");
  assert.equal(items[0]!.unitPrice, dish!.price, "unitPrice must come from catalog");
});

test("POST /group-orders/:code/items rejects unknown dish id", async () => {
  const host = await makeUser("Host");
  const code = await createGroup(host);
  const r = await api(
    "POST",
    `/group-orders/${code}/items`,
    { dishId: 999_999_999, quantity: 1 }, // not in catalog or DB
    host,
  );
  assert.equal(r.status, 404);
  assert.match(String(r.json.error), /dish not found/i);
});

test("POST /group-orders/:code/items rejects an unavailable dish with 409", async () => {
  // The static catalog ships every dish as available, and the merged
  // resolver always overlays the DB row's isAvailable. Insert a
  // CMS-only menu_items row with isAvailable=false so resolveDishById
  // returns a real but unavailable dish — locks in the route's gate
  // that participants cannot add unavailable items.
  const host = await makeUser("Host");
  const code = await createGroup(host);
  const slug = `test-unavailable-${randomUUID()}`;
  const [row] = await db
    .insert(menuItemsTable)
    .values({
      slug,
      name: "Test Unavailable Dish",
      description: "synthetic test fixture",
      pricePaise: 12345,
      category: "mains",
      kitchenLocation: "continental",
      isVeg: true,
      isAvailable: false,
    })
    .returning({ id: menuItemsTable.id });
  CREATED_MENU_ITEM_IDS.push(row!.id);
  const dishId = SYNTHETIC_ID_OFFSET + row!.id;
  const r = await api(
    "POST",
    `/group-orders/${code}/items`,
    { dishId, quantity: 1 },
    host,
  );
  assert.equal(r.status, 409, `expected 409, got ${r.status}: ${JSON.stringify(r.json)}`);
  assert.match(String(r.json.error), /dish unavailable/i);
});

test("POST /group-orders/:code/items rejects negative / invalid payload", async () => {
  const host = await makeUser("Host");
  const code = await createGroup(host);
  const r = await api(
    "POST",
    `/group-orders/${code}/items`,
    { dishId: -1, quantity: 0 },
    host,
  );
  assert.equal(r.status, 400);
});

test("POST /group-orders/:code/close returns authoritative items under concurrent adds", async () => {
  const host = await makeUser("Host");
  const guests = await Promise.all([
    makeUser("G1"),
    makeUser("G2"),
    makeUser("G3"),
  ]);
  const code = await createGroup(host);
  const dishes = pickAvailableDishes(3);

  // Fire several concurrent /items adds plus the /close in flight.
  // The advisory lock inside the route serializes them, so however the
  // race resolves, the close response's `items` length must equal the
  // DB row's `items` length — no half-applied add can land between the
  // close's read and its status flip.
  const adds = guests.flatMap((g, gi) =>
    dishes.map((d, di) =>
      api(
        "POST",
        `/group-orders/${code}/items`,
        { dishId: d.id, quantity: 1 + ((gi + di) % 3) },
        g,
      ),
    ),
  );
  // Kick the close in the middle of the add storm.
  const closePromise = (async () => {
    // Yield once so a few adds have a chance to enter the lock queue
    // ahead of close, exercising the "in-flight add vs close" race.
    await new Promise((r) => setImmediate(r));
    return api("POST", `/group-orders/${code}/close`, undefined, host);
  })();
  const [closeResp, ...addResps] = await Promise.all([closePromise, ...adds]);

  assert.equal(closeResp.status, 200, "close should succeed");
  assert.equal(closeResp.json.group.status, "closed");
  const closeItems = closeResp.json.group.items as unknown[];

  // Reload from DB. The close response must match the persisted truth —
  // i.e. no add committed AFTER the close response was generated.
  const [persisted] = await db
    .select()
    .from(groupOrdersTable)
    .where(eq(groupOrdersTable.code, code));
  assert.ok(persisted);
  assert.equal(persisted!.status, "closed");
  assert.equal(
    closeItems.length,
    (persisted!.items ?? []).length,
    "close response items must match the final persisted item list",
  );

  // Adds that lost the race to close MUST NOT silently land in the
  // persisted items array post-close. Anything that reports 200 should be
  // reflected in the close response's authoritative item list.
  const successfulAdds = addResps.filter((r) => r.status === 200);
  for (const r of addResps) {
    assert.ok(
      r.status === 200 || r.status >= 400,
      `add response should be 200 or an explicit error, got ${r.status}`,
    );
  }
  assert.equal(
    successfulAdds.length,
    closeItems.length,
    "items in the close response must equal the count of successful adds",
  );
});
