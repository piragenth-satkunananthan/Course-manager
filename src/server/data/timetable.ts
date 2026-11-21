// Class Sessions, Session Changes and the occurrences built from them (design files 40, 41, 45).
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { classSession, course, semester, sessionChange } from "@/server/db/schema";
import { expandOccurrences } from "@/server/domain/occurrences";
import { addDays, weekdayOf } from "@/server/domain/time";
import { AppError, invalid, notFound } from "@/server/http/errors";
import type { ClassSession, ClassSessionCreate, ClassSessionUpdate, Occurrence, SessionChange, SessionChangeCreate, SessionChangeUpdate } from "@/shared/schemas/timetable";
import { isUniqueViolation } from "./util";
import { snapshot, writeEntity } from "./write-entity";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const NOT_A_CLASS_DAY = "That isn't a day this class meets in its Semester";
const OUTSIDE_SEMESTER = "Choose a date inside the Semester";

// ---- Class Sessions ------------------------------------------------------------------------

const toSession = (r: typeof classSession.$inferSelect): ClassSession => ({
  id: r.id, courseId: r.courseId, kind: r.kind, weekday: r.weekday, startTime: hhmm(r.startTime)!, endTime: hhmm(r.endTime)!, location: r.location,
});

/** The Course with its Semester's dates, or 404. */
async function ownCourse(studentId: string, courseId: string) {
  const [c] = await db
    .select({ id: course.id, start: semester.startDate, end: semester.endDate })
    .from(course)
    .innerJoin(semester, eq(semester.id, course.semesterId))
    .where(and(eq(course.studentId, studentId), eq(course.id, courseId)));
  if (!c) throw notFound("Course");
  return c;
}

export async function listClassSessions(studentId: string, courseId: string) {
  const rows = await db
    .select()
    .from(classSession)
    .where(and(eq(classSession.studentId, studentId), eq(classSession.courseId, courseId)))
    .orderBy(asc(classSession.weekday), asc(classSession.startTime));
  return rows.map(toSession);
}

export async function createClassSession(studentId: string, courseId: string, input: ClassSessionCreate) {
  await ownCourse(studentId, courseId);
  const [row] = await db.insert(classSession).values({ studentId, courseId, ...input }).returning();
  return toSession(row!);
}

export async function updateClassSession(studentId: string, id: string, input: ClassSessionUpdate) {
  const mine = and(eq(classSession.studentId, studentId), eq(classSession.id, id));
  const [current] = await db.select().from(classSession).where(mine);
  if (!current) throw notFound("Class");
  const startTime = input.startTime ?? hhmm(current.startTime)!;
  const endTime = input.endTime ?? hhmm(current.endTime)!;
  if (endTime <= startTime) throw invalid("endTime", "The end time must be after the start time");
  const [row] = Object.keys(input).length ? await db.update(classSession).set(input).where(mine).returning() : [current];
  return toSession(row!);
}

/** Deletes the weekly class; its Session Changes go with it (cascade). */
export async function deleteClassSession(studentId: string, id: string) {
  const deleted = await db.delete(classSession).where(and(eq(classSession.studentId, studentId), eq(classSession.id, id))).returning({ id: classSession.id });
  if (!deleted.length) throw notFound("Class");
  return null;
}

// ---- Session Changes -----------------------------------------------------------------------

const toChange = (r: typeof sessionChange.$inferSelect): SessionChange => ({
  id: r.id, courseId: r.courseId, classSessionId: r.classSessionId, kind: r.kind, sessionKind: r.sessionKind, originalDate: r.originalDate,
  newDate: r.newDate, newStartTime: hhmm(r.newStartTime), newEndTime: hhmm(r.newEndTime), newLocation: r.newLocation, version: r.version,
});
const oneChange = async (dbOrTx: DbOrTx, id: string) => toChange((await dbOrTx.select().from(sessionChange).where(eq(sessionChange.id, id)))[0]!);

async function activeChangeFor(dbOrTx: DbOrTx, studentId: string, classSessionId: string, date: string) {
  const [row] = await dbOrTx
    .select()
    .from(sessionChange)
    .where(and(eq(sessionChange.studentId, studentId), eq(sessionChange.classSessionId, classSessionId), eq(sessionChange.originalDate, date), isNull(sessionChange.deletedAt)));
  return row;
}
const alreadyChanged = (row: typeof sessionChange.$inferSelect) =>
  new AppError("CONFLICT", "This class already has a change. Edit that one instead.", { existingId: row.id, current: toChange(row) });

const student = () => ({ actor: "student" as const, setAt: new Date().toISOString() });

export async function createSessionChange(studentId: string, input: SessionChangeCreate) {
  let proposed: Record<string, unknown>;
  if (input.kind === "extra") {
    const c = await ownCourse(studentId, input.courseId);
    if (input.date < c.start || input.date > c.end) throw invalid("date", OUTSIDE_SEMESTER);
    proposed = { courseId: c.id, kind: "extra", sessionKind: input.sessionKind, newDate: input.date, newStartTime: input.start, newEndTime: input.end, newLocation: input.location };
  } else {
    const [s] = await db
      .select({ courseId: classSession.courseId, weekday: classSession.weekday, start: semester.startDate, end: semester.endDate })
      .from(classSession)
      .innerJoin(course, eq(course.id, classSession.courseId))
      .innerJoin(semester, eq(semester.id, course.semesterId))
      .where(and(eq(classSession.studentId, studentId), eq(classSession.id, input.classSessionId)));
    if (!s) throw notFound("Class");
    if (input.date < s.start || input.date > s.end || weekdayOf(input.date) !== s.weekday) throw invalid("date", NOT_A_CLASS_DAY);
    if (input.kind === "reschedule" && (input.newDate < s.start || input.newDate > s.end)) throw invalid("newDate", OUTSIDE_SEMESTER);
    proposed = { courseId: s.courseId, classSessionId: input.classSessionId, kind: input.kind, originalDate: input.date };
    if (input.kind === "reschedule") Object.assign(proposed, { newDate: input.newDate, newStartTime: input.newStart, newEndTime: input.newEnd, newLocation: input.newLocation });
  }

  try {
    return await db.transaction(async (tx) => {
      if (input.kind !== "extra") {
        const existing = await activeChangeFor(tx, studentId, input.classSessionId, input.date);
        if (existing) throw alreadyChanged(existing);
      }
      const { row } = await writeEntity(tx, { studentId, entityType: "session_change", op: "create", proposed, ...student() });
      return oneChange(tx, row.id);
    });
  } catch (e) {
    // Two creates at once: the partial unique index stops the second; answer it like the check above.
    if (input.kind !== "extra" && isUniqueViolation(e, "session_change_one_active")) throw alreadyChanged((await activeChangeFor(db, studentId, input.classSessionId, input.date))!);
    throw e;
  }
}

export async function updateSessionChange(studentId: string, id: string, { expectedVersion, kind, newDate, newStart, newEnd, newLocation }: SessionChangeUpdate) {
  return db.transaction(async (tx) => {
    const proposed = { kind, newDate, newStartTime: newStart, newEndTime: newEnd, newLocation };
    const { row } = await writeEntity(tx, { studentId, entityType: "session_change", op: "update", entityId: id, proposed, expectedVersion, ...student(), toDto: async (r) => oneChange(tx, r.id) });
    // Checked on the result, since a PATCH sends only some fields. Throwing rolls the write back.
    const after = snapshot("session_change", row) as Record<string, string | null>;
    const wasExtra = !after.classSessionId;
    if (wasExtra !== (after.kind === "extra")) throw invalid("kind", "An extra session can't become a change to a weekly class, or the other way round");
    if (after.kind !== "cancel") {
      if (!after.newDate || !after.newStartTime || !after.newEndTime) throw invalid("newDate", "Give the new date, start and end time");
      if (after.newEndTime <= after.newStartTime) throw invalid("newEnd", "The end time must be after the start time");
    }
    return oneChange(tx, row.id);
  });
}

export async function deleteSessionChange(studentId: string, id: string, expectedVersion: number) {
  await db.transaction((tx) =>
    writeEntity(tx, { studentId, entityType: "session_change", op: "delete", entityId: id, expectedVersion, ...student(), toDto: async (r) => oneChange(tx, r.id) }),
  );
  return null;
}

// ---- Reading -------------------------------------------------------------------------------

/** Occurrences in [from, to] for Courses and Semesters that aren't archived. */
export async function getOccurrences(studentId: string, from: string, to: string): Promise<Occurrence[]> {
  const active = and(eq(course.studentId, studentId), isNull(course.archivedAt), isNull(semester.archivedAt));
  const courses = await db
    .select({ id: course.id, code: course.code, colour: course.colour, start: semester.startDate, end: semester.endDate })
    .from(course)
    .innerJoin(semester, eq(semester.id, course.semesterId))
    .where(active);
  if (!courses.length) return [];
  const info = new Map(courses.map((c) => [c.id, c]));
  const [sessions, changes] = await Promise.all([
    db.select().from(classSession).where(and(eq(classSession.studentId, studentId), inArray(classSession.courseId, [...info.keys()]))),
    db.select().from(sessionChange).where(and(eq(sessionChange.studentId, studentId), isNull(sessionChange.deletedAt), inArray(sessionChange.courseId, [...info.keys()]))),
  ]);
  const occ = expandOccurrences(
    sessions.map((s) => ({ ...toSession(s), semesterStart: info.get(s.courseId)!.start, semesterEnd: info.get(s.courseId)!.end })),
    changes.map(toChange),
    { from, to },
  );
  return occ.map((o) => ({ ...o, courseCode: info.get(o.courseId)!.code, colour: info.get(o.courseId)!.colour }));
}

export const getWeek = (studentId: string, weekStart: string) => getOccurrences(studentId, weekStart, addDays(weekStart, 6));
