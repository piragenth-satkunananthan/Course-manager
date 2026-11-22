// The AI context from Postgres (design §9). Shared by the worker's batches and Unknown Course resolution (#14).
import { and, desc, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { decrypt } from "@/server/crypto";
import type { Tx } from "@/server/db/client";
import { assignment, course, courseNickname, exam, inboxMessage, semester, suppression } from "@/server/db/schema";
import { addDays, localToInstant, todayIn } from "@/server/domain/time";
import type { ContextAdapter } from "./context";

/** The context from Postgres (design §9). The current Semester and its Courses that aren't archived. */
export function pgAdapter(db: Tx, studentId: string, groupId: string, batchIds: string[], key: Buffer, now: Date): ContextAdapter {
  const currentSemester = async () =>
    (await db.select().from(semester).where(and(eq(semester.studentId, studentId), eq(semester.isCurrent, true), isNull(semester.archivedAt))))[0];
  const courseIds = async () => {
    const s = await currentSemester();
    return s ? (await db.select({ id: course.id }).from(course).where(and(eq(course.semesterId, s.id), isNull(course.archivedAt)))).map((c) => c.id) : [];
  };
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
  return {
    async getSemester() {
      const s = await currentSemester();
      return s ? { id: s.id, startDate: s.startDate, endDate: s.endDate } : null;
    },
    async getCourses() {
      const ids = await courseIds();
      if (!ids.length) return [];
      const [cs, nicks] = await Promise.all([
        db.select().from(course).where(inArray(course.id, ids)),
        db.select().from(courseNickname).where(inArray(courseNickname.courseId, ids)),
      ]);
      return cs.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        nicknames: nicks.filter((n) => n.courseId === c.id).map((n) => n.nickname),
        ...(c.practicalOfCourseId && ids.includes(c.practicalOfCourseId) ? { practicalOf: c.practicalOfCourseId } : {}),
      }));
    },
    async getOpenAndRecentAssessments() {
      const ids = await courseIds();
      if (!ids.length) return { assignments: [], exams: [] };
      const recent = addDays(todayIn(now), -30);
      const [as, es] = await Promise.all([
        db
          .select()
          .from(assignment)
          .where(and(inArray(assignment.courseId, ids), isNull(assignment.deletedAt), or(ne(assignment.status, "submitted"), gte(assignment.submittedAt, localToInstant(recent, "00:00"))))),
        db.select().from(exam).where(and(inArray(exam.courseId, ids), isNull(exam.deletedAt), or(isNull(exam.date), gte(exam.date, todayIn(now))))),
      ]);
      return {
        assignments: as.map((a) => ({ id: a.id, courseId: a.courseId, title: a.title, dueDate: a.dueDate, dueTime: hhmm(a.dueTime), status: a.status })),
        exams: es.map((e) => ({ id: e.id, courseId: e.courseId, title: e.title, kindLabel: e.kindLabel, date: e.date, startTime: hhmm(e.startTime) })),
      };
    },
    async getSuppressions() {
      const ids = await courseIds();
      if (!ids.length) return [];
      const rows = await db.select().from(suppression).where(inArray(suppression.courseId, ids));
      return rows.map((r) => ({ courseId: r.courseId, entityType: r.entityType as "assignment" | "exam", title: r.titleKey, dueDate: r.dueDate }));
    },
    async getRecentMessages() {
      const rows = await db
        .select()
        .from(inboxMessage)
        // Deleted messages are left out: their changes were withdrawn, and a repost must read as new.
        .where(and(eq(inboxMessage.waGroupId, groupId), eq(inboxMessage.status, "done"), inArray(inboxMessage.kind, ["text", "edit"]), isNull(inboxMessage.revokedAt), gte(inboxMessage.sentAt, new Date(+now - 7 * 86_400_000))))
        .orderBy(desc(inboxMessage.sentAt))
        .limit(60);
      return rows
        .filter((r) => !batchIds.includes(r.id) && r.textEnc)
        .reverse()
        .map((r) => ({ id: r.id, sender: r.senderName, sentAt: r.sentAt.toISOString(), text: decrypt(r.textEnc!, key), decision: r.decision }));
    },
  };
}
