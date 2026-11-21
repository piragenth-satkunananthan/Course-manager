// Every table lives here (design file 17). #5 adds Better Auth's tables; later tickets add the domain tables.
import { sql } from "drizzle-orm";
import { COURSE_COLOURS } from "@/shared/schemas/course";
import { bigint, boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

// Assessments and their history (§3, #7).
export const assignmentStatus = pgEnum("assignment_status", ["todo", "in_progress", "submitted"]);
export const itemSource = pgEnum("item_source", ["manual", "ai"]);
const versioned = () => ({
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  version: integer("version").default(1).notNull(),
  fieldSetAt: jsonb("field_set_at").$type<Record<string, string>>().default({}).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
const courseId = () => uuid("course_id").notNull().references(() => course.id, { onDelete: "cascade" });

export const assignment = pgTable(
  "assignment",
  {
    id: id(),
    studentId: studentId(),
    courseId: courseId(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    dueTime: time("due_time"), // null: time not announced, treated as 23:59
    status: assignmentStatus("status").default("todo").notNull(), // the Student owns status and submittedAt
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submitWhere: text("submit_where"),
    isGroupWork: boolean("is_group_work").default(false).notNull(),
    source: itemSource("source").default("manual").notNull(),
    ...versioned(),
  },
  (t) => [index("assignment_student_due_idx").on(t.studentId, t.dueDate)],
);

export const exam = pgTable(
  "exam",
  {
    id: id(),
    studentId: studentId(),
    courseId: courseId(),
    title: text("title").notNull(),
    kindLabel: text("kind_label"),
    date: date("date", { mode: "string" }), // null: TBA
    startTime: time("start_time"),
    location: text("location"),
    topics: text("topics"),
    source: itemSource("source").default("manual").notNull(),
    ...versioned(),
  },
  (t) => [index("exam_student_date_idx").on(t.studentId, t.date)],
);

export const entityType = pgEnum("entity_type", ["assignment", "exam", "session_change", "semester"]);
export const versionOp = pgEnum("version_op", ["create", "update", "delete", "undo", "status"]);
export const actor = pgEnum("actor", ["ai", "student", "system"]);

/** One row for every write to an AI-writable item, by anyone. */
export const entityVersion = pgTable(
  "entity_version",
  {
    id: id(),
    studentId: studentId(),
    entityType: entityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    version: integer("version").notNull(),
    op: versionOp("op").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    beforeFieldSetAt: jsonb("before_field_set_at").$type<Record<string, string> | null>(),
    actor: actor("actor").notNull(),
    autoChangeId: uuid("auto_change_id"), // FK added with auto_change (#12)
    createdAt: createdAt(),
  },
  (t) => [index("entity_version_entity_idx").on(t.entityType, t.entityId)],
);

// The timetable (§3, #8). Occurrences are calculated from these, never stored.
export const sessionKind = pgEnum("session_kind", ["lecture", "tutorial", "lab"]);

export const classSession = pgTable(
  "class_session",
  {
    id: id(),
    studentId: studentId(),
    courseId: courseId(),
    kind: sessionKind("kind").notNull(),
    weekday: integer("weekday").notNull(), // ISO: 1 = Monday … 7 = Sunday
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    location: text("location"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("class_session_time_chk", sql`${t.endTime} > ${t.startTime} and ${t.weekday} between 1 and 7`),
    index("class_session_course_idx").on(t.courseId),
  ],
);

export const sessionChangeKind = pgEnum("session_change_kind", ["cancel", "reschedule", "extra"]);

export const sessionChange = pgTable(
  "session_change",
  {
    id: id(),
    studentId: studentId(),
    courseId: courseId(),
    classSessionId: uuid("class_session_id").references(() => classSession.id, { onDelete: "cascade" }), // null for extras
    kind: sessionChangeKind("kind").notNull(),
    sessionKind: sessionKind("session_kind"), // for extras: what kind of class
    originalDate: date("original_date", { mode: "string" }), // the occurrence changed; null for extras
    newDate: date("new_date", { mode: "string" }),
    newStartTime: time("new_start_time"),
    newEndTime: time("new_end_time"),
    newLocation: text("new_location"),
    source: itemSource("source").default("manual").notNull(),
    ...versioned(),
  },
  (t) => [
    // Each occurrence has at most one active change, updated (never duplicated) when corrected.
    uniqueIndex("session_change_one_active")
      .on(t.classSessionId, t.originalDate)
      .where(sql`${t.deletedAt} is null and ${t.kind} in ('cancel', 'reschedule')`),
    index("session_change_course_idx").on(t.courseId),
  ],
);

// Email and health (§3, #9).
export const emailKind = pgEnum("email_kind", ["digest", "final_reminder", "alert", "password_reset", "account_deleted"]);
export const emailStatus = pgEnum("email_status", ["sending", "sent", "failed", "skipped"]);

/** Written before every provider call; its id is the Idempotency-Key, so a resend never duplicates. */
export const emailLog = pgTable(
  "email_log",
  {
    id: id(),
    studentId: studentId(),
    kind: emailKind("kind").notNull(),
    digestDate: date("digest_date", { mode: "string" }),
    entityType: entityType("entity_type"),
    entityId: uuid("entity_id"),
    dueAt: timestamp("due_at", { withTimezone: true }), // the due instant a Final Reminder is for
    subject: text("subject").notNull(),
    status: emailStatus("status").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    attempts: integer("attempts").default(0).notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("email_log_one_digest_per_day").on(t.studentId, t.digestDate).where(sql`${t.kind} = 'digest'`),
    uniqueIndex("email_log_one_final_reminder").on(t.entityType, t.entityId, t.dueAt).where(sql`${t.kind} = 'final_reminder'`),
  ],
);

export const healthComponent = pgEnum("health_component", ["wa_socket", "ai", "scheduler", "email", "backup"]);

/** Read by the banners and heartbeats (#10). One row per component. */
export const healthSignal = pgTable("health_signal", {
  component: healthComponent("component").primaryKey(),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  detail: text("detail"),
});

// Activity Log entries that aren't Auto Changes (§3). Alerts are de-duplicated by kind + payload.cause within 12 h.
export const activityKind = pgEnum("activity_kind", ["ai_output_rejected", "ai_overflow", "alert", "stuck_messages", "file_too_large"]);
export const activityEvent = pgTable(
  "activity_event",
  {
    id: id(),
    studentId: studentId(),
    kind: activityKind("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_event_student_idx").on(t.studentId, t.createdAt)],
);
