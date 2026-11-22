import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { COLOUR_BG } from "@/lib/course-colours";
import type { Course } from "@/shared/schemas/course";

/** One Course in a list: a 4 px colour bar, always with the code next to it (design-system §2.1). */
export function CourseRow({ course, practicalOf }: { course: Course; practicalOf?: Course }) {
  return (
    <li>
      <Link href={`/courses/${course.id}`} className="flex min-h-14 items-center gap-3 rounded-md px-3 py-2 hover:bg-muted">
        <span aria-hidden="true" className={`h-10 w-1 shrink-0 rounded-full ${COLOUR_BG[course.colour]}`} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {course.code} <span className="font-normal">{course.name}</span>
          </span>
          {practicalOf && <span className="block text-sm text-muted-foreground">Practical of {practicalOf.code}</span>}
          {course.lecturerName && <span className="block text-sm text-muted-foreground">{course.lecturerName}</span>}
        </span>
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="text-muted-foreground" />
      </Link>
    </li>
  );
}
