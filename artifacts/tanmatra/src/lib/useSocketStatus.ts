import { useEffect, useState } from "react";
import { getSocket } from "./socket";

export function useSocketStatus(): { connected: boolean } {
  const [connected, setConnected] = useState<boolean>(() => {
    try {
      return getSocket().connected;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const socket = getSocket();
    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onReconnectAttempt = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect", onConnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect", onConnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
    };
  }, []);

  return { connected };
}
