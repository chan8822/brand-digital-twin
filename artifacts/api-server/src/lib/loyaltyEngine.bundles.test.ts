/**
 * Integration tests for finalizeOrder bundle math + preorder discount +
 * credit redemption. These hit the real Postgres dev DB (DATABASE_URL).
 *
 * Run with:
 *   node --test --import tsx ./src/lib/loyaltyEngine.bundles.test.ts
 *
 * Each test creates its own user / order id / bundle slugs so concurrent
 * runs don't collide and we don't depend on prior fixture state.
 */

import assert from "node:assert/strict";
import { test, after, before } from "node:test";
import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import {
  bundlesTable,
  creditLedgerTable,
  db,
  orderClaimsTable,
  ordersTable,
  pickupLocationsTable,
  usersTable,
} from "@workspace/db";
import { DISHES } from "@workspace/menu-catalog";

import {
  finalizeOrder,
  issueCredit,
  PREORDER_DISCOUNT_BPS,
} from "./loyaltyEngine";

// Premium-only slugs are gated at the route layer (not in finalizeOrder),
// but we still avoid them so unrelated route-level tests can reuse this
// catalog selection without surprises.
const PREMIUM_SLUGS = new Set([
  "alfredo-pasta-prawns",
  "pesto-pasta-prawns",
  "crispy-peri-peri-chicken-burrito-wrap",
]);

function pickAvailableDishes(n: number) {
  const pool = DISHES.filter(
    (d) => d.isAvailable && !PREMIUM_SLUGS.has(d.slug) && d.price > 0,
  );
  if (pool.length < n) throw new Error(`catalog only has ${pool.length} usable dishes`);
  return pool.slice(0, n);
}

const CREATED_USER_IDS: string[] = [];
const CREATED_BUNDLE_SLUGS: string[] = [];
let pickupLocationId = 0;

async function makeUser(): Promise<string> {
  const id = randomUUID();
  await db.insert(usersTable).values({
    id,
    email: `bundle-test-${id}@example.test`,
    firstName: "Bundle",
    lastName: "Tester",
  });
  CREATED_USER_IDS.push(id);
  return id;
}

async function makeBundle(args: {
  dishIds: number[];
  pricePaise: number;
  originalPricePaise: number;
}): Promise<string> {
  const slug = `combo-test-${randomUUID().slice(0, 8)}`;
  await db.insert(bundlesTable).values({
    slug,
    name: `Test Combo ${slug}`,
    description: "",
    pricePaise: args.pricePaise,
    originalPricePaise: args.originalPricePaise,
    dishIds: args.dishIds,
  });
  CREATED_BUNDLE_SLUGS.push(slug);
  return slug;
}

before(async () => {
  // One pickup location reused across tests, with zero discount so it
  // doesn't perturb the bundle math we're verifying. Using pickup also
  // sidesteps the delivery-slot + geocoding setup the delivery path
  // would require.
  const [loc] = await db
    .insert(pickupLocationsTable)
    .values({
      name: `Bundle Test Pickup ${randomUUID().slice(0, 6)}`,
      addressLine: "1 Test St",
      city: "Bengaluru",
      pincode: "560001",
      lat: 12.97,
      lng: 77.59,
      discountPaise: 0,
      active: true,
    })
    .returning();
  pickupLocationId = loc!.id;
});

after(async () => {
  // Clean up everything we created. Order matters: claims/orders/credits
  // hang off users via FK references. Bundles and the pickup location are
  // standalone.
  if (CREATED_USER_IDS.length > 0) {
    await db
      .delete(orderClaimsTable)
      .where(inArray(orderClaimsTable.userId, CREATED_USER_IDS));
    await db
      .delete(ordersTable)
      .where(inArray(ordersTable.userId, CREATED_USER_IDS));
    await db
      .delete(creditLedgerTable)
      .where(inArray(creditLedgerTable.userId, CREATED_USER_IDS));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, CREATED_USER_IDS));
  }
  if (CREATED_BUNDLE_SLUGS.length > 0) {
    await db
      .delete(bundlesTable)
      .where(inArray(bundlesTable.slug, CREATED_BUNDLE_SLUGS));
  }
  if (pickupLocationId) {
    await db
      .delete(pickupLocationsTable)
      .where(eq(pickupLocationsTable.id, pickupLocationId));
  }
});

function itemsFor(dishes: { id: number; price: number }[], qty = 1) {
  return dishes.map((d) => ({
    id: d.id,
    name: "ignored",
    qty,
    price: 0, // server re-prices from catalog; client price is ignored
  }));
}

function callerArgs(userId: string, extra: Record<string, unknown> = {}) {
  return {
    userId,
    orderId: `ord-${randomUUID()}`,
    fulfillmentType: "pickup" as const,
    pickupLocationId,
    ...extra,
  };
}

test("finalizeOrder applies a single bundle's saving", async () => {
  const userId = await makeUser();
  const [a, b] = pickAvailableDishes(2);
  const original = a!.price + b!.price;
  const bundlePrice = original - 5000;
  const slug = await makeBundle({
    dishIds: [a!.id, b!.id],
    pricePaise: bundlePrice,
    originalPricePaise: original,
  });
  const out = await finalizeOrder({
    ...callerArgs(userId),
    items: itemsFor([a!, b!]),
    bundleSlugs: [slug],
  });
  assert.equal(out.bundleDiscountPaise, 5000);
  assert.equal(out.grossPaise, original - 5000);
  assert.equal(out.finalPaise, original - 5000);
});

test("finalizeOrder discounts each repeated combo instance", async () => {
  const userId = await makeUser();
  const [a, b] = pickAvailableDishes(2);
  const original = a!.price + b!.price;
  const bundlePrice = original - 4000;
  const slug = await makeBundle({
    dishIds: [a!.id, b!.id],
    pricePaise: bundlePrice,
    originalPricePaise: original,
  });
  // Buy two of each component so the same combo can be applied twice.
  const items = [
    { id: a!.id, name: "x", qty: 2, price: 0 },
    { id: b!.id, name: "y", qty: 2, price: 0 },
  ];
  const out = await finalizeOrder({
    ...callerArgs(userId),
    items,
    bundleSlugs: [slug, slug],
  });
  const grossBefore = (a!.price + b!.price) * 2;
  assert.equal(out.bundleDiscountPaise, 8000, "two combo instances saved 2x");
  assert.equal(out.grossPaise, grossBefore - 8000);

  // Asking for three instances when only two are stocked must drop the third.
  const userId2 = await makeUser();
  const out2 = await finalizeOrder({
    ...callerArgs(userId2),
    items,
    bundleSlugs: [slug, slug, slug],
  });
  assert.equal(
    out2.bundleDiscountPaise,
    8000,
    "third combo instance has no remaining stock and is dropped",
  );
});

test("finalizeOrder picks the higher-savings bundle when components overlap", async () => {
  const userId = await makeUser();
  const [a, b, c] = pickAvailableDishes(3);
  // Two bundles competing for dish `a`.  Smaller saving on (a, b),
  // larger saving on (a, c). The cart only stocks one of `a`, so only
  // one bundle can win — finalizeOrder must pick the larger saving.
  const small = await makeBundle({
    dishIds: [a!.id, b!.id],
    pricePaise: a!.price + b!.price - 2000,
    originalPricePaise: a!.price + b!.price,
  });
  const big = await makeBundle({
    dishIds: [a!.id, c!.id],
    pricePaise: a!.price + c!.price - 9000,
    originalPricePaise: a!.price + c!.price,
  });
  const items = [
    { id: a!.id, name: "x", qty: 1, price: 0 },
    { id: b!.id, name: "y", qty: 1, price: 0 },
    { id: c!.id, name: "z", qty: 1, price: 0 },
  ];
  const out = await finalizeOrder({
    ...callerArgs(userId),
    items,
    bundleSlugs: [small, big],
  });
  assert.equal(
    out.bundleDiscountPaise,
    9000,
    "must apply the larger-savings bundle, not the smaller overlapping one",
  );
});

test("finalizeOrder silently drops bundles whose components are missing", async () => {
  const userId = await makeUser();
  const [a, b] = pickAvailableDishes(2);
  const slug = await makeBundle({
    dishIds: [a!.id, b!.id],
    pricePaise: a!.price + b!.price - 7000,
    originalPricePaise: a!.price + b!.price,
  });
  // Cart is missing dish `b` entirely → bundle cannot apply.
  const out = await finalizeOrder({
    ...callerArgs(userId),
    items: [{ id: a!.id, name: "x", qty: 1, price: 0 }],
    bundleSlugs: [slug],
  });
  assert.equal(out.bundleDiscountPaise, 0);
  assert.equal(out.grossPaise, a!.price);
});

test("finalizeOrder layers bundle, preorder discount and credit redemption", async () => {
  const userId = await makeUser();
  const [a, b] = pickAvailableDishes(2);
  const original = a!.price + b!.price;
  const bundleSaving = 6000;
  const slug = await makeBundle({
    dishIds: [a!.id, b!.id],
    pricePaise: original - bundleSaving,
    originalPricePaise: original,
  });
  // Seed credits so the redemption has something to consume.
  await issueCredit({
    userId,
    deltaPaise: 12000,
    reason: "manual_grant",
  });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const out = await finalizeOrder({
    ...callerArgs(userId),
    items: itemsFor([a!, b!]),
    bundleSlugs: [slug],
    scheduledFor: tomorrow,
    applyCreditsPaise: 5000,
  });
  const afterBundle = original - bundleSaving;
  const expectedPreorder = Math.floor((afterBundle * PREORDER_DISCOUNT_BPS) / 10_000);
  const afterPreorder = afterBundle - expectedPreorder;
  assert.equal(out.bundleDiscountPaise, bundleSaving);
  assert.equal(out.preorderDiscountPaise, expectedPreorder);
  assert.equal(out.grossPaise, afterPreorder);
  assert.equal(out.redeemedPaise, 5000);
  assert.equal(out.finalPaise, afterPreorder - 5000);
  assert.equal(out.balancePaise, 12000 - 5000);
});
