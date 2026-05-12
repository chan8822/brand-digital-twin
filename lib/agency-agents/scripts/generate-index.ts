import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONTENT_DIR = join(ROOT, "content");
const OUT_FILE = join(ROOT, "src", "agents.generated.ts");
const UPSTREAM = "https://github.com/msitarzewski/agency-agents";

interface Frontmatter {
  name?: string;
  description?: string;
  color?: string;
  emoji?: string;
  vibe?: string;
}

function parseFrontmatter(raw: string): { fm: Frontmatter; body: string } {
  // Hand-rolled parser: every agent file follows the same simple shape
  // (name/description/color/emoji/vibe — flat strings, sometimes quoted).
  // Avoids pulling in a yaml dependency for what is effectively static
  // build-time content.
  if (!raw.startsWith("---")) return { fm: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { fm: {}, body: raw };
  const block = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const fm: Frontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2].trim();
    // Strip matching surrounding quotes (single or double).
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    (fm as Record<string, string>)[m[1]] = val;
  }
  return { fm, body };
}

function titleFromFilename(file: string): string {
  return file
    .replace(/\.md$/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function titleFromBody(body: string): string | undefined {
  // Parse title from the first H1 heading.
  for (const line of body.split(/\r?\n/)) {
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) return m[1].trim();
  }
  return undefined;
}

function shortDescription(body: string): string {
  // First non-empty paragraph after the first H1, stripped of markdown
  // emphasis. Capped so card UIs stay tidy.
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].startsWith("# ")) i++;
  i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  const buf: string[] = [];
  while (i < lines.length && lines[i].trim() !== "") {
    buf.push(lines[i]);
    i++;
  }
  const para = buf
    .join(" ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (para.length <= 240) return para;
  return para.slice(0, 237).trimEnd() + "…";
}

function divisionLabel(dir: string): string {
  return dir
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface AgentRecord {
  slug: string;
  title: string;
  division: string;
  divisionLabel: string;
  description: string;
  color?: string;
  emoji?: string;
  vibe?: string;
  filePath: string;
  markdown: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

const records: AgentRecord[] = [];
const divisionDirs = readdirSync(CONTENT_DIR).filter((d) => {
  return statSync(join(CONTENT_DIR, d)).isDirectory();
});
for (const division of divisionDirs.sort()) {
  const dirPath = join(CONTENT_DIR, division);
  for (const filePath of walk(dirPath)) {
    const raw = readFileSync(filePath, "utf8");
    const { fm, body } = parseFrontmatter(raw);
    const relFromDivision = relative(dirPath, filePath).replace(/\\/g, "/");
    const slugTail = relFromDivision.replace(/\.md$/, "");
    const slug = `${division}/${slugTail}`;
    const fileName = relFromDivision.split("/").pop() ?? relFromDivision;
    records.push({
      slug,
      // Prefer H1 from the body; fall back to frontmatter `name`,
      // then a humanised filename.
      title:
        titleFromBody(body) ||
        fm.name?.trim() ||
        titleFromFilename(fileName),
      division,
      divisionLabel: divisionLabel(division),
      // Prefer the first body paragraph; fall back to frontmatter
      // `description` when the body has no prose under the H1.
      description: shortDescription(body) || fm.description?.trim() || "",
      color: fm.color?.trim() || undefined,
      emoji: fm.emoji?.trim() || undefined,
      vibe: fm.vibe?.trim() || undefined,
      filePath: relative(ROOT, filePath).replace(/\\/g, "/"),
      markdown: raw,
    });
  }
}

const divisions = Array.from(
  new Map(
    records.map((r) => [r.division, { slug: r.division, label: r.divisionLabel }]),
  ).values(),
).sort((a, b) => a.label.localeCompare(b.label));

const lines: string[] = [];
lines.push(
  "// AUTO-GENERATED by scripts/generate-index.ts — do not edit by hand.",
  "// Re-run `pnpm --filter @workspace/agency-agents run generate` after",
  "// changing files in `content/`.",
  "",
  "export interface Agent {",
  "  slug: string;",
  "  title: string;",
  "  division: string;",
  "  divisionLabel: string;",
  "  description: string;",
  "  color?: string;",
  "  emoji?: string;",
  "  vibe?: string;",
  "  filePath: string;",
  "  markdown: string;",
  "}",
  "",
  "export interface Division {",
  "  slug: string;",
  "  label: string;",
  "}",
  "",
  `export const UPSTREAM_REPO_URL = ${JSON.stringify(UPSTREAM)};`,
  "",
  `export const divisions: ReadonlyArray<Division> = ${JSON.stringify(divisions, null, 2)};`,
  "",
  "export const agents: ReadonlyArray<Agent> = [",
);
for (const r of records) {
  lines.push("  {");
  lines.push(`    slug: ${JSON.stringify(r.slug)},`);
  lines.push(`    title: ${JSON.stringify(r.title)},`);
  lines.push(`    division: ${JSON.stringify(r.division)},`);
  lines.push(`    divisionLabel: ${JSON.stringify(r.divisionLabel)},`);
  lines.push(`    description: ${JSON.stringify(r.description)},`);
  if (r.color) lines.push(`    color: ${JSON.stringify(r.color)},`);
  if (r.emoji) lines.push(`    emoji: ${JSON.stringify(r.emoji)},`);
  if (r.vibe) lines.push(`    vibe: ${JSON.stringify(r.vibe)},`);
  lines.push(`    filePath: ${JSON.stringify(r.filePath)},`);
  lines.push(`    markdown: ${JSON.stringify(r.markdown)},`);
  lines.push("  },");
}
lines.push("];", "");

lines.push(
  "const _byDivision = new Map<string, Agent[]>();",
  "for (const a of agents) {",
  "  const arr = _byDivision.get(a.division) ?? [];",
  "  arr.push(a);",
  "  _byDivision.set(a.division, arr);",
  "}",
  "export const agentsByDivision: ReadonlyMap<string, ReadonlyArray<Agent>> = _byDivision;",
  "",
  "const _bySlug = new Map<string, Agent>(agents.map((a) => [a.slug, a]));",
  "export function agentBySlug(slug: string): Agent | undefined {",
  "  return _bySlug.get(slug);",
  "}",
  "",
);

writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
// eslint-disable-next-line no-console
console.log(
  `generated ${OUT_FILE} with ${records.length} agents across ${divisions.length} divisions`,
);
