/**
 * Tests for the server-managed Idempotency-Key middleware.
 *
 * Run with:
 *   GOOGLE_API_KEY=dummy node --test --import tsx \
 *     ./src/middlewares/idempotency.test.ts
 *
 * The middleware is hoisted onto a tiny Express app with a stub
 * handler so each scenario exercises the cache without dragging in
 * the full finalizeOrder pipeline. Real DB writes go through the
 * shared `idempotency_keys` table — rows are scoped by a per-test
 * randomUUID user so suites stay isolated.
 */

import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { type AddressInfo } from "node:net";
import http from "node:http";

import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  idempotencyKeysTable,
  usersTable,
} from "@workspace/db";

import { idempotencyMiddleware } from "./idempotency";

interface TestUser {
  id: string;
}

const CREATED_USER_IDS: string[] = [];
const REGISTRY = new Map<string, TestUser>();

let server: http.Server;
let baseUrl = "";

// Counts handler invocations per (user, key) so we can assert that
// the actual route body ran exactly once across N parallel POSTs.
const handlerCalls = new Map<string, number>();

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as unknown as {
      user?: TestUser;
      log: Record<string, (...a: unknown[]) => void>;
      isAuthenticated: () => boolean;
    };
    const headerId = req.header("x-test-user-id");
    const u = headerId ? REGISTRY.get(headerId) : undefined;
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
  app.post(
    "/orders/finalize",
    idempotencyMiddleware,
    async (req: Request, res: Response) => {
      const userId = (req as unknown as { user: TestUser }).user.id;
      const key = req.header("Idempotency-Key") ?? "";
      const tag = `${userId}:${key}`;
      handlerCalls.set(tag, (handlerCalls.get(tag) ?? 0) + 1);
      // Slow handler so the race test reliably overlaps two POSTs.
      const delay = Number(req.query.delay ?? 0);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      // Echo a unique server-side id so every successful run can be
      // distinguished from a replay of the prior run.
      res.status(201).json({
        ok: true,
        serverOrderId: `srv-${randomUUID()}`,
        echoed: req.body,
      });
    },
  );
  return app;
}

async function makeUser(): Promise<TestUser> {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: `idemp-${id}@example.test`,
    firstName: "Idemp",
  });
  CREATED_USER_IDS.push(id);
  const u = { id };
  REGISTRY.set(id, u);
  return u;
}

interface ApiResponse<T = unknown> {
  status: number;
  json: T;
  headers: Record<string, string>;
}

async function api<T = unknown>(
  path: string,
  body: unknown,
  user: TestUser,
  key: string | null,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-test-user-id": user.id,
  };
  if (key) headers["Idempotency-Key"] = key;
  const r = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  const parsed = text ? (JSON.parse(text) as T) : ({} as T);
  const out: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    out[k] = v;
  });
  return { status: r.status, json: parsed, headers: out };
}

await new Promise<void>((resolve) => {
  server = http.createServer(makeApp()).listen(0, () => {
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    resolve();
  });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (CREATED_USER_IDS.length > 0) {
    await db
      .delete(idempotencyKeysTable)
      .where(inArray(idempotencyKeysTable.userId, CREATED_USER_IDS));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, CREATED_USER_IDS));
  }
});

test("missing Idempotency-Key header is rejected with 400", async () => {
  const u = await makeUser();
  const r = await api("/orders/finalize", { qty: 1 }, u, null);
  assert.equal(r.status, 400);
  assert.equal(
    (r.json as { error: string }).error,
    "idempotency_key_required",
  );
  assert.equal(handlerCalls.get(`${u.id}:`), undefined, "handler must not run");
});

test("happy path: handler runs once and the row is stamped with the response", async () => {
  const u = await makeUser();
  const key = `idem-${randomUUID()}`;
  const r = await api<{ ok: boolean; serverOrderId: string }>(
    "/orders/finalize",
    { item: "evoo", qty: 1 },
    u,
    key,
  );
  assert.equal(r.status, 201);
  assert.equal(r.json.ok, true);
  assert.match(r.json.serverOrderId, /^srv-/);
  assert.equal(r.headers["idempotent-replay"], undefined);
  assert.equal(handlerCalls.get(`${u.id}:${key}`), 1);
  // DB row stamped.
  const [row] = await db
    .select()
    .from(idempotencyKeysTable)
    .where(
      and(
        eq(idempotencyKeysTable.userId, u.id),
        eq(idempotencyKeysTable.key, key),
      ),
    );
  assert.ok(row);
  assert.equal(row!.statusCode, 201);
  // Stored as raw JSON text — parsing must round-trip to the same
  // shape the client received.
  const parsed = JSON.parse(row!.responseBody as string) as {
    serverOrderId: string;
  };
  assert.equal(parsed.serverOrderId, r.json.serverOrderId);
});

test("retry-after-timeout replay returns the original response byte-for-byte and does not re-run the handler", async () => {
  const u = await makeUser();
  const key = `idem-${randomUUID()}`;
  const body = { item: "honey", qty: 2 };
  const first = await api<{ serverOrderId: string }>(
    "/orders/finalize",
    body,
    u,
    key,
  );
  const second = await api<{ serverOrderId: string }>(
    "/orders/finalize",
    body,
    u,
    key,
  );
  assert.equal(second.status, first.status);
  assert.deepEqual(second.json, first.json);
  assert.equal(
    second.headers["idempotent-replay"],
    "true",
    "replay header must be set on the second call",
  );
  assert.equal(
    handlerCalls.get(`${u.id}:${key}`),
    1,
    "handler must run exactly once across both calls",
  );
});

test("two-in-flight race: only one handler runs, both callers see the same response", async () => {
  const u = await makeUser();
  const key = `idem-${randomUUID()}`;
  const body = { item: "tamari", qty: 1 };
  // 200ms server-side delay so both POSTs are reliably in-flight at
  // the same time; loser must poll until winner persists then replay.
  const [a, b] = await Promise.all([
    api<{ serverOrderId: string }>(
      "/orders/finalize?delay=200",
      body,
      u,
      key,
    ),
    api<{ serverOrderId: string }>(
      "/orders/finalize?delay=200",
      body,
      u,
      key,
    ),
  ]);
  assert.equal(a.status, b.status);
  assert.deepEqual(a.json, b.json, "both responses must match byte-for-byte");
  assert.equal(
    handlerCalls.get(`${u.id}:${key}`),
    1,
    "handler must run exactly once across two concurrent POSTs",
  );
  // Exactly one of the two carries the replay header; the other is
  // the original.
  const replayCount = [a, b].filter(
    (r) => r.headers["idempotent-replay"] === "true",
  ).length;
  assert.equal(replayCount, 1, "exactly one response must be a replay");
});

test("key-mismatch: same key reused with a different body returns 409", async () => {
  const u = await makeUser();
  const key = `idem-${randomUUID()}`;
  const first = await api(
    "/orders/finalize",
    { item: "evoo", qty: 1 },
    u,
    key,
  );
  assert.equal(first.status, 201);
  const second = await api<{ error: string }>(
    "/orders/finalize",
    { item: "evoo", qty: 99 }, // different body
    u,
    key,
  );
  assert.equal(second.status, 409);
  assert.equal(second.json.error, "idempotency_key_mismatch");
  // Handler still ran only once (the first call).
  assert.equal(handlerCalls.get(`${u.id}:${key}`), 1);
});

test("different keys with the same body create separate orders (intent matters)", async () => {
  const u = await makeUser();
  const body = { item: "almond-mix", qty: 3 };
  const a = await api<{ serverOrderId: string }>(
    "/orders/finalize",
    body,
    u,
    `idem-${randomUUID()}`,
  );
  const b = await api<{ serverOrderId: string }>(
    "/orders/finalize",
    body,
    u,
    `idem-${randomUUID()}`,
  );
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual(
    a.json.serverOrderId,
    b.json.serverOrderId,
    "different keys must produce different orders",
  );
});

test("client abort mid-flight does NOT clear the row; same-key retry replays without re-running the handler", async () => {
  const u = await makeUser();
  const key = `idem-${randomUUID()}`;
  const body = { item: "saffron", qty: 1 };

  // First call: client aborts after 50ms while the handler is still
  // working (handler has a 400ms artificial delay). The TCP `close`
  // event fires on the server side, but the handler should continue
  // to completion and the row should still get stamped.
  const ctrl = new AbortController();
  const aborted = fetch(`${baseUrl}/orders/finalize?delay=400`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-user-id": u.id,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
    signal: ctrl.signal,
  }).catch(() => null);
  await new Promise((r) => setTimeout(r, 50));
  ctrl.abort();
  await aborted;

  // Wait long enough for the original handler to have completed and
  // its res.json shim to have persisted the cached response.
  await new Promise((r) => setTimeout(r, 600));

  // Retry with the SAME key + body. Must replay; handler must NOT
  // run a second time (otherwise we'd have duplicate orders).
  const retry = await api<{ ok: boolean; serverOrderId: string }>(
    "/orders/finalize",
    body,
    u,
    key,
  );
  assert.equal(retry.status, 201);
  assert.equal(retry.headers["idempotent-replay"], "true");
  assert.equal(
    handlerCalls.get(`${u.id}:${key}`),
    1,
    "handler must run exactly once even though the original client aborted",
  );
});

test("invalid Idempotency-Key format is rejected with 400", async () => {
  const u = await makeUser();
  const r = await api("/orders/finalize", { qty: 1 }, u, "bad key!!!");
  assert.equal(r.status, 400);
  assert.equal(
    (r.json as { error: string }).error,
    "idempotency_key_invalid",
  );
});
