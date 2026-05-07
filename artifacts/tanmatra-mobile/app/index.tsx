import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getGetWellnessTodayQueryKey,
  useConnectWearable,
  useDisconnectWearable,
  useGetWellnessToday,
  useSyncWearable,
  type WearableLink,
} from "@workspace/api-client-react";

import { Button, Card, Divider, Label, Stat } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useAuthToken } from "@/lib/auth";
import {
  defaultProvider,
  nativeHealthAvailable,
  providerLabel,
  readTodayActivity,
} from "@/lib/activity";

function clampInt(raw: string, max: number): number {
  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never synced";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomPad = isWeb ? Math.max(insets.bottom, 34) : insets.bottom + 16;

  const { token, ready: tokenReady, setToken } = useAuthToken();
  const [tokenInput, setTokenInput] = useState("");

  const provider = useMemo(() => defaultProvider(), []);
  const queryClient = useQueryClient();
  const todayKey = getGetWellnessTodayQueryKey();

  const todayQuery = useGetWellnessToday({
    query: { enabled: !!token, queryKey: todayKey },
  });

  const connect = useConnectWearable();
  const disconnect = useDisconnectWearable();
  const sync = useSyncWearable();

  const wearableLink: WearableLink | undefined = todayQuery.data?.wearables?.find(
    (w) => w.provider === provider,
  );
  const isConnected = !!wearableLink?.connected;

  const [stepsInput, setStepsInput] = useState("");
  const [kcalInput, setKcalInput] = useState("");

  const refreshAll = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: todayKey });
  }, [queryClient, todayKey]);

  const handleSaveToken = useCallback(async () => {
    const trimmed = tokenInput.trim();
    if (trimmed.length < 8) {
      Alert.alert("Invalid token", "Paste the device pairing token from the web app.");
      return;
    }
    await setToken(trimmed);
    setTokenInput("");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refreshAll();
  }, [tokenInput, setToken, refreshAll]);

  const handleConnect = useCallback(async () => {
    try {
      await connect.mutateAsync({ data: { provider } });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await refreshAll();
    } catch (e) {
      Alert.alert("Connect failed", e instanceof Error ? e.message : "Unknown error");
    }
  }, [connect, provider, refreshAll]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect.mutateAsync({ data: { provider } });
      await refreshAll();
    } catch (e) {
      Alert.alert("Disconnect failed", e instanceof Error ? e.message : "Unknown error");
    }
  }, [disconnect, provider, refreshAll]);

  const handleAutoFill = useCallback(async () => {
    const reading = await readTodayActivity();
    if (!reading) {
      Alert.alert(
        "Native health source unavailable",
        `${providerLabel(provider)} requires a custom build of this app. For now, enter today's totals manually.`,
      );
      return;
    }
    setStepsInput(String(reading.steps));
    setKcalInput(String(reading.activityKcal));
  }, [provider]);

  const handleSync = useCallback(async () => {
    const steps = clampInt(stepsInput, 60000);
    const activityKcal = clampInt(kcalInput, 3000);
    if (activityKcal === 0 && steps === 0) {
      Alert.alert("Nothing to sync", "Enter today's steps or active calories first.");
      return;
    }
    try {
      await sync.mutateAsync({
        data: { provider, activityKcal, steps },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStepsInput("");
      setKcalInput("");
      await refreshAll();
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Sync failed", e instanceof Error ? e.message : "Unknown error");
    }
  }, [stepsInput, kcalInput, provider, sync, refreshAll]);

  const handleSignOut = useCallback(async () => {
    await setToken(null);
    queryClient.clear();
  }, [setToken, queryClient]);

  if (!tokenReady) {
    return <View style={{ flex: 1, backgroundColor: c.background }} />;
  }

  if (!token) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          paddingTop: topPad + 32,
          paddingBottom: bottomPad + 32,
          paddingHorizontal: 20,
          gap: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 32,
              letterSpacing: -0.8,
            }}
          >
            Tanmatra
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            Pair this device to push your daily activity from{" "}
            {providerLabel(provider)} into your wellness dashboard.
          </Text>
        </View>

        <Card>
          <Label>Device pairing token</Label>
          <TextInput
            value={tokenInput}
            onChangeText={setTokenInput}
            placeholder="Paste token from web → Settings"
            placeholderTextColor={c.zinc}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={{
              marginTop: 12,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.borderStrong,
              borderRadius: c.radius,
              paddingHorizontal: 14,
              paddingVertical: 14,
              color: c.foreground,
              backgroundColor: c.cardElevated,
              fontFamily: "Inter_500Medium",
              fontSize: 14,
            }}
          />
          <View style={{ height: 14 }} />
          <Button title="Pair device" onPress={handleSaveToken} testID="pair-button" />
          <View style={{ height: 12 }} />
          <Text
            style={{
              color: c.zinc,
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            On the Tanmatra web app, sign in and copy your session token from
            the wellness settings page.
          </Text>
        </Card>
      </ScrollView>
    );
  }

  const totals = todayQuery.data?.totals;
  const targets = todayQuery.data?.targets;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: topPad + 16,
        paddingBottom: bottomPad + 24,
        paddingHorizontal: 20,
        gap: 16,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={todayQuery.isFetching}
          onRefresh={refreshAll}
          tintColor={c.primary}
        />
      }
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View>
          <Label>Today</Label>
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 26,
              letterSpacing: -0.5,
              marginTop: 4,
            }}
          >
            Activity sync
          </Text>
        </View>
        <Feather
          name="log-out"
          size={20}
          color={c.zinc}
          onPress={handleSignOut}
          testID="signout-button"
          style={{ padding: 8 }}
        />
      </View>

      {todayQuery.isError ? (
        <Card style={{ borderColor: c.destructive }}>
          <Text
            style={{
              color: c.destructive,
              fontFamily: "Inter_500Medium",
              fontSize: 14,
            }}
          >
            Couldn't reach the wellness API. Pull to retry, or re-pair your
            device.
          </Text>
        </Card>
      ) : null}

      <Card>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: isConnected ? c.primarySoft : c.cardElevated,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather
              name={provider === "apple_health" ? "heart" : "activity"}
              size={18}
              color={isConnected ? c.primary : c.zinc}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
              }}
            >
              {providerLabel(provider)}
            </Text>
            <Text
              style={{
                color: c.zinc,
                fontFamily: "Inter_400Regular",
                fontSize: 12,
                marginTop: 2,
              }}
            >
              {isConnected
                ? `Last sync · ${relativeTime(wearableLink?.lastSyncedAt)}`
                : "Not connected"}
            </Text>
          </View>
          {isConnected ? (
            <Button
              title="Disconnect"
              variant="ghost"
              onPress={handleDisconnect}
              loading={disconnect.isPending}
              style={{ paddingHorizontal: 14, paddingVertical: 10, minHeight: 0 }}
            />
          ) : (
            <Button
              title="Connect"
              onPress={handleConnect}
              loading={connect.isPending}
              style={{ paddingHorizontal: 16, paddingVertical: 10, minHeight: 0 }}
            />
          )}
        </View>
      </Card>

      <Card>
        <Label>Today's totals</Label>
        <View style={{ height: 14 }} />
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Stat
            label="Steps"
            value={(wearableLink?.lastSteps ?? 0).toLocaleString()}
            tint={c.primary}
          />
          <Stat
            label="Active"
            value={String(wearableLink?.lastActivityKcal ?? 0)}
            unit="kcal"
            tint={c.accentForeground}
          />
        </View>
        <View style={{ height: 16 }} />
        <Divider />
        <View style={{ height: 12 }} />
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Stat
            label="Calories in"
            value={String(Math.round(totals?.calories ?? 0))}
            unit={`/ ${targets?.effectiveCalorieTarget ?? targets?.calorieTarget ?? 0}`}
          />
          <Stat
            label="Protein"
            value={String(Math.round(totals?.proteinGrams ?? 0))}
            unit={`/ ${targets?.proteinTargetGrams ?? 0} g`}
          />
        </View>
      </Card>

      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Label>Push activity</Label>
          {nativeHealthAvailable() ? (
            <Feather
              name="refresh-cw"
              size={16}
              color={c.primary}
              onPress={handleAutoFill}
              style={{ padding: 6 }}
            />
          ) : null}
        </View>

        <View style={{ height: 14 }} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: c.zinc,
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              Steps
            </Text>
            <TextInput
              value={stepsInput}
              onChangeText={setStepsInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={c.zinc}
              style={{
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: c.borderStrong,
                borderRadius: c.radius,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: c.foreground,
                backgroundColor: c.cardElevated,
                fontFamily: "Inter_600SemiBold",
                fontSize: 18,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: c.zinc,
                fontFamily: "Inter_500Medium",
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              Active kcal
            </Text>
            <TextInput
              value={kcalInput}
              onChangeText={setKcalInput}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={c.zinc}
              style={{
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: c.borderStrong,
                borderRadius: c.radius,
                paddingHorizontal: 14,
                paddingVertical: 12,
                color: c.foreground,
                backgroundColor: c.cardElevated,
                fontFamily: "Inter_600SemiBold",
                fontSize: 18,
              }}
            />
          </View>
        </View>

        <View style={{ height: 16 }} />
        <Button
          title={isConnected ? "Sync to Tanmatra" : "Connect first"}
          onPress={handleSync}
          loading={sync.isPending}
          disabled={!isConnected}
          testID="sync-button"
        />

        <View style={{ height: 12 }} />
        <Text
          style={{
            color: c.zinc,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {nativeHealthAvailable()
            ? `Tap refresh to auto-fill from ${providerLabel(provider)}.`
            : `Auto-fill from ${providerLabel(provider)} requires a custom build of the app. Enter totals manually for now.`}
        </Text>
      </Card>
    </ScrollView>
  );
}
