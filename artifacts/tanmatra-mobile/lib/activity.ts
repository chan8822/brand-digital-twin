import { Platform } from "react-native";
import type { WearableProvider } from "@workspace/api-client-react";

export function defaultProvider(): WearableProvider {
  return Platform.OS === "android" ? "google_fit" : "apple_health";
}

export function providerLabel(p: WearableProvider): string {
  return p === "apple_health" ? "Apple Health" : "Google Fit / Health Connect";
}

export interface DailyActivity {
  steps: number;
  activityKcal: number;
}

/**
 * Native HealthKit / Health Connect modules are not linked into Expo Go.
 * We lazy-require them inside try/catch so the JS bundle still loads under
 * Expo Go (and on web), and only the actual `read*Activity` calls fail.
 *
 * For real device integration, build a custom dev client — the config
 * plugins in app.json then provision the iOS HealthKit entitlement +
 * Info.plist usage strings, and the Android Health Connect intent
 * filter + permissions.
 */

type AppleHealthKit = {
  initHealthKit: (
    permissions: unknown,
    cb: (err: string | null) => void,
  ) => void;
  getStepCount: (
    options: { date: string },
    cb: (err: string | null, results: { value: number }) => void,
  ) => void;
  getActiveEnergyBurned: (
    options: { startDate: string; endDate: string },
    cb: (
      err: string | null,
      results: Array<{ value: number }>,
    ) => void,
  ) => void;
  Constants: {
    Permissions: { Steps: string; ActiveEnergyBurned: string };
  };
};

function loadAppleHealth(): AppleHealthKit | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-health");
    const ahk: AppleHealthKit = mod?.default ?? mod;
    if (
      !ahk ||
      typeof ahk.initHealthKit !== "function" ||
      typeof ahk.getStepCount !== "function"
    ) {
      return null;
    }
    return ahk;
  } catch {
    return null;
  }
}

function loadHealthConnect():
  | typeof import("react-native-health-connect")
  | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-health-connect");
  } catch {
    return null;
  }
}

export function nativeHealthAvailable(): boolean {
  if (Platform.OS === "ios") return loadAppleHealth() !== null;
  if (Platform.OS === "android") return loadHealthConnect() !== null;
  return false;
}

function todayBounds(): { startISO: string; endISO: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

async function readApple(): Promise<DailyActivity | null> {
  const AppleHealthKit = loadAppleHealth();
  if (!AppleHealthKit) return null;

  const { Permissions } = AppleHealthKit.Constants;
  const permissions = {
    permissions: {
      read: [Permissions.Steps, Permissions.ActiveEnergyBurned],
      write: [],
    },
  };

  await new Promise<void>((resolve, reject) => {
    AppleHealthKit.initHealthKit(permissions, (err) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });

  const { startISO, endISO } = todayBounds();

  const steps = await new Promise<number>((resolve) => {
    AppleHealthKit.getStepCount({ date: startISO }, (err, result) => {
      if (err || !result) resolve(0);
      else resolve(Math.round(result.value ?? 0));
    });
  });

  const activityKcal = await new Promise<number>((resolve) => {
    AppleHealthKit.getActiveEnergyBurned(
      { startDate: startISO, endDate: endISO },
      (err, results) => {
        if (err || !Array.isArray(results)) resolve(0);
        else {
          const total = results.reduce(
            (sum, r) => sum + (r.value ?? 0),
            0,
          );
          resolve(Math.round(total));
        }
      },
    );
  });

  return { steps, activityKcal };
}

async function readAndroid(): Promise<DailyActivity | null> {
  const HC = loadHealthConnect();
  if (!HC) return null;

  const initialized = await HC.initialize();
  if (!initialized) return null;

  const granted = await HC.requestPermission([
    { accessType: "read", recordType: "Steps" },
    { accessType: "read", recordType: "ActiveCaloriesBurned" },
  ]);

  const hasSteps = granted.some(
    (p: { recordType: string }) => p.recordType === "Steps",
  );
  const hasKcal = granted.some(
    (p: { recordType: string }) => p.recordType === "ActiveCaloriesBurned",
  );

  const { startISO, endISO } = todayBounds();
  const timeRangeFilter = {
    operator: "between" as const,
    startTime: startISO,
    endTime: endISO,
  };

  let steps = 0;
  if (hasSteps) {
    const res = await HC.readRecords("Steps", { timeRangeFilter });
    const records = (res as { records: Array<{ count: number }> }).records;
    steps = records.reduce((sum, r) => sum + (r.count ?? 0), 0);
  }

  let activityKcal = 0;
  if (hasKcal) {
    const res = await HC.readRecords("ActiveCaloriesBurned", {
      timeRangeFilter,
    });
    const records = (
      res as {
        records: Array<{ energy: { inKilocalories: number } }>;
      }
    ).records;
    activityKcal = Math.round(
      records.reduce(
        (sum, r) => sum + (r.energy?.inKilocalories ?? 0),
        0,
      ),
    );
  }

  return { steps, activityKcal };
}

/**
 * Read today's step + active-energy totals from the device's native health
 * store. Returns null when:
 * - running on web,
 * - running in Expo Go (native modules not linked),
 * - the user denies permission, or
 * - Health Connect / HealthKit is not available on the device.
 *
 * The UI falls back to manual entry in any of these cases.
 */
export async function readTodayActivity(): Promise<DailyActivity | null> {
  try {
    if (Platform.OS === "ios") return await readApple();
    if (Platform.OS === "android") return await readAndroid();
    return null;
  } catch {
    return null;
  }
}
