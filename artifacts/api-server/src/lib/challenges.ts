import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  challengesTable,
  challengeMembersTable,
  challengePostsTable,
  challengeCheckInsTable,
  type Challenge,
  type ChallengeCheckIn,
  type ChallengePost,
} from "@workspace/db";

export interface ChallengeWithCount extends Challenge {
  memberCount: number;
}

export async function listChallenges(): Promise<ChallengeWithCount[]> {
  const rows = await db
    .select({
      c: challengesTable,
      memberCount: sql<number>`coalesce(count(${challengeMembersTable.id}) filter (where ${challengeMembersTable.leftAt} is null), 0)::int`,
    })
    .from(challengesTable)
    .leftJoin(
      challengeMembersTable,
      eq(challengeMembersTable.challengeId, challengesTable.id),
    )
    .groupBy(challengesTable.id)
    .orderBy(desc(challengesTable.featured), desc(challengesTable.startsAt));
  return rows.map((r) => ({ ...r.c, memberCount: r.memberCount }));
}

export async function getChallengeBySlug(
  slug: string,
): Promise<ChallengeWithCount | null> {
  const [row] = await db
    .select({
      c: challengesTable,
      memberCount: sql<number>`coalesce(count(${challengeMembersTable.id}) filter (where ${challengeMembersTable.leftAt} is null), 0)::int`,
    })
    .from(challengesTable)
    .leftJoin(
      challengeMembersTable,
      eq(challengeMembersTable.challengeId, challengesTable.id),
    )
    .where(eq(challengesTable.slug, slug))
    .groupBy(challengesTable.id);
  if (!row) return null;
  return { ...row.c, memberCount: row.memberCount };
}

export async function isMember(
  challengeId: number,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(challengeMembersTable)
    .where(
      and(
        eq(challengeMembersTable.challengeId, challengeId),
        eq(challengeMembersTable.userId, userId),
        isNull(challengeMembersTable.leftAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function joinChallenge(
  challengeId: number,
  userId: string,
): Promise<void> {
  await db
    .insert(challengeMembersTable)
    .values({ challengeId, userId })
    .onConflictDoUpdate({
      target: [challengeMembersTable.challengeId, challengeMembersTable.userId],
      set: { leftAt: null, joinedAt: new Date() },
    });
}

export async function leaveChallenge(
  challengeId: number,
  userId: string,
): Promise<void> {
  await db
    .update(challengeMembersTable)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(challengeMembersTable.challengeId, challengeId),
        eq(challengeMembersTable.userId, userId),
      ),
    );
}

export interface PublicPost {
  id: number;
  authorName: string;
  body: string;
  createdAt: Date;
}

export async function listPosts(
  challengeId: number,
  limit = 50,
): Promise<PublicPost[]> {
  const rows = await db
    .select()
    .from(challengePostsTable)
    .where(
      and(
        eq(challengePostsTable.challengeId, challengeId),
        eq(challengePostsTable.hidden, 0),
      ),
    )
    .orderBy(desc(challengePostsTable.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
  return rows.map((r) => ({
    id: r.id,
    authorName: r.authorName || "Member",
    body: r.body,
    createdAt: r.createdAt,
  }));
}

export interface PostForModeration {
  id: number;
  challengeId: number;
  challengeSlug: string;
  challengeTitle: string;
  authorName: string;
  body: string;
  hidden: number;
  createdAt: Date;
}

export async function listPostsForModeration(
  limit = 100,
): Promise<PostForModeration[]> {
  const rows = await db
    .select({
      post: challengePostsTable,
      challengeSlug: challengesTable.slug,
      challengeTitle: challengesTable.title,
    })
    .from(challengePostsTable)
    .innerJoin(
      challengesTable,
      eq(challengesTable.id, challengePostsTable.challengeId),
    )
    .orderBy(desc(challengePostsTable.createdAt))
    .limit(Math.max(1, Math.min(500, limit)));
  return rows.map((r) => ({
    id: r.post.id,
    challengeId: r.post.challengeId,
    challengeSlug: r.challengeSlug,
    challengeTitle: r.challengeTitle,
    authorName: r.post.authorName || "Member",
    body: r.post.body,
    hidden: r.post.hidden,
    createdAt: r.post.createdAt,
  }));
}

export async function setPostHidden(
  id: number,
  hidden: boolean,
): Promise<ChallengePost | null> {
  const [row] = await db
    .update(challengePostsTable)
    .set({ hidden: hidden ? 1 : 0 })
    .where(eq(challengePostsTable.id, id))
    .returning();
  return row ?? null;
}

export async function createPost(
  challengeId: number,
  userId: string,
  authorName: string,
  body: string,
): Promise<ChallengePost> {
  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed) throw new Error("body required");
  const [row] = await db
    .insert(challengePostsTable)
    .values({ challengeId, userId, authorName: authorName.slice(0, 128), body: trimmed })
    .returning();
  if (!row) throw new Error("failed to insert post");

  // Screen via moderation. We deliberately await so users see "hidden"
  // immediately if it gets blocked. The moderation lib writes its own
  // audit row regardless of decision; here we just toggle visibility.
  // Imported lazily to avoid a cycle with the community lib.
  const { screenContent } = await import("./community/moderation");
  try {
    const decision = await screenContent({
      text: trimmed,
      contentType: "challenge_post",
      contentId: row.id,
      userId,
    });
    if (decision.decision === "hidden") {
      await db
        .update(challengePostsTable)
        .set({ hidden: 1 })
        .where(eq(challengePostsTable.id, row.id));
      return { ...row, hidden: 1 };
    }
  } catch {
    // never block content creation on moderation failure
  }
  return row;
}

const SEED_CHALLENGES: Array<Omit<Challenge, "id" | "createdAt">> = [
  {
    slug: "21-day-high-protein-reset",
    title: "21-Day High-Protein Reset",
    tagline: "Hit 1.6g/kg protein every day for three weeks with RD check-ins.",
    description:
      "A three-week guided reset built around our highest-protein meals. You'll log daily protein, get two RD video check-ins, and share progress with the cohort.",
    image:
      "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=1200&q=80",
    rdName: "Dr. Anika Rao",
    durationDays: 21,
    startsAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 19),
    goalTags: ["high-protein", "muscle", "recovery"],
    bundleSlug: "performance-stack",
    featured: 1,
  },
  {
    slug: "14-day-anti-inflammatory",
    title: "14-Day Anti-Inflammatory Reset",
    tagline: "Two weeks of low-GI, plant-forward meals to calm inflammation.",
    description:
      "Built for users with joint stiffness, IBS flares, or post-illness recovery. Daily plant-forward menu, hydration prompts, and a private cohort feed.",
    image:
      "https://images.unsplash.com/photo-1547592180-85f173990554?w=1200&q=80",
    rdName: "Dr. Meera Iyer",
    durationDays: 14,
    startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 17),
    goalTags: ["anti-inflammatory", "plant-based", "gut"],
    bundleSlug: "wellness-light",
    featured: 1,
  },
  {
    slug: "30-day-balanced-loss",
    title: "30-Day Balanced Loss",
    tagline: "Sustainable -0.5kg/week loss with macro-balanced meals.",
    description:
      "A four-week programme aimed at gentle, sustainable fat loss. No crash dieting — calorie targets stay above your BMR floor.",
    image:
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80",
    rdName: "Dr. Anika Rao",
    durationDays: 30,
    startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 37),
    goalTags: ["fat-loss", "macros", "sustainable"],
    bundleSlug: "lunch-balance",
    featured: 0,
  },
];

export interface PublicCheckIn {
  id: number;
  title: string;
  scheduledAt: Date;
  joinUrl: string;
}

export async function listUpcomingCheckIns(
  challengeId: number,
  limit = 10,
): Promise<PublicCheckIn[]> {
  const rows = await db
    .select()
    .from(challengeCheckInsTable)
    .where(
      and(
        eq(challengeCheckInsTable.challengeId, challengeId),
        sql`${challengeCheckInsTable.scheduledAt} >= now() - interval '1 hour'`,
      ),
    )
    .orderBy(asc(challengeCheckInsTable.scheduledAt))
    .limit(Math.max(1, Math.min(50, limit)));
  return rows.map((r: ChallengeCheckIn) => ({
    id: r.id,
    title: r.title,
    scheduledAt: r.scheduledAt,
    joinUrl: r.joinUrl,
  }));
}

interface SeedCheckIn {
  title: string;
  offsetDays: number;
  hour: number;
  joinUrl: string;
}

const SEED_CHECK_INS: Record<string, SeedCheckIn[]> = {
  "21-day-high-protein-reset": [
    {
      title: "Week 1 kickoff with Dr. Anika",
      offsetDays: 1,
      hour: 18,
      joinUrl: "https://meet.tanmatra.health/rd/anika-protein-w1",
    },
    {
      title: "Mid-programme protein review",
      offsetDays: 10,
      hour: 18,
      joinUrl: "https://meet.tanmatra.health/rd/anika-protein-w2",
    },
  ],
  "14-day-anti-inflammatory": [
    {
      title: "Anti-inflammatory primer with Dr. Meera",
      offsetDays: 4,
      hour: 19,
      joinUrl: "https://meet.tanmatra.health/rd/meera-antiinf-w1",
    },
    {
      title: "Halfway gut & joint check-in",
      offsetDays: 10,
      hour: 19,
      joinUrl: "https://meet.tanmatra.health/rd/meera-antiinf-w2",
    },
  ],
  "30-day-balanced-loss": [
    {
      title: "Goal-setting call with Dr. Anika",
      offsetDays: 8,
      hour: 18,
      joinUrl: "https://meet.tanmatra.health/rd/anika-loss-w1",
    },
    {
      title: "Week 2 macro tune-up",
      offsetDays: 15,
      hour: 18,
      joinUrl: "https://meet.tanmatra.health/rd/anika-loss-w2",
    },
    {
      title: "Final review and next steps",
      offsetDays: 35,
      hour: 18,
      joinUrl: "https://meet.tanmatra.health/rd/anika-loss-w4",
    },
  ],
};

let seeded = false;
export async function ensureChallengeSeeds(): Promise<void> {
  if (seeded) return;
  for (const c of SEED_CHALLENGES) {
    await db
      .insert(challengesTable)
      .values(c)
      .onConflictDoNothing({ target: challengesTable.slug });
  }
  // Seed check-ins (idempotent: only insert if none exist for the challenge).
  const now = Date.now();
  for (const [slug, items] of Object.entries(SEED_CHECK_INS)) {
    const challenge = await getChallengeBySlug(slug);
    if (!challenge) continue;
    const [existing] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(challengeCheckInsTable)
      .where(eq(challengeCheckInsTable.challengeId, challenge.id));
    if ((existing?.n ?? 0) > 0) continue;
    for (const item of items) {
      const at = new Date(now + item.offsetDays * 86_400_000);
      at.setUTCHours(item.hour, 30, 0, 0);
      await db.insert(challengeCheckInsTable).values({
        challengeId: challenge.id,
        title: item.title,
        scheduledAt: at,
        joinUrl: item.joinUrl,
      });
    }
  }
  seeded = true;
}
