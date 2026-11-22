"use client";
// The Course filter of the Deadlines lists (design-system §7.3): kept in the URL, like the other filters.
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLOUR_BG } from "@/lib/course-colours";
import { type ListKind, type ListStatus, listHref } from "@/lib/deadline-list-href";
import type { CourseOption } from "./form";

const ALL = "all"; // Radix Select items can't have an empty value

export function CourseFilter({ courses, value, kind, status }: { courses: CourseOption[]; value: string | null; kind: ListKind; status: ListStatus }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="course-filter" className="text-sm font-medium">Course</label>
      <Select value={value ?? ALL} onValueChange={(v) => router.push(listHref(kind, { status, course: v === ALL ? null : v }))}>
        <SelectTrigger id="course-filter" className="min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Courses</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span aria-hidden="true" className={`size-3 rounded-full ${COLOUR_BG[c.colour]}`} />
              {c.code} {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
