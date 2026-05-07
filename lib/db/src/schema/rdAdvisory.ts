import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  text,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export type AppointmentKind = "intro_15m" | "follow_up_30m" | "follow_up_45m";
export type AppointmentStatus = "scheduled" | "completed" | "cancelled";
export type RdMessageSender = "user" | "rd";

export const rdAppointmentsTable = pgTable(
  "rd_appointments",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 24 }).$type<AppointmentKind>().notNull(),
    status: varchar("status", { length: 16 })
      .$type<AppointmentStatus>()
      .notNull()
      .default("scheduled"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    pricePaise: integer("price_paise").notNull().default(0),
    joinUrl: text("join_url"),
    userQuestion: text("user_question"),
    rdNotes: text("rd_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("idx_rd_appt_user").on(t.userId, t.startAt),
    index("idx_rd_appt_rd").on(t.rdSlug, t.startAt),
  ],
);

export const rdMessagesTable = pgTable(
  "rd_messages",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    rdSlug: varchar("rd_slug", { length: 64 }).notNull(),
    senderRole: varchar("sender_role", { length: 8 })
      .$type<RdMessageSender>()
      .notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rd_msg_thread").on(t.userId, t.rdSlug, t.createdAt)],
);

export const rdProgressLogsTable = pgTable(
  "rd_progress_logs",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
    energyScore: integer("energy_score"),
    adherenceScore: integer("adherence_score"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rd_progress_user").on(t.userId, t.loggedAt)],
);

export const rdLabUploadsTable = pgTable(
  "rd_lab_uploads",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    sharedWithRdSlug: varchar("shared_with_rd_slug", { length: 64 }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    sizeBytes: integer("size_bytes"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_rd_lab_user").on(t.userId, t.createdAt)],
);

export type RdAppointment = typeof rdAppointmentsTable.$inferSelect;
export type RdMessage = typeof rdMessagesTable.$inferSelect;
export type RdProgressLog = typeof rdProgressLogsTable.$inferSelect;
export type RdLabUpload = typeof rdLabUploadsTable.$inferSelect;
