import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
import { db, idempotencyKeysTable } from "@workspace/db";

/**
 * Server-managed `Idempotency-Key` middleware for write endpoints that
 * must survive client retries — primarily order create.
 *
 * Contract:
 *   - Header `Idempotency-Key` REQUIRED (8–128 url-safe chars). Missing
 *     → 400 `idempotency_key_required` so the client (and integration
 *     tests) cannot regress to "id from request body" behavior.
 *   - Same key + same body within TTL → cached status + body replayed
 *     verbatim (no duplicate handler call → no duplicate order/charge).
 *   - Same key + DIFFERENT body → 409 `idempotency_key_mismatch`. Loud
 *     so client bugs surface instead of silently dropping a real order.
 *   - Concurrent duplicate POSTs serialize: the first request inserts
 *     the placeholder row (status_code = NULL → "in flight"), the
 *     second sees the conflict, polls the row until the winner stamps
 *     it, then replays. Persistence happens BEFORE the winner's
 *     response is flushed so the loser's poll always observes the
 *     stamped row by the time the winner's caller sees the answer.
 *
 * The middleware itself is route-agnostic; mount it on each endpoint
 * that needs the guarantee. Auth must run first because the cache is
 * scoped per (user_id, key) — anonymous use would be ambiguous.
 */

const KEY_RE = /^[A-Za-z0-9._\-:]{8,128}$/;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const POLL_INTERVAL_MS = 50;
const POLL_TIMEOUT_MS = 5_000;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = canonicalize((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function hashRequestBody(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(body ?? null)))
    .digest("hex");
}

function isExpired(row: { expiresAt: Date }): boolean {
  return row.expiresAt.getTime() <= Date.now();
}

/**
 * Send a previously cached response. We always emit JSON because every
 * route protected by this middleware speaks JSON; if a future route
 * needs to cache a non-JSON body, extend the schema with a content-
 * type column rather than guessing here. We replay the EXACT serialized
 * bytes the original handler produced — not a re-serialization of a
 * parsed object — so byte-level equivalence holds (matters for clients
 * that hash response bodies).
 */
function replay(
  res: Response,
  row: { statusCode: number | null; responseBody: string | null },
): void {
  res
    .status(row.statusCode ?? 500)
    .setHeader("Idempotent-Replay", "true")
    .type("application/json")
    .send(row.responseBody ?? "null");
}

async function loadRow(userId: string, key: string) {
  const [row] = await db
    .select()
    .from(idempotencyKeysTable)
    .where(
      and(
        eq(idempotencyKeysTable.userId, userId),
        eq(idempotencyKeysTable.key, key),
      ),
    );
  return row;
}

async function waitForCompletion(
  userId: string,
  key: string,
): Promise<typeof idempotencyKeysTable.$inferSelect | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const row = await loadRow(userId, key);
    if (!row) return null; // winner deleted it (e.g. expired race)
    if (row.statusCode != null) return row;
  }
  return null;
}

export function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  void runIdempotency(req, res, next).catch(next);
}

async function runIdempotency(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.isAuthenticated()) {
    // Defer auth response to the route's own requireAuth — but we
    // cannot scope the cache without a user, so just pass through.
    next();
    return;
  }
  const userId = req.user.id;
  const rawKey = req.header("Idempotency-Key");
  if (!rawKey) {
    res.status(400).json({
      error: "idempotency_key_required",
      message:
        "POST to this endpoint requires an Idempotency-Key header (UUID recommended).",
    });
    return;
  }
  const key = rawKey.trim();
  if (!KEY_RE.test(key)) {
    res.status(400).json({
      error: "idempotency_key_invalid",
      message:
        "Idempotency-Key must be 8-128 chars from [A-Za-z0-9._-:].",
    });
    return;
  }

  const requestHash = hashRequestBody(req.body);
  const expiresAt = new Date(Date.now() + TTL_MS);

  // Race-free placeholder insert. ON CONFLICT DO NOTHING returns the
  // row only when WE inserted it, letting us distinguish winner from
  // loser without a separate SELECT.
  const inserted = await db
    .insert(idempotencyKeysTable)
    .values({
      userId,
      key,
      requestHash,
      statusCode: null,
      responseBody: null,
      expiresAt,
    })
    .onConflictDoNothing({
      target: [idempotencyKeysTable.userId, idempotencyKeysTable.key],
    })
    .returning();

  if (inserted.length === 0) {
    // Someone else owns this key. Either it's a true replay (already
    // stamped), an in-flight duplicate (poll), or an expired stale row
    // we should overwrite.
    const existing = await loadRow(userId, key);
    if (!existing) {
      // Winner deleted/expired between conflict and our SELECT —
      // safest to ask client to retry rather than risk a silent
      // double-insert race.
      res.status(409).json({ error: "idempotency_state_lost" });
      return;
    }
    if (isExpired(existing)) {
      // Stale: clear it and recurse-once. Cleanest path for a 25 h
      // delayed retry.
      await db
        .delete(idempotencyKeysTable)
        .where(
          and(
            eq(idempotencyKeysTable.userId, userId),
            eq(idempotencyKeysTable.key, key),
          ),
        );
      return runIdempotency(req, res, next);
    }
    if (existing.requestHash !== requestHash) {
      res.status(409).json({
        error: "idempotency_key_mismatch",
        message:
          "Idempotency-Key reused with a different request body. Generate a new key for a new request.",
      });
      return;
    }
    if (existing.statusCode == null) {
      const completed = await waitForCompletion(userId, key);
      if (!completed) {
        res.status(409).json({
          error: "idempotency_in_flight",
          message:
            "A prior request with this key is still being processed; retry shortly.",
        });
        return;
      }
      replay(res, completed);
      return;
    }
    replay(res, existing);
    return;
  }

  // We own the row. Capture the response so we can persist it BEFORE
  // it is flushed to the wire (so a concurrent loser polling the row
  // never sees the response on the network before it sees the cached
  // copy in the DB).
  const originalJson = res.json.bind(res);
  let captured = false;
  res.json = (body: unknown) => {
    if (captured) return res; // shouldn't happen, but be safe
    captured = true;
    const status = res.statusCode || 200;
    // Serialize ONCE here so the bytes we cache are identical to the
    // bytes we ultimately send on the wire (and that any retry will
    // get back). Re-serializing inside replay() via res.json could
    // reorder keys after a jsonb roundtrip.
    const serialized = JSON.stringify(body);
    // Schedule persist-then-send. We deliberately do not await inside
    // the synchronous res.json shim; we kick off the async work and
    // return res to satisfy the express signature, then send the real
    // response only after the persist resolves.
    void (async () => {
      try {
        await db
          .update(idempotencyKeysTable)
          .set({ statusCode: status, responseBody: serialized })
          .where(
            and(
              eq(idempotencyKeysTable.userId, userId),
              eq(idempotencyKeysTable.key, key),
            ),
          );
      } catch (err) {
        req.log?.error?.({ err, key }, "idempotency persist failed");
      }
      // Send the same string we cached so winner + losers see the
      // same bytes byte-for-byte.
      res.type("application/json").send(serialized);
      void originalJson; // kept for the signature reference; not used
    })();
    return res;
  };

  // CRITICAL: do NOT clear the placeholder on `close`. `close` also
  // fires when the client disconnects/aborts mid-flight while the
  // handler is still executing server-side (and may still go on to
  // create the order, charge the card, etc.). Removing the row here
  // would let a same-key retry insert a fresh row and execute the
  // handler a second time → duplicate order. Instead:
  //
  //   * If the handler completes via res.json, our shim captures,
  //     persists and sends. Aborted clients still get the row
  //     persisted, so a retry replays correctly.
  //   * If the handler completes via res.end / res.send WITHOUT
  //     going through res.json (e.g. a 204 or an error handler),
  //     we stamp the row on `finish` with the actual status and an
  //     empty body so a retry replays a deterministic answer
  //     instead of polling for 5s and getting `idempotency_in_flight`.
  //   * If the handler crashes WITHOUT ever flushing a response,
  //     the row stays in-flight. Retries within 5s poll → 409
  //     `idempotency_in_flight`; later retries (within 24 h TTL)
  //     hit the same in-flight row and likewise get 409. The hourly
  //     sweeper + TTL prevent permanent leakage. This is the safer
  //     failure mode than risking a duplicate charge.
  res.on("finish", () => {
    if (captured) return;
    const status = res.statusCode || 200;
    void db
      .update(idempotencyKeysTable)
      .set({ statusCode: status, responseBody: "" })
      .where(
        and(
          eq(idempotencyKeysTable.userId, userId),
          eq(idempotencyKeysTable.key, key),
        ),
      )
      .catch((err) => {
        req.log?.error?.({ err, key }, "idempotency finish-stamp failed");
      });
  });

  next();
}

/**
 * Periodic sweeper. Cheap to call — the index on `expires_at` makes
 * this an O(log n) range delete. Returns the number of rows purged.
 */
export async function sweepExpiredIdempotencyKeys(): Promise<number> {
  const r = await db
    .delete(idempotencyKeysTable)
    .where(lt(idempotencyKeysTable.expiresAt, sql`now()`))
    .returning({ k: idempotencyKeysTable.key });
  return r.length;
}
