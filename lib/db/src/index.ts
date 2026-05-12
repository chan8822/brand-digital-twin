import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Task #7: Manual-Mode bulkhead. We split the connection budget into
// two named pools so the staff override path can never queue behind
// the auto-dispatcher's long-running transactions:
//
//   - `pool` / `db`         : main pool, ~16 connections, used by
//                             every route except the override path.
//   - `overridePool` /
//     `overrideDb`          : carve-out, 4 connections, used ONLY by
//                             `/delivery/dispatch/override`. Even
//                             when the main pool is fully saturated
//                             by background dispatch work, the
//                             override path always has connections
//                             available.
//
// The two budgets sum to 20, well under typical Postgres connection
// limits. The carve-out is intentionally small — override traffic is
// human-driven and bursty, not high-throughput.
const MAIN_POOL_MAX = Number(process.env.PG_POOL_MAX ?? 16);
const OVERRIDE_POOL_MAX = Number(process.env.PG_OVERRIDE_POOL_MAX ?? 4);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: MAIN_POOL_MAX,
});
export const db = drizzle(pool, { schema });

export const overridePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: OVERRIDE_POOL_MAX,
  // Hard ceiling on how long an override request will wait for a
  // connection — well under the 2s SLO for the route as a whole.
  connectionTimeoutMillis: 1_000,
});
export const overrideDb = drizzle(overridePool, { schema });

/**
 * Concrete drizzle-pg type for both `db` and `overrideDb` so callers
 * can accept either pool. Inferred from the export to avoid drift if
 * the schema set ever changes.
 */
export type DrizzleDb = typeof db;

export * from "./schema";
