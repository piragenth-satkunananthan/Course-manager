import { Archive, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as z from "zod";
import { CourseActions } from "@/components/app/course-actions";
import { NicknameEditor } from "@/components/app/nickname-editor";
import { WeeklyClasses } from "@/components/app/weekly-classes";
import { Badge } from "@/components/ui/badge";
import { COLOUR_BG } from "@/lib/course-colours";
import { getCourse, listCourses } from "@/server/data/courses";
import { listClassSessions } from "@/server/data/timetable";
import { AppError } from "@/server/http/errors";
import { requireStudentId } from "@/server/session";

// Details, weekly classes and Nicknames. The Assignments and Exams tabs join later.
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const studentId = await requireStudentId();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const course = await getCourse(studentId, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const others = await listCourses(studentId, { semesterId: course.semesterId });
  const practicalOf = others.find((c) => c.id === course.practicalOfCourseId);
  const practical = others.find((c) => c.practicalOfCourseId === course.id);

  return (
    <>
      <Link href={`/courses?semester=${course.semesterId}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        Courses
      </Link>
      <div className="mt-2 flex items-start gap-3">
        <span aria-hidden="true" className={`mt-1 h-12 w-1 shrink-0 rounded-full ${COLOUR_BG[course.colour]}`} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold md:text-display">{course.code}</h1>
          <p className="text-heading">{course.name}</p>
          {course.lecturerName && <p className="text-sm text-muted-foreground">{course.lecturerName}</p>}
          {practicalOf && <p className="text-sm text-muted-foreground">Practical of <Link href={`/courses/${practicalOf.id}`} className="underline">{practicalOf.code}</Link></p>}
          {practical && <p className="text-sm text-muted-foreground">Practical Course: <Link href={`/courses/${practical.id}`} className="underline">{practical.code}</Link></p>}
          {course.archivedAt && (
            <Badge variant="secondary" className="mt-2 text-muted-foreground">
              <Archive aria-hidden="true" />
              Archived
            </Badge>
          )}
        </div>
        <CourseActions course={course} others={others} />
      </div>
      <div className="mt-6 space-y-6">
        <WeeklyClasses courseId={course.id} code={course.code} sessions={await listClassSessions(studentId, course.id)} />
        <NicknameEditor courseId={course.id} code={course.code} nicknames={course.nicknames} />
      </div>
    </>
  );
}
