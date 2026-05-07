import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState, useCallback } from "react";

const TOKEN_KEY = "tanmatra.session_token";

let cached: string | null = null;
const listeners = new Set<() => void>();

export async function loadToken(): Promise<string | null> {
  if (cached !== null) return cached;
  const v = await AsyncStorage.getItem(TOKEN_KEY);
  cached = v;
  return v;
}

export async function saveToken(token: string | null): Promise<void> {
  cached = token;
  if (token && token.trim().length > 0) {
    await AsyncStorage.setItem(TOKEN_KEY, token.trim());
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
    cached = null;
  }
  listeners.forEach((l) => l());
}

export function getTokenSync(): string | null {
  return cached;
}

export function useAuthToken() {
  const [token, setToken] = useState<string | null>(cached);
  const [ready, setReady] = useState<boolean>(cached !== null);

  useEffect(() => {
    let mounted = true;
    loadToken().then((t) => {
      if (!mounted) return;
      setToken(t);
      setReady(true);
    });
    const onChange = () => setToken(cached);
    listeners.add(onChange);
    return () => {
      mounted = false;
      listeners.delete(onChange);
    };
  }, []);

  const update = useCallback(async (next: string | null) => {
    await saveToken(next);
    setToken(cached);
  }, []);

  return { token, ready, setToken: update };
}
