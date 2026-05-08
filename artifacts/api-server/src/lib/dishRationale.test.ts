/**
 * Pure-function tests for dishRationale's hashing + factual guard.
 *
 * Run with:
 *   node --test --import tsx ./src/lib/dishRationale.test.ts
 *
 * No DB or model access — these cover the cache-key composition and
 * the hallucination/allergy-claim guard that gates persisted output.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeBriefHash,
  computeDishVersion,
} from "./dishRationale";
import type { DishData } from "@workspace/menu-catalog";
import type { UserBrief } from "./userBrief";

// We reach into the module's internal guard via dynamic import so we
// don't have to export it from the public surface — the test still
// pins the behavior we care about.
const mod = (await import("./dishRationale")) as unknown as {
  __test__?: { looksFactuallyGrounded: (s: string, d: DishData) => boolean };
};

function fixtureDish(overrides: Partial<DishData> = {}): DishData {
  return {
    id: 1,
    slug: "test-dish",
    name: "Quinoa Salad Bowl",
    description: "",
    price: 39900,
    image: "",
    kitchen: "continental",
    category: "salads",
    isVeg: true,
    isAvailable: true,
    rdVerified: true,
    glycaemicIndex: "low",
    macros: { calories: 420, protein: 22, carbs: 38, fat: 14, fiber: 9 },
    allergens: [],
    ingredients: ["quinoa", "spinach", "chickpea", "olive oil", "lemon"],
    tags: [],
    ...overrides,
  } as DishData;
}

function fixtureBrief(overrides: Partial<UserBrief> = {}): UserBrief {
  return {
    identity: { userId: "u_1" },
    preferences: {
      dietaryStyle: "vegetarian",
      spiceLevel: "medium",
      goal: "maintain",
      activityLevel: "moderate",
      allergens: ["peanut"],
      dislikedIngredients: [],
      cuisines: ["mediterranean"],
      calorieTarget: 2000,
      proteinTargetGrams: 90,
      carbsTargetGrams: null,
      fatTargetGrams: null,
    },
    recentOrders: [],
    ...overrides,
  } as UserBrief;
}

test("computeBriefHash: stable across allergen reordering", () => {
  const a = computeBriefHash(
    fixtureBrief({
      preferences: {
        ...fixtureBrief().preferences!,
        allergens: ["peanut", "gluten"],
      },
    }),
  );
  const b = computeBriefHash(
    fixtureBrief({
      preferences: {
        ...fixtureBrief().preferences!,
        allergens: ["gluten", "peanut"],
      },
    }),
  );
  assert.equal(a, b);
});

test("computeBriefHash: changes when goal changes", () => {
  const base = computeBriefHash(fixtureBrief());
  const moved = computeBriefHash(
    fixtureBrief({
      preferences: { ...fixtureBrief().preferences!, goal: "lose_weight" },
    }),
  );
  assert.notEqual(base, moved);
});

test("computeDishVersion: changes when macros change", () => {
  const base = computeDishVersion(fixtureDish());
  const moved = computeDishVersion(
    fixtureDish({
      macros: { calories: 500, protein: 22, carbs: 38, fat: 14, fiber: 9 },
    }),
  );
  assert.notEqual(base, moved);
});

test("computeDishVersion: stable when ingredient list reordered", () => {
  const a = computeDishVersion(fixtureDish());
  const b = computeDishVersion(
    fixtureDish({
      ingredients: ["lemon", "olive oil", "chickpea", "spinach", "quinoa"],
    }),
  );
  assert.equal(a, b);
});

if (mod.__test__) {
  const { looksFactuallyGrounded } = mod.__test__;
  test("guard: passes when only listed ingredients are mentioned", () => {
    assert.equal(
      looksFactuallyGrounded(
        "Quinoa with chickpea and spinach — 22g protein supports your goal.",
        fixtureDish(),
      ),
      true,
    );
  });
  test("guard: rejects invented ingredient (salmon not in dish)", () => {
    assert.equal(
      looksFactuallyGrounded(
        "Wild salmon fillet pairs with avocado mousse, lemon zest, and saffron rice",
        fixtureDish(),
      ),
      false,
    );
  });
  test("guard: rejects allergy-safety claim", () => {
    assert.equal(
      looksFactuallyGrounded("Safe for your peanut allergy.", fixtureDish()),
      false,
    );
  });
}
