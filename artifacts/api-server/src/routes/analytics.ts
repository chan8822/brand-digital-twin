import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  askDataQuestion,
  listRecentQueries,
  markQuerySaved,
  runEditedSql,
  chartSpecSchema,
} from "../lib/nlAnalytics";
import {
  generateWbr,
  getWbrReport,
  lastFullWeek,
  listWbrReports,
} from "../lib/wbr";
import { extractWeeklyVoc, listVocThemes } from "../lib/voc";
import { publishWbr } from "../lib/wbrPublisher";
import { SAFE_SCHEMA, UnsafeSqlError } from "../lib/safeSql";
import { requireCatalog as gateRequireCatalog } from "../lib/adminGate";

const router: IRouter = Router();

function requireCatalog(req: Request, res: Response): boolean {
  return gateRequireCatalog(req, res) !== null;
}

function userId(req: Request): string | null {
  return req.isAuthenticated() ? req.user.id ?? null : null;
}

function sendError(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof UnsafeSqlError) {
    // UnsafeSqlError messages are caller-friendly validation explanations.
    res.status(400).json({ error: msg });
    return;
  }
  const lower = msg.toLowerCase();
  let code = 500;
  if (lower.includes("not found")) code = 404;
  else if (lower.includes("required") || lower.includes("invalid")) code = 400;
  else if (lower.includes("statement timeout")) code = 504;
  // Only echo the message for caller-fixable 4xx / known 504 cases. 500s
  // get a generic message so we don't leak driver / SQL details.
  const exposed = code === 500 ? "internal error" : msg;
  res.status(code).json({ error: exposed });
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
  chartSpec: chartSpecSchema.optional(),
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
      parsed.data.chartSpec ?? null,
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
    let week;
    if (req.body?.weekStart) {
      const ws = new Date(req.body.weekStart);
      const we = new Date(req.body.weekEnd ?? Date.now());
      if (Number.isNaN(ws.getTime()) || Number.isNaN(we.getTime())) {
        res.status(400).json({ error: "invalid weekStart/weekEnd" });
        return;
      }
      if (we.getTime() <= ws.getTime()) {
        res.status(400).json({ error: "weekEnd must be after weekStart" });
        return;
      }
      week = { weekStart: ws, weekEnd: we };
    } else {
      week = lastFullWeek();
    }
    const report = await generateWbr(week);
    res.json({ report });
  } catch (err) {
    sendError(res, err);
  }
});

router.post("/analytics/wbr/:id/publish", async (req: Request, res: Response) => {
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
    const result = await publishWbr(report);
    res.json({ result });
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
