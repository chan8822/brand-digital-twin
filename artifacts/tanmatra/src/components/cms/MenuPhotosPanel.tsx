import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface MenuItemRow {
  slug: string;
  name: string;
  imageUrl?: string | null;
}

interface Asset {
  id: number;
  slug: string;
  kind: "original" | "enhanced" | "hero" | "nobg";
  publicUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  isAiGenerated: number;
  provenance: {
    source?: string;
    model?: string;
    pipeline?: string[];
    prompt?: string;
  } | null;
  createdAt: string;
}

const KIND_LABEL: Record<Asset["kind"], string> = {
  original: "Original",
  enhanced: "Enhanced",
  hero: "AI Hero",
  nobg: "No BG",
};

const KIND_VARIANT: Record<
  Asset["kind"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  original: "outline",
  enhanced: "secondary",
  hero: "default",
  nobg: "secondary",
};

async function authedFetch(
  url: string,
  init: RequestInit,
  adminToken: string,
): Promise<Response> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (adminToken) headers["x-admin-token"] = adminToken;
  return fetch(url, { ...init, credentials: "include", headers });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = String(reader.result ?? "");
      const idx = str.indexOf(",");
      resolve(idx >= 0 ? str.slice(idx + 1) : str);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

interface MissingItem {
  slug: string;
  name: string;
  category: string;
  kitchenLocation: string;
}

interface BulkHeroResult {
  slug: string;
  ok: boolean;
  assetId?: number;
  imageUrl?: string;
  error?: string;
}

export function MenuPhotosPanel({
  items,
  adminToken,
  onPrimaryChanged,
}: {
  items: MenuItemRow[];
  adminToken: string;
  onPrimaryChanged?: () => void;
}) {
  const [slug, setSlug] = useState<string>(items[0]?.slug ?? "");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [bulkPreview, setBulkPreview] = useState<{
    items: MissingItem[];
    total: number;
    cap: number;
    cappedAtCap: boolean;
  } | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkHeroResult[] | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [dropFilter, setDropFilter] = useState("");
  const [dragOverSlug, setDragOverSlug] = useState<string | null>(null);
  const [dropBusySlug, setDropBusySlug] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [dropToast, setDropToast] = useState<string | null>(null);

  useEffect(() => {
    if (!slug && items[0]) setSlug(items[0].slug);
  }, [items, slug]);

  const load = async (s: string) => {
    if (!s) {
      setAssets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/items/${encodeURIComponent(s)}/assets`,
        { method: "GET" },
        adminToken,
      );
      if (res.status === 403) {
        setError("Catalog scope required — set an admin token above.");
        setAssets([]);
        return;
      }
      const json = (await res.json()) as { assets?: Asset[] };
      setAssets(json.assets ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, adminToken]);

  const onUpload = async (file: File) => {
    if (!slug) return;
    if (!file.type.startsWith("image/")) {
      setError("only image files");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("file larger than 10MB");
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await authedFetch(
        `/api/menu/items/${encodeURIComponent(slug)}/assets/upload`,
        {
          method: "POST",
          body: JSON.stringify({ dataBase64, mimeType: file.type }),
        },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const generateHero = async () => {
    setBusy("hero");
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/items/${encodeURIComponent(slug)}/assets/hero`,
        {
          method: "POST",
          body: JSON.stringify(extra ? { extraInstructions: extra } : {}),
        },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const enhance = async (id: number) => {
    setBusy(`enh-${id}`);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/assets/${id}/enhance`,
        { method: "POST" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeBg = async (id: number) => {
    setBusy(`bg-${id}`);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/assets/${id}/remove-bg`,
        { method: "POST" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setPrimary = async (id: number) => {
    setBusy(`pri-${id}`);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/assets/${id}/set-primary`,
        { method: "POST" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      onPrimaryChanged?.();
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const loadBulkPreview = async () => {
    setBusy("bulk-preview");
    setBulkError(null);
    setBulkResults(null);
    try {
      const res = await authedFetch(
        `/api/menu/items/missing-images`,
        { method: "GET" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as {
        items: MissingItem[];
        total: number;
        cap: number;
        cappedAtCap: boolean;
      };
      setBulkPreview(json);
    } catch (err) {
      setBulkError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runBulkHero = async () => {
    if (!bulkPreview || bulkPreview.items.length === 0) return;
    const slugs = bulkPreview.items
      .slice(0, bulkPreview.cap)
      .map((it) => it.slug);
    if (
      !window.confirm(
        `Generate AI hero photos for ${slugs.length} item${
          slugs.length === 1 ? "" : "s"
        }? Each will be set as that item's primary photo and flagged AI-generated.`,
      )
    )
      return;
    setBusy("bulk-run");
    setBulkError(null);
    setBulkResults(null);
    try {
      const res = await authedFetch(
        `/api/menu/items/assets/bulk-hero`,
        { method: "POST", body: JSON.stringify({ slugs, confirm: true }) },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as {
        attempted: number;
        succeeded: number;
        failed: number;
        results: BulkHeroResult[];
      };
      onPrimaryChanged?.();
      // Refresh the preview FIRST (it clears bulkResults as part of its
      // reset) so we can then surface the run results without losing them.
      await loadBulkPreview();
      setBulkResults(json.results);
      // If the currently-selected slug was in the run, refresh its assets.
      if (slugs.includes(slug)) await load(slug);
    } catch (err) {
      setBulkError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDropUpload = async (targetSlug: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      setDropError(`${file.name}: only image files`);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setDropError(`${file.name}: must be JPEG, PNG, or WebP`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setDropError(`${file.name}: file larger than 10MB`);
      return;
    }
    setDropBusySlug(targetSlug);
    setDropError(null);
    setDropToast(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const upRes = await authedFetch(
        `/api/menu/items/${encodeURIComponent(targetSlug)}/assets/upload`,
        {
          method: "POST",
          body: JSON.stringify({ dataBase64, mimeType: file.type }),
        },
        adminToken,
      );
      if (!upRes.ok) throw new Error(await upRes.text());
      const upJson = (await upRes.json()) as {
        original?: { id: number };
        enhanced?: { id: number };
      };
      const primaryId = upJson.enhanced?.id ?? upJson.original?.id;
      if (primaryId) {
        const pRes = await authedFetch(
          `/api/menu/assets/${primaryId}/set-primary`,
          { method: "POST" },
          adminToken,
        );
        if (!pRes.ok) throw new Error(await pRes.text());
      }
      onPrimaryChanged?.();
      if (targetSlug === slug) await load(slug);
      const name =
        items.find((it) => it.slug === targetSlug)?.name ?? targetSlug;
      setDropToast(`Uploaded and set as primary: ${name}`);
    } catch (err) {
      setDropError((err as Error).message);
    } finally {
      setDropBusySlug(null);
    }
  };

  const removeAsset = async (id: number) => {
    if (!window.confirm("Delete this derivative? Originals can't be deleted."))
      return;
    setBusy(`del-${id}`);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/menu/assets/${id}`,
        { method: "DELETE" },
        adminToken,
      );
      if (!res.ok) throw new Error(await res.text());
      await load(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const currentItem = items.find((it) => it.slug === slug);
  const primaryUrl = currentItem?.imageUrl ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="border rounded-md p-2 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-xs font-medium">
                Drag-and-drop a photo onto an item
              </div>
              <div className="text-[11px] text-muted-foreground">
                Drop a JPG/PNG/WebP (≤10MB) on a card to upload it and set it
                as that item's primary photo.
              </div>
            </div>
            <input
              className="border rounded-md px-2 py-1 text-xs bg-background w-44"
              placeholder="Filter items…"
              value={dropFilter}
              onChange={(e) => setDropFilter(e.target.value)}
            />
          </div>
          {dropError && (
            <div className="text-xs text-destructive">{dropError}</div>
          )}
          {dropToast && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400">
              {dropToast}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-auto">
            {items
              .filter((it) => {
                const q = dropFilter.trim().toLowerCase();
                if (!q) return true;
                return (
                  it.name.toLowerCase().includes(q) ||
                  it.slug.toLowerCase().includes(q)
                );
              })
              .slice(0, 60)
              .map((it) => {
                const isOver = dragOverSlug === it.slug;
                const isBusy = dropBusySlug === it.slug;
                return (
                  <div
                    key={it.slug}
                    onClick={() => setSlug(it.slug)}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverSlug(it.slug);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "copy";
                      if (dragOverSlug !== it.slug) setDragOverSlug(it.slug);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragOverSlug === it.slug) setDragOverSlug(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverSlug(null);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleDropUpload(it.slug, f);
                    }}
                    className={`group relative cursor-pointer border rounded-md overflow-hidden bg-background transition-all ${
                      isOver
                        ? "ring-2 ring-primary border-primary"
                        : slug === it.slug
                          ? "border-primary"
                          : "border-border"
                    }`}
                    title={`Drop a photo to set as ${it.name}'s primary`}
                  >
                    <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                      {it.imageUrl ? (
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground px-2 text-center">
                          No primary photo
                        </span>
                      )}
                    </div>
                    <div className="px-2 py-1 text-[11px] font-medium truncate">
                      {it.name}
                    </div>
                    {(isOver || isBusy) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-[11px] font-medium">
                        {isBusy ? "Uploading…" : "Drop to upload"}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
          {items.length > 60 && !dropFilter && (
            <div className="text-[10px] text-muted-foreground">
              Showing first 60 items. Use the filter to find more.
            </div>
          )}
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <select
            className="flex-1 min-w-[200px] border rounded-md px-2 py-1 text-sm bg-background"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          >
            <option value="">Select an item…</option>
            {items.map((it) => (
              <option key={it.slug} value={it.slug}>
                {it.name} ({it.slug})
              </option>
            ))}
          </select>
          <label className="text-xs">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={!slug || !!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
            <span className="inline-block">
              <Button
                size="sm"
                variant="outline"
                disabled={!slug || !!busy}
                asChild
              >
                <span>{busy === "upload" ? "Uploading…" : "Upload"}</span>
              </Button>
            </span>
          </label>
        </div>

        <div className="flex gap-2 items-center">
          <input
            className="flex-1 border rounded-md px-2 py-1 text-xs bg-background"
            placeholder="Optional extra hero prompt (e.g. 'with mint garnish, wooden spoon')"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            disabled={!slug || !!busy}
          />
          <Button
            size="sm"
            disabled={!slug || !!busy}
            onClick={() => void generateHero()}
          >
            {busy === "hero" ? "Generating…" : "Generate AI hero"}
          </Button>
        </div>

        <div className="border rounded-md p-2 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-xs font-medium">
                Generate missing hero photos
              </div>
              <div className="text-[11px] text-muted-foreground">
                Find every item with no primary photo and AI-generate one. Two
                steps: preview, then confirm. Capped at 25 per run. Each photo
                is flagged AI-generated.
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => void loadBulkPreview()}
              >
                {busy === "bulk-preview" ? "…" : "Preview"}
              </Button>
              <Button
                size="sm"
                disabled={
                  !!busy || !bulkPreview || bulkPreview.items.length === 0
                }
                onClick={() => void runBulkHero()}
              >
                {busy === "bulk-run"
                  ? "Generating…"
                  : `Generate ${
                      bulkPreview
                        ? Math.min(bulkPreview.items.length, bulkPreview.cap)
                        : ""
                    }`}
              </Button>
            </div>
          </div>
          {bulkError && (
            <div className="text-xs text-destructive">{bulkError}</div>
          )}
          {bulkPreview && (
            <div className="text-[11px] space-y-1 max-h-40 overflow-auto border rounded p-2 bg-background">
              {bulkPreview.items.length === 0 ? (
                <div className="text-muted-foreground">
                  Every item already has a primary photo — nothing to generate.
                </div>
              ) : (
                <>
                  <div className="text-muted-foreground">
                    {bulkPreview.total} item
                    {bulkPreview.total === 1 ? "" : "s"} missing a primary
                    photo
                    {bulkPreview.cappedAtCap
                      ? `; will run on the first ${bulkPreview.cap} this batch`
                      : ""}
                    .
                  </div>
                  {bulkPreview.items.slice(0, bulkPreview.cap).map((it) => (
                    <div
                      key={it.slug}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="font-medium truncate">{it.name}</span>
                      <span className="text-muted-foreground truncate">
                        {it.category} · {it.kitchenLocation}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          {bulkResults && (
            <div className="text-[11px] space-y-1 max-h-40 overflow-auto border rounded p-2 bg-background">
              <div className="text-muted-foreground">
                {bulkResults.filter((r) => r.ok).length} ok ·{" "}
                {bulkResults.filter((r) => !r.ok).length} failed
              </div>
              {bulkResults.map((r) => (
                <div
                  key={r.slug}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{r.slug}</span>
                  {r.ok ? (
                    <Badge variant="secondary" className="text-[10px]">
                      ok
                    </Badge>
                  ) : (
                    <span
                      className="text-destructive truncate"
                      title={r.error ?? ""}
                    >
                      {r.error ?? "failed"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : assets.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No photos yet. Upload one or generate an AI hero.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {assets.map((a) => {
              const isPrimary = primaryUrl === a.publicUrl;
              return (
                <div
                  key={a.id}
                  className={`border rounded-md p-2 space-y-1 text-xs ${
                    isPrimary ? "border-primary border-2" : ""
                  }`}
                >
                  <div className="aspect-[4/3] bg-muted rounded overflow-hidden flex items-center justify-center">
                    <img
                      src={a.publicUrl}
                      alt={`${a.kind} ${a.id}`}
                      className="object-cover w-full h-full"
                      style={
                        a.kind === "nobg"
                          ? {
                              background:
                                "repeating-conic-gradient(#e5e5e5 0% 25%, #f5f5f5 0% 50%) 50%/16px 16px",
                              objectFit: "contain",
                            }
                          : undefined
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <Badge variant={KIND_VARIANT[a.kind]}>
                      {KIND_LABEL[a.kind]}
                    </Badge>
                    {a.isAiGenerated === 1 && (
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        title="This photo was created by an AI image model, not a real photograph."
                      >
                        AI-generated
                      </Badge>
                    )}
                    {isPrimary && (
                      <Badge className="text-[10px]">Primary</Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {a.width && a.height ? `${a.width}×${a.height} · ` : ""}
                    {new Date(a.createdAt).toLocaleString()}
                  </div>
                  {a.provenance?.model && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      model: {a.provenance.model}
                    </div>
                  )}
                  {a.provenance?.pipeline &&
                    a.provenance.pipeline.length > 0 && (
                      <div
                        className="text-[10px] text-muted-foreground truncate"
                        title={a.provenance.pipeline.join(" → ")}
                      >
                        steps: {a.provenance.pipeline.length}
                      </div>
                    )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {!isPrimary && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-6 text-[11px] px-2"
                        disabled={!!busy}
                        onClick={() => void setPrimary(a.id)}
                      >
                        Set primary
                      </Button>
                    )}
                    {a.kind === "original" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2"
                        disabled={!!busy}
                        onClick={() => void enhance(a.id)}
                      >
                        {busy === `enh-${a.id}` ? "…" : "Re-enhance"}
                      </Button>
                    )}
                    {a.kind !== "nobg" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11px] px-2"
                        disabled={!!busy}
                        onClick={() => void removeBg(a.id)}
                      >
                        {busy === `bg-${a.id}` ? "…" : "Remove BG"}
                      </Button>
                    )}
                    {a.kind !== "original" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] px-2 text-destructive"
                        disabled={!!busy}
                        onClick={() => void removeAsset(a.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
