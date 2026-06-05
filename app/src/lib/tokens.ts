/**
 * Design tokens mirrored from the marketing `index.html` so marketing → app
 * feels continuous. Keep in sync if the LP palette changes.
 */
export const tokens = {
  colors: {
    bg: "#0a0a0a", // neutral-950
    surface: "#141414", // card background
    border: "#262626", // neutral-800
    muted: "#525252", // neutral-600
    text: "#fafafa", // neutral-50
    textMuted: "#a3a3a3", // neutral-400
    accent: "#6366f1", // indigo-500
    accentHov: "#4f46e5", // indigo-600
    success: "#22c55e", // green-500
    warning: "#f59e0b", // amber-500
    danger: "#ef4444", // red-500
  },
  font: {
    sans: '"Plus Jakarta Sans", "Space Grotesk", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
} as const;
