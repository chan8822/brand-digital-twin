// Eval cases for the menu copywriter safety rails. Run with:
//   pnpm --filter @workspace/scripts run eval-menu-copy
//
// These are deliberately framework-free assertions (Node `assert/strict`)
// because the monorepo does not ship vitest. They guard against the most
// dangerous failure modes for a customer-facing menu: hallucinated allergens,
// fish/shellfish on veg dishes, made-up taxonomy tags, and out-of-range macro
// estimates being persisted.
import { strict as assert } from "node:assert";
import {
  ALLOWED_ALLERGENS,
  ALLOWED_CUISINE_TAGS,
  ALLOWED_VIBE_TAGS,
  sanitizeAllergens,
  sanitizeAcceptedPatch,
  sanitizeCopy,
  detectMissingFields,
  type AcceptCopyInput,
} from "./menuCopy";

type MenuItemLike = Parameters<typeof sanitizeCopy>[1];

function vegItem(over: Partial<MenuItemLike> = {}): MenuItemLike {
  return {
    id: 1,
    slug: "test-veg",
    name: "Test Veg Bowl",
    description: "",
    pricePaise: 25000,
    category: "bowls",
    kitchenLocation: "default",
    isVeg: true,
    isAvailable: true,
    availabilityWindow: null,
    tags: ["paneer", "rice"],
    imageUrl: null,
    longDescription: null,
    allergens: null,
    cuisineTags: null,
    vibeTags: null,
    seoTitle: null,
    seoDescription: null,
    macros: null,
    macrosAreEstimate: true,
    copyGeneratedAt: null,
    copyGeneratedBy: null,
    unavailableReason: null,
    unavailableUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as MenuItemLike;
}

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${(err as Error).message}`);
    failed++;
  }
}

console.log("\n[eval] menu copywriter safety rails\n");

test("sanitizeAllergens drops invented allergens", () => {
  const r = sanitizeAllergens(
    ["milk", "magic_dust", "uranium", "egg"],
    true,
  );
  assert.deepEqual(r.allergens, ["milk", "egg"]);
  assert.equal(r.warnings.length, 2);
});

test("sanitizeAllergens drops fish/shellfish on veg items", () => {
  const r = sanitizeAllergens(["milk", "fish", "shellfish"], true);
  assert.deepEqual(r.allergens, ["milk"]);
  assert.ok(r.warnings.some((w) => w.includes("fish")));
});

test("sanitizeAllergens normalises casing and dedupes", () => {
  const r = sanitizeAllergens(
    ["MILK", "  Tree Nuts ", "milk", "MILK"],
    false,
  );
  assert.deepEqual(r.allergens, ["milk", "tree_nuts"]);
});

test("sanitizeCopy on model output drops made-up cuisine tags", () => {
  const r = sanitizeCopy(
    { cuisineTags: ["north_indian", "alien_fusion", "italian"] },
    vegItem(),
    ["cuisineTags"],
  );
  assert.deepEqual(r.proposed.cuisineTags, ["north_indian", "italian"]);
  assert.ok(r.warnings.some((w) => w.includes("alien_fusion")));
});

test("sanitizeCopy clamps overlong description", () => {
  const long = "x".repeat(2000);
  const r = sanitizeCopy({ description: long }, vegItem(), ["description"]);
  assert.ok((r.proposed.description ?? "").length <= 140);
});

test("sanitizeCopy rejects out-of-range macros", () => {
  const r = sanitizeCopy(
    { macros: { kcal: 99999, proteinG: 1, carbsG: 1, fatG: 1 } },
    vegItem(),
    ["macros"],
  );
  assert.equal(r.proposed.macros, undefined);
  assert.ok(r.warnings.some((w) => w.includes("macros")));
});

test("sanitizeCopy rounds well-formed macros", () => {
  const r = sanitizeCopy(
    { macros: { kcal: 510.7, proteinG: 22.3, carbsG: 60.1, fatG: 14.9 } },
    vegItem(),
    ["macros"],
  );
  assert.deepEqual(r.proposed.macros, {
    kcal: 511,
    proteinG: 22,
    carbsG: 60,
    fatG: 15,
  });
});

test("sanitizeAcceptedPatch (apply path) blocks injected allergens", () => {
  const patch: AcceptCopyInput = {
    allergens: ["milk", "anthrax", "<script>", "peanut"],
  };
  const r = sanitizeAcceptedPatch(patch, true);
  assert.deepEqual(r.patch.allergens, ["milk", "peanut"]);
  assert.ok(r.warnings.length >= 2);
});

test("sanitizeAcceptedPatch (apply path) blocks fish on veg item", () => {
  const r = sanitizeAcceptedPatch(
    { allergens: ["fish", "shellfish", "milk"] },
    true,
  );
  assert.deepEqual(r.patch.allergens, ["milk"]);
});

test("sanitizeAcceptedPatch (apply path) blocks invented vibe/cuisine tags", () => {
  const r = sanitizeAcceptedPatch(
    {
      cuisineTags: ["north_indian", "made_up_cuisine"],
      vibeTags: ["comfort", "magic_glow"],
    },
    false,
  );
  assert.deepEqual(r.patch.cuisineTags, ["north_indian"]);
  assert.deepEqual(r.patch.vibeTags, ["comfort"]);
  assert.ok(r.warnings.length >= 2);
});

test("sanitizeAcceptedPatch (apply path) rejects out-of-range macros", () => {
  const r = sanitizeAcceptedPatch(
    { macros: { kcal: 999999, proteinG: 1, carbsG: 1, fatG: 1 } },
    true,
  );
  assert.equal(r.patch.macros, undefined);
  assert.ok(r.warnings.some((w) => w.includes("macros")));
});

test("detectMissingFields flags everything missing on a fresh item", () => {
  const missing = detectMissingFields(vegItem());
  for (const f of [
    "longDescription",
    "allergens",
    "cuisineTags",
    "vibeTags",
    "macros",
    "seoTitle",
    "seoDescription",
  ]) {
    assert.ok(missing.includes(f as never), `expected ${f} in missing`);
  }
});

test("detectMissingFields treats empty arrays as missing", () => {
  const missing = detectMissingFields(
    vegItem({
      allergens: [],
      cuisineTags: ["north_indian"],
    }),
  );
  assert.ok(missing.includes("allergens"));
  assert.ok(!missing.includes("cuisineTags"));
});

test("ALLOWED_* whitelists are non-empty and non-overlapping where it matters", () => {
  assert.ok(ALLOWED_ALLERGENS.length >= 10);
  assert.ok(ALLOWED_CUISINE_TAGS.length >= 8);
  assert.ok(ALLOWED_VIBE_TAGS.length >= 8);
});

console.log(`\n[eval] passed=${passed} failed=${failed}\n`);
if (failed > 0) process.exit(1);
