import type { Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { logger } from "./logger";

let io: IOServer | null = null;

export function initRealtime(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    path: "/api/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("subscribe:order", (orderId: number) => {
      if (typeof orderId === "number" && Number.isFinite(orderId)) {
        socket.join(`order:${orderId}`);
      }
    });
    socket.on("unsubscribe:order", (orderId: number) => {
      socket.leave(`order:${orderId}`);
    });
    socket.on("subscribe:riders", () => socket.join("riders"));
  });

  logger.info("Socket.IO mounted at /api/socket.io");
  return io;
}

export function emitDeliveryEvent(orderId: number, payload: Record<string, unknown>): void {
  if (!io) return;
  io.to(`order:${orderId}`).emit("delivery:event", { orderId, ...payload });
}

export function emitRiderPosition(
  riderId: number,
  pos: { lat: number; lng: number; orderId?: number },
): void {
  if (!io) return;
  io.to("riders").emit("rider:position", { riderId, ...pos });
  if (pos.orderId) {
    io.to(`order:${pos.orderId}`).emit("rider:position", { riderId, ...pos });
  }
}
