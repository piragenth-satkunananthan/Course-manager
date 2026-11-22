// Courses and their Nicknames, scoped to the Student (design file 39). The AI never writes here.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { course, courseNickname, semester, waSession } from "@/server/db/schema";
import { invalid, notFound } from "@/server/http/errors";
import type { Course, CourseCreate, CourseUpdate, Nickname } from "@/shared/schemas/course";
import { isUniqueViolation, iso } from "./util";

type Row = typeof course.$inferSelect;

async function toCourses(studentId: string, rows: Row[]): Promise<Course[]> {
  const ids = rows.map((r) => r.id);
  const nicks = ids.length
    ? await db
        .select()
        .from(courseNickname)
        .where(and(eq(courseNickname.studentId, studentId), inArray(courseNickname.courseId, ids)))
        .orderBy(asc(courseNickname.nickname))
    : [];
  return rows.map((r) => ({
    id: r.id,
    semesterId: r.semesterId,
    code: r.code,
    name: r.name,
    lecturerName: r.lecturerName,
    colour: r.colour,
    practicalOfCourseId: r.practicalOfCourseId,
    archivedAt: iso(r.archivedAt),
    nicknames: nicks.filter((n) => n.courseId === r.id).map((n) => ({ id: n.id, nickname: n.nickname })),
  }));
}
const toCourse = async (studentId: string, row: Row) => (await toCourses(studentId, [row]))[0]!;

const mine = (studentId: string, id: string) => and(eq(course.studentId, studentId), eq(course.id, id));

/** Runs a write that may hit the one-code-per-Semester index, reporting it on the code field. */
async function uniqueCode<T>(write: () => Promise<T>) {
  try {
    return await write();
  } catch (e) {
    if (isUniqueViolation(e, "course_code_unique")) throw invalid("code", "This Semester already has a Course with this code");
    if (isUniqueViolation(e, "course_practical_unique")) throw invalid("practicalOfCourseId", "That Course already has a Practical Course");
    throw e;
  }
}

async function assertSemester(studentId: string, semesterId: string) {
  const [s] = await db.select({ id: semester.id }).from(semester).where(and(eq(semester.studentId, studentId), eq(semester.id, semesterId)));
  if (!s) throw notFound("Semester");
}

/** U13: a Practical Course points at a theory Course in its own Semester; neither side may be part of another pair. */
async function assertPractical(studentId: string, self: { id?: string; semesterId: string; practicalOfCourseId?: string | null }, theoryId: string | null | undefined) {
  if (!theoryId || theoryId === self.practicalOfCourseId) return; // unchanged
  const field = "practicalOfCourseId";
  if (theoryId === self.id) throw invalid(field, "A Course can't be its own Practical Course");
  const [t] = await db.select().from(course).where(mine(studentId, theoryId));
  if (!t) throw notFound("Course");
  if (t.semesterId !== self.semesterId) throw invalid(field, "Choose a Course in the same Semester");
  if (t.practicalOfCourseId) throw invalid(field, "That Course is itself a Practical Course");
  if (t.archivedAt) throw invalid(field, "That Course is archived");
  if (self.id) {
    const [own] = await db.select({ id: course.id }).from(course).where(and(eq(course.studentId, studentId), eq(course.practicalOfCourseId, self.id)));
    if (own) throw invalid(field, "This Course has its own Practical Course");
  }
}

export async function listCourses(studentId: string, { semesterId }: { semesterId?: string }) {
  if (semesterId) await assertSemester(studentId, semesterId);
  const where = semesterId ? and(eq(course.studentId, studentId), eq(course.semesterId, semesterId)) : eq(course.studentId, studentId);
  return toCourses(studentId, await db.select().from(course).where(where).orderBy(asc(course.code)));
}

export async function getCourse(studentId: string, id: string) {
  const [row] = await db.select().from(course).where(mine(studentId, id));
  if (!row) throw notFound("Course");
  return toCourse(studentId, row);
}

export async function createCourse(studentId: string, input: CourseCreate) {
  await assertSemester(studentId, input.semesterId);
  await assertPractical(studentId, { semesterId: input.semesterId }, input.practicalOfCourseId);
  const [row] = await uniqueCode(() => db.insert(course).values({ studentId, ...input }).returning());
  return toCourse(studentId, row!);
}

export async function updateCourse(studentId: string, id: string, input: CourseUpdate) {
  if (input.practicalOfCourseId) {
    const [self] = await db.select({ id: course.id, semesterId: course.semesterId, practicalOfCourseId: course.practicalOfCourseId }).from(course).where(mine(studentId, id));
    if (!self) throw notFound("Course");
    await assertPractical(studentId, self, input.practicalOfCourseId);
  }
  const [row] = Object.keys(input).length
    ? await uniqueCode(() => db.update(course).set(input).where(mine(studentId, id)).returning())
    : await db.select().from(course).where(mine(studentId, id));
  if (!row) throw notFound("Course");
  return toCourse(studentId, row);
}

export async function archiveCourse(studentId: string, id: string) {
  const [existing] = await db.select().from(course).where(mine(studentId, id));
  if (!existing) throw notFound("Course");
  if (existing.archivedAt) return toCourse(studentId, existing); // archiving twice keeps the first time
  const [row] = await db.update(course).set({ archivedAt: new Date() }).where(mine(studentId, id)).returning();
  return toCourse(studentId, row!);
}

/** Hard delete, guarded by typing the code. Cascades to everything under the Course (§3). */
export async function deleteCourse(studentId: string, id: string, confirmCode: string) {
  const [row] = await db.select({ code: course.code }).from(course).where(mine(studentId, id));
  if (!row) throw notFound("Course");
  if (confirmCode.trim().toLowerCase() !== row.code.toLowerCase()) throw invalid("confirmCode", `Type ${row.code} to confirm`);
  // Its WhatsApp group is unlinked by the foreign key (on delete set null); the worker reloads its groups.
  await db.delete(course).where(mine(studentId, id));
  await db.update(waSession).set({ groupsReloadRequestedAt: new Date() }).where(eq(waSession.studentId, studentId));
  return null;
}

export async function addNickname(studentId: string, courseId: string, nickname: string): Promise<Nickname> {
  const [c] = await db.select({ id: course.id }).from(course).where(mine(studentId, courseId));
  if (!c) throw notFound("Course");
  try {
    const [row] = await db.insert(courseNickname).values({ studentId, courseId, nickname }).returning();
    return { id: row!.id, nickname: row!.nickname };
  } catch (e) {
    if (isUniqueViolation(e, "course_nickname_unique")) throw invalid("nickname", "This Course already has that nickname");
    throw e;
  }
}

export async function removeNickname(studentId: string, id: string) {
  const deleted = await db
    .delete(courseNickname)
    .where(and(eq(courseNickname.studentId, studentId), eq(courseNickname.id, id)))
    .returning({ id: courseNickname.id });
  if (!deleted.length) throw notFound("Nickname");
  return null;
}

/** Courses the Student can add Assignments and Exams to: neither the Course nor its Semester is archived. */
export async function listCourseOptions(studentId: string) {
  return db
    .select({ id: course.id, code: course.code, name: course.name, colour: course.colour })
    .from(course)
    .innerJoin(semester, eq(semester.id, course.semesterId))
    .where(and(eq(course.studentId, studentId), isNull(course.archivedAt), isNull(semester.archivedAt)))
    .orderBy(asc(course.code));
}
