/**
 * Pure-function tests for the B2B planner & health agent.
 *
 * Run with:
 *   node --test --import tsx ./src/lib/b2b/b2b.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TeamDietConstraints } from "@workspace/db";
import { normaliseConstraints } from "./dietSurvey";
import {
  buildDeterministicPlan,
  nextMonday,
  weekDates,
} from "./lunchPlanner";
import { bandFromScore, scoreFromDrivers } from "./accountHealth";

const baseConstraints: TeamDietConstraints = {
  headcount: 10,
  vegPct: 60,
  vegCount: 6,
  veganCount: 2,
  glutenFreeCount: 1,
  jainCount: 0,
  halalCount: 0,
  allergens: ["peanut"],
  cuisinePrefs: ["indian", "thai"],
  calorieFloor: null,
  calorieCeiling: null,
  notes: "",
};

interface SampleItem {
  id: number;
  slug: string;
  name: string;
  isVeg: boolean;
  tags: string[];
  allergens: string[];
  cuisineTags: string[];
  kcal: number | null;
  pricePaise: number;
}

const sampleItems: SampleItem[] = [
  {
    id: 1,
    slug: "paneer-bowl",
    name: "Paneer Bowl",
    isVeg: true,
    tags: ["vegan"],
    allergens: [],
    cuisineTags: ["indian"],
    kcal: 600,
    pricePaise: 25_000,
  },
  {
    id: 2,
    slug: "chicken-tikka",
    name: "Chicken Tikka",
    isVeg: false,
    tags: [],
    allergens: [],
    cuisineTags: ["indian"],
    kcal: 700,
    pricePaise: 32_000,
  },
  {
    id: 3,
    slug: "rice-noodle-salad",
    name: "Rice Noodle Salad",
    isVeg: true,
    tags: ["vegan", "gluten-free"],
    allergens: [],
    cuisineTags: ["thai"],
    kcal: 480,
    pricePaise: 22_000,
  },
  {
    id: 4,
    slug: "peanut-noodles",
    name: "Peanut Noodles",
    isVeg: true,
    tags: [],
    allergens: ["peanut"],
    cuisineTags: ["thai"],
    kcal: 550,
    pricePaise: 24_000,
  },
  {
    id: 5,
    slug: "garden-salad",
    name: "Garden Salad",
    isVeg: true,
    tags: ["vegan", "gluten-free", "jain"],
    allergens: [],
    cuisineTags: ["continental"],
    kcal: 320,
    pricePaise: 18_000,
  },
  {
    id: 6,
    slug: "fish-curry",
    name: "Fish Curry",
    isVeg: false,
    tags: [],
    allergens: ["fish"],
    cuisineTags: ["indian"],
    kcal: 720,
    pricePaise: 36_000,
  },
];

test("normaliseConstraints clamps absurd input and dedupes allergens", () => {
  const out = normaliseConstraints({
    headcount: -5,
    vegCount: 999,
    allergens: ["peanut", "Peanut", "tree nut", "garbage"],
    cuisinePrefs: ["indian", "Indian"],
    calorieFloor: 100,
    calorieCeiling: 9999,
  });
  assert.equal(out.headcount, 1);
  assert.equal(out.vegCount, 1);
  assert.deepEqual(out.allergens.slice().sort(), ["peanut", "tree_nut"]);
  assert.deepEqual(out.cuisinePrefs, ["indian"]);
  assert.equal(out.calorieFloor, 200);
  assert.equal(out.calorieCeiling, 2500);
});

test("buildDeterministicPlan excludes allergen-positive items globally", () => {
  const plan = buildDeterministicPlan({
    weekStartDate: "2026-05-11",
    constraints: baseConstraints,
    items: sampleItems,
  });
  for (const day of plan.days) {
    for (const pick of day.picks) {
      assert.notEqual(pick.slug, "peanut-noodles");
    }
  }
});

test("buildDeterministicPlan covers vegan + gluten-free needs each day", () => {
  const plan = buildDeterministicPlan({
    weekStartDate: "2026-05-11",
    constraints: baseConstraints,
    items: sampleItems,
  });
  assert.equal(plan.days.length, 5);
  for (const day of plan.days) {
    const hasVegan = day.picks.some((p) =>
      ["paneer-bowl", "rice-noodle-salad", "garden-salad"].includes(p.slug),
    );
    const hasGf = day.picks.some((p) =>
      ["rice-noodle-salad", "garden-salad"].includes(p.slug),
    );
    assert.ok(hasVegan, `day ${day.date} missing vegan pick`);
    assert.ok(hasGf, `day ${day.date} missing GF pick`);
  }
});

test("buildDeterministicPlan warns when no vegan option exists", () => {
  const plan = buildDeterministicPlan({
    weekStartDate: "2026-05-11",
    constraints: { ...baseConstraints, veganCount: 1 },
    items: sampleItems.filter((it) => !it.tags.includes("vegan")),
  });
  assert.ok(plan.days[0]!.warnings.includes("no vegan option available"));
});

test("weekDates returns 5 consecutive weekdays from a Monday", () => {
  assert.deepEqual(weekDates("2026-05-11"), [
    "2026-05-11",
    "2026-05-12",
    "2026-05-13",
    "2026-05-14",
    "2026-05-15",
  ]);
});

test("nextMonday rolls forward when called on a Friday", () => {
  // 2026-05-08 is a Friday.
  assert.equal(nextMonday(new Date("2026-05-08T12:00:00Z")), "2026-05-11");
});

test("scoreFromDrivers separates healthy from dormant accounts", () => {
  const healthy = scoreFromDrivers({
    ordersLast30: 12,
    ordersPrev30: 10,
    ordersTrendPct: 20,
    activeMembers: 18,
    totalMembers: 20,
    memberActivationPct: 90,
    budgetUtilization: 0.7,
    daysSinceLastOrder: 1,
    hasDietProfile: true,
  });
  const dormant = scoreFromDrivers({
    ordersLast30: 0,
    ordersPrev30: 4,
    ordersTrendPct: -100,
    activeMembers: 1,
    totalMembers: 20,
    memberActivationPct: 5,
    budgetUtilization: 0,
    daysSinceLastOrder: 60,
    hasDietProfile: false,
  });
  assert.ok(healthy > dormant);
  assert.match(bandFromScore(healthy), /healthy|watch/);
  assert.match(bandFromScore(dormant), /at_risk|critical/);
});

test("scoreFromDrivers clamps to [0,100]", () => {
  const insane = scoreFromDrivers({
    ordersLast30: 1000,
    ordersPrev30: 1,
    ordersTrendPct: 99_999,
    activeMembers: 1,
    totalMembers: 1,
    memberActivationPct: 100,
    budgetUtilization: 5,
    daysSinceLastOrder: 0,
    hasDietProfile: true,
  });
  assert.ok(insane <= 100 && insane >= 0);
});
