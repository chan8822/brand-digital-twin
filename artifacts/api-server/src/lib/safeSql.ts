import { pool } from "@workspace/db";
import { logger } from "./logger";

// ---- Curated safe data layer ------------------------------------------------
// We expose the warehouse to the NL analytics agent and to manual SQL ONLY
// through SQL VIEWS that we own and maintain in this file. Each view selects
// a deliberately narrow column set — sensitive PII (phone, address, email)
// is omitted. The validator below refuses any query that references a name
// outside this allowlist, so column-level safety is enforced by the DB
// itself even if the validator is somehow bypassed.

export interface SafeColumn {
  name: string;
  type: string;
  description?: string;
}
export interface SafeTable {
  name: string; // view name analysts can reference
  source: string; // underlying table the view is built from
  description: string;
  columns: SafeColumn[];
}

export const SAFE_SCHEMA: SafeTable[] = [
  {
    name: "safe_orders",
    source: "orders",
    description: "Orders. items is jsonb [{name,qty,price (paise)}].",
    columns: [
      { name: "id", type: "int" },
      { name: "user_id", type: "varchar" },
      { name: "status", type: "varchar" },
      { name: "total_paise", type: "int" },
      { name: "city", type: "varchar" },
      { name: "pincode", type: "varchar" },
      { name: "items", type: "jsonb" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "safe_menu_items",
    source: "menu_items",
    description: "Catalog menu items.",
    columns: [
      { name: "slug", type: "varchar" },
      { name: "name", type: "varchar" },
      { name: "price_paise", type: "int" },
      { name: "is_available", type: "boolean" },
      { name: "category", type: "varchar" },
    ],
  },
  {
    name: "safe_dish_reviews",
    source: "dish_reviews",
    description: "Customer dish reviews. rating is 1..5.",
    columns: [
      { name: "id", type: "int" },
      { name: "slug", type: "varchar" },
      { name: "rating", type: "int" },
      { name: "body", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "safe_anomaly_alerts",
    source: "anomaly_alerts",
    description: "Auto-detected metric anomalies.",
    columns: [
      { name: "id", type: "int" },
      { name: "metric", type: "varchar" },
      { name: "severity", type: "varchar" },
      { name: "status", type: "varchar" },
      { name: "value", type: "double precision" },
      { name: "baseline", type: "double precision" },
      { name: "summary", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "safe_subscriptions",
    source: "subscriptions",
    description: "Active customer meal subscriptions.",
    columns: [
      { name: "id", type: "int" },
      { name: "status", type: "varchar" },
      { name: "plan", type: "varchar" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "safe_credit_ledger",
    source: "credit_ledger",
    description: "Customer credit/loyalty ledger. delta_paise > 0 = credit, < 0 = redemption.",
    columns: [
      { name: "id", type: "int" },
      { name: "user_id", type: "varchar" },
      { name: "delta_paise", type: "int" },
      { name: "reason", type: "varchar" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "safe_support_messages",
    source: "messages",
    description:
      "Customer-side support chat messages (role='user' only is the typical filter). content is the raw message text.",
    columns: [
      { name: "id", type: "int" },
      { name: "conversation_id", type: "int" },
      { name: "role", type: "text" },
      { name: "content", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "safe_nps_responses",
    source: "nps_responses",
    description: "Customer NPS responses (0-10) with optional comment.",
    columns: [
      { name: "id", type: "int" },
      { name: "score", type: "int" },
      { name: "comment", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
];

const ALLOWED_TABLE_NAMES = new Set(SAFE_SCHEMA.map((t) => t.name));

// Substring tokens that are unambiguous DDL/DML markers regardless of
// surrounding context. We deliberately do NOT include single English words
// that are also legitimate column names (e.g. "comment") — those are
// handled by the per-keyword regex list below which only matches when the
// word starts a SQL statement form, not a column reference.
const FORBIDDEN_SUBSTRINGS = [
  "pg_", "information_schema", ";--", "/*", "*/", "\\copy", "lo_",
  // Double-quoted identifiers would let a caller reference base tables like
  // "orders" or "users" that the FROM/JOIN allowlist regex (which only
  // matches unquoted lowercase identifiers) wouldn't catch. All safe_*
  // views are unquoted lowercase, so callers never need quoted identifiers.
  '"',
];
const FORBIDDEN_LEADING_KEYWORDS = [
  "insert", "update", "delete", "drop", "alter", "create", "truncate",
  "grant", "revoke", "copy", "vacuum", "analyze", "reset", "do", "call",
  "merge", "set",
];
// `comment on ...` is the SQL DDL we want to block; the bare word `comment`
// is a valid column name in safe_nps_responses, so we only refuse the
// statement form.
const FORBIDDEN_PHRASES = [
  /\bcomment\s+on\b/,
  /\bwith\s+recursive\b/,
];

const MAX_ROWS = 500;
const STATEMENT_TIMEOUT_MS = 4000;

export interface SafeSqlResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
}

export class UnsafeSqlError extends Error {}

function stripStringLiterals(sql: string): string {
  // Remove single-quoted strings so identifiers inside literals don't trip us.
  return sql.replace(/'(?:''|[^'])*'/g, "''");
}

export function validateSafeSql(sqlIn: string): string {
  const sql = sqlIn.trim().replace(/;+\s*$/g, "");
  if (!sql) throw new UnsafeSqlError("empty SQL");
  if (sql.includes(";")) {
    throw new UnsafeSqlError("only a single SELECT statement is allowed");
  }
  const lowerFull = sql.toLowerCase();
  if (!lowerFull.startsWith("select ") && !lowerFull.startsWith("select\n")) {
    throw new UnsafeSqlError("only SELECT queries are allowed");
  }
  const stripped = stripStringLiterals(sql).toLowerCase();
  for (const tok of FORBIDDEN_SUBSTRINGS) {
    if (stripped.includes(tok)) {
      throw new UnsafeSqlError(`forbidden token: ${tok.trim()}`);
    }
  }
  for (const re of FORBIDDEN_PHRASES) {
    if (re.test(stripped)) {
      throw new UnsafeSqlError(`forbidden statement form: ${re.source}`);
    }
  }
  // Tokenize once and check if any DDL/DML keyword starts a statement.
  // Statement starts are: index 0, or the position right after `;` (already
  // rejected), or right after `)` followed by a leading keyword. Since we
  // already require the query to start with SELECT and disallow `;`, a
  // forbidden leading keyword can only appear inside a subquery — which is
  // also disallowed (e.g. `select * from safe_orders where exists (delete ...)`).
  for (const kw of FORBIDDEN_LEADING_KEYWORDS) {
    const re = new RegExp(`(^|[\\s(])${kw}\\b`);
    if (re.test(stripped)) {
      throw new UnsafeSqlError(`forbidden keyword: ${kw}`);
    }
  }
  // Reject implicit (comma) joins outright. The table-extraction regex
  // below only sees identifiers that follow FROM or JOIN, so a query like
  // `select * from safe_orders, orders` would otherwise expose the base
  // `orders` table. We walk every FROM clause and refuse if a top-level
  // comma appears before the next clause boundary.
  if (hasFromCommaJoin(stripped)) {
    throw new UnsafeSqlError("comma joins are not allowed; use explicit JOIN");
  }
  // Column-level safety is enforced by the DB itself: queries are only
  // allowed to reference `safe_*` views (created by ensureSafeViews) which
  // SELECT a narrow, explicit column list from each underlying table. Even
  // if the validator missed something, `select phone from safe_orders` will
  // fail at parse time inside Postgres because the view doesn't expose it.
  const tables = [
    ...stripped.matchAll(/\b(?:from|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)/g),
  ].map((m) => m[1] ?? "");
  if (tables.length === 0) {
    throw new UnsafeSqlError("query must reference at least one table");
  }
  for (const t of tables) {
    if (!ALLOWED_TABLE_NAMES.has(t) || !t.startsWith("safe_")) {
      throw new UnsafeSqlError(`table not in safe view: ${t}`);
    }
  }
  return sql;
}

// Walks the (already-lowercased, string-literals-stripped) SQL and returns
// true if any top-level comma appears inside a FROM clause — i.e. an
// implicit (comma) join such as `from safe_orders, orders` or
// `from safe_orders o, users u`. Commas inside parentheses (function args,
// subqueries) are ignored.
export function hasFromCommaJoin(s: string): boolean {
  const CLAUSE_END = /^\s+(?:where|group|order|having|limit|offset|union|intersect|except|fetch|window|for|returning)\b/;
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf("from", i);
    if (idx === -1) return false;
    const before = idx === 0 ? "" : s[idx - 1] ?? "";
    const after = s[idx + 4] ?? "";
    // Require word boundaries so we don't match inside identifiers.
    if (/[a-z0-9_]/.test(before) || /[a-z0-9_]/.test(after)) {
      i = idx + 4;
      continue;
    }
    let j = idx + 4;
    let depth = 0;
    while (j < s.length) {
      const c = s[j];
      if (c === "(") {
        depth++;
        j++;
        continue;
      }
      if (c === ")") {
        if (depth === 0) break;
        depth--;
        j++;
        continue;
      }
      if (depth === 0) {
        if (c === ",") return true;
        if (CLAUSE_END.test(s.slice(j))) break;
      }
      j++;
    }
    i = j + 1;
  }
  return false;
}

export async function ensureSafeViews(): Promise<void> {
  // Idempotent: run on startup. Each view selects only the explicitly listed
  // columns from its source table. CREATE OR REPLACE means we can edit the
  // SAFE_SCHEMA above and a server restart updates the views.
  const client = await pool.connect();
  try {
    for (const t of SAFE_SCHEMA) {
      const cols = t.columns.map((c) => `"${c.name}"`).join(", ");
      const ddl = `create or replace view ${t.name} as select ${cols} from ${t.source}`;
      try {
        await client.query(ddl);
      } catch (err) {
        // The source table may not exist yet (e.g. nps_responses before its
        // first migration); log and continue so the rest of the pack works.
        logger.warn({ err, view: t.name }, "skipping safe view (source missing)");
      }
    }
  } finally {
    client.release();
  }
}

export async function runSafeSql(sqlIn: string): Promise<SafeSqlResult> {
  const sql = validateSafeSql(sqlIn);
  const client = await pool.connect();
  const start = Date.now();
  try {
    // Explicit read-only transaction guarantees no DML can succeed even if
    // the validator missed something. statement_timeout is set inside the
    // same transaction so it applies to the wrapped query.
    await client.query("begin read only");
    try {
      await client.query(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const wrapped = `select * from (${sql}) as _safe limit ${MAX_ROWS + 1}`;
      const result = await client.query(wrapped);
      const truncated = result.rows.length > MAX_ROWS;
      const rows = (truncated ? result.rows.slice(0, MAX_ROWS) : result.rows) as Record<string, unknown>[];
      return {
        rows,
        rowCount: rows.length,
        truncated,
        durationMs: Date.now() - start,
      };
    } finally {
      // Read-only transaction: rollback is the cheapest way to end it.
      await client.query("rollback").catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

export function describeSchemaForPrompt(): string {
  return SAFE_SCHEMA.map((t) => {
    const cols = t.columns
      .map((c) => `  - ${c.name} (${c.type})${c.description ? ` — ${c.description}` : ""}`)
      .join("\n");
    return `View ${t.name} — ${t.description}\n${cols}`;
  }).join("\n\n");
}
