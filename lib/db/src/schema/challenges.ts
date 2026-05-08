import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const challengesTable = pgTable("challenges", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  tagline: varchar("tagline", { length: 280 }).notNull().default(""),
  description: text("description").notNull().default(""),
  image: varchar("image", { length: 512 }),
  rdName: varchar("rd_name", { length: 128 }).notNull().default(""),
  durationDays: integer("duration_days").notNull().default(21),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  goalTags: jsonb("goal_tags").$type<string[]>().notNull().default([]),
  bundleSlug: varchar("bundle_slug", { length: 128 }),
  featured: integer("featured").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const challengeMembersTable = pgTable(
  "challenge_members",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id")
      .notNull()
      .references(() => challengesTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_challenge_member").on(t.challengeId, t.userId),
    index("idx_challenge_member_user").on(t.userId),
  ],
);

export const challengePostsTable = pgTable(
  "challenge_posts",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id")
      .notNull()
      .references(() => challengesTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    authorName: varchar("author_name", { length: 128 }).notNull().default(""),
    body: text("body").notNull(),
    hidden: integer("hidden").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_challenge_posts").on(t.challengeId, t.createdAt)],
);

export type Challenge = typeof challengesTable.$inferSelect;
export type ChallengeMember = typeof challengeMembersTable.$inferSelect;
export type ChallengePost = typeof challengePostsTable.$inferSelect;
