import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const contentRecipesTable = pgTable(
  "content_recipes",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 128 }).notNull().unique(),
    title: varchar("title", { length: 200 }).notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull().default(""),
    image: varchar("image", { length: 512 }),
    authorName: varchar("author_name", { length: 128 }).notNull(),
    authorRole: varchar("author_role", { length: 64 }).notNull().default("RD"),
    goal: varchar("goal", { length: 32 }).notNull().default("general_wellness"),
    diet: varchar("diet", { length: 32 }).notNull().default("omnivore"),
    timeMinutes: integer("time_minutes").notNull().default(30),
    calories: integer("calories"),
    proteinGrams: integer("protein_grams"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    ingredients: jsonb("ingredients")
      .$type<string[]>()
      .notNull()
      .default([]),
    steps: jsonb("steps").$type<string[]>().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_content_recipes_goal").on(t.goal, t.publishedAt)],
);

export type ContentRecipe = typeof contentRecipesTable.$inferSelect;
