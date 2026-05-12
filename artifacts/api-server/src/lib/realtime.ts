import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Server as IOServer } from "socket.io";
import { db, ordersTable, rdUsersTable } from "@workspace/db";
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
  // Authenticated user is a clinician (RD) — has a row in `rd_users`.
  // Clinicians may subscribe to any patient order room so STAT cancel
  // and lifecycle updates stream live in the RD console.
  isClinician: boolean;
}

function isOpsUser(userId: string | null): boolean {
  if (!userId) return false;
  const ops = (process.env["OPS_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ops.includes(userId);
}
// Note: realtime auth uses a request-shaped helper rather than `lib/adminGate`
// because socket.io hands us a raw `IncomingMessage`, not an Express `Request`.
// The OPS_USER_IDS list semantics must stay in sync with `lib/adminGate.ts`.

function parseCorsAllowList(): string[] {
  return (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function authenticate(req: IncomingMessage): Promise<SocketAuthState> {
  const parsed = parseCookieHeader(req.headers.cookie);
  const sid = parsed[SESSION_COOKIE];
  if (!sid) return { userId: null, isOps: false, isClinician: false };
  const session = await getSession(sid);
  const userId = session?.user?.id ?? null;
  let isClinician = false;
  if (userId) {
    const rows = await db
      .select({ id: rdUsersTable.id })
      .from(rdUsersTable)
      .where(eq(rdUsersTable.userId, userId))
      .limit(1);
    isClinician = rows.length > 0;
  }
  return { userId, isOps: isOpsUser(userId), isClinician };
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
      socket.data.isClinician = state.isClinician;
      next();
    } catch (err) {
      logger.error({ err }, "socket auth error");
      next(new Error("auth failed"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("subscribe:order", async (orderId: number) => {
      if (!Number.isInteger(orderId) || orderId <= 0) return;
      const userId = socket.data.userId as string | null;
      if (!userId && !socket.data.isOps) {
        socket.emit("subscribe:order:error", { orderId, error: "unauthenticated" });
        return;
      }
      // Ops users and clinicians (RD) can subscribe to any order.
      // Customers can only join a room for an order that belongs to
      // them.
      if (!socket.data.isOps && !socket.data.isClinician) {
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
