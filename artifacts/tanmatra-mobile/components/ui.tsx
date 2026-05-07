import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
  type PressableProps,
} from "react-native";

import { useColors } from "@/hooks/useColors";

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: c.radius,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const c = useColors();
  return (
    <Text
      style={[
        {
          color: c.zinc,
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Stat({
  label,
  value,
  unit,
  tint,
}: {
  label: string;
  value: string;
  unit?: string;
  tint?: string;
}) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Label>{label}</Label>
      <View
        style={{ flexDirection: "row", alignItems: "baseline", marginTop: 6 }}
      >
        <Text
          style={{
            color: tint ?? c.foreground,
            fontFamily: "Inter_700Bold",
            fontSize: 28,
            letterSpacing: -0.5,
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            style={{
              color: c.zinc,
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              marginLeft: 6,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  style,
  testID,
}: {
  title: string;
  onPress: PressableProps["onPress"];
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useColors();
  const palette: Record<
    ButtonVariant,
    { bg: string; fg: string; border: string }
  > = {
    primary: { bg: c.primary, fg: c.primaryForeground, border: c.primary },
    secondary: {
      bg: c.cardElevated,
      fg: c.foreground,
      border: c.borderStrong,
    },
    ghost: { bg: "transparent", fg: c.mutedForeground, border: c.border },
    destructive: {
      bg: c.destructiveSoft,
      fg: c.destructive,
      border: c.destructive,
    },
  };
  const p = palette[variant];
  const isDisabled = !!disabled || !!loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderRadius: c.radius,
          paddingVertical: 14,
          paddingHorizontal: 18,
          alignItems: "center",
          justifyContent: "center",
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          minHeight: 50,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <Text
          style={{
            color: p.fg,
            fontFamily: "Inter_600SemiBold",
            fontSize: 15,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Divider() {
  const c = useColors();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: c.border,
        marginVertical: 4,
      }}
    />
  );
}
