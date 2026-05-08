import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE = `${import.meta.env.BASE_URL}api`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

export interface RecipeDTO {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  image: string | null;
  authorName: string;
  authorRole: string;
  goal: string;
  diet: string;
  timeMinutes: number;
  calories: number | null;
  proteinGrams: number | null;
  tags: string[];
  ingredients: string[];
  steps: string[];
  publishedAt: string;
}

export interface RecipeFilter {
  goal?: string;
  diet?: string;
  maxTime?: number;
  q?: string;
}

export function useRecipes(filter: RecipeFilter) {
  const params = new URLSearchParams();
  if (filter.goal && filter.goal !== "all") params.set("goal", filter.goal);
  if (filter.diet && filter.diet !== "all") params.set("diet", filter.diet);
  if (filter.maxTime) params.set("maxTime", String(filter.maxTime));
  if (filter.q?.trim()) params.set("q", filter.q.trim());
  const qs = params.toString();
  return useQuery<RecipeDTO[]>({
    queryKey: ["recipes", filter],
    queryFn: async () => {
      const r = await api<{ recipes: RecipeDTO[] }>(
        `/recipes${qs ? `?${qs}` : ""}`,
      );
      return r.recipes;
    },
    staleTime: 1000 * 60,
  });
}

export function useRecipe(slug: string | undefined) {
  return useQuery<RecipeDTO | null>({
    queryKey: ["recipe", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const r = await api<{ recipe: RecipeDTO }>(
        `/recipes/${encodeURIComponent(slug!)}`,
      );
      return r.recipe;
    },
    staleTime: 1000 * 60,
  });
}

export interface ChallengeDTO {
  id: number;
  slug: string;
  title: string;
  tagline: string;
  description: string;
  image: string | null;
  rdName: string;
  durationDays: number;
  startsAt: string;
  endsAt: string;
  goalTags: string[];
  bundleSlug: string | null;
  featured: number;
  memberCount: number;
}

export interface ChallengePostDTO {
  id: number;
  authorName: string;
  body: string;
  createdAt: string;
}

export function useChallenges() {
  return useQuery<ChallengeDTO[]>({
    queryKey: ["challenges"],
    queryFn: async () => {
      const r = await api<{ challenges: ChallengeDTO[] }>(`/challenges`);
      return r.challenges;
    },
    staleTime: 1000 * 60,
  });
}

export interface ChallengeCheckInDTO {
  id: number;
  title: string;
  scheduledAt: string;
  joinUrl: string;
}

export interface ChallengeDetailDTO {
  challenge: ChallengeDTO;
  joined: boolean;
  posts: ChallengePostDTO[];
  checkIns: ChallengeCheckInDTO[];
}

export function useChallenge(slug: string | undefined) {
  return useQuery<ChallengeDetailDTO | null>({
    queryKey: ["challenge", slug],
    enabled: Boolean(slug),
    queryFn: async () =>
      api<ChallengeDetailDTO>(`/challenges/${encodeURIComponent(slug!)}`),
    staleTime: 1000 * 30,
  });
}

export function useJoinChallenge(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      api<{ ok: boolean; joined: boolean }>(
        `/challenges/${encodeURIComponent(slug)}/join`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenge", slug] });
      qc.invalidateQueries({ queryKey: ["challenges"] });
    },
  });
}

export function useLeaveChallenge(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      api<{ ok: boolean; joined: boolean }>(
        `/challenges/${encodeURIComponent(slug)}/leave`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenge", slug] });
      qc.invalidateQueries({ queryKey: ["challenges"] });
    },
  });
}

export interface CommunityChallengeCard {
  cohort: { id: number; slug: string; name: string };
  challenge: {
    id: number;
    title: string;
    description: string;
    metric: string;
    targetCount: number;
    rewardPoints: number;
    weekStartDate: string;
    status: string;
  };
  progress: {
    count: number;
    ratio: number;
    completed: boolean;
    recent: Array<{ key: string; reason: string }>;
  };
}

export function useCommunityMe() {
  return useQuery<CommunityChallengeCard[]>({
    queryKey: ["community-me"],
    queryFn: async () => {
      const r = await api<{ cohorts: CommunityChallengeCard[] }>(
        `/community/me`,
      );
      return r.cohorts;
    },
    staleTime: 1000 * 60,
  });
}

export interface ModerationDecisionDTO {
  id: number;
  contentType: string;
  contentId: number;
  userId: string | null;
  decision: "allowed" | "flagged" | "hidden";
  severity: number;
  categories: string[];
  rationale: string;
  actor: "ai" | "human";
  reviewerId: string | null;
  model: string | null;
  snapshot: string;
  createdAt: string;
}

export interface ModerationAppealDTO {
  id: number;
  decisionId: number;
  userId: string;
  reason: string;
  status: "open" | "upheld" | "overturned";
  reviewerId: string | null;
  reviewerNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export function usePostToChallenge(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      api<{ post: ChallengePostDTO }>(
        `/challenges/${encodeURIComponent(slug)}/posts`,
        { method: "POST", body: JSON.stringify({ body }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenge", slug] });
    },
  });
}
