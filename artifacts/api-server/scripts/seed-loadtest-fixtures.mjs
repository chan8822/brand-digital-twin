#!/usr/bin/env node
/**
 * Task #7 — seed minimal fixtures for the HTTP-level bulkhead smoke.
 *
 * Inserts a rider (id=1) and a small set of in-progress orders that
 * the loadtest can target with /api/delivery/dispatch/override. Prints
 * the resulting order IDs as a comma-separated list on stdout so the
 * CI step can capture them.
 *
 * Idempotent: if rider id=1 already exists we update it back to
 * 'available'; orders are always freshly inserted (the loadtest only
 * needs them to be in a non-terminal status that the override accepts).
 *
 * Schema notes (kept in lock-step with lib/db/src/schema):
 *   - orders.total_paise NOT NULL (currency is paise, not cents).
 *   - orders.items jsonb NOT NULL.
 *   - riders requires (name, phone, zone) — `zone` has no default.
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
    // Upsert rider id=1 in 'available' state.
    await c.query(
      `insert into riders (id, name, phone, zone, status)
       values (1, 'CI Test Rider', '+10000000000', 'ci-zone', 'available')
       on conflict (id) do update
         set status = 'available',
             zone = excluded.zone,
             phone = excluded.phone,
             name = excluded.name`,
    );
    // Keep the riders.id sequence ahead of the manual id=1 insert so
    // future serial inserts don't collide.
    await c.query(
      "select setval(pg_get_serial_sequence('riders','id'), greatest(1, (select max(id) from riders)))",
    );

    const orderIds = [];
    for (let i = 0; i < 5; i++) {
      const r = await c.query(
        `insert into orders (status, total_paise, items, fulfillment_type, priority, created_at)
         values ('preparing', 10000, '[{"id":1,"name":"ci-item","qty":1,"price":100}]'::jsonb,
                 'delivery', 'routine', now())
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
