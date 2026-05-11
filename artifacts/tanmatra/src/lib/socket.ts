import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./apiBase";

let socket: Socket | null = null;

// The server mounts socket.io at /api/socket.io (see
// api-server/src/lib/realtime.ts). When the SPA and API are on the same
// origin (dev / single-deploy), io() with no URL connects to the page
// origin and we just point `path` at /api/socket.io. When the API is on
// a different origin (e.g. tanmatra.food → wellness-foods.run.app via
// VITE_API_BASE), we derive the API origin from API_BASE and point `path`
// at the socket route relative to that origin.
function deriveSocketTarget(): { url: string | undefined; path: string } {
  // API_BASE is either an absolute URL ("https://host/api") or a relative
  // path like "/api". For the relative case, leave url undefined so
  // socket.io connects to window.location.origin.
  if (/^https?:\/\//i.test(API_BASE)) {
    const u = new URL(API_BASE);
    const apiPath = u.pathname.replace(/\/+$/, ""); // e.g. "/api"
    return {
      url: u.origin,
      path: `${apiPath}/socket.io`,
    };
  }
  const apiPath = API_BASE.replace(/\/+$/, "");
  return { url: undefined, path: `${apiPath}/socket.io` };
}

export function getSocket(): Socket {
  if (socket) return socket;
  const { url, path } = deriveSocketTarget();
  socket = url
    ? io(url, {
        path,
        transports: ["websocket", "polling"],
        autoConnect: true,
        withCredentials: true,
      })
    : io({
        path,
        transports: ["websocket", "polling"],
        autoConnect: true,
        withCredentials: true,
      });
  return socket;
}
