import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  type AssetKind,
  type AssetProvenance,
  type MenuItemAsset,
  menuItemAssetsTable,
  menuItemsTable,
} from "@workspace/db";
import {
  generateImage,
  editImage,
} from "@workspace/integrations-gemini-ai/image";
import {
  enhanceImage,
  normaliseGenerated,
  type EnhanceResult,
} from "./imageEnhance";
import { readAssetBytes, saveAssetBytes } from "./imageStorage";
import type { MenuItem } from "@workspace/db";
import { setImage } from "./menu";

export type { EnhanceResult } from "./imageEnhance";

const HERO_PROMPT_BASE = `You are creating a hero photo for an Indian wellness food brand called Tanmatra.
Style:
- top-down 45° angle, single hero dish on a hand-thrown ceramic plate or bowl
- warm natural daylight from the upper left, soft shadows
- background: light oak wooden table, a few subtle props (linen napkin, tiny bowl of garnish)
- vibrant fresh ingredients, glistening textures, no people, no text overlay, no logo
- composition leaves a bit of negative space at the top for marketing copy
- realistic photography, NOT illustration, NOT AI-art aesthetic

Dish: %DISH%
Description: %DESC%
Tags: %TAGS%
Vegetarian: %VEG%`;

function buildHeroPrompt(item: MenuItem): string {
  return HERO_PROMPT_BASE.replaceAll("%DISH%", item.name)
    .replaceAll("%DESC%", item.description || "(no description)")
    .replaceAll("%TAGS%", (item.tags ?? []).join(", ") || "(none)")
    .replaceAll("%VEG%", item.isVeg ? "yes" : "no");
}

async function persistAsset(input: {
  slug: string;
  kind: AssetKind;
  result: EnhanceResult;
  provenance: AssetProvenance;
  sourceAssetId?: number | null;
  isAiGenerated: boolean;
  createdBy: string | null;
}): Promise<MenuItemAsset> {
  const stored = await saveAssetBytes({
    slug: input.slug,
    kind: input.kind,
    buffer: input.result.buffer,
    mimeType: input.result.mimeType,
  });
  const [row] = await db
    .insert(menuItemAssetsTable)
    .values({
      slug: input.slug,
      kind: input.kind,
      storagePath: stored.storagePath,
      publicUrl: stored.publicUrl,
      mimeType: input.result.mimeType,
      width: input.result.width,
      height: input.result.height,
      bytes: input.result.buffer.length,
      sourceAssetId: input.sourceAssetId ?? null,
      provenance: input.provenance,
      isAiGenerated: input.isAiGenerated ? 1 : 0,
      createdBy: input.createdBy,
    })
    .returning();
  if (!row) throw new Error("asset insert failed");
  return row;
}

export async function listAssetsForSlug(
  slug: string,
): Promise<MenuItemAsset[]> {
  return db
    .select()
    .from(menuItemAssetsTable)
    .where(
      and(eq(menuItemAssetsTable.slug, slug), isNull(menuItemAssetsTable.deletedAt)),
    )
    .orderBy(desc(menuItemAssetsTable.createdAt));
}

export async function findAssetById(
  id: number,
): Promise<MenuItemAsset | null> {
  const [row] = await db
    .select()
    .from(menuItemAssetsTable)
    .where(eq(menuItemAssetsTable.id, id))
    .limit(1);
  return row ?? null;
}

// Active = exists and not soft-deleted. Used by mutation helpers that must
// refuse to operate on a tombstoned row.
export async function findActiveAssetById(
  id: number,
): Promise<MenuItemAsset | null> {
  const [row] = await db
    .select()
    .from(menuItemAssetsTable)
    .where(
      and(eq(menuItemAssetsTable.id, id), isNull(menuItemAssetsTable.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

export async function softDeleteAsset(id: number): Promise<MenuItemAsset | null> {
  const [row] = await db
    .update(menuItemAssetsTable)
    .set({ deletedAt: new Date() })
    .where(eq(menuItemAssetsTable.id, id))
    .returning();
  return row ?? null;
}

// === Upload + enhancement =================================================

export async function ingestUpload(input: {
  slug: string;
  buffer: Buffer;
  mimeType: string;
  createdBy: string | null;
}): Promise<{ original: MenuItemAsset; enhanced: MenuItemAsset }> {
  if (input.buffer.length > 10 * 1024 * 1024)
    throw new Error("image larger than 10MB not supported");

  // Run the enhancement (and decode the input) BEFORE we persist anything.
  // This keeps the upload atomic from the editor's perspective: a corrupt
  // file rejects with no orphan original row.
  const enhancedResult = await enhanceImage(input.buffer);

  const original = await persistAsset({
    slug: input.slug,
    kind: "original",
    result: {
      buffer: input.buffer,
      mimeType: input.mimeType,
      width: 0,
      height: 0,
      pipeline: [],
    },
    provenance: { source: "upload", createdBy: input.createdBy },
    isAiGenerated: false,
    createdBy: input.createdBy,
  });

  let enhanced: MenuItemAsset;
  try {
    enhanced = await persistAsset({
      slug: input.slug,
      kind: "enhanced",
      result: enhancedResult,
      provenance: {
        source: "sharp-enhance",
        pipeline: enhancedResult.pipeline,
        createdBy: input.createdBy,
      },
      sourceAssetId: original.id,
      isAiGenerated: false,
      createdBy: input.createdBy,
    });
  } catch (err) {
    // Compensate: tombstone the orphan original we just wrote.
    await softDeleteAsset(original.id).catch(() => undefined);
    throw err;
  }
  return { original, enhanced };
}

// Re-run the enhancement pipeline on an existing asset (e.g. after
// adjusting the originals or re-trying a previously poor crop).
export async function reEnhanceAsset(input: {
  sourceAssetId: number;
  createdBy: string | null;
}): Promise<MenuItemAsset> {
  const src = await findAssetById(input.sourceAssetId);
  if (!src) throw new Error("source asset not found");
  const { buffer } = await readAssetBytes(src.storagePath);
  const result = await enhanceImage(buffer);
  return persistAsset({
    slug: src.slug,
    kind: "enhanced",
    result,
    provenance: {
      source: "sharp-enhance",
      pipeline: result.pipeline,
      createdBy: input.createdBy,
    },
    sourceAssetId: src.id,
    isAiGenerated: false,
    createdBy: input.createdBy,
  });
}

// === AI hero generation ===================================================

export async function generateHeroAsset(input: {
  item: MenuItem;
  extraInstructions?: string;
  createdBy: string | null;
}): Promise<MenuItemAsset> {
  const prompt =
    buildHeroPrompt(input.item) +
    (input.extraInstructions ? `\nExtra: ${input.extraInstructions}` : "");
  const ai = await generateImage(prompt);
  const buf = Buffer.from(ai.b64_json, "base64");
  const norm = await normaliseGenerated(buf, { keepTransparency: false });
  return persistAsset({
    slug: input.item.slug,
    kind: "hero",
    result: norm,
    provenance: {
      source: "ai-generate",
      model: "gemini-2.5-flash-image",
      prompt,
      createdBy: input.createdBy,
    },
    sourceAssetId: null,
    isAiGenerated: true,
    createdBy: input.createdBy,
  });
}

// === Bulk: items missing primary photo ====================================

// Cap any single bulk hero run. Image generation is slow + spendy; this also
// keeps the request well under the upstream timeout.
export const BULK_HERO_CAP = 25;

export interface MissingHeroItem {
  slug: string;
  name: string;
  category: string;
  kitchenLocation: string;
}

export async function listItemsMissingPrimary(filter: {
  category?: string;
  kitchenLocation?: string;
  slugs?: string[];
}): Promise<MissingHeroItem[]> {
  const conds = [isNull(menuItemsTable.imageUrl)];
  if (filter.category) conds.push(eq(menuItemsTable.category, filter.category));
  if (filter.kitchenLocation)
    conds.push(eq(menuItemsTable.kitchenLocation, filter.kitchenLocation));
  if (filter.slugs && filter.slugs.length > 0)
    conds.push(inArray(menuItemsTable.slug, filter.slugs));
  const rows = await db
    .select({
      slug: menuItemsTable.slug,
      name: menuItemsTable.name,
      category: menuItemsTable.category,
      kitchenLocation: menuItemsTable.kitchenLocation,
    })
    .from(menuItemsTable)
    .where(and(...conds))
    .orderBy(asc(menuItemsTable.name))
    .limit(500);
  return rows;
}

export interface BulkHeroResult {
  slug: string;
  ok: boolean;
  assetId?: number;
  imageUrl?: string;
  error?: string;
}

export type BulkHeroEvent =
  | { type: "plan"; total: number; slugs: string[] }
  | { type: "started"; slug: string; name: string; index: number; total: number }
  | { type: "item"; result: BulkHeroResult; index: number; total: number };

// Streaming variant: yields per-item events so callers can surface live
// progress and persist partial results if the run is interrupted.
export async function* bulkGenerateMissingHeroesIter(input: {
  slugs: string[];
  createdBy: string | null;
}): AsyncGenerator<BulkHeroEvent, void, void> {
  const capped = input.slugs.slice(0, BULK_HERO_CAP);
  if (capped.length === 0) {
    yield { type: "plan", total: 0, slugs: [] };
    return;
  }
  const items = await db
    .select()
    .from(menuItemsTable)
    .where(
      and(inArray(menuItemsTable.slug, capped), isNull(menuItemsTable.imageUrl)),
    );
  const seen = new Set(items.map((i) => i.slug));
  // Items missing from the DB result already have a primary (race) — emit
  // them as failures up-front so the audit log captures them.
  const skipped: BulkHeroResult[] = [];
  for (const slug of capped) {
    if (!seen.has(slug)) {
      skipped.push({ slug, ok: false, error: "already has primary image" });
    }
  }
  const total = items.length + skipped.length;
  yield {
    type: "plan",
    total,
    slugs: [...items.map((i) => i.slug), ...skipped.map((s) => s.slug)],
  };
  let index = 0;
  for (const it of items) {
    index += 1;
    yield { type: "started", slug: it.slug, name: it.name, index, total };
    let result: BulkHeroResult;
    try {
      const asset = await generateHeroAsset({
        item: it,
        createdBy: input.createdBy,
      });
      const r = await setAssetAsPrimary({
        assetId: asset.id,
        expectedSlug: it.slug,
      });
      result = {
        slug: it.slug,
        ok: true,
        assetId: asset.id,
        imageUrl: r.item?.imageUrl ?? asset.publicUrl,
      };
    } catch (err) {
      result = {
        slug: it.slug,
        ok: false,
        error: (err as Error).message,
      };
    }
    yield { type: "item", result, index, total };
  }
  for (const s of skipped) {
    index += 1;
    yield { type: "item", result: s, index, total };
  }
}

// Buffered wrapper around the iterator. Used by the AI agent which expects
// a single aggregate result; the streaming HTTP endpoint consumes the
// iterator directly.
export async function bulkGenerateMissingHeroes(input: {
  slugs: string[];
  createdBy: string | null;
}): Promise<BulkHeroResult[]> {
  const out: BulkHeroResult[] = [];
  for await (const ev of bulkGenerateMissingHeroesIter(input)) {
    if (ev.type === "item") out.push(ev.result);
  }
  return out;
}

// === Background removal ===================================================

const BG_REMOVE_PROMPT = `Remove the background completely. Keep only the food / dish in the foreground, with crisp, anti-aliased edges. The new background must be fully transparent (alpha channel). Do not add any new background, do not change colour or lighting of the dish itself, do not add shadows or props.`;

export async function removeBackgroundAsset(input: {
  sourceAssetId: number;
  createdBy: string | null;
}): Promise<MenuItemAsset> {
  const src = await findAssetById(input.sourceAssetId);
  if (!src) throw new Error("source asset not found");
  const { buffer, mimeType } = await readAssetBytes(src.storagePath);
  const ai = await editImage({
    prompt: BG_REMOVE_PROMPT,
    imageBase64: buffer.toString("base64"),
    mimeType,
  });
  const outBuf = Buffer.from(ai.b64_json, "base64");
  const norm = await normaliseGenerated(outBuf, { keepTransparency: true });
  return persistAsset({
    slug: src.slug,
    kind: "nobg",
    result: norm,
    provenance: {
      source: "ai-edit",
      model: "gemini-2.5-flash-image",
      prompt: BG_REMOVE_PROMPT,
      createdBy: input.createdBy,
    },
    sourceAssetId: src.id,
    isAiGenerated: true,
    createdBy: input.createdBy,
  });
}

// === Set primary ==========================================================

export async function setAssetAsPrimary(input: {
  assetId: number;
  expectedSlug?: string;
}): Promise<{ asset: MenuItemAsset; item: MenuItem | null }> {
  const asset = await findActiveAssetById(input.assetId);
  if (!asset) throw new Error("asset not found or has been deleted");
  if (input.expectedSlug && asset.slug !== input.expectedSlug) {
    throw new Error(
      `asset ${input.assetId} belongs to slug "${asset.slug}", not "${input.expectedSlug}"`,
    );
  }
  const item = await setImage(asset.slug, asset.publicUrl);
  return { asset, item };
}
