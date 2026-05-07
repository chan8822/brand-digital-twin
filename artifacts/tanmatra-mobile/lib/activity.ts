import { Platform } from "react-native";
import type { WearableProvider } from "@workspace/api-client-react";

export function defaultProvider(): WearableProvider {
  return Platform.OS === "android" ? "google_fit" : "apple_health";
}

export function providerLabel(p: WearableProvider): string {
  return p === "apple_health" ? "Apple Health" : "Google Fit";
}

/**
 * Read today's activity from the device's native health source.
 *
 * HealthKit (iOS) and Health Connect (Android) require a custom dev build —
 * they are not available in Expo Go. When unavailable, this returns null and
 * the UI falls back to manual entry.
 *
 * Replace the body of this function with `expo-health-connect` /
 * `react-native-health` calls in a custom build to wire up real data.
 */
export async function readTodayActivity(): Promise<{
  steps: number;
  activityKcal: number;
} | null> {
  return null;
}

export function nativeHealthAvailable(): boolean {
  return false;
}
