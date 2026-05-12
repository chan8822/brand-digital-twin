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
    // ON CONFLICT DO NOTHING — producer-side dedupe. We use the
    // RETURNING clause to distinguish "actually inserted" from
    // "swallowed as duplicate" so the metrics tell operators
    // whether a retry storm is happening.
    const inserted = await executor
      .insert(opsAuditOutboxTable)
      .values({ dedupeKey, payload })
      .onConflictDoNothing({ target: opsAuditOutboxTable.dedupeKey })
      .returning({ id: opsAuditOutboxTable.id });
    if (inserted.length === 0) {
      opsAuditOutboxDuplicatesIgnoredTotal += 1;
    } else {
      opsAuditOutboxEnqueuedTotal += 1;
    }
  } catch (err) {
    // Inside a transaction we MUST propagate so the override rolls back.
    throw err;
  }
}

// How long a Phase-A claim is honoured. A drainer that crashes mid-Phase-B
// strands its claimed rows for at most this long before another drainer
// re-claims them. Tuned > 2 × the longest possible per-row processing
// time (a single ops_actions insert), so a healthy drainer never races
// itself for the same row.
const OPS_AUDIT_CLAIM_LEASE_SECONDS = 30;

/**
 * Drain up to `limit` unprocessed outbox rows into `ops_actions` and mark
 * them processed. Safe to run concurrently across pods.
 *
 * Correctness model: at-least-once delivery + idempotent consumer.
 *
 *   Phase A — atomic CLAIM (single round-trip).
 *     `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING ...`
 *     stamps `claimed_at = now()` and bumps `attempts`. The lock from
 *     the inner SKIP LOCKED is held for the duration of the UPDATE,
 *     and the COMMITTED claim is what subsequent drainers see — they
 *     filter rows whose claim is still inside the lease window. This
 *     closes the "claim then release lock then someone else picks the
 *     same row" hole.
 *
 *   Phase B — per-row transaction with consumer dedupe.
 *     Each claimed row is inserted into ops_actions with
 *     `ON CONFLICT (dedupe_key) DO NOTHING`. Even if two drainers race
 *     past Phase A (e.g. exactly at the lease boundary), at most one
 *     ops_actions row materialises. The per-row tx model also means a
 *     poison row's tx aborts in isolation; sibling rows still commit.
 *
 *   Lease expiry. Rows whose `claimed_at < now() - lease` are eligible
 *     for re-claim, so a crashed drainer cannot strand work indefinitely.
 *
 * Postgres correctness note: a statement error aborts the surrounding
 * transaction. Per-row tx is therefore mandatory — the previous batch-tx
 * implementation (rolled back here) rolled back the whole batch when one
 * row's insert failed.
 */
export async function drainOpsAuditOutbox(limit = 50): Promise<number> {
  // ── Phase A: atomic claim ────────────────────────────────────────────
  type ClaimedRow = {
    id: number;
    dedupe_key: string;
    payload: Record<string, unknown>;
  };
  const claimResult = await db.execute<ClaimedRow>(sql`
    update ${opsAuditOutboxTable} as o
    set claimed_at = now(), attempts = coalesce(o.attempts, 0) + 1
    from (
      select id
      from ${opsAuditOutboxTable}
      where processed_at is null
        and (
          claimed_at is null
          or claimed_at < now() - ${sql.raw(`interval '${OPS_AUDIT_CLAIM_LEASE_SECONDS} seconds'`)}
        )
      order by created_at asc
      limit ${limit}
      for update skip locked
    ) as picks
    where o.id = picks.id
    returning o.id, o.dedupe_key, o.payload
  `);
  const claimed: ClaimedRow[] =
    (claimResult as unknown as { rows?: ClaimedRow[] }).rows
    ?? (claimResult as unknown as ClaimedRow[])
    ?? [];
  if (claimed.length === 0) return 0;

  // ── Phase B: per-row tx with consumer-side ON CONFLICT dedupe ────────
  let drained = 0;
  for (const r of claimed) {
    try {
      await db.transaction(async (rowTx) => {
        // Stamp dedupeKey on the ops_actions row so the unique index
        // (`ux_ops_actions_dedupe_key`) collapses concurrent inserts
        // to one row even if two drainers race past Phase A.
        const payload = r.payload as Record<string, unknown>;
        const insertRow = {
          ...(payload as unknown as InsertOpsAction),
          dedupeKey: r.dedupe_key,
        };
        await rowTx
          .insert(opsActionsTable)
          .values(insertRow)
          .onConflictDoNothing({ target: opsActionsTable.dedupeKey });
        await rowTx.execute(sql`
          update ${opsAuditOutboxTable}
          set processed_at = now(), last_error = null
          where id = ${r.id}
        `);
      });
      drained += 1;
    } catch (err) {
      opsAuditOutboxDrainFailuresTotal += 1;
      const msg = err instanceof Error ? err.message : String(err);
      // Failure path runs in its OWN fresh tx; the failed insert tx
      // is already rolled back. We also clear claimed_at so the lease
      // doesn't have to expire before someone retries — but we keep
      // last_error so an operator sees the failure trail.
      try {
        await db.execute(sql`
          update ${opsAuditOutboxTable}
          set last_error = ${msg}, claimed_at = null
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
