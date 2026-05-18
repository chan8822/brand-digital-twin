import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import overrideRouter from "./routes/manualOverride";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { adminSessionShim } from "./lib/adminSessionShim";
import {
  publicMenuRateLimit,
  orderRateLimit,
  aiRateLimit,
  rationaleRateLimit,
  paymentRateLimit,
  addressRateLimit,
} from "./middlewares/rateLimitMiddleware";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// The API server only emits JSON, never HTML, so a browser shouldn't
// ever execute a response from us. CSP at the API layer is mostly
// belt-and-braces — the SPA's own index.html ships its own CSP via
// <meta http-equiv> for the document context. We still set Helmet's
// other headers (HSTS, X-Frame-Options=DENY, X-Content-Type-Options,
// Referrer-Policy, etc.) which DO apply to non-HTML responses.
app.use(
  helmet({
    contentSecurityPolicy: {
      // Tight policy suitable for a JSON API: refuse all sub-resource
      // loading from the response. If a future route ever returns HTML
      // (it should not), nothing can be loaded into it.
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

const isProduction = process.env["NODE_ENV"] === "production";

const allowedOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsAllowList = new Set<string>(allowedOrigins);

app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server requests have no Origin
      // header — allow them so health checks and SSR fetches still work.
      if (!origin) return cb(null, true);
      if (corsAllowList.has(origin)) return cb(null, true);
      // Fail-open ONLY in development when the operator hasn't configured
      // an allowlist. In production an empty allowlist is treated as a
      // misconfiguration and we refuse the request rather than wildcard.
      if (!isProduction && corsAllowList.size === 0) return cb(null, true);
      cb(new Error("Origin not allowed"));
    },
    credentials: true,
  }),
);

app.use(cookieParser());

// --- Body parsers -----------------------------------------------------------
//
// Express's body parsers short-circuit once any of them has consumed the
// request body, so the *first* parser whose route matches wins. To keep
// the global default tight (100kb) while still allowing larger payloads
// for image-upload / agent endpoints, we mount the higher-limit parsers
// FIRST against their specific path prefixes, then a 100kb catch-all.
//
// Razorpay webhook requires the raw Buffer body for HMAC verification,
// so we mount express.raw() for that path BEFORE the JSON parsers so
// the JSON parser never consumes it.

const jsonLarge = express.json({ limit: "15mb" });
const jsonAgent = express.json({ limit: "2mb" });
const jsonDefault = express.json({ limit: "100kb" });
const urlEncodedDefault = express.urlencoded({ extended: true, limit: "100kb" });

// Razorpay server-to-server webhook — raw body needed for HMAC.
app.use("/api/payments/razorpay/webhook", express.raw({ type: "application/json" }));

// Web Vitals beacons arrive as text/plain from navigator.sendBeacon.
app.use("/api/vitals", express.text({ type: "text/plain", limit: "4kb" }));

// Image / asset upload endpoints — base64 dataURL payloads can hit several MB.
app.use("/api/menu/uploads", jsonLarge);
app.use("/api/menu-assets", jsonLarge);
// AI agent chat endpoints carry conversation history.
app.use("/api/cms-agent", jsonAgent);
app.use("/api/coach-agent", jsonAgent);
app.use("/api/ops-agent", jsonAgent);
app.use("/api/support-agent", jsonAgent);

app.use(jsonDefault);
app.use(urlEncodedDefault);

// --- Per-category rate limiting -------------------------------------------
// Mounted before authMiddleware so unauthenticated scraping is also limited.
// Each limiter is keyed on client IP so authenticated + anonymous requests
// share the same counter per IP.

app.use("/api/menu", publicMenuRateLimit);
app.use("/api/dish", publicMenuRateLimit);
app.use("/api/orders", orderRateLimit);
app.use("/api/checkout", orderRateLimit);
app.use("/api/cms-agent", aiRateLimit);
app.use("/api/coach-agent", aiRateLimit);
app.use("/api/ops-agent", aiRateLimit);
app.use("/api/support-agent", aiRateLimit);
app.use("/api/dish-rationales", rationaleRateLimit);
app.use("/api/payments", paymentRateLimit);
app.use("/api/user-addresses", addressRateLimit);

// Surface body-parser failures as a clean 413 / 400 instead of a 500.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err && typeof err === "object" && "type" in err) {
    const t = (err as { type?: string }).type;
    if (t === "entity.too.large") {
      res.status(413).json({ error: "payload too large" });
      return;
    }
    if (t === "entity.parse.failed") {
      res.status(400).json({ error: "invalid json" });
      return;
    }
  }
  next(err);
});

app.use(authMiddleware);

// Mirror the new signed-cookie admin session into the legacy
// `req.session.isAdmin` flag so endpoints written before the cookie-
// based admin login (aiRuns, community, challenges, b2bPlanner, …)
// honor admins who logged in through POST /admin/login. See
// lib/adminSessionShim.ts for the full rationale.
app.use(adminSessionShim);

// Task #7 bulkhead: mount the clinical override router BEFORE the
// monolithic /api router so the override request never traverses
// sibling middleware on the aggregate router. Auth + adminSessionShim
// already ran above; the handler still enforces the ops scope.
app.use(overrideRouter);

app.use("/api", router);

// Catch-all error handler. Must be the LAST middleware so any route
// that calls `next(err)` (or throws inside an async handler that
// Express 5 forwards) lands here. We log the full error server-side
// but only surface a generic shape to the client — never the stack.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status =
    err && typeof err === "object" && "status" in err && typeof (err as { status?: unknown }).status === "number"
      ? ((err as { status: number }).status as number)
      : 500;
  req.log?.error({ err, status }, "unhandled error");
  if (res.headersSent) return;
  res.status(status).json({ error: status >= 500 ? "internal error" : "bad request" });
});

export default app;
