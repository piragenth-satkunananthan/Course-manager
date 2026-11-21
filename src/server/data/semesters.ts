// Semesters, scoped to the Student (design file 38). Every query filters on studentId.
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { course, inboxMessage, semester, waGroup, waSession } from "@/server/db/schema";
import { AppError, notFound } from "@/server/http/errors";
import type { Semester, SemesterCreate } from "@/shared/schemas/semester";
import { iso } from "./util";

type Row = typeof semester.$inferSelect;
const toDto = (r: Row): Semester => ({
  id: r.id,
  name: r.name,
  startDate: r.startDate,
  endDate: r.endDate,
  isCurrent: r.isCurrent,
  archivedAt: iso(r.archivedAt),
  version: r.version,
});

const mine = (studentId: string, id: string) => and(eq(semester.studentId, studentId), eq(semester.id, id));

// Serialises changes to which Semester is current, per Student, so two tabs can't race into the one-current index.
const lockCurrent = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], studentId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"semester-current:" + studentId}))`);

export async function listSemesters(studentId: string) {
  const rows = await db.select().from(semester).where(eq(semester.studentId, studentId)).orderBy(desc(semester.startDate), desc(semester.createdAt));
  return rows.map(toDto);
}

export async function createSemester(studentId: string, input: SemesterCreate) {
  return db.transaction(async (tx) => {
    await lockCurrent(tx, studentId);
    // The first Semester becomes current, so a new account has somewhere to put its Courses.
    const [current] = await tx.select({ id: semester.id }).from(semester).where(and(eq(semester.studentId, studentId), eq(semester.isCurrent, true)));
    const [row] = await tx.insert(semester).values({ studentId, ...input, isCurrent: !current }).returning();
    return toDto(row!);
  });
}

export async function setCurrentSemester(studentId: string, id: string) {
  return db.transaction(async (tx) => {
    await lockCurrent(tx, studentId);
    const [row] = await tx.select().from(semester).where(mine(studentId, id));
    if (!row) throw notFound("Semester");
    if (row.archivedAt) throw new AppError("VALIDATION", "An archived Semester can't be the current one");
    await tx.update(semester).set({ isCurrent: false }).where(and(eq(semester.studentId, studentId), ne(semester.id, id), eq(semester.isCurrent, true)));
    const [updated] = await tx.update(semester).set({ isCurrent: true }).where(mine(studentId, id)).returning();
    return toDto(updated!);
  });
}

export async function archiveSemester(studentId: string, id: string) {
  // shortcut: #12 also expires this Semester's suppressions here.
  const [row] = await db
    .update(semester)
    .set({ archivedAt: sql`coalesce(${semester.archivedAt}, now())`, isCurrent: false }) // archiving twice keeps the first time
    .where(mine(studentId, id))
    .returning();
  if (!row) throw notFound("Semester");
  // D1: message text is kept only until its Semester is archived; the decision rows stay. Its groups (the Class
  // Group and its Courses' groups) stop being read, so no new text arrives, and the worker reloads its list.
  await db.update(inboxMessage).set({ textEnc: null }).where(and(eq(inboxMessage.studentId, studentId), eq(inboxMessage.semesterId, id)));
  const courseIds = db.select({ id: course.id }).from(course).where(and(eq(course.studentId, studentId), eq(course.semesterId, id)));
  await db
    .update(waGroup)
    .set({ linkedCourseId: null, linkedSemesterId: null, linkedAt: null })
    .where(and(eq(waGroup.studentId, studentId), sql`(${waGroup.linkedSemesterId} = ${id} or ${waGroup.linkedCourseId} in ${courseIds})`));
  await db.update(waSession).set({ groupsReloadRequestedAt: new Date() }).where(eq(waSession.studentId, studentId));
  return toDto(row);
}
