import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, userAddressesTable, addressInstructionsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { requireAuthUser } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const addressBody = z.object({
  label: z.string().trim().min(1).max(64),
  type: z.enum(["home", "work", "other"]).default("home"),
  line1: z.string().trim().min(3).max(256),
  line2: z.string().trim().max(256).optional().nullable(),
  city: z.string().trim().min(1).max(128),
  pincode: z
    .string()
    .trim()
    .regex(/^[0-9]{4,10}$/, "invalid pincode"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "invalid phone"),
  isDefault: z.boolean().optional(),
});

function serialize(row: typeof userAddressesTable.$inferSelect) {
  return {
    id: String(row.id),
    label: row.label,
    type: row.type as "home" | "work" | "other",
    line1: row.line1,
    line2: row.line2 ?? "",
    city: row.city,
    pincode: row.pincode,
    phone: row.phone,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/addresses", async (req: Request, res: Response) => {
  const userId = requireAuthUser(req, res);
  if (!userId) return;
  const rows = await db
    .select()
    .from(userAddressesTable)
    .where(eq(userAddressesTable.userId, userId))
    .orderBy(desc(userAddressesTable.isDefault), desc(userAddressesTable.id));
  res.json({ addresses: rows.map(serialize) });
});

router.post("/addresses", async (req: Request, res: Response) => {
  const userId = requireAuthUser(req, res);
  if (!userId) return;
  const parsed = addressBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "invalid payload" });
    return;
  }
  const data = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      // If this is the first address for the user, force default=true so
      // checkout always has a pre-selected option without extra UI work.
      const [existing] = await tx
        .select({ id: userAddressesTable.id })
        .from(userAddressesTable)
        .where(eq(userAddressesTable.userId, userId))
        .limit(1);
      const shouldDefault = data.isDefault === true || !existing;
      if (shouldDefault) {
        await tx
          .update(userAddressesTable)
          .set({ isDefault: false })
          .where(eq(userAddressesTable.userId, userId));
      }
      const [inserted] = await tx
        .insert(userAddressesTable)
        .values({
          userId,
          label: data.label,
          type: data.type,
          line1: data.line1,
          line2: data.line2 ?? null,
          city: data.city,
          pincode: data.pincode,
          phone: data.phone,
          isDefault: shouldDefault,
        })
        .returning();
      return inserted;
    });
    res.status(201).json({ address: serialize(result) });
  } catch (err) {
    logger.error({ err }, "failed to create address");
    res.status(500).json({ error: "failed to save address" });
  }
});

router.patch("/addresses/:id", async (req: Request, res: Response) => {
  const userId = requireAuthUser(req, res);
  if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const parsed = addressBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "invalid payload" });
    return;
  }
  const data = parsed.data;
  try {
    const updated = await db.transaction(async (tx) => {
      if (data.isDefault === true) {
        // Clearing other defaults must happen inside the same transaction so
        // we never end up with two rows marked default mid-flight.
        await tx
          .update(userAddressesTable)
          .set({ isDefault: false })
          .where(eq(userAddressesTable.userId, userId));
      }
      // If the label is being renamed, also rename the matching row in
      // address_instructions so the user's saved rider notes follow the
      // address. Without this, instructions appear "lost" after every
      // edit because that table is keyed by (userId, addressLabel).
      // Architect-flagged P0.
      if (data.label !== undefined) {
        const [prev] = await tx
          .select({ label: userAddressesTable.label })
          .from(userAddressesTable)
          .where(
            and(
              eq(userAddressesTable.id, id),
              eq(userAddressesTable.userId, userId),
            ),
          )
          .limit(1);
        if (prev && prev.label !== data.label) {
          await tx
            .update(addressInstructionsTable)
            .set({ addressLabel: data.label, updatedAt: new Date() })
            .where(
              and(
                eq(addressInstructionsTable.userId, userId),
                eq(addressInstructionsTable.addressLabel, prev.label),
              ),
            );
        }
      }
      const [row] = await tx
        .update(userAddressesTable)
        .set({
          ...(data.label !== undefined && { label: data.label }),
          ...(data.type !== undefined && { type: data.type }),
          ...(data.line1 !== undefined && { line1: data.line1 }),
          ...(data.line2 !== undefined && { line2: data.line2 ?? null }),
          ...(data.city !== undefined && { city: data.city }),
          ...(data.pincode !== undefined && { pincode: data.pincode }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userAddressesTable.id, id),
            eq(userAddressesTable.userId, userId),
          ),
        )
        .returning();
      return row;
    });
    if (!updated) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ address: serialize(updated) });
  } catch (err) {
    logger.error({ err }, "failed to update address");
    res.status(500).json({ error: "failed to update address" });
  }
});

router.delete("/addresses/:id", async (req: Request, res: Response) => {
  const userId = requireAuthUser(req, res);
  if (!userId) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  // We promote a sibling to default in the same tx so the user always has
  // a fallback selected on the next checkout. Promoting *before* delete
  // would briefly leave two defaults if the delete failed; instead we
  // delete first, then promote the most-recent sibling if needed.
  try {
    await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(userAddressesTable)
        .where(
          and(
            eq(userAddressesTable.id, id),
            eq(userAddressesTable.userId, userId),
          ),
        )
        .returning();
      if (!removed) return;
      if (removed.isDefault) {
        const [next] = await tx
          .select({ id: userAddressesTable.id })
          .from(userAddressesTable)
          .where(eq(userAddressesTable.userId, userId))
          .orderBy(desc(userAddressesTable.id))
          .limit(1);
        if (next) {
          await tx
            .update(userAddressesTable)
            .set({ isDefault: true })
            .where(eq(userAddressesTable.id, next.id));
        }
      }
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "failed to delete address");
    res.status(500).json({ error: "failed to delete address" });
  }
});

export default router;
