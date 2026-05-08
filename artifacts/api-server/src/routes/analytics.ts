import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  askDataQuestion,
  listRecentQueries,
  markQuerySaved,
  runEditedSql,
  type ChartSpec,
} from "../lib/nlAnalytics";
import {
  generateWbr,
  getWbrReport,
  lastFullWeek,
  listWbrReports,
} from "../lib/wbr";
import { extractWeeklyVoc, listVocThemes } from "../lib/voc";
import { SAFE_SCHEMA, UnsafeSqlError } from "../lib/safeSql";

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
  return req.isAuthenticated() ? req.user.id ?? null : null;
}

function sendError(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof UnsafeSqlError) {
    res.status(400).json({ error: msg });
    return;
  }
  const lower = msg.toLowerCase();
  let code = 500;
  if (lower.includes("not found")) code = 404;
  else if (lower.includes("required") || lower.includes("invalid")) code = 400;
  else if (lower.includes("statement timeout")) code = 504;
  res.status(code).json({ error: msg });
}

// ---- Schema introspection (safe) --------------------------------------------

router.get("/analytics/schema", (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  res.json({ tables: SAFE_SCHEMA });
});

// ---- NL → SQL ---------------------------------------------------------------

const askSchema = z.object({ question: z.string().min(2).max(2000) });

router.post("/analytics/ask", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  try {
    const out = await askDataQuestion(parsed.data.question, userId(req));
    res.json(out);
  } catch (err) {
    sendError(res, err);
  }
});

const sqlSchema = z.object({
  sql: z.string().min(6).max(10_000),
  question: z.string().max(2000).optional(),
  chartSpec: z.any().optional(),
});

router.post("/analytics/sql", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const parsed = sqlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  try {
    const out = await runEditedSql(
      parsed.data.sql,
      parsed.data.question ?? null,
      (parsed.data.chartSpec as ChartSpec | undefined) ?? null,
      userId(req),
    );
    res.json(out);
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/analytics/queries", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  try {
    const rows = await listRecentQueries(50);
    res.json({ queries: rows });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/analytics/queries/:id/save", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const id = Number(req.params["id"]);
  const saved = req.body?.saved !== false;
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  try {
    const row = await markQuerySaved(id, saved);
    if (!row) {
      res.status(404).json({ error: "query not found" });
      return;
    }
    res.json({ query: row });
  } catch (err) {
    sendError(res, err);
  }
});

// ---- WBR --------------------------------------------------------------------

router.get("/analytics/wbr", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  try {
    const reports = await listWbrReports(12);
    res.json({ reports });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/analytics/wbr/latest", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  try {
    const [latest] = await listWbrReports(1);
    res.json({ report: latest ?? null });
  } catch (err) {
    sendError(res, err);
  }
});

router.get("/analytics/wbr/:id", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  const id = Number(req.params["id"]);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  try {
    const report = await getWbrReport(id);
    if (!report) {
      res.status(404).json({ error: "report not found" });
      return;
    }
    res.json({ report });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/analytics/wbr/generate", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  try {
    const week = req.body?.weekStart
      ? {
          weekStart: new Date(req.body.weekStart),
          weekEnd: new Date(req.body.weekEnd ?? Date.now()),
        }
      : lastFullWeek();
    const report = await generateWbr(week);
    res.json({ report });
  } catch (err) {
    sendError(res, err);
  }
});

// ---- VoC --------------------------------------------------------------------

router.get("/analytics/voc/themes", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  try {
    const themes = await listVocThemes(4);
    res.json({ themes });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/analytics/voc/extract", async (req: Request, res: Response) => {
  if (!requireCatalog(req, res)) return;
  try {
    const themes = await extractWeeklyVoc();
    res.json({ themes });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
