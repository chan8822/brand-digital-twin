import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  socket = io({
    path: `${base}/api/socket.io`,
    transports: ["websocket", "polling"],
    autoConnect: true,
  });
  return socket;
}
