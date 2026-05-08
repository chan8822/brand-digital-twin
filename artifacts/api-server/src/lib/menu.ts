import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import {
  db,
  menuItemsTable,
  type MenuItem,
} from "@workspace/db";

type InsertMenuItem = typeof menuItemsTable.$inferInsert;

export type AvailabilitySlot = "breakfast" | "lunch" | "dinner" | "all_day";

export interface ListFilter {
  category?: string;
  kitchenLocation?: string;
  available?: boolean;
  q?: string;
  slugs?: string[];
}

function whereForFilter(filter: ListFilter) {
  const conds = [];
  if (filter.category) conds.push(eq(menuItemsTable.category, filter.category));
  if (filter.kitchenLocation)
    conds.push(eq(menuItemsTable.kitchenLocation, filter.kitchenLocation));
  if (typeof filter.available === "boolean")
    conds.push(eq(menuItemsTable.isAvailable, filter.available));
  if (filter.q) conds.push(ilike(menuItemsTable.name, `%${filter.q}%`));
  if (filter.slugs && filter.slugs.length > 0)
    conds.push(inArray(menuItemsTable.slug, filter.slugs));
  return conds.length > 0 ? and(...conds) : undefined;
}

export async function listMenuItems(filter: ListFilter = {}): Promise<MenuItem[]> {
  const w = whereForFilter(filter);
  const base = db.select().from(menuItemsTable);
  return w
    ? await base.where(w).orderBy(asc(menuItemsTable.name)).limit(500)
    : await base.orderBy(asc(menuItemsTable.name)).limit(500);
}

export async function findBySlug(slug: string): Promise<MenuItem | null> {
  const [row] = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function previewMatchingItems(
  filter: ListFilter,
): Promise<MenuItem[]> {
  return listMenuItems(filter);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

export interface CreateInput {
  name: string;
  pricePaise: number;
  category: string;
  kitchenLocation?: string;
  isVeg?: boolean;
  description?: string;
  availabilityWindow?: AvailabilitySlot[] | null;
  tags?: string[];
  imageUrl?: string | null;
  slug?: string;
}

export async function createMenuItem(input: CreateInput): Promise<MenuItem> {
  const slug = (input.slug && slugify(input.slug)) || slugify(input.name);
  if (!slug) throw new Error("invalid name/slug");
  const values: InsertMenuItem = {
    slug,
    name: input.name,
    description: input.description ?? "",
    pricePaise: input.pricePaise,
    category: input.category,
    kitchenLocation: input.kitchenLocation ?? "default",
    isVeg: input.isVeg ?? true,
    isAvailable: true,
    availabilityWindow:
      input.availabilityWindow && input.availabilityWindow.length > 0
        ? input.availabilityWindow
        : null,
    tags: input.tags ?? null,
    imageUrl: input.imageUrl ?? null,
  };
  const [row] = await db.insert(menuItemsTable).values(values).returning();
  if (!row) throw new Error("insert failed");
  return row;
}

export async function updatePrice(
  slug: string,
  pricePaise: number,
): Promise<MenuItem | null> {
  const [row] = await db
    .update(menuItemsTable)
    .set({ pricePaise })
    .where(eq(menuItemsTable.slug, slug))
    .returning();
  return row ?? null;
}

export async function setAvailability(
  slug: string,
  available: boolean,
  reason: string | null,
  unavailableUntil: Date | null,
): Promise<MenuItem | null> {
  const [row] = await db
    .update(menuItemsTable)
    .set({
      isAvailable: available,
      unavailableReason: available ? null : reason,
      unavailableUntil: available ? null : unavailableUntil,
    })
    .where(eq(menuItemsTable.slug, slug))
    .returning();
  return row ?? null;
}

export async function setImage(
  slug: string,
  imageUrl: string,
): Promise<MenuItem | null> {
  const [row] = await db
    .update(menuItemsTable)
    .set({ imageUrl })
    .where(eq(menuItemsTable.slug, slug))
    .returning();
  return row ?? null;
}

export async function bulkSetAvailability(
  filter: ListFilter,
  available: boolean,
  reason: string | null,
  unavailableUntil: Date | null,
): Promise<{ matched: number; updated: MenuItem[] }> {
  const targets = await listMenuItems(filter);
  if (targets.length === 0) return { matched: 0, updated: [] };
  const slugs = targets.map((t) => t.slug);
  const updated = await db
    .update(menuItemsTable)
    .set({
      isAvailable: available,
      unavailableReason: available ? null : reason,
      unavailableUntil: available ? null : unavailableUntil,
    })
    .where(inArray(menuItemsTable.slug, slugs))
    .returning();
  return { matched: targets.length, updated };
}

export interface UpdateInput {
  name?: string;
  description?: string;
  category?: string;
  kitchenLocation?: string;
  isVeg?: boolean;
  availabilityWindow?: AvailabilitySlot[] | null;
  tags?: string[] | null;
}

export async function updateItem(
  slug: string,
  patch: UpdateInput,
): Promise<MenuItem | null> {
  const set: Record<string, unknown> = {};
  if (patch.name != null) set["name"] = patch.name;
  if (patch.description != null) set["description"] = patch.description;
  if (patch.category != null) set["category"] = patch.category;
  if (patch.kitchenLocation != null)
    set["kitchenLocation"] = patch.kitchenLocation;
  if (patch.isVeg != null) set["isVeg"] = patch.isVeg;
  if (patch.availabilityWindow !== undefined)
    set["availabilityWindow"] =
      patch.availabilityWindow && patch.availabilityWindow.length > 0
        ? patch.availabilityWindow
        : null;
  if (patch.tags !== undefined)
    set["tags"] = patch.tags && patch.tags.length > 0 ? patch.tags : null;
  if (Object.keys(set).length === 0) return findBySlug(slug);
  const [row] = await db
    .update(menuItemsTable)
    .set(set)
    .where(eq(menuItemsTable.slug, slug))
    .returning();
  return row ?? null;
}

export async function summarizeForPreview(items: MenuItem[]): Promise<{
  count: number;
  byCategory: Record<string, number>;
  byKitchen: Record<string, number>;
  examples: Array<{ slug: string; name: string; price: number }>;
}> {
  const byCategory: Record<string, number> = {};
  const byKitchen: Record<string, number> = {};
  for (const it of items) {
    byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
    byKitchen[it.kitchenLocation] = (byKitchen[it.kitchenLocation] ?? 0) + 1;
  }
  return {
    count: items.length,
    byCategory,
    byKitchen,
    examples: items.slice(0, 5).map((it) => ({
      slug: it.slug,
      name: it.name,
      price: it.pricePaise / 100,
    })),
  };
}

export const _internal = { sql };
