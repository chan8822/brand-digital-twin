import { Router, type IRouter, type Request, type Response } from "express";
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
import { getMergedCatalog } from "../lib/menuResolver";
import {
  ALL_COPY_FIELDS,
  applyCopyToItem,
  detectMissingFields,
  generateCopyForItem,
  type CopyField,
} from "../lib/menuCopy";
import { recordOpsAction } from "../lib/opsAudit";

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
  if (!isCatalogRequest(req)) {
    res.status(403).json({ error: "catalog scope required" });
    return false;
  }
  return true;
}

// Public, unauthenticated catalog: merges editable DB fields (price, name,
// description, image, isAvailable, macros) on top of the static DISHES seed.
// Items only present in the DB (CMS-created) are emitted with synthetic ids
// in the 100000+ range so they don't collide with static dish ids used by
// existing carts/orders.
router.get("/menu/public", async (_req: Request, res: Response) => {
  const dishes = await getMergedCatalog();
  res.json({ dishes });
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
