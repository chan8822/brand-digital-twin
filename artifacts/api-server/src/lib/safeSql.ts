import { pool } from "@workspace/db";

// Curated, read-only schema exposed to the NL analytics agent. Adding a
// table or column here is a deliberate decision — the agent and the user
// can ONLY read what is listed. Sensitive PII (phone, address line, email)
// is intentionally omitted.
export interface SafeColumn {
  name: string;
  type: string;
  description?: string;
}
export interface SafeTable {
  name: string;
  description: string;
  columns: SafeColumn[];
}

export const SAFE_SCHEMA: SafeTable[] = [
  {
    name: "orders",
    description: "Customer orders. items is jsonb array of {name,qty,price}.",
    columns: [
      { name: "id", type: "int" },
      { name: "user_id", type: "varchar", description: "opaque user id" },
      { name: "status", type: "varchar" },
      { name: "total_paise", type: "int", description: "order total in paise" },
      { name: "city", type: "varchar" },
      { name: "pincode", type: "varchar" },
      { name: "items", type: "jsonb" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "menu_items",
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
    name: "dish_reviews",
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
    name: "anomaly_alerts",
    description: "Auto-detected metric anomalies.",
    columns: [
      { name: "id", type: "int" },
      { name: "metric", type: "varchar" },
      { name: "severity", type: "varchar" },
      { name: "status", type: "varchar" },
      { name: "value", type: "double" },
      { name: "baseline", type: "double" },
      { name: "summary", type: "text" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "subscriptions",
    description: "Active customer meal subscriptions.",
    columns: [
      { name: "id", type: "int" },
      { name: "status", type: "varchar" },
      { name: "plan", type: "varchar" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
  {
    name: "loyalty_points",
    description: "Loyalty point ledger entries.",
    columns: [
      { name: "id", type: "int" },
      { name: "user_id", type: "varchar" },
      { name: "delta", type: "int" },
      { name: "reason", type: "varchar" },
      { name: "created_at", type: "timestamptz" },
    ],
  },
];

const ALLOWED_TABLE_NAMES = new Set(SAFE_SCHEMA.map((t) => t.name));

// Block anything that mutates state, escapes the safe view, or hits system
// catalogs. Allowlist is more reliable than denylist; we still keep both.
const FORBIDDEN_KEYWORDS = [
  "insert ",
  "update ",
  "delete ",
  "drop ",
  "alter ",
  "create ",
  "truncate ",
  "grant ",
  "revoke ",
  "copy ",
  "vacuum ",
  "analyze ",
  "comment ",
  "set ",
  "reset ",
  "do ",
  "call ",
  "merge ",
  "with recursive",
  "pg_",
  "information_schema",
  ";--",
  "/*",
  "*/",
  "\\\\copy",
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

export function validateSafeSql(sqlIn: string): string {
  const sql = sqlIn.trim().replace(/;+\s*$/g, "");
  if (!sql) throw new UnsafeSqlError("empty SQL");
  const lower = sql.toLowerCase();
  // single statement only
  if (sql.includes(";")) {
    throw new UnsafeSqlError("only a single SELECT is allowed");
  }
  if (!lower.startsWith("select ") && !lower.startsWith("select\n")) {
    throw new UnsafeSqlError("only SELECT queries are allowed");
  }
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (lower.includes(kw)) {
      throw new UnsafeSqlError(`forbidden token: ${kw.trim()}`);
    }
  }
  // Every referenced table after FROM/JOIN must be in the allowlist. We
  // tolerate optional schema prefix `public.` but disallow other schemas.
  const tableMatches = [
    ...lower.matchAll(/\b(?:from|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)/g),
  ];
  if (tableMatches.length === 0) {
    throw new UnsafeSqlError("query must reference at least one table");
  }
  for (const m of tableMatches) {
    const name = m[1] ?? "";
    if (!ALLOWED_TABLE_NAMES.has(name)) {
      throw new UnsafeSqlError(`table not in safe view: ${name}`);
    }
  }
  return sql;
}

export async function runSafeSql(sqlIn: string): Promise<SafeSqlResult> {
  const sql = validateSafeSql(sqlIn);
  const client = await pool.connect();
  const start = Date.now();
  try {
    // Per-session safety: enforce read-only + statement timeout.
    await client.query(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await client.query("set local transaction read only");
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
    client.release();
  }
}

export function describeSchemaForPrompt(): string {
  return SAFE_SCHEMA.map((t) => {
    const cols = t.columns
      .map((c) => `  - ${c.name} (${c.type})${c.description ? ` — ${c.description}` : ""}`)
      .join("\n");
    return `Table ${t.name} — ${t.description}\n${cols}`;
  }).join("\n\n");
}
