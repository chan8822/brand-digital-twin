import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod/v4";
import {
  bulkSetAvailability,
  createMenuItem,
  findBySlug,
  listMenuItems,
  setAvailability,
  setImage,
  updatePrice,
  updateItem,
} from "../lib/menu";
import { saveAssetBytes } from "../lib/imageStorage";
import { getMergedCatalog } from "../lib/menuResolver";
import {
  ALL_COPY_FIELDS,
  applyCopyToItem,
  detectMissingFields,
  generateCopyForItem,
  type CopyField,
} from "../lib/menuCopy";
import { recordOpsAction } from "../lib/opsAudit";
import { requireCatalog as gateRequireCatalog } from "../lib/adminGate";

const router: IRouter = Router();

function requireCatalog(req: Request, res: Response): boolean {
  return gateRequireCatalog(req, res) !== null;
}

// Public, unauthenticated catalog: merges editable DB fields (price, name,
// description, image, isAvailable, macros) on top of the static DISHES seed.
// Items only present in the DB (CMS-created) are emitted with synthetic ids
// in the 100000+ range so they don't collide with static dish ids used by
// existing carts/orders.
router.get("/menu/public", async (_req: Request, res: Response) => {
  // Patient-safety: a dish whose RD review state is anything other than
  // "reviewed" is hidden from the public catalog. Legacy curated dishes
  // have no `rdReviewState` field set and remain visible. Staff/RD
  // admin routes (e.g. /menu/items) intentionally bypass this filter so
  // pending items can still be inspected and approved.
  const dishes = await getMergedCatalog();
  const safe = dishes.filter(
    (d) => !d.rdReviewState || d.rdReviewState === "reviewed",
  );
  res.json({ dishes: safe });
});

router.get("/menu/items", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const items = await listMenuItems({
    category:
      typeof req.query.category === "string" ? req.query.category : undefined,
    kitchenLocation:
      typeof req.query.kitchen === "string" ? req.query.kitchen : undefined,
    available:
      req.query.available === "true"
        ? true
        : req.query.available === "false"
          ? false
          : undefined,
    q: typeof req.query.q === "string" ? req.query.q : undefined,
  });
  res.json({ items });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  pricePaise: z.number().int().min(0).max(10_000_000),
  category: z.string().min(1).max(64),
  kitchenLocation: z.string().max(128).optional(),
  isVeg: z.boolean().optional(),
  description: z.string().max(2000).optional(),
  availabilityWindow: z
    .array(z.enum(["breakfast", "lunch", "dinner", "all_day"]))
    .optional(),
  tags: z.array(z.string().max(64)).optional(),
  imageUrl: z.string().url().optional(),
  slug: z.string().max(128).optional(),
  allergenReviewState: z
    .enum(["pending_review", "reviewed", "blocked"])
    .optional(),
});

router.post("/menu/items", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const item = await createMenuItem(parsed.data);
    await recordOpsAction({
      operatorId: req.user?.id ?? null,
      agent: "cms-rest",
      action: "cms_create_menu_item",
      params: parsed.data,
      beforeState: null,
      afterState: { id: item.id, slug: item.slug },
      status: "success",
      reasoning: "created via REST",
    });
    res.json({ item });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const slugParam = z.object({ slug: z.string().min(1).max(128) });

router.patch("/menu/items/:slug", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const sp = slugParam.safeParse(req.params);
  const customizationSchema = z.object({
    groupName: z.string().min(1).max(120),
    type: z.enum(["single", "multiple"]),
    options: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          priceModifier: z.number().int().min(-1_000_000).max(1_000_000),
          default: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(20),
  });
  const patchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    category: z.string().min(1).max(64).optional(),
    kitchenLocation: z.string().max(128).optional(),
    isVeg: z.boolean().optional(),
    availabilityWindow: z
      .array(z.enum(["breakfast", "lunch", "dinner", "all_day"]))
      .nullable()
      .optional(),
    tags: z.array(z.string().max(64)).nullable().optional(),
    rdVerified: z.boolean().optional(),
    rdNote: z.string().max(1000).nullable().optional(),
    prepTime: z.string().max(64).nullable().optional(),
    glycaemicIndex: z.enum(["low", "medium", "high"]).nullable().optional(),
    sugarPerServing: z.string().max(64).nullable().optional(),
    ingredients: z.array(z.string().max(200)).max(50).nullable().optional(),
    customizations: z.array(customizationSchema).max(20).nullable().optional(),
    pairingSlug: z.string().max(128).nullable().optional(),
    allergenReviewState: z
      .enum(["pending_review", "reviewed", "blocked"])
      .optional(),
  });
  const bp = patchSchema.safeParse(req.body);
  if (!sp.success || !bp.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const before = await findBySlug(sp.data.slug);
  if (!before) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const item = await updateItem(sp.data.slug, bp.data);
  await recordOpsAction({
    operatorId: req.user?.id ?? null,
    agent: "cms-rest",
    action: "cms_update_menu_item",
    params: { slug: sp.data.slug, patch: bp.data },
    beforeState: before,
    afterState: item,
    status: "success",
    reasoning: "updated via REST",
  });
  res.json({ item });
});

router.post(
  "/menu/items/:slug/price",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = slugParam.safeParse(req.params);
    const bp = z
      .object({ pricePaise: z.number().int().min(0).max(10_000_000) })
      .safeParse(req.body);
    if (!sp.success || !bp.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const before = await findBySlug(sp.data.slug);
    if (!before) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const item = await updatePrice(sp.data.slug, bp.data.pricePaise);
    await recordOpsAction({
      operatorId: req.user?.id ?? null,
      agent: "cms-rest",
      action: "cms_update_price",
      params: { slug: sp.data.slug, pricePaise: bp.data.pricePaise },
      beforeState: { pricePaise: before.pricePaise },
      afterState: { pricePaise: item?.pricePaise ?? null },
      status: "success",
      reasoning: "price set via REST",
    });
    res.json({ item });
  },
);

router.post(
  "/menu/items/bulk/availability",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const bp = z
      .object({
        filter: z.object({
          category: z.string().optional(),
          kitchenLocation: z.string().optional(),
          slugs: z.array(z.string()).optional(),
        }),
        available: z.boolean(),
        reason: z.string().max(500).optional(),
        unavailableUntil: z.string().datetime().optional(),
      })
      .safeParse(req.body);
    if (!bp.success) {
      res.status(400).json({ error: bp.error.message });
      return;
    }
    const result = await bulkSetAvailability(
      bp.data.filter,
      bp.data.available,
      bp.data.reason ?? null,
      bp.data.unavailableUntil ? new Date(bp.data.unavailableUntil) : null,
    );
    await recordOpsAction({
      operatorId: req.user?.id ?? null,
      agent: "cms-rest",
      action: "cms_bulk_availability",
      params: bp.data,
      beforeState: { matched: result.matched },
      afterState: {
        updated: result.updated.length,
        slugs: result.updated.map((u) => u.slug),
      },
      status: "success",
      reasoning: bp.data.reason ?? "bulk availability via REST",
    });
    res.json({
      matched: result.matched,
      updated: result.updated.length,
      items: result.updated,
    });
  },
);

router.post(
  "/menu/items/:slug/availability",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = slugParam.safeParse(req.params);
    const bp = z
      .object({
        available: z.boolean(),
        reason: z.string().max(500).optional(),
        unavailableUntil: z.string().datetime().optional(),
      })
      .safeParse(req.body);
    if (!sp.success || !bp.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const before = await findBySlug(sp.data.slug);
    if (!before) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const item = await setAvailability(
      sp.data.slug,
      bp.data.available,
      bp.data.reason ?? null,
      bp.data.unavailableUntil ? new Date(bp.data.unavailableUntil) : null,
    );
    await recordOpsAction({
      operatorId: req.user?.id ?? null,
      agent: "cms-rest",
      action: "cms_toggle_availability",
      params: { slug: sp.data.slug, ...bp.data },
      beforeState: { isAvailable: before.isAvailable },
      afterState: { isAvailable: item?.isAvailable ?? null },
      status: "success",
      reasoning: bp.data.reason ?? "availability toggled via REST",
    });
    res.json({ item });
  },
);

// Editor file uploads — accepts a multipart image, persists it to object
// storage, and returns a public URL the editor (or the CMS agent's
// upload_image tool) can paste back into a menu item. Image bytes are
// validated for mime type and size; the chat tool flow is unchanged.
const ALLOWED_UPLOAD_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const uploadImageMw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_MIMES.has(file.mimetype.toLowerCase())) cb(null, true);
    else cb(new Error("only jpeg, png, or webp images are allowed"));
  },
}).single("file");

router.post("/menu/uploads", (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  uploadImageMw(req, res, async (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "upload failed";
      res.status(400).json({ error: msg });
      return;
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file || file.size === 0) {
      res.status(400).json({ error: "missing file" });
      return;
    }
    try {
      const stored = await saveAssetBytes({
        slug: "uploads",
        kind: "upload",
        buffer: file.buffer,
        mimeType: file.mimetype.toLowerCase(),
      });
      await recordOpsAction({
        operatorId: req.user?.id ?? null,
        agent: "cms-rest",
        action: "cms_upload_file",
        params: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          bytes: file.size,
        },
        beforeState: null,
        afterState: { url: stored.publicUrl },
        status: "success",
        reasoning: "editor uploaded an image via /menu/uploads",
      });
      res.json({ url: stored.publicUrl, bytes: file.size });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
});

router.post("/menu/items/:slug/image", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const sp = slugParam.safeParse(req.params);
  const bp = z.object({ imageUrl: z.string().url() }).safeParse(req.body);
  if (!sp.success || !bp.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const before = await findBySlug(sp.data.slug);
  if (!before) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const item = await setImage(sp.data.slug, bp.data.imageUrl);
  await recordOpsAction({
    operatorId: req.user?.id ?? null,
    agent: "cms-rest",
    action: "cms_upload_image",
    params: { slug: sp.data.slug, imageUrl: bp.data.imageUrl },
    beforeState: { imageUrl: before.imageUrl },
    afterState: { imageUrl: item?.imageUrl ?? null },
    status: "success",
    reasoning: "image set via REST",
  });
  res.json({ item });
});

const copyFieldEnum = z.enum([
  "name",
  "description",
  "longDescription",
  "allergens",
  "cuisineTags",
  "vibeTags",
  "seoTitle",
  "seoDescription",
  "macros",
]);

router.post(
  "/menu/items/:slug/generate-copy",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = slugParam.safeParse(req.params);
    const bp = z
      .object({ fields: z.array(copyFieldEnum).min(1).optional() })
      .safeParse(req.body ?? {});
    if (!sp.success || !bp.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const item = await findBySlug(sp.data.slug);
    if (!item) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const fields = (bp.data.fields ?? ALL_COPY_FIELDS) as CopyField[];
    try {
      const draft = await generateCopyForItem(item, fields);
      await recordOpsAction({
        operatorId: req.user?.id ?? null,
        agent: "cms-rest",
        action: "cms_generate_copy",
        params: { slug: sp.data.slug, fields },
        beforeState: null,
        afterState: { warnings: draft.warnings, modelId: draft.modelId },
        status: "success",
        reasoning: "copy draft generated",
      });
      res.json({ draft });
    } catch (err) {
      await recordOpsAction({
        operatorId: req.user?.id ?? null,
        agent: "cms-rest",
        action: "cms_generate_copy",
        params: { slug: sp.data.slug, fields },
        beforeState: null,
        afterState: null,
        status: "error",
        reasoning: (err as Error).message,
      });
      res.status(502).json({ error: (err as Error).message });
    }
  },
);

const acceptCopySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  longDescription: z.string().max(2000).optional(),
  allergens: z.array(z.string().max(64)).optional(),
  cuisineTags: z.array(z.string().max(64)).optional(),
  vibeTags: z.array(z.string().max(64)).optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
  macros: z
    .object({
      kcal: z.number().int().min(0).max(3000),
      proteinG: z.number().int().min(0).max(200),
      carbsG: z.number().int().min(0).max(400),
      fatG: z.number().int().min(0).max(200),
      fiberG: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
});

router.post("/menu/items/:slug/copy", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const sp = slugParam.safeParse(req.params);
  const bp = acceptCopySchema.safeParse(req.body);
  if (!sp.success || !bp.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const before = await findBySlug(sp.data.slug);
  if (!before) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const { item, warnings } = await applyCopyToItem(
    sp.data.slug,
    bp.data,
    req.user?.id ?? null,
  );
  await recordOpsAction({
    operatorId: req.user?.id ?? null,
    agent: "cms-rest",
    action: "cms_accept_copy",
    params: { slug: sp.data.slug, fields: Object.keys(bp.data) },
    beforeState: { name: before.name, description: before.description },
    afterState: item
      ? { name: item.name, description: item.description, warnings }
      : null,
    status: "success",
    reasoning:
      warnings.length > 0
        ? `copy accepted via REST; sanitised: ${warnings.join("; ")}`
        : "copy accepted via REST",
  });
  res.json({ item, warnings });
});

router.get("/menu/copy/missing", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const category =
    typeof req.query.category === "string" && req.query.category
      ? req.query.category
      : undefined;
  const kitchenLocation =
    typeof req.query.kitchenLocation === "string" && req.query.kitchenLocation
      ? req.query.kitchenLocation
      : undefined;
  const items = await listMenuItems({ category, kitchenLocation });
  const out = items
    .map((it) => ({
      slug: it.slug,
      name: it.name,
      category: it.category,
      missing: detectMissingFields(it),
    }))
    .filter((x) => x.missing.length > 0);
  res.json({ items: out, total: out.length });
});

export default router;
