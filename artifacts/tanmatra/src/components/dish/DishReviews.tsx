import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Star, MessageSquare, Sparkles, TrendingUp, TrendingDown, Minus, ShieldCheck } from "lucide-react";

import { API_BASE as API_BASE } from "@/lib/apiBase";

interface PublicReviewer {
  label: string;
  avatarUrl: string | null;
}

interface PublicReview {
  id: number;
  slug: string;
  rating: number;
  body: string;
  photoUrl?: string | null;
  createdAt: string;
  reviewer: PublicReviewer;
  // Optional — populated by the API only when the reviewer's
  // user-id has a delivered order containing this dish. Drives the
  // "Verified Purchase" badge per ASCI 2022 endorsement guidelines.
  // If the backend doesn't return this field yet, the badge is
  // simply hidden (no breakage).
  verifiedPurchase?: boolean;
}

function reviewerInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

interface ReviewSummary {
  slug: string;
  mostLoved: string;
  commonGripe: string;
  trend: "improving" | "declining" | "stable";
  sampleSize: number;
  averageRating: number;
  generatedAt: string;
}

interface ReviewsResponse {
  reviews: PublicReview[];
  summary: ReviewSummary | null;
  eligibleToReview: boolean;
}

interface AuthResponse {
  user: { id: string } | null;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const day = Math.floor(diffMs / 86_400_000);
  if (day < 1) {
    const hr = Math.floor(diffMs / 3_600_000);
    if (hr < 1) return "just now";
    return `${hr}h ago`;
  }
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function StarRow({
  value,
  onChange,
  size = 16,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  const interactive = Boolean(onChange);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(n)}
          className={interactive ? "hover:scale-110 transition-transform" : "cursor-default"}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
        >
          <Star
            style={{ width: size, height: size }}
            className={
              n <= value
                ? "fill-clinical-gold text-clinical-gold"
                : "text-clinical-slate/40"
            }
          />
        </button>
      ))}
    </div>
  );
}

interface DishReviewsProps {
  slug: string;
}

export default function DishReviews({ slug }: DishReviewsProps) {
  const qc = useQueryClient();

  const auth = useQuery<AuthResponse>({
    queryKey: ["auth", "user"],
    queryFn: () => fetchJson<AuthResponse>(`/auth/user`),
    staleTime: 1000 * 60 * 5,
  });
  const isLoggedIn = Boolean(auth.data?.user?.id);

  const data = useQuery<ReviewsResponse>({
    queryKey: ["dish-reviews", slug, auth.data?.user?.id ?? null],
    queryFn: () => fetchJson<ReviewsResponse>(`/dish-reviews/${encodeURIComponent(slug)}`),
    staleTime: 1000 * 30,
  });

  // Eligibility ("has this user ordered this dish?") is computed server-side
  // against the orders table so localStorage tampering or cross-device gaps
  // can't bypass it. The server also re-checks on POST.
  const hasOrdered = Boolean(data.data?.eligibleToReview);

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        slug,
        rating,
        body: body.trim(),
      };
      const trimmedPhoto = photoUrl.trim();
      if (trimmedPhoto) payload["photoUrl"] = trimmedPhoto;
      return fetchJson<{ review: PublicReview }>(`/dish-reviews`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success("Thanks for your review");
      setRating(0);
      setBody("");
      setPhotoUrl("");
      qc.invalidateQueries({ queryKey: ["dish-reviews", slug] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Could not submit review";
      toast.error(msg);
    },
  });

  const reviews = data.data?.reviews ?? [];
  const summary = data.data?.summary ?? null;
  const canReview = isLoggedIn && hasOrdered;

  const trendIcon =
    summary?.trend === "improving" ? (
      <TrendingUp className="w-3 h-3" />
    ) : summary?.trend === "declining" ? (
      <TrendingDown className="w-3 h-3" />
    ) : (
      <Minus className="w-3 h-3" />
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-clinical-gold" />
        <p className="text-clinical-label">Customer reviews</p>
        {summary && (
          <Badge
            variant="outline"
            className="border-clinical-slate/30 text-clinical-zinc text-[10px] gap-1 ml-auto tabular-nums"
          >
            <Star className="w-3 h-3 fill-clinical-gold text-clinical-gold" />
            {(summary.averageRating / 10).toFixed(1)} · {summary.sampleSize}
          </Badge>
        )}
      </div>

      {summary && (summary.mostLoved || summary.commonGripe) && (
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-clinical-gold" />
              <p className="text-[10px] uppercase tracking-[0.12em] text-clinical-zinc/70 font-semibold">
                What customers say
              </p>
              <Badge
                variant="outline"
                className="border-clinical-slate/30 text-clinical-zinc text-[10px] ml-auto gap-1 capitalize"
              >
                {trendIcon}
                {summary.trend}
              </Badge>
            </div>
            {summary.mostLoved && (
              <div className="flex items-start gap-2">
                <span className="text-[11px] text-clinical-sage font-medium shrink-0">Loved:</span>
                <p className="text-xs text-clinical-zinc">{summary.mostLoved}</p>
              </div>
            )}
            {summary.commonGripe && (
              <div className="flex items-start gap-2">
                <span className="text-[11px] text-clinical-gold font-medium shrink-0">Gripe:</span>
                <p className="text-xs text-clinical-zinc">{summary.commonGripe}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canReview && (
        <Card className="bg-clinical-surface border-clinical-slate/20">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-medium text-white">Leave a review</p>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-clinical-zinc">Your rating</span>
              <StarRow value={rating} onChange={setRating} size={20} />
            </div>
            <Textarea
              placeholder="Tell other customers what you thought (optional)"
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 2000))}
              rows={3}
              className="bg-clinical-dark border-clinical-slate/30 text-xs"
            />
            <input
              type="url"
              placeholder="Optional photo URL"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value.slice(0, 1024))}
              className="w-full bg-clinical-dark border border-clinical-slate/30 rounded-md px-3 py-2 text-xs text-white placeholder:text-clinical-zinc/50 focus:outline-none focus:border-clinical-gold/40"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-clinical-zinc/70">
                {body.length}/2000
              </span>
              <Button
                size="sm"
                disabled={rating < 1 || submit.isPending}
                onClick={() => submit.mutate()}
                className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
              >
                {submit.isPending ? "Posting…" : "Post review"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!canReview && (
        <p className="text-[11px] text-clinical-zinc">
          {isLoggedIn
            ? "Order this dish once to leave a review."
            : "Log in and order this dish to leave a review."}
        </p>
      )}

      {reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.slice(0, 5).map((r, idx) => (
            <div key={r.id}>
              {idx > 0 && <Separator className="bg-clinical-slate/10 mb-3" />}
              <div className="flex items-center gap-2.5">
                <Avatar className="h-7 w-7 border border-clinical-slate/20">
                  {r.reviewer.avatarUrl && (
                    <AvatarImage
                      src={r.reviewer.avatarUrl}
                      alt={r.reviewer.label}
                    />
                  )}
                  <AvatarFallback className="bg-clinical-dark text-[10px] text-clinical-zinc">
                    {reviewerInitials(r.reviewer.label)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-xs font-medium text-white truncate">
                      {r.reviewer.label}
                    </p>
                    {r.verifiedPurchase && (
                      <span
                        className="shrink-0 inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-clinical-sage/15 text-clinical-sage border border-clinical-sage/30 font-semibold leading-none"
                        title="This reviewer bought and received this dish"
                      >
                        <ShieldCheck className="w-2.5 h-2.5" aria-hidden />
                        Verified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRow value={r.rating} size={12} />
                    <span className="text-[10px] text-clinical-zinc tabular-nums">
                      {formatRelative(r.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              {r.body && (
                <p className="text-xs text-clinical-zinc leading-relaxed mt-2">
                  {r.body}
                </p>
              )}
              {r.photoUrl && (
                <img
                  src={r.photoUrl}
                  alt="Reviewer photo"
                  loading="lazy"
                  className="mt-2 rounded-md max-h-40 w-auto object-cover border border-clinical-slate/20"
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-clinical-zinc">
          No reviews yet — be the first to share your experience.
        </p>
      )}
    </div>
  );
}
