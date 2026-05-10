import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Server as IOServer } from "socket.io";
import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSession, SESSION_COOKIE } from "./auth";
import { logger } from "./logger";

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k && !(k in out)) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

let io: IOServer | null = null;

interface SocketAuthState {
  userId: string | null;
  isOps: boolean;
}

function isOpsUser(userId: string | null): boolean {
  if (!userId) return false;
  const ops = (process.env["OPS_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ops.includes(userId);
}

function parseCorsAllowList(): string[] {
  const allowed = (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const replit = (process.env["REPLIT_DOMAINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((d) => [`https://${d}`, `http://${d}`]);
  return [...allowed, ...replit];
}

async function authenticate(req: IncomingMessage): Promise<SocketAuthState> {
  const parsed = parseCookieHeader(req.headers.cookie);
  const sid = parsed[SESSION_COOKIE];
  if (!sid) return { userId: null, isOps: false };
  const session = await getSession(sid);
  const userId = session?.user?.id ?? null;
  return { userId, isOps: isOpsUser(userId) };
}

export function initRealtime(httpServer: HttpServer): IOServer {
  const allowList = parseCorsAllowList();
  const isProduction = process.env["NODE_ENV"] === "production";

  io = new IOServer(httpServer, {
    path: "/api/socket.io",
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowList.includes(origin)) return cb(null, true);
        if (!isProduction && allowList.length === 0) return cb(null, true);
        cb(new Error("Origin not allowed"));
      },
      credentials: true,
    },
  });

  // Authenticate every connection once, up front. Anonymous connections
  // are still allowed (so the server can refuse subscriptions later
  // with a clean error event), but they cannot join private rooms.
  io.use(async (socket, next) => {
    try {
      const state = await authenticate(socket.request);
      socket.data.userId = state.userId;
      socket.data.isOps = state.isOps;
      next();
    } catch (err) {
      logger.error({ err }, "socket auth error");
      next(new Error("auth failed"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("subscribe:order", async (orderId: number) => {
      if (typeof orderId !== "number" || !Number.isFinite(orderId)) return;
      const userId = socket.data.userId as string | null;
      if (!userId && !socket.data.isOps) {
        socket.emit("subscribe:order:error", { orderId, error: "unauthenticated" });
        return;
      }
      // Ops users can subscribe to any order. Customers can only join
      // a room for an order that belongs to them.
      if (!socket.data.isOps) {
        const [row] = await db
          .select({ userId: ordersTable.userId })
          .from(ordersTable)
          .where(eq(ordersTable.id, orderId))
          .limit(1);
        if (!row || row.userId !== userId) {
          socket.emit("subscribe:order:error", { orderId, error: "forbidden" });
          return;
        }
      }
      socket.join(`order:${orderId}`);
    });
    socket.on("unsubscribe:order", (orderId: number) => {
      if (typeof orderId === "number" && Number.isFinite(orderId)) {
        socket.leave(`order:${orderId}`);
      }
    });
    socket.on("subscribe:riders", () => {
      // Rider GPS is operator-only.
      if (socket.data.isOps) socket.join("riders");
      else socket.emit("subscribe:riders:error", { error: "forbidden" });
    });
  });

  logger.info("Socket.IO mounted at /api/socket.io with auth + room scoping");
  return io;
}

export function emitDeliveryEvent(orderId: number, payload: Record<string, unknown>): void {
  if (!io) return;
  io.to(`order:${orderId}`).emit("delivery:event", { orderId, ...payload });
}

export function emitDeliveryEta(
  orderId: number,
  payload: { etaAt: string; distanceMeters: number },
): void {
  if (!io) return;
  io.to(`order:${orderId}`).emit("delivery:eta", { orderId, ...payload });
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
