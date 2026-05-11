import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  approvePricingSuggestion,
  buildPricingSuggestionsForRun,
  dismissPricingSuggestion,
  getLatestRun,
  getRunStats,
  listPendingSuggestions,
  listSuggestionsForSlug,
  runMenuEngineering,
} from "../lib/menuEngineering";
import { recordOpsAction } from "../lib/opsAudit";
import {
  createReview,
  getSummariesForActiveMenu,
  getSummary,
  listPublicReviews,
  listReviews,
  listReviewsForModeration,
  setReviewHidden,
  summarizeAllReviews,
  summarizeReviewsForSlug,
  userHasOrderedSlug,
} from "../lib/dishReviews";
import { requireCatalog as gateRequireCatalog } from "../lib/adminGate";

const router: IRouter = Router();

function requireCatalog(req: Request, res: Response): boolean {
  return gateRequireCatalog(req, res) !== null;
}

function userId(req: Request): string | null {
  return req.isAuthenticated() ? (req.user.id ?? null) : null;
}

function sendError(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  let code = 500;
  if (lower.includes("not found")) code = 404;
  else if (lower.includes("already decided") || lower.includes("invalid"))
    code = 400;
  // Don't echo raw error text for unmapped 500s.
  const exposed = code === 500 ? "internal error" : msg;
  res.status(code).json({ error: exposed });
}

// ---- Menu engineering --------------------------------------------------------

router.get(
  "/menu-engineering/matrix",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    try {
      const run = await getLatestRun();
      if (!run) {
        res.json({ run: null, stats: [], summaries: [] });
        return;
      }
      const [stats, summaryMap] = await Promise.all([
        getRunStats(run.id),
        getSummariesForActiveMenu(),
      ]);
      res.json({
        run,
        stats,
        summaries: [...summaryMap.values()],
      });
    } catch (err) {
      sendError(res, err);
    }
  },
);

const runBody = z
  .object({ sinceDays: z.number().int().min(1).max(180).optional() })
  .default({});

router.post("/menu-engineering/run", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const parsed = runBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  try {
    const result = await runMenuEngineering({
      sinceDays: parsed.data.sinceDays,
      operatorId: userId(req),
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.get(
  "/menu-engineering/dish/:slug",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const slug = String(req.params["slug"] ?? "");
    if (!slug) {
      res.status(400).json({ error: "missing slug" });
      return;
    }
    try {
      const run = await getLatestRun();
      const stats = run
        ? (await getRunStats(run.id)).filter((s) => s.slug === slug)
        : [];
      const [suggestions, reviews, summary] = await Promise.all([
        listSuggestionsForSlug(slug),
        listReviews(slug, 50),
        getSummary(slug),
      ]);
      res.json({
        run,
        stat: stats[0] ?? null,
        suggestions,
        reviews,
        summary,
      });
    } catch (err) {
      sendError(res, err);
    }
  },
);

// ---- Pricing suggestions -----------------------------------------------------

router.get(
  "/menu-engineering/pricing-suggestions",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const runIdRaw = req.query["runId"];
    const runIdNum = runIdRaw ? Number(runIdRaw) : NaN;
    try {
      const rows = await listPendingSuggestions(
        Number.isFinite(runIdNum) ? runIdNum : undefined,
      );
      res.json({ rows });
    } catch (err) {
      sendError(res, err);
    }
  },
);

const buildBody = z.object({ runId: z.number().int().positive().optional() });

router.post(
  "/menu-engineering/pricing-suggestions/run",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const parsed = buildBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    try {
      let runId = parsed.data.runId;
      if (!runId) {
        const latest = await getLatestRun();
        if (!latest) {
          res
            .status(400)
            .json({ error: "run a menu engineering pass first" });
          return;
        }
        runId = latest.id;
      }
      const rows = await buildPricingSuggestionsForRun(runId, userId(req));
      res.json({ rows });
    } catch (err) {
      sendError(res, err);
    }
  },
);

const idParam = z.object({ id: z.coerce.number().int().positive() });

router.post(
  "/menu-engineering/pricing-suggestions/:id/approve",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    try {
      const out = await approvePricingSuggestion(sp.data.id, userId(req));
      res.json(out);
    } catch (err) {
      sendError(res, err);
    }
  },
);

router.post(
  "/menu-engineering/pricing-suggestions/:id/dismiss",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const sp = idParam.safeParse(req.params);
    if (!sp.success) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    try {
      const out = await dismissPricingSuggestion(sp.data.id, userId(req));
      res.json(out);
    } catch (err) {
      sendError(res, err);
    }
  },
);

// ---- Reviews -----------------------------------------------------------------

const createReviewBody = z.object({
  slug: z.string().min(1).max(128),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).default(""),
  photoUrl: z.string().url().max(1024).optional().nullable(),
});

// Customer-facing: an authenticated user who has actually ordered the dish
// can leave a review. Eligibility is enforced server-side against the
// `orders` table so localStorage tampering or cross-device gaps cannot
// bypass it.
router.post("/dish-reviews", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "login required" });
    return;
  }
  const parsed = createReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  try {
    const eligible = await userHasOrderedSlug(req.user.id, parsed.data.slug);
    if (!eligible) {
      res
        .status(403)
        .json({ error: "order this dish before leaving a review" });
      return;
    }
    const review = await createReview({
      userId: req.user.id,
      slug: parsed.data.slug,
      rating: parsed.data.rating,
      body: parsed.data.body,
      photoUrl: parsed.data.photoUrl ?? null,
    });
    res.json({ review });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/dish-reviews/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params["slug"] ?? "");
  if (!slug) {
    res.status(400).json({ error: "missing slug" });
    return;
  }
  try {
    const [reviews, summary, eligibleToReview] = await Promise.all([
      listPublicReviews(slug, 50),
      getSummary(slug),
      req.isAuthenticated()
        ? userHasOrderedSlug(req.user.id, slug)
        : Promise.resolve(false),
    ]);
    // Public endpoint — never leaks reviewer userId. Each review carries a
    // safe display label (e.g. "Priya S.") and optional avatar. Catalog
    // endpoints (the dish detail view) still receive the full row via
    // listReviews. `eligibleToReview` is computed server-side from the
    // orders table so the client doesn't need to consult localStorage.
    res.json({ reviews, summary, eligibleToReview });
  } catch (err) {
    sendError(res, err);
  }
});

router.post(
  "/dish-reviews/:slug/summarize",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const slug = String(req.params["slug"] ?? "");
    if (!slug) {
      res.status(400).json({ error: "missing slug" });
      return;
    }
    try {
      const summary = await summarizeReviewsForSlug(slug);
      res.json({ summary });
    } catch (err) {
      sendError(res, err);
    }
  },
);

// ---- Review moderation (catalog scope) --------------------------------------

router.get("/dish-reviews-mod", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const reviews = await listReviewsForModeration(200);
  res.json({ reviews });
});

router.post(
  "/dish-reviews/:id/hide",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const row = await setReviewHidden(id, true);
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    await recordOpsAction({
      action: "review.hide",
      agent: "catalog-admin",
      operatorId: userId(req),
      params: { id },
      status: "ok",
    });
    res.json({ review: row });
  },
);

router.post(
  "/dish-reviews/:id/unhide",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const row = await setReviewHidden(id, false);
    if (!row) {
      res.status(404).json({ error: "not found" });
      return;
    }
    await recordOpsAction({
      action: "review.unhide",
      agent: "catalog-admin",
      operatorId: userId(req),
      params: { id },
      status: "ok",
    });
    res.json({ review: row });
  },
);

router.post(
  "/dish-reviews/summarize-all",
  async (req: Request, res: Response) => {
    if (!requireCatalog(req, res)) return;
    try {
      const out = await summarizeAllReviews();
      res.json(out);
    } catch (err) {
      sendError(res, err);
    }
  },
);

export default router;
