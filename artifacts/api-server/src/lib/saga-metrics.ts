// Lightweight in-memory counters for the reserve-and-create saga
// (Task #6). No prom-client dependency — these are read by debug
// endpoints and asserted in tests. Process-local; if we ever scale
// out we should swap this for a real metrics backend.

import { db, slotReservationsTable, ordersTable } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface SagaMetricsSnapshot {
  orphanReclaimedTotal: number;
  reserveSlotInvariantViolationsTotal: number;
  marketplaceCheckoutRollbackTotal: number;
  outstandingOrphanReservations: number;
}

let orphanReclaimedTotal = 0;
let reserveSlotInvariantViolationsTotal = 0;
let marketplaceCheckoutRollbackTotal = 0;

export function incOrphanReclaimed(n = 1): void {
  orphanReclaimedTotal += n;
}

export function incReserveSlotInvariantViolation(): void {
  reserveSlotInvariantViolationsTotal += 1;
}

export function incMarketplaceCheckoutRollback(): void {
  marketplaceCheckoutRollbackTotal += 1;
}

export async function getOutstandingOrphanReservations(): Promise<number> {
  // Count rows that the sweeper would consider orphans right now,
  // ignoring the grace window — useful as a "current pressure" gauge.
  const result = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
    from ${slotReservationsTable} sr
    where sr.kind = 'order'
      and (
        sr.order_id is null
        or not exists (select 1 from ${ordersTable} o where o.id = sr.order_id)
      )
  `);
  const rows = (result as unknown as { rows: Array<{ n: number }> }).rows
    ?? (result as unknown as Array<{ n: number }>);
  return rows?.[0]?.n ?? 0;
}

export async function snapshotSagaMetrics(): Promise<SagaMetricsSnapshot> {
  return {
    orphanReclaimedTotal,
    reserveSlotInvariantViolationsTotal,
    marketplaceCheckoutRollbackTotal,
    outstandingOrphanReservations: await getOutstandingOrphanReservations(),
  };
}

// Test-only reset hook.
export function __resetSagaMetricsForTests(): void {
  orphanReclaimedTotal = 0;
  reserveSlotInvariantViolationsTotal = 0;
  marketplaceCheckoutRollbackTotal = 0;
}
