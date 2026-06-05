import type { Config } from "tailwindcss";
import { tokens } from "./src/lib/tokens";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: tokens.colors.bg,
        surface: tokens.colors.surface,
        border: tokens.colors.border,
        muted: tokens.colors.muted,
        "text-primary": tokens.colors.text,
        "text-muted": tokens.colors.textMuted,
        accent: tokens.colors.accent,
        "accent-hover": tokens.colors.accentHov,
        success: tokens.colors.success,
        warning: tokens.colors.warning,
        danger: tokens.colors.danger,
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
