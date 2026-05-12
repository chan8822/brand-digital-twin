import { useEffect, useSyncExternalStore } from "react";
import { clinicalModeStore, useClinicalMode } from "./clinicalDiet";

// Manual theme override stored independently from clinicalMode so a
// clinician can pin the high-contrast theme on (or force it off) without
// affecting the underlying clinical-mode flag that drives the safety
// gate. "auto" defers to clinicalMode; "clinical" / "default" pin it.
export type ThemeChoice = "auto" | "clinical" | "default";

const THEME_KEY = "tanmatra:theme-override:v1";

function loadOverride(): ThemeChoice {
  if (typeof window === "undefined") return "auto";
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === "clinical" || v === "default" || v === "auto") return v;
  } catch {
    /* ignore */
  }
  return "auto";
}

let override: ThemeChoice = loadOverride();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export const themeOverrideStore = {
  get: (): ThemeChoice => override,
  set(choice: ThemeChoice) {
    if (override === choice) return;
    override = choice;
    try {
      window.localStorage.setItem(THEME_KEY, choice);
    } catch {
      /* ignore */
    }
    notify();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useThemeOverride(): ThemeChoice {
  return useSyncExternalStore(
    themeOverrideStore.subscribe,
    themeOverrideStore.get,
    () => "auto" as ThemeChoice,
  );
}

export function resolveTheme(
  override: ThemeChoice,
  clinicalEnabled: boolean,
): "clinical" | "default" {
  if (override === "clinical") return "clinical";
  if (override === "default") return "default";
  return clinicalEnabled ? "clinical" : "default";
}

/**
 * ThemeManager — mount once near the app root. Toggles the
 * `theme-clinical` class on <html> based on the active clinical mode
 * and the user's manual Account override. The class powers the
 * motion cap + decorative-gradient suppression rules in index.css.
 */
export function ThemeManager() {
  const { enabled } = useClinicalMode();
  const ov = useThemeOverride();
  useEffect(() => {
    if (typeof document === "undefined") return;
    const active = resolveTheme(ov, enabled);
    document.documentElement.classList.toggle(
      "theme-clinical",
      active === "clinical",
    );
  }, [enabled, ov]);
  return null;
}

// Re-export so consumers can flip clinical mode without two imports.
export { clinicalModeStore };
