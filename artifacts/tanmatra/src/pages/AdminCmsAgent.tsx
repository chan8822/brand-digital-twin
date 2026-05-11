import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MenuPhotosPanel } from "@/components/cms/MenuPhotosPanel";
import { API_BASE } from "@/lib/apiBase";

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

interface ToolCall {
  name: string;
  args: unknown;
  result: unknown;
  ok: boolean;
  ms: number;
}

interface Msg {
  id: string;
  role: "user" | "agent";
  text: string;
  toolCalls?: ToolCall[];
  ts: string;
}

interface AuditRow {
  id: number;
  operatorId: string | null;
  agent: string;
  action: string;
  params: unknown;
  beforeState: unknown;
  afterState: unknown;
  status: string;
  reasoning: string | null;
  createdAt: string;
}

interface MenuItemRow {
  id: number;
  slug: string;
  name: string;
  category: string;
  kitchenLocation: string;
  pricePaise: number;
  isVeg: boolean;
  isAvailable: boolean;
  availabilityWindow: string[] | null;
  imageUrl?: string | null;
}

type CopyField =
  | "name"
  | "description"
  | "longDescription"
  | "allergens"
  | "cuisineTags"
  | "vibeTags"
  | "seoTitle"
  | "seoDescription"
  | "macros";

interface MacrosEstimate {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface CopyDraft {
  slug: string;
  current: Partial<Record<CopyField, unknown>>;
  proposed: Partial<Record<CopyField, unknown>>;
  warnings: string[];
  fields: CopyField[];
  modelId: string;
}

const COPY_FIELDS: CopyField[] = [
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

function CopyFieldEditor({
  field,
  value,
  onChange,
}: {
  field: CopyField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const isTextArea =
    field === "description" ||
    field === "longDescription" ||
    field === "seoDescription";
  const isList =
    field === "allergens" || field === "cuisineTags" || field === "vibeTags";

  if (field === "macros") {
    const m = (value ?? {
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    }) as MacrosEstimate;
    const update = (k: keyof MacrosEstimate, v: number) =>
      onChange({ ...m, [k]: v });
    return (
      <div className="grid grid-cols-2 gap-1">
        {(["kcal", "proteinG", "carbsG", "fatG"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1 text-[11px]">
            <span className="w-12 text-muted-foreground">{k}</span>
            <input
              type="number"
              className="w-full border rounded px-1 py-0.5 bg-background"
              value={m[k] ?? 0}
              onChange={(e) =>
                update(k, Number.isFinite(+e.target.value) ? +e.target.value : 0)
              }
            />
          </label>
        ))}
      </div>
    );
  }

  if (isList) {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <input
        className="w-full border rounded px-1 py-0.5 bg-background text-xs"
        value={arr.join(", ")}
        placeholder="comma,separated,tags"
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }

  const str = typeof value === "string" ? value : "";
  if (isTextArea) {
    return (
      <textarea
        className="w-full border rounded px-1 py-0.5 bg-background text-xs"
        rows={field === "longDescription" ? 4 : 2}
        value={str}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="w-full border rounded px-1 py-0.5 bg-background text-xs"
      value={str}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function fmt(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "object") {
    const m = v as Partial<MacrosEstimate>;
    if (m.kcal != null)
      return `${m.kcal} kcal · ${m.proteinG}p / ${m.carbsG}c / ${m.fatG}f`;
    return JSON.stringify(v);
  }
  return String(v);
}

const QUICK_ACTIONS: Array<{ label: string; message: string }> = [
  {
    label: "List menu items",
    message: "Show me the current menu items.",
  },
  {
    label: "Create paneer wrap",
    message:
      'Create a new menu item: "Paneer Wrap" at ₹220, category wraps, vegetarian, available only at lunch. Preview first.',
  },
  {
    label: "86 all desserts at HSR",
    message:
      'Toggle off all desserts in HSR Kitchen for tonight (reason: low traffic). Preview first.',
  },
  {
    label: "Bump aglio-olio price",
    message: "Update the price of aglio-olio-veg to ₹140. Preview first.",
  },
  {
    label: "Bulk regenerate missing copy (wraps)",
    message:
      'Regenerate any missing copy fields for items in the wraps category. Preview first, then I will say confirm.',
  },
];

function newId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function AdminCmsAgent() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: newId(),
      role: "agent",
      text:
        'CMS Assistant ready. Try "create a new paneer wrap at ₹220, vegetarian, available only at lunch" or "toggle off all desserts in HSR Kitchen for tonight". I always show a preview before committing any change.',
      ts: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [copySlug, setCopySlug] = useState<string>("");
  const [copyDraft, setCopyDraft] = useState<CopyDraft | null>(null);
  const [copyEdits, setCopyEdits] = useState<Partial<Record<CopyField, unknown>>>(
    {},
  );
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [bulkMissingOnly, setBulkMissingOnly] = useState(true);
  const [bulkPreview, setBulkPreview] = useState<
    Array<{ slug: string; name: string; missing: CopyField[] }> | null
  >(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [photoSlug, setPhotoSlug] = useState<string>("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [adminToken, setAdminToken] = useState<string>(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const persistToken = (val: string) => {
    setAdminToken(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem(ADMIN_TOKEN_KEY, val);
      else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  };

  const authedHeaders = (): HeadersInit => {
    const h: HeadersInit = {};
    if (adminToken) h["x-admin-token"] = adminToken;
    return h;
  };

  const loadAudit = async () => {
    try {
      const res = await fetch(`${API_BASE}/cms-agent/audit?limit=20`, {
        credentials: "include",
        headers: authedHeaders(),
      });
      if (res.status === 403) {
        setError("Catalog scope required — set an admin token below.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { actions: AuditRow[] };
      setAudit(json.actions);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/menu/items`, {
        credentials: "include",
        headers: authedHeaders(),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { items: MenuItemRow[] };
      setItems(json.items);
    } catch {
      // ignore — surfaced via audit error already
    }
  };

  useEffect(() => {
    void loadAudit();
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const generateCopy = async (slug: string, fields?: CopyField[]) => {
    if (!slug) return;
    setCopyBusy(true);
    setCopyError(null);
    if (!fields) {
      setCopyDraft(null);
      setCopyEdits({});
    }
    try {
      const res = await fetch(`${API_BASE}/menu/items/${slug}/generate-copy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authedHeaders() },
        body: JSON.stringify(fields ? { fields } : {}),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { draft: CopyDraft };
      if (fields && copyDraft && copyDraft.slug === slug) {
        // Per-field regenerate: merge proposed/current for the requested fields
        // and refresh edit buffers for them only.
        setCopyDraft((prev) =>
          prev
            ? {
                ...prev,
                proposed: { ...prev.proposed, ...j.draft.proposed },
                current: { ...prev.current, ...j.draft.current },
                warnings: j.draft.warnings,
                modelId: j.draft.modelId,
              }
            : j.draft,
        );
        setCopyEdits((prev) => {
          const next = { ...prev };
          for (const f of fields) next[f] = j.draft.proposed[f];
          return next;
        });
      } else {
        setCopyDraft(j.draft);
        setCopyEdits({ ...j.draft.proposed });
      }
    } catch (err) {
      setCopyError((err as Error).message);
    } finally {
      setCopyBusy(false);
    }
  };

  const acceptCopyField = async (field: CopyField) => {
    if (!copyDraft) return;
    const value = copyEdits[field] ?? copyDraft.proposed[field];
    if (value == null) return;
    setCopyBusy(true);
    setCopyError(null);
    try {
      const res = await fetch(`${API_BASE}/menu/items/${copyDraft.slug}/copy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authedHeaders() },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as {
        item: unknown;
        warnings?: string[];
      };
      // Patch local draft so accepted field becomes the "current" value.
      setCopyDraft((prev) =>
        prev
          ? {
              ...prev,
              current: { ...prev.current, [field]: value },
              warnings:
                j.warnings && j.warnings.length > 0
                  ? [...prev.warnings, ...j.warnings]
                  : prev.warnings,
            }
          : prev,
      );
      void loadItems();
      void loadAudit();
    } catch (err) {
      setCopyError((err as Error).message);
    } finally {
      setCopyBusy(false);
    }
  };

  const loadBulkPreview = async () => {
    setBulkBusy(true);
    setBulkError(null);
    setBulkPreview(null);
    try {
      const qs = new URLSearchParams();
      if (bulkCategory) qs.set("category", bulkCategory);
      const res = await fetch(`${API_BASE}/menu/copy/missing?${qs.toString()}`, {
        credentials: "include",
        headers: authedHeaders(),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as {
        items: Array<{ slug: string; name: string; missing: CopyField[] }>;
      };
      const filtered = bulkMissingOnly
        ? j.items.filter((it) => it.missing.length > 0)
        : j.items;
      setBulkPreview(filtered.slice(0, 25));
    } catch (err) {
      setBulkError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const uploadPhotoFile = async (file: File) => {
    if (!photoSlug) {
      setPhotoError("pick an item first");
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    setPhotoUrl(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/menu/uploads`, {
        method: "POST",
        credentials: "include",
        headers: authedHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { url: string };
      setPhotoUrl(j.url);
      // Hand off to the agent — same upload_image two-step preview/confirm
      // flow as if the editor had pasted the URL themselves.
      const slug = photoSlug;
      const name =
        items.find((it) => it.slug === slug)?.name ?? slug;
      await sendText(
        `I just uploaded a new photo for "${name}" (slug: ${slug}). Please attach this URL using upload_image: ${j.url}. Preview first.`,
      );
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const runBulkRegenerate = async () => {
    if (!bulkPreview || bulkPreview.length === 0) return;
    const slugs = bulkPreview.map((p) => p.slug).slice(0, 25);
    const msg = `Run bulk_regenerate_copy on these slugs: ${slugs.join(", ")}. Use missingOnly=${bulkMissingOnly}. Preview first, then I will say confirm.`;
    await sendText(msg);
  };

  const categories = Array.from(
    new Set(items.map((it) => it.category)),
  ).sort();

  const sendText = async (text: string) => {
    if (!text || busy) return;
    setInput(text);
    await Promise.resolve();
    await sendInner(text);
  };

  const send = async () => {
    const text = input.trim();
    await sendInner(text);
  };

  const sendInner = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", text, ts: new Date().toISOString() },
    ]);
    setInput("");
    setBusy(true);
    setError(null);

    const agentMsg: Msg = {
      id: newId(),
      role: "agent",
      text: "",
      toolCalls: [],
      ts: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, agentMsg]);

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (adminToken) headers["x-admin-token"] = adminToken;
      const res = await fetch(`${API_BASE}/cms-agent/chat`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ message: text, history }),
      });
      if (res.status === 403) {
        setError("Catalog scope required — set an admin token.");
        setBusy(false);
        return;
      }
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "text-delta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsg.id ? { ...m, text: m.text + event.delta } : m,
              ),
            );
          } else if (event.type === "finish") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsg.id
                  ? { ...m, text: event.text, toolCalls: event.toolCalls }
                  : m,
              ),
            );
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
      void loadAudit();
      void loadItems();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container mx-auto py-8 grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">CMS Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Catalog editor chat. Every mutating action shows a preview first
            and waits for your confirmation before writing. Full audit log on
            the right.
          </p>
        </div>

        <Card>
          <CardContent className="pt-4 space-y-2">
            <label className="text-sm font-medium">Admin token</label>
            <Input
              type="password"
              placeholder="x-admin-token (or rely on CATALOG_USER_IDS allowlist)"
              value={adminToken}
              onChange={(e) => persistToken(e.target.value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Catalog ({items.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No items yet. Ask the assistant to create one.
              </div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
                {items.map((it) => (
                  <div
                    key={it.slug}
                    className="flex items-center justify-between border-b py-1 gap-2"
                  >
                    <div className="flex-1 truncate">
                      <span className="font-medium">{it.name}</span>{" "}
                      <span className="text-muted-foreground">
                        · {it.category} · {it.kitchenLocation}
                      </span>
                    </div>
                    <Badge variant={it.isAvailable ? "default" : "destructive"}>
                      {it.isAvailable ? "available" : "86"}
                    </Badge>
                    <span className="text-muted-foreground tabular-nums w-14 text-right">
                      ₹{(it.pricePaise / 100).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Copy & tags generator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <select
                className="flex-1 border rounded-md px-2 py-1 text-sm bg-background"
                value={copySlug}
                onChange={(e) => setCopySlug(e.target.value)}
              >
                <option value="">Select an item…</option>
                {items.map((it) => (
                  <option key={it.slug} value={it.slug}>
                    {it.name} ({it.slug})
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => void generateCopy(copySlug)}
                disabled={!copySlug || copyBusy}
              >
                {copyBusy ? "…" : "Generate"}
              </Button>
            </div>
            {copyError && (
              <div className="text-sm text-destructive">{copyError}</div>
            )}
            {copyDraft && (
              <div className="space-y-2">
                {copyDraft.warnings.length > 0 && (
                  <div className="text-xs text-amber-600 border border-amber-300 rounded p-2 bg-amber-50">
                    {copyDraft.warnings.map((w, i) => (
                      <div key={i}>⚠ {w}</div>
                    ))}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground">
                  Macros are model estimates — please double-check before publishing.
                  {" "}
                  Model: {copyDraft.modelId}
                </div>
                <div className="space-y-2">
                  {COPY_FIELDS.filter(
                    (f) => copyDraft.proposed[f] != null,
                  ).map((f) => {
                    const cur = copyDraft.current[f];
                    const edited = copyEdits[f];
                    const editedSerialised = JSON.stringify(edited ?? null);
                    const same = editedSerialised === JSON.stringify(cur ?? null);
                    return (
                      <div
                        key={f}
                        className="border rounded-md p-2 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium uppercase tracking-wide text-[10px]">
                            {f}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={copyBusy || same}
                              onClick={() => void acceptCopyField(f)}
                            >
                              {same ? "no change" : "Accept"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={copyBusy}
                              title="Regenerate just this field"
                              onClick={() =>
                                void generateCopy(copyDraft.slug, [f])
                              }
                            >
                              ↻
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-muted-foreground">
                              current
                            </div>
                            <div className="whitespace-pre-wrap">{fmt(cur)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground">
                              proposed (editable)
                            </div>
                            <CopyFieldEditor
                              field={f}
                              value={edited}
                              onChange={(v) =>
                                setCopyEdits((prev) => ({ ...prev, [f]: v }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload menu photo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Pick an item, then drop in a JPG/PNG/WebP (≤10MB). The photo
              uploads to storage and the assistant will preview attaching it
              before committing — same confirmation flow as a pasted URL.
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="flex-1 min-w-[180px] border rounded-md px-2 py-1 text-sm bg-background"
                value={photoSlug}
                onChange={(e) => setPhotoSlug(e.target.value)}
                disabled={photoBusy}
              >
                <option value="">Select an item…</option>
                {items.map((it) => (
                  <option key={it.slug} value={it.slug}>
                    {it.name} ({it.slug})
                  </option>
                ))}
              </select>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={photoBusy || !photoSlug}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPhotoFile(f);
                }}
                className="text-xs"
              />
            </div>
            {photoBusy && (
              <div className="text-xs text-muted-foreground">Uploading…</div>
            )}
            {photoError && (
              <div className="text-sm text-destructive">{photoError}</div>
            )}
            {photoUrl && (
              <div className="text-xs text-muted-foreground break-all">
                Uploaded: <span className="font-mono">{photoUrl}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <MenuPhotosPanel
          items={items}
          adminToken={adminToken}
          onPrimaryChanged={() => void loadItems()}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Bulk regenerate missing copy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="border rounded-md px-2 py-1 text-sm bg-background"
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label className="text-xs flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={bulkMissingOnly}
                  onChange={(e) => setBulkMissingOnly(e.target.checked)}
                />
                Missing fields only
              </label>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void loadBulkPreview()}
              >
                {bulkBusy ? "…" : "Preview"}
              </Button>
              <Button
                size="sm"
                disabled={
                  bulkBusy || !bulkPreview || bulkPreview.length === 0 || busy
                }
                onClick={() => void runBulkRegenerate()}
              >
                Run via assistant
              </Button>
            </div>
            {bulkError && (
              <div className="text-sm text-destructive">{bulkError}</div>
            )}
            {bulkPreview && (
              <div className="text-xs space-y-1 max-h-48 overflow-auto border rounded-md p-2">
                {bulkPreview.length === 0 && (
                  <div className="text-muted-foreground">
                    Nothing to regenerate — every item in this filter has
                    complete copy.
                  </div>
                )}
                {bulkPreview.map((p) => (
                  <div
                    key={p.slug}
                    className="flex items-start justify-between gap-2"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">
                      {p.missing.length > 0
                        ? `missing: ${p.missing.join(", ")}`
                        : "complete"}
                    </span>
                  </div>
                ))}
                {bulkPreview.length > 0 && (
                  <div className="text-[10px] text-muted-foreground pt-1 border-t mt-1">
                    Capped at 25 items per run. Click "Run via assistant" — the
                    chat panel will preview each item, then say "confirm".
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((a) => (
              <Button
                key={a.label}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void sendText(a.message)}
              >
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="flex flex-col h-[600px]">
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden flex flex-col gap-3">
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-md p-3 text-sm ${
                    m.role === "user"
                      ? "bg-primary/10 ml-12"
                      : "bg-muted mr-12"
                  }`}
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {m.role === "user" ? "You" : "CMS Assistant"}
                  </div>
                  <div className="whitespace-pre-wrap">{m.text || "…"}</div>
                  {m.toolCalls && m.toolCalls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.toolCalls.map((t, i) => (
                        <Badge
                          key={i}
                          variant={t.ok ? "secondary" : "destructive"}
                        >
                          {t.name} ({t.ms}ms)
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder='e.g. "create a new paneer wrap at ₹220, lunch only"'
                disabled={busy}
              />
              <Button onClick={() => void send()} disabled={busy}>
                {busy ? "…" : "Send"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="h-[700px] flex flex-col">
        <CardHeader>
          <CardTitle>CMS audit log</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2">
              {audit.map((a) => (
                <div key={a.id} className="border rounded-md p-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={a.status === "success" ? "default" : "destructive"}
                    >
                      {a.action}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(a.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    operator: {a.operatorId ?? "—"} · agent: {a.agent}
                  </div>
                  {a.reasoning && (
                    <div className="mt-1 italic text-muted-foreground">
                      “{a.reasoning}”
                    </div>
                  )}
                  <pre className="mt-1 text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(a.params, null, 2)}
                  </pre>
                </div>
              ))}
              {audit.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No CMS actions yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
