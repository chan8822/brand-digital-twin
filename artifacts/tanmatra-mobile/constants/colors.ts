const palette = {
  bg: "#050505",
  surface: "#0A0A0C",
  surfaceElevated: "#111114",
  border: "#1F1F23",
  borderStrong: "#2A2A30",
  foreground: "#FAFAFA",
  muted: "#A1A1AA",
  zinc: "#71717A",
  slate: "#334155",
  sage: "#7D9E7E",
  sageSoft: "rgba(125, 158, 126, 0.14)",
  gold: "#D4AF37",
  goldSoft: "rgba(212, 175, 55, 0.14)",
  blue: "#6BA3C8",
  blueSoft: "rgba(107, 163, 200, 0.14)",
  destructive: "#EF4444",
  destructiveSoft: "rgba(239, 68, 68, 0.12)",
};

const colors = {
  light: {
    text: palette.foreground,
    tint: palette.sage,

    background: palette.bg,
    foreground: palette.foreground,

    card: palette.surface,
    cardElevated: palette.surfaceElevated,
    cardForeground: palette.foreground,

    primary: palette.sage,
    primaryForeground: palette.bg,
    primarySoft: palette.sageSoft,

    secondary: palette.surfaceElevated,
    secondaryForeground: palette.foreground,

    muted: palette.surfaceElevated,
    mutedForeground: palette.muted,
    zinc: palette.zinc,

    accent: palette.gold,
    accentSoft: palette.goldSoft,
    accentForeground: palette.gold,

    info: palette.blue,
    infoSoft: palette.blueSoft,

    destructive: palette.destructive,
    destructiveSoft: palette.destructiveSoft,
    destructiveForeground: "#ffffff",

    border: palette.border,
    borderStrong: palette.borderStrong,
    input: palette.border,
  },

  dark: {
    text: palette.foreground,
    tint: palette.sage,

    background: palette.bg,
    foreground: palette.foreground,

    card: palette.surface,
    cardElevated: palette.surfaceElevated,
    cardForeground: palette.foreground,

    primary: palette.sage,
    primaryForeground: palette.bg,
    primarySoft: palette.sageSoft,

    secondary: palette.surfaceElevated,
    secondaryForeground: palette.foreground,

    muted: palette.surfaceElevated,
    mutedForeground: palette.muted,
    zinc: palette.zinc,

    accent: palette.gold,
    accentSoft: palette.goldSoft,
    accentForeground: palette.gold,

    info: palette.blue,
    infoSoft: palette.blueSoft,

    destructive: palette.destructive,
    destructiveSoft: palette.destructiveSoft,
    destructiveForeground: "#ffffff",

    border: palette.border,
    borderStrong: palette.borderStrong,
    input: palette.border,
  },

  radius: 14,
};

export default colors;
