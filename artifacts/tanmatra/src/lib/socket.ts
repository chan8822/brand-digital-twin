import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

// The server always mounts socket.io at /api/socket.io (see
// api-server/src/lib/realtime.ts). We deliberately do NOT prefix this
// with Vite's BASE_URL — that's for static asset paths, not for the
// socket transport URL, and prefixing produced subtle breakage when
// BASE_URL was empty or "/".
const SOCKET_PATH = "/api/socket.io";

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    path: SOCKET_PATH,
    transports: ["websocket", "polling"],
    autoConnect: true,
    withCredentials: true,
  });
  return socket;
}
