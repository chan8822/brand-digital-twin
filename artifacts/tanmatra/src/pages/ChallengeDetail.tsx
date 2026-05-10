import { useState } from "react";
import { Link, useParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useChallenge,
  useJoinChallenge,
  useLeaveChallenge,
  usePostToChallenge,
} from "@/lib/contentApi";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Flag,
  MessageSquare,
  Sparkles,
  Users,
  Video,
} from "lucide-react";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const day = Math.floor(diff / 86_400_000);
  if (day < 1) {
    const hr = Math.floor(diff / 3_600_000);
    if (hr < 1) return "just now";
    return `${hr}h ago`;
  }
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

function formatCheckInWhen(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "live now";
  const hr = Math.floor(ms / 3_600_000);
  if (hr < 1) {
    const min = Math.max(1, Math.floor(ms / 60_000));
    return `in ${min}m`;
  }
  if (hr < 24) return `in ${hr}h`;
  return `in ${Math.floor(hr / 24)}d`;
}

export default function ChallengeDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isLoading } = useChallenge(slug);
  const join = useJoinChallenge(slug ?? "");
  const leave = useLeaveChallenge(slug ?? "");
  const post = usePostToChallenge(slug ?? "");
  const [body, setBody] = useState("");

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center text-clinical-zinc">
        Loading challenge…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-3">
        <Flag className="w-8 h-8 text-clinical-gold mx-auto" />
        <p className="text-white font-semibold">Challenge not found</p>
        <Link to="/challenges">
          <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to challenges
          </Button>
        </Link>
      </div>
    );
  }

  const { challenge, joined, posts, checkIns } = data;
  const upcomingCheckIns = checkIns ?? [];
  const SOON_MS = 24 * 60 * 60 * 1000;

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const handleJoin = () => {
    join.mutate(undefined, {
      onSuccess: () => {
        // Reveal a "what happens next" panel so the user understands what
        // they just signed up for. Per UX audit J-C finding 6.
        setShowWelcome(true);
        toast.success(`Joined ${challenge.title}`, {
          description: "Check your email for your start-day instructions.",
        });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Could not join";
        if (msg.startsWith("401")) {
          toast.error("Log in to join challenges");
        } else {
          toast.error(msg);
        }
      },
    });
  };

  const handleLeave = () => {
    leave.mutate(undefined, {
      onSuccess: () => {
        toast.success(`Left ${challenge.title}`);
        setLeaveConfirmOpen(false);
      },
    });
  };

  const handlePost = () => {
    if (!body.trim()) return;
    post.mutate(body, {
      onSuccess: () => {
        setBody("");
        toast.success("Posted to the cohort feed");
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Could not post";
        toast.error(msg);
      },
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <Link
        to="/challenges"
        className="inline-flex items-center gap-1.5 text-xs text-clinical-zinc hover:text-clinical-gold"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to challenges
      </Link>

      {challenge.image && (
        <div className="relative aspect-[16/9] rounded-2xl overflow-hidden border border-clinical-slate/20">
          <img
            src={challenge.image}
            alt={challenge.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/80 to-transparent" />
          {challenge.featured > 0 && (
            <Badge className="absolute top-3 left-3 bg-clinical-gold/90 text-[#050505] border-0 gap-1 text-[10px]">
              <Sparkles className="w-3 h-3" />
              Featured
            </Badge>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-start gap-4 justify-between">
        <div className="space-y-2 flex-1">
          <h1 className="font-serif text-3xl text-white">{challenge.title}</h1>
          <p className="text-sm text-clinical-zinc">{challenge.tagline}</p>
          <div className="flex items-center gap-3 text-[11px] text-clinical-zinc/80 tabular-nums">
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3 h-3 text-clinical-gold" />
              {challenge.durationDays} days
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3 text-clinical-gold" />
              {challenge.memberCount} joined
            </span>
            <span className="text-clinical-zinc/70">Led by {challenge.rdName}</span>
          </div>
        </div>
        <div className="shrink-0">
          {joined ? (
            <Button
              variant="outline"
              onClick={() => setLeaveConfirmOpen(true)}
              disabled={leave.isPending}
              className="min-h-11 border-clinical-slate/40 text-clinical-zinc hover:text-white"
            >
              Leave challenge
            </Button>
          ) : (
            <Button
              onClick={handleJoin}
              disabled={join.isPending}
              className="min-h-11 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
            >
              {join.isPending ? "Joining…" : "Join challenge"}
            </Button>
          )}
        </div>
      </div>

      {challenge.description && (
        <p className="text-sm text-clinical-zinc leading-relaxed">
          {challenge.description}
        </p>
      )}

      {challenge.bundleSlug && (
        <Card className="bg-clinical-gold/5 border-clinical-gold/30">
          <CardContent className="p-4 flex items-center gap-3 text-xs text-clinical-zinc">
            <Sparkles className="w-4 h-4 text-clinical-gold" />
            <span className="flex-1">
              This challenge ships with the{" "}
              <span className="text-clinical-gold capitalize">
                {challenge.bundleSlug.replaceAll("-", " ")}
              </span>{" "}
              meal bundle.
            </span>
            <Link to="/menu" className="text-clinical-gold hover:underline">
              See menu →
            </Link>
          </CardContent>
        </Card>
      )}

      {joined && upcomingCheckIns.length > 0 && (
        <>
          <Separator className="bg-clinical-slate/20" />
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-clinical-gold" />
              <h2 className="text-clinical-label">Upcoming RD check-ins</h2>
              <Badge
                variant="outline"
                className="ml-auto border-clinical-slate/30 text-clinical-zinc text-[10px] tabular-nums"
              >
                {upcomingCheckIns.length} scheduled
              </Badge>
            </div>
            <div className="space-y-2">
              {upcomingCheckIns.map((ci) => {
                const ms = new Date(ci.scheduledAt).getTime() - Date.now();
                const soon = ms > 0 && ms <= SOON_MS;
                return (
                  <Card
                    key={ci.id}
                    className="bg-clinical-surface border-clinical-slate/20"
                  >
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold text-white">
                            {ci.title}
                          </p>
                          {soon && (
                            <Badge className="bg-clinical-gold/90 text-[#050505] border-0 gap-1 text-[10px]">
                              <Bell className="w-3 h-3" />
                              Within 24h
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-clinical-zinc tabular-nums">
                          {formatCheckInWhen(ci.scheduledAt)}{" "}
                          <span className="text-clinical-zinc/70">
                            · {formatCountdown(ci.scheduledAt)}
                          </span>
                        </p>
                      </div>
                      {ci.joinUrl ? (
                        <a
                          href={ci.joinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0"
                        >
                          <Button
                            size="sm"
                            className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
                          >
                            <Video className="w-3.5 h-3.5 mr-1.5" />
                            Join video
                          </Button>
                        </a>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}

      <Separator className="bg-clinical-slate/20" />

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-clinical-gold" />
          <h2 className="text-clinical-label">Cohort feed</h2>
          <Badge
            variant="outline"
            className="ml-auto border-clinical-slate/30 text-clinical-zinc text-[10px] tabular-nums"
          >
            {posts.length} post{posts.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {joined ? (
          <Card className="bg-clinical-surface border-clinical-slate/20">
            <CardContent className="p-4 space-y-3">
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 1000))}
                rows={3}
                placeholder="Share progress, a meal photo idea, or a question for the RD…"
                className="bg-clinical-dark border-clinical-slate/30 text-xs"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-clinical-zinc/70">
                  {body.length}/1000
                </span>
                <Button
                  size="sm"
                  disabled={!body.trim() || post.isPending}
                  onClick={handlePost}
                  className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
                >
                  {post.isPending ? "Posting…" : "Post update"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <p className="text-[11px] text-clinical-zinc/70">
            Join the challenge to post in the cohort feed.
          </p>
        )}

        {posts.length === 0 ? (
          <p className="text-[11px] text-clinical-zinc/70">
            No posts yet — be the first to share.
          </p>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <Card key={p.id} className="bg-clinical-surface border-clinical-slate/20">
                <CardContent className="p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white">{p.authorName}</p>
                    <span className="text-[10px] text-clinical-zinc/70 tabular-nums">
                      {formatRelative(p.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-clinical-zinc leading-relaxed whitespace-pre-wrap">
                    {p.body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ------ Leave-challenge confirmation ------ */}
      <AlertDialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <AlertDialogContent className="bg-clinical-surface border-clinical-slate/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Leave this challenge?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-clinical-zinc text-xs">
              You'll lose your spot in the cohort. Your check-in history is
              preserved if you re-join later, but your current streak resets
              to zero. You can re-join while spots are open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              Stay in challenge
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-red-500 text-white hover:bg-red-600"
              onClick={handleLeave}
            >
              Yes, leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ------ Post-join welcome — sets expectations for first-time joiners ------ */}
      <AlertDialog open={showWelcome} onOpenChange={setShowWelcome}>
        <AlertDialogContent className="bg-clinical-surface border-clinical-gold/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              You're in — here's what's next
            </AlertDialogTitle>
            <AlertDialogDescription className="text-clinical-zinc text-xs">
              Welcome to {challenge.title}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="text-xs text-clinical-zinc space-y-2 leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-clinical-gold font-bold">1.</span>
              <span>
                <strong className="text-white">Starts {formatRelative(challenge.startsAt)}.</strong>
                {" "}You'll get a kickoff email with your day-1 plan.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-clinical-gold font-bold">2.</span>
              <span>
                <strong className="text-white">Daily check-ins</strong> appear
                on this page once the challenge is live — log meals, mood,
                and metrics in 30 seconds.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-clinical-gold font-bold">3.</span>
              <span>
                <strong className="text-white">Cohort feed</strong> below lets
                you ask questions and cheer on others. {challenge.rdName} drops
                in a few times a week.
              </span>
            </li>
            {challenge.bundleSlug && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-clinical-gold font-bold">4.</span>
                <span>
                  <strong className="text-white">Optional meal bundle</strong>{" "}
                  available below — RD-curated dishes that fit the protocol.
                </span>
              </li>
            )}
          </ul>
          <AlertDialogFooter>
            <AlertDialogAction
              className="min-h-11 bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold"
              onClick={() => setShowWelcome(false)}
            >
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
