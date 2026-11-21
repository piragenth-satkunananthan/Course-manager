// Assignments and Exams, scoped to the Student (design files 42, 43). Writes go through writeEntity.
import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { assignment, course, entityVersion, exam } from "@/server/db/schema";
import { effectiveDueInstant } from "@/server/domain/deadlines";
import { invalid, notFound } from "@/server/http/errors";
import type { Assignment, AssignmentCreate, AssignmentUpdate } from "@/shared/schemas/assignment";
import type { Exam, ExamCreate, ExamUpdate } from "@/shared/schemas/exam";
import { iso } from "./util";
import { snapshot, writeEntity } from "./write-entity";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

// ---- reading -------------------------------------------------------------------------------

export async function loadAssignments(x: Executor, studentId: string, where?: SQL): Promise<Assignment[]> {
  const rows = await x
    .select({ a: assignment, courseCode: course.code, courseColour: course.colour })
    .from(assignment)
    .innerJoin(course, eq(course.id, assignment.courseId))
    .where(and(eq(assignment.studentId, studentId), isNull(assignment.deletedAt), where))
    .orderBy(asc(assignment.dueDate), asc(assignment.dueTime));
  return rows.map(({ a, courseCode, courseColour }) => {
    const dueTime = hhmm(a.dueTime);
    return {
      id: a.id, courseId: a.courseId, courseCode, courseColour, title: a.title, description: a.description,
      dueDate: a.dueDate, dueTime, timeAnnounced: dueTime !== null,
      dueAt: effectiveDueInstant({ type: "assignment", id: a.id, dueDate: a.dueDate, dueTime, status: a.status })!.toISOString(),
      status: a.status, submittedAt: iso(a.submittedAt), submitWhere: a.submitWhere, isGroupWork: a.isGroupWork, source: a.source, version: a.version,
    };
  });
}

export async function loadExams(x: Executor, studentId: string, where?: SQL): Promise<Exam[]> {
  const rows = await x
    .select({ e: exam, courseCode: course.code, courseColour: course.colour })
    .from(exam)
    .innerJoin(course, eq(course.id, exam.courseId))
    .where(and(eq(exam.studentId, studentId), isNull(exam.deletedAt), where))
    .orderBy(asc(exam.date), asc(exam.startTime));
  return rows.map(({ e, courseCode, courseColour }) => {
    const startTime = hhmm(e.startTime);
    const dueAt = effectiveDueInstant({ type: "exam", id: e.id, date: e.date, startTime });
    return {
      id: e.id, courseId: e.courseId, courseCode, courseColour, title: e.title, kindLabel: e.kindLabel, date: e.date, startTime,
      location: e.location, topics: e.topics, dueAt: dueAt?.toISOString() ?? null, source: e.source, version: e.version,
    };
  });
}

const oneAssignment = async (x: Executor, studentId: string, id: string) => (await loadAssignments(x, studentId, eq(assignment.id, id)))[0]!;
const oneExam = async (x: Executor, studentId: string, id: string) => (await loadExams(x, studentId, eq(exam.id, id)))[0]!;

async function assertCourse(studentId: string, courseId: string | undefined) {
  if (!courseId) return;
  const [c] = await db.select({ id: course.id }).from(course).where(and(eq(course.studentId, studentId), eq(course.id, courseId)));
  if (!c) throw notFound("Course");
}

// ---- Assignments ---------------------------------------------------------------------------

export async function listAssignments(studentId: string, q: { courseId?: string; status?: Assignment["status"] }) {
  await assertCourse(studentId, q.courseId);
  return loadAssignments(db, studentId, and(q.courseId ? eq(assignment.courseId, q.courseId) : undefined, q.status ? eq(assignment.status, q.status) : undefined));
}

const studentWrite = { actor: "student" as const, setAt: () => new Date().toISOString() };

export async function createAssignment(studentId: string, input: AssignmentCreate) {
  await assertCourse(studentId, input.courseId);
  return db.transaction(async (tx) => {
    const { row } = await writeEntity(tx, { studentId, entityType: "assignment", op: "create", proposed: input, actor: "student", setAt: studentWrite.setAt(), toDto: async () => null });
    return oneAssignment(tx, studentId, row.id);
  });
}

export async function updateAssignment(studentId: string, id: string, { expectedVersion, ...proposed }: AssignmentUpdate) {
  await assertCourse(studentId, proposed.courseId);
  return db.transaction(async (tx) => {
    const { row } = await writeEntity(tx, {
      studentId, entityType: "assignment", op: "update", entityId: id, proposed, expectedVersion, actor: "student", setAt: studentWrite.setAt(),
      toDto: (r) => oneAssignment(tx, studentId, r.id),
    });
    return oneAssignment(tx, studentId, row.id);
  });
}

export async function deleteAssignment(studentId: string, id: string, expectedVersion: number) {
  // shortcut: deleting an Assignment the AI created also adds a suppression once that table exists (#12).
  await db.transaction((tx) =>
    writeEntity(tx, { studentId, entityType: "assignment", op: "delete", entityId: id, expectedVersion, actor: "student", setAt: studentWrite.setAt(), toDto: (r) => oneAssignment(tx, studentId, r.id) }),
  );
  return null;
}

/** The Student owns status: it writes history but never bumps the version, so it never blocks Undo (§3). */
export async function setAssignmentStatus(studentId: string, id: string, status: Assignment["status"]) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(assignment)
      .where(and(eq(assignment.id, id), eq(assignment.studentId, studentId), isNull(assignment.deletedAt)))
      .for("update");
    if (!row) throw notFound("Assignment");
    if (row.status !== status) {
      const submittedAt = status === "submitted" ? new Date() : null;
      await tx.update(assignment).set({ status, submittedAt }).where(eq(assignment.id, id));
      await tx.insert(entityVersion).values({
        studentId, entityType: "assignment", entityId: id, version: row.version, op: "status", actor: "student",
        before: { status: row.status, submittedAt: iso(row.submittedAt) }, after: { status, submittedAt: iso(submittedAt) },
      });
    }
    return oneAssignment(tx, studentId, id);
  });
}

// ---- Exams ---------------------------------------------------------------------------------

export async function listExams(studentId: string, q: { courseId?: string }) {
  await assertCourse(studentId, q.courseId);
  return loadExams(db, studentId, q.courseId ? eq(exam.courseId, q.courseId) : undefined);
}

export async function createExam(studentId: string, input: ExamCreate) {
  await assertCourse(studentId, input.courseId);
  return db.transaction(async (tx) => {
    const { row } = await writeEntity(tx, { studentId, entityType: "exam", op: "create", proposed: input, actor: "student", setAt: studentWrite.setAt(), toDto: async () => null });
    return oneExam(tx, studentId, row.id);
  });
}

export async function updateExam(studentId: string, id: string, { expectedVersion, ...proposed }: ExamUpdate) {
  await assertCourse(studentId, proposed.courseId);
  return db.transaction(async (tx) => {
    const { row } = await writeEntity(tx, {
      studentId, entityType: "exam", op: "update", entityId: id, proposed, expectedVersion, actor: "student", setAt: studentWrite.setAt(),
      toDto: (r) => oneExam(tx, studentId, r.id),
    });
    // A partial edit can leave a time without a date; the schema only sees the fields sent. Throwing rolls back.
    const after = snapshot("exam", row);
    if (after.startTime && !after.date) throw invalid("startTime", "Add the date too, or leave the time empty while it's TBA");
    return oneExam(tx, studentId, row.id);
  });
}

export async function deleteExam(studentId: string, id: string, expectedVersion: number) {
  await db.transaction((tx) =>
    writeEntity(tx, { studentId, entityType: "exam", op: "delete", entityId: id, expectedVersion, actor: "student", setAt: studentWrite.setAt(), toDto: (r) => oneExam(tx, studentId, r.id) }),
  );
  return null;
}
