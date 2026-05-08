import { eq } from "drizzle-orm";
import { generateText } from "ai";
import { db, menuItemsTable, type MenuItem } from "@workspace/db";
import { getModel, DEFAULT_MODEL_ID } from "./ai/model";
import { logger } from "./logger";

export type CopyField =
  | "name"
  | "description"
  | "longDescription"
  | "allergens"
  | "cuisineTags"
  | "vibeTags"
  | "seoTitle"
  | "seoDescription"
  | "macros";

export const ALL_COPY_FIELDS: CopyField[] = [
  "name",
  "description",
  "longDescription",
  "allergens",
  "cuisineTags",
  "vibeTags",
  "seoTitle",
  "seoDescription",
  "macros",
];

export interface MacrosEstimate {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface GeneratedCopy {
  name?: string;
  description?: string;
  longDescription?: string;
  allergens?: string[];
  cuisineTags?: string[];
  vibeTags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  macros?: MacrosEstimate;
}

export interface CopyDraft {
  slug: string;
  current: Partial<GeneratedCopy>;
  proposed: GeneratedCopy;
  warnings: string[];
  fields: CopyField[];
  modelId: string;
}

const BRAND_VOICE = `You are the Tanmatra menu copywriter. Tanmatra is a clean-eating, plant-forward
wellness food brand. Voice is calm, warm, plain-spoken, and trustworthy — never
hype-y, never medical claims. Avoid words: "magical", "miracle", "best ever",
"detox", "cure", "boost". Prefer simple sensory language and honest sourcing
notes. Indian-English spelling. Keep promises modest and specific.`;

export const ALLOWED_ALLERGENS = [
  "milk",
  "egg",
  "wheat",
  "gluten",
  "soy",
  "peanut",
  "tree_nuts",
  "sesame",
  "fish",
  "shellfish",
  "mustard",
  "sulphites",
];

export const ALLOWED_CUISINE_TAGS = [
  "north_indian",
  "south_indian",
  "pan_asian",
  "mediterranean",
  "continental",
  "mexican",
  "thai",
  "italian",
  "indo_chinese",
  "gujarati",
  "bengali",
  "kerala",
];

export const ALLOWED_VIBE_TAGS = [
  "comfort",
  "light",
  "post_workout",
  "monsoon",
  "summer_cool",
  "festive",
  "kids_friendly",
  "office_lunch",
  "late_night",
  "immunity",
  "gut_friendly",
  "high_protein",
  "low_carb",
];

function sanitizeTagList(
  raw: string[] | undefined,
  allowed: string[],
  max: number,
): { values: string[]; warnings: string[] } {
  if (!raw) return { values: [], warnings: [] };
  const warnings: string[] = [];
  const out: string[] = [];
  for (const t of raw) {
    const norm = t.toLowerCase().trim().replace(/\s+/g, "_");
    if (!allowed.includes(norm)) {
      warnings.push(`dropped unknown tag "${t}"`);
      continue;
    }
    if (!out.includes(norm)) out.push(norm);
    if (out.length >= max) break;
  }
  return { values: out, warnings };
}

function buildPrompt(item: MenuItem, fields: CopyField[]): string {
  const knownIngredients = (item.tags ?? []).join(", ") || "(not provided)";
  const wantsMacros = fields.includes("macros");
  return `${BRAND_VOICE}

You are generating menu copy for ONE dish. Use ONLY the facts below; do not
invent ingredients, sourcing claims, awards, prices, or origin stories.

Existing dish data:
- name: ${item.name}
- category: ${item.category}
- veg: ${item.isVeg ? "yes" : "no"}
- known tags / ingredients: ${knownIngredients}
- current short description: ${item.description || "(none)"}
- price (₹): ${(item.pricePaise / 100).toFixed(2)}

Output ONLY a JSON object with the following keys (omit any key you were not
asked to generate). Allowed allergens (lowercase, snake_case) come from this
fixed list and nothing else: ${ALLOWED_ALLERGENS.join(", ")}.

Fields requested: ${fields.join(", ")}

Schema:
{
  "name": string,                 // <= 60 chars, sentence case, no emojis
  "description": string,          // 1 sentence, <= 140 chars, no marketing fluff
  "longDescription": string,      // 2-3 sentences, <= 400 chars
  "allergens": string[],          // subset of allowed allergens above; [] if none
  "cuisineTags": string[],        // 1-3 tags from {north_indian, south_indian, pan_asian, mediterranean, continental, mexican, thai, italian, indo_chinese, gujarati, bengali, kerala}
  "vibeTags": string[],           // 1-4 tags from {comfort, light, post_workout, monsoon, summer_cool, festive, kids_friendly, office_lunch, late_night, immunity, gut_friendly, high_protein, low_carb}
  "seoTitle": string,             // <= 60 chars, includes dish name
  "seoDescription": string,       // <= 155 chars
  "macros": { "kcal": number, "proteinG": number, "carbsG": number, "fatG": number }${wantsMacros ? "  // honest rough estimate; integers" : ""}
}

Rules:
- Allergens MUST be a strict subset of the allowed list. If unsure, omit.
- If the dish is marked veg, never list fish/shellfish.
- Do not echo the price or claim any award/certification.
- Output ONLY valid JSON, no markdown fences, no commentary.`;
}

function tryParseJson(text: string): unknown {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function arrOfStrings(v: unknown, max = 8): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim()) out.push(x.trim());
    if (out.length >= max) break;
  }
  return out;
}

function clampStr(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function safeMacros(v: unknown): MacrosEstimate | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const kcal = typeof o["kcal"] === "number" ? Math.round(o["kcal"]) : null;
  const proteinG =
    typeof o["proteinG"] === "number" ? Math.round(o["proteinG"]) : null;
  const carbsG =
    typeof o["carbsG"] === "number" ? Math.round(o["carbsG"]) : null;
  const fatG = typeof o["fatG"] === "number" ? Math.round(o["fatG"]) : null;
  if (kcal == null || proteinG == null || carbsG == null || fatG == null)
    return undefined;
  if (kcal < 0 || kcal > 3000) return undefined;
  if (proteinG < 0 || proteinG > 200) return undefined;
  if (carbsG < 0 || carbsG > 400) return undefined;
  if (fatG < 0 || fatG > 200) return undefined;
  return { kcal, proteinG, carbsG, fatG };
}

// Strict allergen sanitiser: drop anything not in the allowed list, and drop
// fish/shellfish for veg items. Returns warnings for any drops.
export function sanitizeAllergens(
  raw: string[] | undefined,
  isVeg: boolean,
): { allergens: string[]; warnings: string[] } {
  if (!raw) return { allergens: [], warnings: [] };
  const warnings: string[] = [];
  const out: string[] = [];
  for (const a of raw) {
    const norm = a.toLowerCase().trim().replace(/\s+/g, "_");
    if (!ALLOWED_ALLERGENS.includes(norm)) {
      warnings.push(`dropped unknown allergen "${a}"`);
      continue;
    }
    if (isVeg && (norm === "fish" || norm === "shellfish")) {
      warnings.push(`dropped non-veg allergen "${norm}" on veg item`);
      continue;
    }
    if (!out.includes(norm)) out.push(norm);
  }
  return { allergens: out, warnings };
}

export function sanitizeCopy(
  raw: unknown,
  item: MenuItem,
  fields: CopyField[],
): { proposed: GeneratedCopy; warnings: string[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const warnings: string[] = [];
  const proposed: GeneratedCopy = {};
  const want = (f: CopyField) => fields.includes(f);

  if (want("name")) {
    const v = clampStr(o["name"], 60);
    if (v) proposed.name = v;
  }
  if (want("description")) {
    const v = clampStr(o["description"], 140);
    if (v) proposed.description = v;
  }
  if (want("longDescription")) {
    const v = clampStr(o["longDescription"], 400);
    if (v) proposed.longDescription = v;
  }
  if (want("seoTitle")) {
    const v = clampStr(o["seoTitle"], 60);
    if (v) proposed.seoTitle = v;
  }
  if (want("seoDescription")) {
    const v = clampStr(o["seoDescription"], 155);
    if (v) proposed.seoDescription = v;
  }
  if (want("cuisineTags")) {
    const r = sanitizeTagList(
      arrOfStrings(o["cuisineTags"], 8),
      ALLOWED_CUISINE_TAGS,
      3,
    );
    proposed.cuisineTags = r.values;
    warnings.push(...r.warnings);
  }
  if (want("vibeTags")) {
    const r = sanitizeTagList(
      arrOfStrings(o["vibeTags"], 8),
      ALLOWED_VIBE_TAGS,
      4,
    );
    proposed.vibeTags = r.values;
    warnings.push(...r.warnings);
  }
  if (want("allergens")) {
    const result = sanitizeAllergens(arrOfStrings(o["allergens"], 8), item.isVeg);
    proposed.allergens = result.allergens;
    warnings.push(...result.warnings);
  }
  if (want("macros")) {
    const m = safeMacros(o["macros"]);
    if (m) proposed.macros = m;
    else warnings.push("macros estimate missing or out of range, omitted");
  }
  return { proposed, warnings };
}

export function currentCopySlice(
  item: MenuItem,
  fields: CopyField[],
): Partial<GeneratedCopy> {
  const c: Partial<GeneratedCopy> = {};
  if (fields.includes("name")) c.name = item.name;
  if (fields.includes("description")) c.description = item.description;
  if (fields.includes("longDescription"))
    c.longDescription = item.longDescription ?? undefined;
  if (fields.includes("allergens"))
    c.allergens = item.allergens ?? undefined;
  if (fields.includes("cuisineTags"))
    c.cuisineTags = item.cuisineTags ?? undefined;
  if (fields.includes("vibeTags")) c.vibeTags = item.vibeTags ?? undefined;
  if (fields.includes("seoTitle")) c.seoTitle = item.seoTitle ?? undefined;
  if (fields.includes("seoDescription"))
    c.seoDescription = item.seoDescription ?? undefined;
  if (fields.includes("macros")) c.macros = item.macros ?? undefined;
  return c;
}

const TIMEOUT_MS = 12_000;

export async function generateCopyForItem(
  item: MenuItem,
  fields: CopyField[] = ALL_COPY_FIELDS,
): Promise<CopyDraft> {
  if (!process.env["GEMINI_API_KEY"] && !process.env["AI_INTEGRATIONS_GEMINI_API_KEY"]) {
    throw new Error("Gemini integration not configured");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const result = await generateText({
      model: getModel(),
      prompt: buildPrompt(item, fields),
      abortSignal: ctrl.signal,
    });
    clearTimeout(timer);
    const parsed = tryParseJson(result.text);
    const { proposed, warnings } = sanitizeCopy(parsed, item, fields);
    return {
      slug: item.slug,
      current: currentCopySlice(item, fields),
      proposed,
      warnings,
      fields,
      modelId: DEFAULT_MODEL_ID,
    };
  } catch (err) {
    clearTimeout(timer);
    logger.warn(
      { err: String(err), slug: item.slug },
      "menuCopy.generate failed",
    );
    throw err;
  }
}

export type AcceptCopyInput = Partial<{
  name: string;
  description: string;
  longDescription: string;
  allergens: string[];
  cuisineTags: string[];
  vibeTags: string[];
  seoTitle: string;
  seoDescription: string;
  macros: MacrosEstimate;
}>;

export interface ApplyResult {
  item: MenuItem | null;
  warnings: string[];
}

// Sanitises an editor-accepted patch BEFORE writing. Every list-typed field is
// re-validated against its whitelist (allergens, cuisine tags, vibe tags) so
// even direct REST callers cannot inject unsafe values. Returns the sanitised
// patch plus any warnings about dropped values.
export function sanitizeAcceptedPatch(
  patch: AcceptCopyInput,
  isVeg: boolean,
): { patch: AcceptCopyInput; warnings: string[] } {
  const out: AcceptCopyInput = {};
  const warnings: string[] = [];
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.longDescription !== undefined)
    out.longDescription = patch.longDescription;
  if (patch.seoTitle !== undefined) out.seoTitle = patch.seoTitle;
  if (patch.seoDescription !== undefined)
    out.seoDescription = patch.seoDescription;
  if (patch.allergens !== undefined) {
    const r = sanitizeAllergens(patch.allergens, isVeg);
    out.allergens = r.allergens;
    warnings.push(...r.warnings);
  }
  if (patch.cuisineTags !== undefined) {
    const r = sanitizeTagList(patch.cuisineTags, ALLOWED_CUISINE_TAGS, 3);
    out.cuisineTags = r.values;
    warnings.push(...r.warnings);
  }
  if (patch.vibeTags !== undefined) {
    const r = sanitizeTagList(patch.vibeTags, ALLOWED_VIBE_TAGS, 4);
    out.vibeTags = r.values;
    warnings.push(...r.warnings);
  }
  if (patch.macros !== undefined) {
    const m = safeMacros(patch.macros);
    if (m) out.macros = m;
    else warnings.push("rejected out-of-range macros on apply");
  }
  return { patch: out, warnings };
}

export async function applyCopyToItem(
  slug: string,
  patch: AcceptCopyInput,
  operatorId: string | null,
): Promise<ApplyResult> {
  const item = await db
    .select()
    .from(menuItemsTable)
    .where(eq(menuItemsTable.slug, slug))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (!item) return { item: null, warnings: [] };
  const { patch: clean, warnings } = sanitizeAcceptedPatch(patch, item.isVeg);
  const set: Record<string, unknown> = {};
  if (clean.name !== undefined) set["name"] = clean.name;
  if (clean.description !== undefined) set["description"] = clean.description;
  if (clean.longDescription !== undefined)
    set["longDescription"] = clean.longDescription;
  if (clean.allergens !== undefined) set["allergens"] = clean.allergens;
  if (clean.cuisineTags !== undefined) set["cuisineTags"] = clean.cuisineTags;
  if (clean.vibeTags !== undefined) set["vibeTags"] = clean.vibeTags;
  if (clean.seoTitle !== undefined) set["seoTitle"] = clean.seoTitle;
  if (clean.seoDescription !== undefined)
    set["seoDescription"] = clean.seoDescription;
  if (clean.macros !== undefined) {
    set["macros"] = clean.macros;
    set["macrosAreEstimate"] = true;
  }
  if (Object.keys(set).length === 0) return { item, warnings };
  set["copyGeneratedAt"] = new Date();
  set["copyGeneratedBy"] = operatorId ?? "system";
  const [row] = await db
    .update(menuItemsTable)
    .set(set)
    .where(eq(menuItemsTable.slug, slug))
    .returning();
  return { item: row ?? null, warnings };
}

export function detectMissingFields(item: MenuItem): CopyField[] {
  const missing: CopyField[] = [];
  if (!item.longDescription) missing.push("longDescription");
  if (!item.allergens || item.allergens.length === 0) missing.push("allergens");
  if (!item.cuisineTags || item.cuisineTags.length === 0)
    missing.push("cuisineTags");
  if (!item.vibeTags || item.vibeTags.length === 0) missing.push("vibeTags");
  if (!item.seoTitle) missing.push("seoTitle");
  if (!item.seoDescription) missing.push("seoDescription");
  if (!item.macros) missing.push("macros");
  return missing;
}
