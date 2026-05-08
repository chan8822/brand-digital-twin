import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { recordOpsAction } from "../lib/opsAudit";
import { findBySlug } from "../lib/menu";
import {
  BULK_HERO_CAP,
  bulkGenerateMissingHeroesIter,
  findAssetById,
  generateHeroAsset,
  ingestUpload,
  listAssetsForSlug,
  listItemsMissingPrimary,
  reEnhanceAsset,
  removeBackgroundAsset,
  setAssetAsPrimary,
  softDeleteAsset,
} from "../lib/menuAssets";
import { serveStoredAsset } from "../lib/imageStorage";

const router: IRouter = Router();

function isCatalogRequest(req: Request): boolean {
  const adminToken = process.env["RD_ADMIN_TOKEN"];
  const headerToken = req.header("x-admin-token");
  if (adminToken && headerToken && headerToken === adminToken) return true;
  const opsAllow = (process.env["OPS_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const catalogAllow = (process.env["CATALOG_USER_IDS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    req.isAuthenticated() &&
    (catalogAllow.includes(req.user.id) || opsAllow.includes(req.user.id))
  ) {
    return true;
  }
  return false;
}

function requireCatalog(req: Request, res: Response): boolean {
  if (isCatalogRequest(req)) return true;
  res.status(403).json({ error: "catalog scope required" });
  return false;
}

function userId(req: Request): string | null {
  return req.isAuthenticated() ? (req.user.id ?? null) : null;
}

// Map asset-pipeline errors to sensible HTTP status codes. The lib throws
// plain Errors with conventional messages — we keep the mapping here so the
// libs stay framework-agnostic.
function sendAssetError(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  let code = 500;
  if (lower.includes("not found") || lower.includes("has been deleted"))
    code = 404;
  else if (
    lower.includes("belongs to slug") ||
    lower.includes("invalid") ||
    lower.includes("not supported") ||
    lower.includes("could not read") ||
    lower.includes("dimensions")
  )
    code = 400;
  res.status(code).json({ error: msg });
}

const slugParam = z.object({ slug: z.string().min(1).max(128) });
const idParam = z.object({ id: z.coerce.number().int().positive() });

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];

// Public-ish: serves bytes through the api so we don't need to make the GCS
// bucket itself public. Path is bound to the slug to make tampering obvious.
router.get(
  "/storage/menu-assets/:slug/:filename",
  async (req: Request, res: Response) => {
    const sp = z
      .object({
        slug: z.string().min(1).max(128),
        filename: z.string().min(1).max(256),
      })
      .safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid path" });
      return;
    }
    const r = await serveStoredAsset(sp.data.slug, sp.data.filename);
    if (!r) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.setHeader("Content-Type", r.mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(r.buffer);
  },
);

router.get(
  "/menu/items/:slug/assets",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = slugParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid slug" });
      return;
    }
    const assets = await listAssetsForSlug(sp.data.slug);
    res.json({ assets });
  },
);

const uploadBody = z.object({
  dataBase64: z.string().min(16),
  mimeType: z.string().refine((m) => ALLOWED_MIMES.includes(m), {
    message: "mimeType must be jpeg, png, or webp",
  }),
});

router.post(
  "/menu/items/:slug/assets/upload",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = slugParam.safeParse(req.params);
    const bp = uploadBody.safeParse(req.body);
    if (!sp.success || !bp.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const item = await findBySlug(sp.data.slug);
    if (!item) {
      res.status(404).json({ error: "item not found" });
      return;
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(bp.data.dataBase64, "base64");
    } catch {
      res.status(400).json({ error: "invalid base64" });
      return;
    }
    if (buf.length === 0 || buf.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: "image must be 1B - 10MB" });
      return;
    }
    try {
      const out = await ingestUpload({
        slug: sp.data.slug,
        buffer: buf,
        mimeType: bp.data.mimeType,
        createdBy: userId(req),
      });
      await recordOpsAction({
        operatorId: userId(req),
        agent: "cms-rest",
        action: "cms_upload_asset",
        params: {
          slug: sp.data.slug,
          mimeType: bp.data.mimeType,
          bytes: buf.length,
        },
        beforeState: null,
        afterState: { originalId: out.original.id, enhancedId: out.enhanced.id },
        status: "success",
        reasoning: "asset uploaded; enhancement pipeline applied",
      });
      res.json(out);
    } catch (err) {
      sendAssetError(res, err);
    }
  },
);

router.post(
  "/menu/assets/:id/enhance",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    try {
      const enhanced = await reEnhanceAsset({
        sourceAssetId: sp.data.id,
        createdBy: userId(req),
      });
      await recordOpsAction({
        operatorId: userId(req),
        agent: "cms-rest",
        action: "cms_enhance_asset",
        params: { sourceAssetId: sp.data.id },
        beforeState: null,
        afterState: { enhancedId: enhanced.id },
        status: "success",
        reasoning: "re-ran enhancement pipeline",
      });
      res.json({ asset: enhanced });
    } catch (err) {
      sendAssetError(res, err);
    }
  },
);

const heroBody = z
  .object({ extraInstructions: z.string().max(500).optional() })
  .default({});

router.post(
  "/menu/items/:slug/assets/hero",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = slugParam.safeParse(req.params);
    const bp = heroBody.safeParse(req.body ?? {});
    if (!sp.success || !bp.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const item = await findBySlug(sp.data.slug);
    if (!item) {
      res.status(404).json({ error: "item not found" });
      return;
    }
    try {
      const asset = await generateHeroAsset({
        item,
        extraInstructions: bp.data.extraInstructions,
        createdBy: userId(req),
      });
      await recordOpsAction({
        operatorId: userId(req),
        agent: "cms-rest",
        action: "cms_generate_hero",
        params: {
          slug: sp.data.slug,
          extra: bp.data.extraInstructions ?? null,
        },
        beforeState: null,
        afterState: { assetId: asset.id, isAiGenerated: true },
        status: "success",
        reasoning: "AI hero generated; flagged as AI-generated",
      });
      res.json({ asset });
    } catch (err) {
      sendAssetError(res, err);
    }
  },
);

router.post(
  "/menu/assets/:id/remove-bg",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    try {
      const asset = await removeBackgroundAsset({
        sourceAssetId: sp.data.id,
        createdBy: userId(req),
      });
      await recordOpsAction({
        operatorId: userId(req),
        agent: "cms-rest",
        action: "cms_remove_bg",
        params: { sourceAssetId: sp.data.id },
        beforeState: null,
        afterState: { assetId: asset.id, isAiGenerated: true },
        status: "success",
        reasoning: "AI background removal",
      });
      res.json({ asset });
    } catch (err) {
      sendAssetError(res, err);
    }
  },
);

router.post(
  "/menu/assets/:id/set-primary",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    try {
      const r = await setAssetAsPrimary({ assetId: sp.data.id });
      await recordOpsAction({
        operatorId: userId(req),
        agent: "cms-rest",
        action: "cms_set_primary_asset",
        params: { assetId: sp.data.id, slug: r.asset.slug },
        beforeState: null,
        afterState: { imageUrl: r.asset.publicUrl },
        status: "success",
        reasoning: "set asset as item primary image",
      });
      res.json(r);
    } catch (err) {
      sendAssetError(res, err);
    }
  },
);

router.delete(
  "/menu/assets/:id",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const before = await findAssetById(sp.data.id);
    if (!before) {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (before.kind === "original") {
      res
        .status(400)
        .json({ error: "cannot delete original; revert by picking a different primary" });
      return;
    }
    const row = await softDeleteAsset(sp.data.id);
    await recordOpsAction({
      operatorId: userId(req),
      agent: "cms-rest",
      action: "cms_delete_asset",
      params: { assetId: sp.data.id, slug: before.slug, kind: before.kind },
      beforeState: { assetId: before.id },
      afterState: { deletedAt: row?.deletedAt ?? null },
      status: "success",
      reasoning: "soft-deleted asset derivative",
    });
    res.json({ asset: row });
  },
);

// === Bulk: hero photos for items missing imagery =========================

router.get(
  "/menu/items/missing-images",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const filter = z
      .object({
        category: z.string().min(1).max(64).optional(),
        kitchenLocation: z.string().min(1).max(128).optional(),
      })
      .safeParse({
        category:
          typeof req.query.category === "string" && req.query.category
            ? req.query.category
            : undefined,
        kitchenLocation:
          typeof req.query.kitchenLocation === "string" &&
          req.query.kitchenLocation
            ? req.query.kitchenLocation
            : undefined,
      });
    if (!filter.success) {
      res.status(400).json({ error: "invalid filter" });
      return;
    }
    const items = await listItemsMissingPrimary(filter.data);
    res.json({
      items,
      total: items.length,
      cap: BULK_HERO_CAP,
      cappedAtCap: items.length > BULK_HERO_CAP,
    });
  },
);

const bulkHeroBody = z.object({
  slugs: z.array(z.string().min(1).max(128)).min(1).max(BULK_HERO_CAP),
  confirm: z.literal(true),
});

router.post(
  "/menu/items/assets/bulk-hero",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const bp = bulkHeroBody.safeParse(req.body);
    if (!bp.success) {
      res.status(400).json({ error: "invalid payload; need slugs + confirm:true" });
      return;
    }
    // Stream NDJSON (one JSON object per line) so the editor can show
    // per-item progress and so a flaky network only loses what hasn't been
    // flushed yet. The audit log is always written from a `finally` block —
    // even if the client disconnects mid-run — so partial work is recorded.
    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const results: Array<{
      slug: string;
      ok: boolean;
      assetId?: number;
      imageUrl?: string;
      error?: string;
    }> = [];
    let aborted = false;
    let fatalError: string | null = null;
    const onClose = () => {
      aborted = true;
    };
    req.on("close", onClose);

    const write = (event: Record<string, unknown>): void => {
      if (res.writableEnded) return;
      try {
        res.write(JSON.stringify(event) + "\n");
      } catch {
        /* socket gone; finally block handles audit */
      }
    };

    try {
      for await (const ev of bulkGenerateMissingHeroesIter({
        slugs: bp.data.slugs,
        createdBy: userId(req),
      })) {
        if (ev.type === "item") results.push(ev.result);
        write(ev);
        if (aborted) break;
      }
    } catch (err) {
      fatalError = err instanceof Error ? err.message : String(err);
      write({ type: "error", error: fatalError });
    } finally {
      const succeeded = results.filter((r) => r.ok).length;
      const failed = results.length - succeeded;
      try {
        await recordOpsAction({
          operatorId: userId(req),
          agent: "cms-rest",
          action: "cms_bulk_generate_missing_heroes",
          params: { slugs: bp.data.slugs },
          beforeState: { requested: bp.data.slugs.length },
          afterState: {
            attempted: results.length,
            succeeded,
            failed,
            aborted,
            ...(fatalError ? { fatalError } : {}),
            slugs: results.map((r) => ({
              slug: r.slug,
              ok: r.ok,
              ...(r.error ? { error: r.error } : {}),
            })),
          },
          status: fatalError ? "failure" : "success",
          reasoning: aborted
            ? `bulk AI hero generation interrupted; ${succeeded} ok / ${failed} failed before disconnect`
            : `bulk AI hero generation; ${succeeded} ok / ${failed} failed`,
        });
      } catch (auditErr) {
        req.log?.error?.(
          { err: auditErr },
          "failed to record bulk-hero audit entry",
        );
      }
      if (!res.writableEnded) {
        write({
          type: "summary",
          attempted: results.length,
          succeeded,
          failed,
          aborted,
          results,
        });
        res.end();
      }
      req.off("close", onClose);
    }
  },
);

export default router;
