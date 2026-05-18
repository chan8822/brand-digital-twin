import type { Request } from "express";
import { db, auditLogTable } from "@workspace/db";
import type { InsertAuditLog } from "@workspace/db";

function clientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * Fire-and-forget audit log writer. Failures are logged but never rethrown —
 * an audit write failure must never block the user-facing response.
 */
export async function audit(
  req: Request,
  entry: Omit<InsertAuditLog, "ipAddress" | "createdAt">,
): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      ...entry,
      ipAddress: clientIp(req),
    });
  } catch (err) {
    req.log?.error({ err, entry }, "audit log write failed");
  }
}
