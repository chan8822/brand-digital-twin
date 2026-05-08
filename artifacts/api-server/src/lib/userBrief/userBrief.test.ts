/**
 * Pure-function tests for the redaction layer + prompt rendering.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server run test:user-brief
 *
 * No DB access — we feed a hand-crafted UserBrief that intentionally
 * contains every forbidden field to prove redaction strips them before
 * any prompt rendering.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  briefToPromptJson,
  briefToPromptMarkdown,
  findForbiddenFields,
  PROMPT_ALLOWLIST,
  redactBrief,
} from "./index";
import type { UserBrief } from "./types";

function fixtureBrief(): UserBrief {
  return {
    identity: {
      userId: "u_123",
      firstName: "Asha",
      // forbidden — must not survive redaction
      lastName: "Kumar",
      email: "asha@example.com",
      profileImageUrl: "https://cdn/x.png",
    } as unknown as UserBrief["identity"],
    preferences: {
      dietaryStyle: "vegetarian",
      allergens: ["peanuts"],
      dislikedIngredients: ["okra"],
      cuisines: ["south_indian"],
      spiceLevel: "medium",
      goal: "lose_weight",
      activityLevel: "moderate",
      calorieTarget: 1800,
      proteinTargetGrams: 90,
      carbsTargetGrams: 200,
      fatTargetGrams: 60,
      quizCompleted: true,
    },
    profile: {
      hasBirthDate: true,
      hasAnniversary: false,
      proteinGoalGrams: 90,
      proteinShortfallStreak: 2,
      birthDate: "1990-01-01",
      anniversaryDate: "2020-05-12",
    } as unknown as UserBrief["profile"],
    subscription: {
      id: 7,
      status: "active",
      cadence: "weekly",
      mealsPerDelivery: 5,
      deliveryWindow: "12:00-13:30",
      nextDeliveryAt: "2026-05-10T07:00:00.000Z",
      pricePerDeliveryRupees: 1235,
      city: "Bengaluru",
      memberCount: 2,
      // forbidden
      addressLine: "221B Baker Street",
      pincode: "560001",
      phone: "+91-9999999999",
    } as unknown as UserBrief["subscription"],
    loyalty: { creditBalanceRupees: 350.5, pendingNotifications: 1 },
    premium: {
      isPremium: true,
      currentPeriodEndIso: "2026-06-01T00:00:00.000Z",
      rdConsultsRemaining: 1,
    },
    recentOrders: [
      {
        id: 4001,
        status: "delivered",
        totalRupees: 540,
        itemCount: 2,
        topItems: ["Quinoa Khichdi", "Tomato Basil Soup"],
        placedAtIso: "2026-05-07T10:00:00.000Z",
        fulfillmentType: "delivery",
        // forbidden — order rows have these in real life
        deliveryInstructions: "Leave at gate, code 4422",
        addressLine: "221B Baker Street",
        phone: "+91-9999999999",
      } as unknown as NonNullable<UserBrief["recentOrders"]>[number],
    ],
    wellness: {
      calorieTarget: 1800,
      proteinTargetGrams: 90,
      todayCalories: 420,
      todayProteinGrams: 22,
      todayWaterMl: 800,
      proteinStreakDays: 3,
      vegStreakDays: 5,
    },
    context: {
      timezone: "Asia/Kolkata",
      localDate: "2026-05-08",
      localHour: 12,
      timeOfDay: "afternoon",
      city: "Bengaluru",
    },
    loadedSections: [
      "identity",
      "preferences",
      "profile",
      "subscription",
      "loyalty",
      "premium",
      "recentOrders",
      "wellness",
      "context",
    ],
    assembledAtIso: "2026-05-08T06:30:00.000Z",
  };
}

test("redactBrief drops every forbidden field", () => {
  const r = redactBrief(fixtureBrief());
  const hits = findForbiddenFields(r);
  assert.deepEqual(
    hits,
    [],
    `forbidden fields leaked into redacted brief: ${hits.join(", ")}`,
  );
});

test("redactBrief keeps only allowlisted keys per section", () => {
  const r = redactBrief(fixtureBrief());
  assert.deepEqual(
    Object.keys(r.identity).sort(),
    [...PROMPT_ALLOWLIST.identity].sort(),
  );
  assert.deepEqual(
    Object.keys(r.subscription!).sort(),
    [...PROMPT_ALLOWLIST.subscription].sort(),
  );
  assert.deepEqual(
    Object.keys(r.profile!).sort(),
    [...PROMPT_ALLOWLIST.profile].sort(),
  );
  assert.deepEqual(
    Object.keys(r.recentOrders![0]).sort(),
    [...PROMPT_ALLOWLIST.recentOrder].sort(),
  );
});

test("briefToPromptMarkdown never contains forbidden values", () => {
  const md = briefToPromptMarkdown(fixtureBrief());
  for (const needle of [
    "221B Baker Street",
    "560001",
    "+91-9999999999",
    "asha@example.com",
    "Kumar",
    "1990-01-01",
    "2020-05-12",
    "Leave at gate",
    "https://cdn/x.png",
  ]) {
    assert.equal(
      md.includes(needle),
      false,
      `markdown leaked forbidden value: ${needle}`,
    );
  }
  // sanity — allowed values do appear
  assert.ok(md.includes("Bengaluru"));
  assert.ok(md.includes("Asha"));
  assert.ok(md.includes("vegetarian"));
});

test("briefToPromptJson never contains forbidden values", () => {
  const json = briefToPromptJson(fixtureBrief());
  for (const needle of [
    "221B Baker Street",
    "560001",
    "+91-9999999999",
    "asha@example.com",
    "Kumar",
    "Leave at gate",
  ]) {
    assert.equal(json.includes(needle), false, `json leaked: ${needle}`);
  }
});

test("redactBrief tolerates null sections", () => {
  const empty: UserBrief = {
    ...fixtureBrief(),
    preferences: null,
    profile: null,
    subscription: null,
    loyalty: null,
    premium: null,
    recentOrders: null,
    wellness: null,
  };
  const r = redactBrief(empty);
  assert.equal(r.preferences, null);
  assert.equal(r.subscription, null);
  assert.equal(r.recentOrders, null);
  // markdown still renders without throwing
  const md = briefToPromptMarkdown(empty);
  assert.ok(md.includes("## User context"));
});
