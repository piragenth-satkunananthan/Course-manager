// Every table lives here (design file 17). #5 adds Better Auth's tables; later tickets add the domain tables.
import { sql } from "drizzle-orm";
import { COURSE_COLOURS } from "@/shared/schemas/course";
import { bigint, boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull();

// Better Auth core tables (shape from better-auth 1.7.27), plus the Student's settings.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  autoChangesPaused: boolean("auto_changes_paused").default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Better Auth's limiter with storage: "database", so limits survive restarts (§5).
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// Semesters and Courses (§3, #6).
const id = () => uuid("id").primaryKey().defaultRandom();
const studentId = () => text("student_id").notNull().references(() => user.id, { onDelete: "cascade" });

export const semester = pgTable(
  "semester",
  {
    id: id(),
    studentId: studentId(),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    isCurrent: boolean("is_current").default(false).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // The AI may extend end_date (#16), so the row is versioned like every AI-writable item.
    version: integer("version").default(1).notNull(),
    fieldSetAt: jsonb("field_set_at").$type<Record<string, string>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("semester_one_current").on(t.studentId).where(sql`${t.isCurrent}`),
    check("semester_dates_chk", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

export const courseColour = pgEnum("course_colour", COURSE_COLOURS);

export const course = pgTable(
  "course",
  {
    id: id(),
    studentId: studentId(),
    semesterId: uuid("semester_id").notNull().references(() => semester.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    lecturerName: text("lecturer_name"),
    colour: courseColour("colour").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("course_code_unique").on(t.studentId, t.semesterId, sql`lower(${t.code})`)],
);

export const nicknameSource = pgEnum("nickname_source", ["manual", "unknown_course"]);

export const courseNickname = pgTable(
  "course_nickname",
  {
    id: id(),
    studentId: studentId(),
    courseId: uuid("course_id").notNull().references(() => course.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(), // stored lowercase
    source: nicknameSource("source").default("manual").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("course_nickname_unique").on(t.studentId, t.courseId, t.nickname)],
);
