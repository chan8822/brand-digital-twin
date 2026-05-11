import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/apiBase";

const ADMIN_TOKEN_KEY = "tanmatra:admin-token:v1";

interface ReviewRow {
  id: number;
  slug: string;
  rating: number;
  body: string;
  hidden: number;
  createdAt: string;
}

interface PostRow {
  id: number;
  challengeSlug: string;
  challengeTitle: string;
  authorName: string;
  body: string;
  hidden: number;
  createdAt: string;
}

async function adminFetch<T>(
  path: string,
  init: RequestInit,
  token: string,
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers ?? {}),
  };
  if (token) (headers as Record<string, string>)["x-admin-token"] = token;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return res.json() as Promise<T>;
}

export default function AdminModeration() {
  const [tab, setTab] = useState<"reviews" | "posts">("reviews");
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? ""),
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, p] = await Promise.all([
        adminFetch<{ reviews: ReviewRow[] }>("/dish-reviews-mod", {}, token),
        adminFetch<{ posts: PostRow[] }>("/challenge-posts-mod", {}, token),
      ]);
      setReviews(r.reviews);
      setPosts(p.posts);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveToken = (val: string) => {
    setToken(val);
    if (typeof window !== "undefined") {
      if (val) window.localStorage.setItem(ADMIN_TOKEN_KEY, val);
      else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  };

  const toggleReview = async (row: ReviewRow) => {
    const action = row.hidden ? "unhide" : "hide";
    const key = `r:${row.id}`;
    setBusyId(key);
    try {
      await adminFetch(
        `/dish-reviews/${row.id}/${action}`,
        { method: "POST", body: "{}" },
        token,
      );
      setReviews((rs) =>
        rs.map((x) =>
          x.id === row.id ? { ...x, hidden: row.hidden ? 0 : 1 } : x,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const togglePost = async (row: PostRow) => {
    const action = row.hidden ? "unhide" : "hide";
    const key = `p:${row.id}`;
    setBusyId(key);
    try {
      await adminFetch(
        `/challenge-posts/${row.id}/${action}`,
        { method: "POST", body: "{}" },
        token,
      );
      setPosts((ps) =>
        ps.map((x) =>
          x.id === row.id ? { ...x, hidden: row.hidden ? 0 : 1 } : x,
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const reviewVisible = reviews.filter((r) => !r.hidden).length;
  const postVisible = posts.filter((p) => !p.hidden).length;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="font-serif text-3xl text-white">Moderation queue</h1>
        <p className="text-sm text-clinical-zinc">
          Hide or restore recent dish reviews and challenge posts. Hidden items
          disappear from public views immediately.
        </p>
      </header>

      <Card className="bg-clinical-surface border-clinical-slate/20">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-clinical-zinc">Admin token</label>
          <input
            value={token}
            onChange={(e) => saveToken(e.target.value)}
            placeholder="x-admin-token"
            className="bg-clinical-dark border border-clinical-slate/40 rounded px-2 py-1 text-sm text-white flex-1 min-w-[200px]"
          />
          <Button onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-rose-400">Error: {error}</p>}

      <div className="flex gap-2">
        <Button
          variant={tab === "reviews" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("reviews")}
        >
          Dish reviews ({reviewVisible}/{reviews.length})
        </Button>
        <Button
          variant={tab === "posts" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("posts")}
        >
          Challenge posts ({postVisible}/{posts.length})
        </Button>
      </div>

      {tab === "reviews" && (
        <div className="space-y-3">
          {reviews.length === 0 && (
            <p className="text-sm text-clinical-zinc">No reviews to moderate.</p>
          )}
          {reviews.map((r) => (
            <Card
              key={r.id}
              className="bg-clinical-surface border-clinical-slate/20"
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    className={
                      r.hidden
                        ? "bg-rose-500/20 text-rose-300 border-0"
                        : "bg-emerald-500/20 text-emerald-300 border-0"
                    }
                  >
                    {r.hidden ? "Hidden" : "Visible"}
                  </Badge>
                  <Badge className="bg-clinical-slate/30 text-clinical-zinc border-0 text-[10px]">
                    {r.slug}
                  </Badge>
                  <Badge className="bg-clinical-slate/30 text-clinical-zinc border-0 text-[10px]">
                    {r.rating}★
                  </Badge>
                  <span className="text-[10px] text-clinical-zinc ml-auto">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-white whitespace-pre-wrap">
                  {r.body || <span className="text-clinical-zinc">(no body)</span>}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={r.hidden ? "default" : "outline"}
                    disabled={busyId === `r:${r.id}`}
                    onClick={() => void toggleReview(r)}
                  >
                    {busyId === `r:${r.id}`
                      ? "Working..."
                      : r.hidden
                        ? "Unhide"
                        : "Hide"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "posts" && (
        <div className="space-y-3">
          {posts.length === 0 && (
            <p className="text-sm text-clinical-zinc">No posts to moderate.</p>
          )}
          {posts.map((p) => (
            <Card
              key={p.id}
              className="bg-clinical-surface border-clinical-slate/20"
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    className={
                      p.hidden
                        ? "bg-rose-500/20 text-rose-300 border-0"
                        : "bg-emerald-500/20 text-emerald-300 border-0"
                    }
                  >
                    {p.hidden ? "Hidden" : "Visible"}
                  </Badge>
                  <Badge className="bg-clinical-slate/30 text-clinical-zinc border-0 text-[10px]">
                    {p.challengeTitle}
                  </Badge>
                  <Badge className="bg-clinical-slate/30 text-clinical-zinc border-0 text-[10px]">
                    {p.authorName}
                  </Badge>
                  <span className="text-[10px] text-clinical-zinc ml-auto">
                    {new Date(p.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-white whitespace-pre-wrap">
                  {p.body}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={p.hidden ? "default" : "outline"}
                    disabled={busyId === `p:${p.id}`}
                    onClick={() => void togglePost(p)}
                  >
                    {busyId === `p:${p.id}`
                      ? "Working..."
                      : p.hidden
                        ? "Unhide"
                        : "Hide"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
