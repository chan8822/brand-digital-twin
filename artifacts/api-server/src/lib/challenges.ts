import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  challengesTable,
  challengeMembersTable,
  challengePostsTable,
  type Challenge,
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

let seeded = false;
export async function ensureChallengeSeeds(): Promise<void> {
  if (seeded) return;
  for (const c of SEED_CHALLENGES) {
    await db
      .insert(challengesTable)
      .values(c)
      .onConflictDoNothing({ target: challengesTable.slug });
  }
  seeded = true;
}
