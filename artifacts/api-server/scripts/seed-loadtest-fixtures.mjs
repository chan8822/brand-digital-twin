#!/usr/bin/env node
/**
 * Task #7 — seed minimal fixtures for the HTTP-level bulkhead smoke.
 *
 * Inserts a rider (id=1) and a small set of in-progress orders that
 * the loadtest can target with /delivery/dispatch/override. Prints
 * the resulting order IDs as a comma-separated list on stdout so the
 * CI step can capture them.
 *
 * Idempotent: if rows already exist they are reused.
 */
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(
      `insert into riders (id, name, phone, status)
       values (1, 'CI Test Rider', '+10000000000', 'available')
       on conflict (id) do update set status = 'available'`,
    );
    const orderIds = [];
    for (let i = 0; i < 5; i++) {
      const r = await c.query(
        `insert into orders (status, total_cents, created_at)
         values ('preparing', 100, now())
         returning id`,
      );
      orderIds.push(r.rows[0].id);
    }
    await c.query("commit");
    process.stdout.write(orderIds.join(","));
  } catch (err) {
    await c.query("rollback").catch(() => {});
    console.error(err);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
}

main();
