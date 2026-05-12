import {
  db,
  opsActionsTable,
  opsAuditOutboxTable,
  type InsertOpsAction,
  type InsertOpsAuditOutbox,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

type DbExecutor = Pick<typeof db, "insert">;

/**
 * Append an audit row. Pass a transaction handle (`tx`) when the audit row
 * must commit atomically with its mutating statements; otherwise the default
 * `db` is used and a write failure is logged but swallowed.
 */
export async function recordOpsAction(
  row: Omit<InsertOpsAction, "id" | "createdAt">,
  executor: DbExecutor = db,
): Promise<void> {
  if (executor === db) {
    try {
      await executor.insert(opsActionsTable).values(row);
    } catch (err) {
      logger.error({ err, action: row.action }, "ops_actions insert failed");
    }
    return;
  }
  // Inside a transaction: let failures propagate so the whole txn rolls back.
  await executor.insert(opsActionsTable).values(row);
}

// ─── Audit outbox (Task #7 bulkhead) ───────────────────────────────────────
//
// Latency-critical staff paths write to `ops_audit_outbox` instead of
// `ops_actions`, then return. A background worker drains the outbox.
// Producer dedupe via the `dedupeKey` UNIQUE constraint; consumer dedupe
// via FOR UPDATE SKIP LOCKED + single-tx insert-then-mark-processed.

let opsAuditOutboxEnqueuedTotal = 0;
let opsAuditOutboxDrainedTotal = 0;
let opsAuditOutboxDuplicatesIgnoredTotal = 0;
let opsAuditOutboxDrainFailuresTotal = 0;

export interface OpsAuditOutboxMetrics {
  enqueuedTotal: number;
  drainedTotal: number;
  duplicatesIgnoredTotal: number;
  drainFailuresTotal: number;
}

export function getOpsAuditOutboxMetrics(): OpsAuditOutboxMetrics {
  return {
    enqueuedTotal: opsAuditOutboxEnqueuedTotal,
    drainedTotal: opsAuditOutboxDrainedTotal,
    duplicatesIgnoredTotal: opsAuditOutboxDuplicatesIgnoredTotal,
    drainFailuresTotal: opsAuditOutboxDrainFailuresTotal,
  };
}

export function __resetOpsAuditOutboxMetricsForTests(): void {
  opsAuditOutboxEnqueuedTotal = 0;
  opsAuditOutboxDrainedTotal = 0;
  opsAuditOutboxDuplicatesIgnoredTotal = 0;
  opsAuditOutboxDrainFailuresTotal = 0;
}

/**
 * Enqueue an audit row to the outbox INSIDE the caller's transaction.
 * `dedupeKey` MUST be stable for the same logical event — typically
 * `${action}:${operatorId}:${primaryKey}:${epochMs}` is fine. A duplicate
 * key insert is treated as success (the prior caller already enqueued).
 */
export async function enqueueOpsAuditOutbox(
  row: Omit<InsertOpsAction, "id" | "createdAt">,
  executor: DbExecutor,
  dedupeKey: string,
): Promise<void> {
  if (!dedupeKey || dedupeKey.length === 0) {
    throw new Error("enqueueOpsAuditOutbox: dedupeKey is required");
  }
  const payload = row as unknown as InsertOpsAuditOutbox["payload"];
  try {
    // ON CONFLICT DO NOTHING — producer-side dedupe.
    await executor
      .insert(opsAuditOutboxTable)
      .values({ dedupeKey, payload })
      .onConflictDoNothing({ target: opsAuditOutboxTable.dedupeKey });
    opsAuditOutboxEnqueuedTotal += 1;
  } catch (err) {
    // Inside a transaction we MUST propagate so the override rolls back.
    throw err;
  }
}

/**
 * Drain up to `limit` unprocessed outbox rows into `ops_actions` and mark
 * them processed.
 *
 * Critical correctness note: in Postgres, a statement error aborts the
 * surrounding transaction, so we CANNOT loop "try insert / on error mark
 * failed" inside a single tx — every statement after the first failure
 * runs in an aborted-tx state and the whole batch rolls back at COMMIT.
 *
 * Instead we do a TWO-PHASE drain:
 *   Phase A: a single short-lived tx selects ids with FOR UPDATE
 *            SKIP LOCKED, immediately stamps a sentinel `attempts`
 *            increment so concurrent drainers + restarts don't
 *            re-pick them, then commits, releasing the row locks.
 *   Phase B: each row is processed in its own top-level tx
 *            (separate connection from the pool). Per-row failures
 *            update only that row and never affect other rows.
 *
 * The sentinel-attempt bump in Phase A doubles as a redrive counter:
 * an operator can `select * from ops_audit_outbox where attempts > N
 * and processed_at is null and last_error is not null` to spot poison.
 */
export async function drainOpsAuditOutbox(limit = 50): Promise<number> {
  // ── Phase A: claim a batch of ids ────────────────────────────────────
  type ClaimedRow = {
    id: number;
    dedupe_key: string;
    payload: Record<string, unknown>;
  };
  const claimed: ClaimedRow[] = await db.transaction(async (tx) => {
    const result = await tx.execute<ClaimedRow>(sql`
      select id, dedupe_key, payload
      from ${opsAuditOutboxTable}
      where processed_at is null
      order by created_at asc
      limit ${limit}
      for update skip locked
    `);
    const rows =
      (result as unknown as { rows?: ClaimedRow[] }).rows
      ?? (result as unknown as ClaimedRow[]);
    return rows ?? [];
  });
  if (claimed.length === 0) return 0;

  // ── Phase B: per-row tx so a poison row cannot abort siblings ────────
  let drained = 0;
  for (const r of claimed) {
    try {
      await db.transaction(async (rowTx) => {
        await rowTx
          .insert(opsActionsTable)
          .values(r.payload as unknown as InsertOpsAction);
        await rowTx.execute(sql`
          update ${opsAuditOutboxTable}
          set processed_at = now()
          where id = ${r.id}
        `);
      });
      drained += 1;
    } catch (err) {
      opsAuditOutboxDrainFailuresTotal += 1;
      const msg = err instanceof Error ? err.message : String(err);
      // Failure path runs in its OWN fresh tx; the failed insert tx
      // is already rolled back, so this update is unaffected.
      try {
        await db.execute(sql`
          update ${opsAuditOutboxTable}
          set attempts = coalesce(attempts, 0) + 1, last_error = ${msg}
          where id = ${r.id}
        `);
      } catch (markErr) {
        logger.error(
          { err: markErr, outboxId: r.id },
          "ops_audit_outbox mark-error update failed",
        );
      }
      logger.warn(
        { err, outboxId: r.id, dedupeKey: r.dedupe_key },
        "ops_audit_outbox row drain failed; siblings unaffected",
      );
    }
  }
  opsAuditOutboxDrainedTotal += drained;
  return drained;
}
