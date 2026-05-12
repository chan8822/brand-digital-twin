/**
 * Server-side allergen + dietary-style gate tests for `finalizeOrder`.
 *
 * Covers Task #3: a tampered or stale client cannot bypass the safety
 * evaluator. Every block is fail-closed, returns a structured
 * `safety_block` payload (codes: `allergen_block`, `diet_block`), and
 * appends an `ops_actions` audit row.
 *
 * Run with:
 *   node --test --import tsx ./src/lib/loyaltyEngine.allergenGate.test.ts
 *
 * Hits the real dev DB via DATABASE_URL.
 */

import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  opsActionsTable,
  ordersTable,
  pickupLocationsTable,
  userPreferencesTable,
  usersTable,
  type DietaryStyle,
} from "@workspace/db";
import { DISHES, type DishData } from "@workspace/menu-catalog";

import { finalizeOrder } from "./loyaltyEngine";

const CREATED_USER_IDS: string[] = [];
const CREATED_PICKUP_IDS: number[] = [];

async function makeUser(): Promise<string> {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: `gate-test-${id}@example.test`,
    firstName: "Gate",
    lastName: "Tester",
  });
  CREATED_USER_IDS.push(id);
  return id;
}

async function makePickup(): Promise<number> {
  const [loc] = await db
    .insert(pickupLocationsTable)
    .values({
      name: `Gate Pickup ${randomUUID().slice(0, 6)}`,
      addressLine: "1 Gate St",
      city: "Bengaluru",
      pincode: "560001",
      lat: 12.97,
      lng: 77.59,
      discountPaise: 0,
      active: true,
    })
    .returning({ id: pickupLocationsTable.id });
  CREATED_PICKUP_IDS.push(loc.id);
  return loc.id;
}

async function setPrefs(
  userId: string,
  patch: { allergens?: string[]; dietaryStyle?: DietaryStyle },
): Promise<void> {
  await db
    .insert(userPreferencesTable)
    .values({
      userId,
      allergens: patch.allergens ?? [],
      dislikedIngredients: [],
      cuisines: [],
      dietaryStyle: patch.dietaryStyle ?? "omnivore",
    })
    .onConflictDoUpdate({
      target: userPreferencesTable.userId,
      set: {
        allergens: patch.allergens ?? [],
        dietaryStyle: patch.dietaryStyle ?? "omnivore",
      },
    });
}

function pickDish(predicate: (d: DishData) => boolean): DishData {
  const d = DISHES.find((x) => x.isAvailable && predicate(x));
  if (!d) throw new Error("no dish in real catalog matched predicate");
  return d;
}

function asLineItem(d: DishData) {
  return { id: d.id, name: d.name, qty: 1, price: d.price };
}

async function lastAuditFor(orderId: string) {
  const rows = await db
    .select()
    .from(opsActionsTable)
    .where(
      and(
        eq(opsActionsTable.action, "safety_block"),
        eq(opsActionsTable.status, "blocked"),
      ),
    )
    .orderBy(desc(opsActionsTable.createdAt))
    .limit(50);
  return rows.find((r) => {
    const p = r.params as { orderId?: string } | null;
    return p?.orderId === orderId;
  });
}

after(async () => {
  if (CREATED_USER_IDS.length > 0) {
    await db
      .delete(ordersTable)
      .where(inArray(ordersTable.userId, CREATED_USER_IDS));
    await db
      .delete(userPreferencesTable)
      .where(inArray(userPreferencesTable.userId, CREATED_USER_IDS));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, CREATED_USER_IDS));
  }
  if (CREATED_PICKUP_IDS.length > 0) {
    await db
      .delete(pickupLocationsTable)
      .where(inArray(pickupLocationsTable.id, CREATED_PICKUP_IDS));
  }
});

test("happy path: omnivore with no allergens checks out", async () => {
  const userId = await makeUser();
  await setPrefs(userId, {});
  const pickupId = await makePickup();
  const dish = pickDish((d) => d.allergens.length === 0 && d.price > 0);
  const orderId = `gate-happy-${randomUUID()}`;
  const out = await finalizeOrder({
    userId,
    orderId,
    items: [asLineItem(dish)],
    fulfillmentType: "pickup",
    pickupLocationId: pickupId,
  });
  assert.equal(out.orderId, orderId);
});

test("allergen_block: refuses dish containing a declared allergen", async () => {
  const userId = await makeUser();
  // Use a real catalog dish with a declared allergen — no mutation needed.
  const dish = pickDish((d) => d.allergens.includes("Shellfish") && d.price > 0);
  await setPrefs(userId, { allergens: ["Shellfish"] });
  const pickupId = await makePickup();
  const orderId = `gate-allergen-${randomUUID()}`;
  await assert.rejects(
    finalizeOrder({
      userId,
      orderId,
      items: [asLineItem(dish)],
      fulfillmentType: "pickup",
      pickupLocationId: pickupId,
    }),
    (err: unknown) => {
      const e = err as Error & { safetyBlock?: { codes: string[] } };
      assert.match(e.message, /^safety_block:/);
      assert.ok(e.safetyBlock);
      assert.ok(e.safetyBlock!.codes.includes("allergen_block"));
      return true;
    },
  );
  // No order row should be persisted.
  const orders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.externalOrderId, orderId));
  assert.equal(orders.length, 0);
  // Audit row was appended (best-effort; allow up to 500ms for the
  // fire-and-forget insert to land).
  await new Promise((r) => setTimeout(r, 500));
  const audit = await lastAuditFor(orderId);
  assert.ok(audit, "expected ops_actions safety_block row");
  assert.equal(audit!.operatorId, userId);
});

test("diet_block (vegetarian): refuses non-veg dish for vegetarian user", async () => {
  const userId = await makeUser();
  await setPrefs(userId, { dietaryStyle: "vegetarian" });
  const pickupId = await makePickup();
  const dish = pickDish((d) => !d.isVeg && d.price > 0);
  const orderId = `gate-veg-${randomUUID()}`;
  await assert.rejects(
    finalizeOrder({
      userId,
      orderId,
      items: [asLineItem(dish)],
      fulfillmentType: "pickup",
      pickupLocationId: pickupId,
    }),
    (err: unknown) => {
      const e = err as Error & { safetyBlock?: { codes: string[] } };
      assert.match(e.message, /^safety_block:/);
      assert.ok(e.safetyBlock!.codes.includes("diet_block"));
      return true;
    },
  );
  await new Promise((r) => setTimeout(r, 500));
  const audit = await lastAuditFor(orderId);
  assert.ok(audit, "expected ops_actions safety_block row for diet block");
});

test("mixed-reason block: same order trips both allergen_block and diet_block", async () => {
  const userId = await makeUser();
  await setPrefs(userId, {
    allergens: ["Shellfish"],
    dietaryStyle: "vegetarian",
  });
  const pickupId = await makePickup();
  // One dish that is non-veg (diet_block for vegetarian) and another
  // that has a Shellfish allergen (allergen_block).
  const veggieOffender = pickDish(
    (d) => !d.isVeg && !d.allergens.includes("Shellfish") && d.price > 0,
  );
  const shellfishOffender = pickDish(
    (d) => d.allergens.includes("Shellfish") && d.price > 0,
  );
  assert.notEqual(veggieOffender.id, shellfishOffender.id);
  const orderId = `gate-mixed-${randomUUID()}`;
  await assert.rejects(
    finalizeOrder({
      userId,
      orderId,
      items: [asLineItem(veggieOffender), asLineItem(shellfishOffender)],
      fulfillmentType: "pickup",
      pickupLocationId: pickupId,
    }),
    (err: unknown) => {
      const e = err as Error & { safetyBlock?: { codes: string[] } };
      const codes = e.safetyBlock!.codes;
      assert.ok(codes.includes("allergen_block"), "missing allergen_block");
      assert.ok(codes.includes("diet_block"), "missing diet_block");
      return true;
    },
  );
  // No order row persisted on a mixed-reason block either.
  const orders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.externalOrderId, orderId));
  assert.equal(orders.length, 0);
});

test("diet_block (pescatarian): refuses chicken/meat dish", async () => {
  const userId = await makeUser();
  await setPrefs(userId, { dietaryStyle: "pescatarian" });
  const pickupId = await makePickup();
  // Non-veg dish whose ingredient text has no fish/seafood hints.
  const dish = pickDish((d) => {
    if (d.isVeg) return false;
    const t = d.ingredients.join(" ").toLowerCase();
    const fishy = ["fish", "salmon", "tuna", "shrimp", "prawn"].some((h) =>
      t.includes(h),
    );
    return !fishy && d.price > 0;
  });
  const orderId = `gate-pesc-${randomUUID()}`;
  await assert.rejects(
    finalizeOrder({
      userId,
      orderId,
      items: [asLineItem(dish)],
      fulfillmentType: "pickup",
      pickupLocationId: pickupId,
    }),
    (err: unknown) => {
      const e = err as Error & { safetyBlock?: { codes: string[] } };
      assert.ok(e.safetyBlock!.codes.includes("diet_block"));
      return true;
    },
  );
});
