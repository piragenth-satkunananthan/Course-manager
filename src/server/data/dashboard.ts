// The dashboard (design file 44). Auto Changes (#12) and banners (#10, #11) join later.
import { and, eq, gte, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/server/db/client";
import { assignment, course, exam, semester } from "@/server/db/schema";
import { classifyForDashboard, type DeadlineInput } from "@/server/domain/deadlines";
import { addDays, todayIn } from "@/server/domain/time";
import type { Exam } from "@/shared/schemas/exam";
import type { Dashboard, Deadline } from "@/shared/schemas/dashboard";
import { loadAssignments, loadExams } from "./assessments";
import { getOccurrences } from "./timetable";

type Item = DeadlineInput & { deadline: Deadline };

export async function getDashboard(studentId: string, now = new Date()): Promise<Dashboard> {
  // Only Courses and Semesters that aren't archived. Exams dated before yesterday can't be upcoming.
  const activeCourseIds = db
    .select({ id: course.id })
    .from(course)
    .innerJoin(semester, eq(semester.id, course.semesterId))
    .where(and(eq(course.studentId, studentId), isNull(course.archivedAt), isNull(semester.archivedAt)));
  const today = todayIn(now);
  const [assignments, exams, todaySessions] = await Promise.all([
    loadAssignments(db, studentId, and(inArray(assignment.courseId, activeCourseIds), ne(assignment.status, "submitted"))),
    loadExams(db, studentId, and(inArray(exam.courseId, activeCourseIds), or(isNull(exam.date), gte(exam.date, addDays(today, -1))))),
    getOccurrences(studentId, today, today),
  ]);

  const items: Item[] = [
    ...assignments.map((a): Item => ({ type: "assignment", id: a.id, dueDate: a.dueDate, dueTime: a.dueTime, status: a.status, deadline: { type: "assignment", item: a } })),
    ...exams.map((e): Item => ({ type: "exam", id: e.id, date: e.date, startTime: e.startTime, deadline: { type: "exam", item: e } })),
  ];
  const c = classifyForDashboard(items, now);
  return {
    overdue: c.overdue.map((i) => i.deadline),
    todaySessions,
    upcoming: c.upcoming.map((i) => i.deadline),
    tbaExams: c.tbaExams.map((i) => i.deadline.item as Exam),
    highlightedChanges: [],
    recentAutoChanges: [],
    banners: [],
  };
}
