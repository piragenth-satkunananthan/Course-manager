import { BookOpen, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { AddCourseButton, SemesterPicker } from "@/components/app/course-list-controls";
import { CourseRow } from "@/components/app/course-row";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { listCourses } from "@/server/data/courses";
import { listSemesters } from "@/server/data/semesters";
import { requireStudentId } from "@/server/session";

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ semester?: string }> }) {
  const studentId = await requireStudentId();
  const semesters = await listSemesters(studentId);
  const { semester: wanted } = await searchParams;
  const selected = semesters.find((s) => s.id === wanted) ?? semesters.find((s) => s.isCurrent) ?? semesters.find((s) => !s.archivedAt) ?? semesters[0];

  if (!selected)
    return (
      <>
        <h1 className="text-2xl font-bold md:text-display">Courses</h1>
        <EmptyState
          icon={CalendarPlus}
          action={
            <Button asChild>
              <Link href="/settings">Add Semester</Link>
            </Button>
          }
        >
          Courses belong to a Semester. Add the Semester you&apos;re in first.
        </EmptyState>
      </>
    );

  const courses = await listCourses(studentId, { semesterId: selected.id });
  const active = courses.filter((c) => !c.archivedAt);
  const archived = courses.filter((c) => c.archivedAt);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-display">Courses</h1>
        {!selected.archivedAt && active.length > 0 && <AddCourseButton semesters={semesters} semesterId={selected.id} />}
      </div>
      <div className="mt-4">
        <SemesterPicker semesters={semesters} selectedId={selected.id} />
      </div>

      {active.length === 0 ? (
        <EmptyState icon={BookOpen} action={!selected.archivedAt && <AddCourseButton semesters={semesters} semesterId={selected.id} />}>
          {selected.archivedAt ? "No Courses in this Semester." : "No Courses yet. Add your first Course."}
        </EmptyState>
      ) : (
        <ul className="mt-6 space-y-2 rounded-md border border-border bg-card p-2" aria-label="Courses">
          {active.map((c) => (
            <CourseRow key={c.id} course={c} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="mt-6 rounded-md border border-border bg-card p-2">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 font-semibold">Archived ({archived.length})</summary>
          <ul className="space-y-2" aria-label="Archived Courses">
            {archived.map((c) => (
              <CourseRow key={c.id} course={c} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
