import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickCohortsForPreferences } from "./cohorts";
import {
  applyDeterministicPhotoPolicy,
  applyDeterministicPolicy,
  decisionFromSeverity,
} from "./moderation";
import { computeProgress } from "./progress";

describe("pickCohortsForPreferences", () => {
  const cohorts = [
    { id: 1, active: 1, criteria: { goal: ["gain_muscle"] } },
    { id: 2, active: 1, criteria: { goal: ["lose_weight"] } },
    { id: 3, active: 1, criteria: { dietaryStyle: ["vegan", "vegetarian"] } },
    { id: 4, active: 1, criteria: { goal: ["general_wellness", "maintain"] } },
    { id: 5, active: 0, criteria: { goal: ["gain_muscle"] } }, // inactive
  ];

  it("returns no cohorts when no preferences", () => {
    assert.deepEqual(pickCohortsForPreferences(null, cohorts), []);
  });

  it("matches a muscle-builder + vegan to two cohorts", () => {
    const ids = pickCohortsForPreferences(
      { goal: "gain_muscle", dietaryStyle: "vegan" },
      cohorts,
    );
    assert.deepEqual(ids.sort(), [1, 3]);
  });

  it("ignores inactive cohorts", () => {
    const ids = pickCohortsForPreferences(
      { goal: "gain_muscle", dietaryStyle: "omnivore" },
      cohorts,
    );
    assert.deepEqual(ids, [1]);
  });

  it("matches everyday wellness to general goal", () => {
    const ids = pickCohortsForPreferences(
      { goal: "general_wellness", dietaryStyle: "omnivore" },
      cohorts,
    );
    assert.deepEqual(ids, [4]);
  });
});

describe("applyDeterministicPolicy", () => {
  it("hides slurs", () => {
    const r = applyDeterministicPolicy("kys you idiot");
    assert.equal(decisionFromSeverity(r.severity), "hidden");
    assert.ok(r.categories.includes("hate"));
  });

  it("hides medical misinformation", () => {
    const r = applyDeterministicPolicy("This shake cures diabetes overnight");
    assert.equal(decisionFromSeverity(r.severity), "hidden");
    assert.ok(r.categories.includes("medical_misinfo"));
  });

  it("flags self-harm urgently", () => {
    const r = applyDeterministicPolicy("I want to kill myself after this meal");
    assert.equal(decisionFromSeverity(r.severity), "hidden");
    assert.ok(r.categories.includes("self_harm"));
  });

  it("flags spammy promo with link", () => {
    const r = applyDeterministicPolicy(
      "Buy now at https://shady.example.com great deals",
    );
    assert.equal(decisionFromSeverity(r.severity), "flagged");
    assert.ok(r.categories.includes("spam"));
  });

  it("allows benign feedback", () => {
    const r = applyDeterministicPolicy(
      "The dal was excellent, very filling and flavourful.",
    );
    assert.equal(decisionFromSeverity(r.severity), "allowed");
    assert.equal(r.categories.length, 0);
  });

  it("flags PII", () => {
    const r = applyDeterministicPolicy("Call me at 9876543210 to chat");
    assert.equal(decisionFromSeverity(r.severity), "flagged");
    assert.ok(r.categories.includes("pii"));
  });
});

describe("computeProgress", () => {
  it("counts high-protein logs", () => {
    const r = computeProgress({
      metric: "high_protein_lunches",
      logs: [
        {
          loggedFor: "2026-05-01",
          calories: 500,
          proteinGrams: 35,
          vegServings: 1,
          source: "auto_order",
        },
        {
          loggedFor: "2026-05-02",
          calories: 400,
          proteinGrams: 20,
          vegServings: 1,
          source: "manual",
        },
      ],
      calorieFloor: null,
    });
    assert.equal(r.count, 1);
  });

  it("counts plant-forward by veg servings", () => {
    const r = computeProgress({
      metric: "plant_forward_meals",
      logs: [
        {
          loggedFor: "2026-05-01",
          calories: 0,
          proteinGrams: 0,
          vegServings: 3,
          source: "manual",
        },
        {
          loggedFor: "2026-05-02",
          calories: 0,
          proteinGrams: 0,
          vegServings: 1,
          source: "manual",
        },
      ],
      calorieFloor: null,
    });
    assert.equal(r.count, 1);
  });

  it("counts ordered_days uniquely", () => {
    const r = computeProgress({
      metric: "ordered_days",
      logs: [
        {
          loggedFor: "2026-05-01",
          calories: 0,
          proteinGrams: 0,
          vegServings: 0,
          source: "auto_order",
        },
        {
          loggedFor: "2026-05-01",
          calories: 0,
          proteinGrams: 0,
          vegServings: 0,
          source: "auto_order",
        },
        {
          loggedFor: "2026-05-02",
          calories: 0,
          proteinGrams: 0,
          vegServings: 0,
          source: "manual",
        },
      ],
      calorieFloor: null,
    });
    assert.equal(r.count, 1);
  });
});

describe("applyDeterministicPhotoPolicy", () => {
  it("allows benign https photo url", () => {
    const r = applyDeterministicPhotoPolicy(
      "https://images.example.com/dish.jpg",
    );
    assert.equal(decisionFromSeverity(r.severity), "allowed");
  });
  it("hides non-http urls", () => {
    const r = applyDeterministicPhotoPolicy("javascript:alert(1)");
    assert.equal(decisionFromSeverity(r.severity), "hidden");
    assert.ok(r.categories.includes("spam"));
  });
  it("flags messenger media urls", () => {
    const r = applyDeterministicPhotoPolicy(
      "https://t.me/some/photo.jpg",
    );
    assert.equal(decisionFromSeverity(r.severity), "flagged");
  });
  it("treats empty url as no-op", () => {
    const r = applyDeterministicPhotoPolicy("   ");
    assert.equal(decisionFromSeverity(r.severity), "allowed");
  });
});
