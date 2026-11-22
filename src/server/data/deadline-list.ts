// The Deadlines lists' data (#21): the Student's Assignments or Exams in Courses that aren't archived, filtered by
// status and Course. An unknown or archived Course in the URL is ignored rather than an error.
import type { Deadline } from "@/shared/schemas/dashboard";
import { listAssignments, listExams } from "./assessments";
import { listCourseOptions } from "./courses";

export async function loadDeadlineList(studentId: string, kind: "assignments" | "exams", q: { status?: string; course?: string }) {
  const courses = await listCourseOptions(studentId);
  const active = new Set(courses.map((c) => c.id));
  const course = q.course && active.has(q.course) ? q.course : null;
  const status = kind === "assignments" && q.status === "submitted" ? ("submitted" as const) : ("todo" as const);
  const items: Deadline[] =
    kind === "assignments"
      ? (await listAssignments(studentId, { courseId: course ?? undefined }))
          .filter((a) => active.has(a.courseId) && (status === "submitted") === (a.status === "submitted"))
          .map((item) => ({ type: "assignment" as const, item }))
      : (await listExams(studentId, { courseId: course ?? undefined })).filter((e) => active.has(e.courseId)).map((item) => ({ type: "exam" as const, item }));
  return { status, course, courses, items };
}
