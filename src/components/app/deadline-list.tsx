// The Deadlines lists (design-system §7.3, #21): /assignments and /exams, with the Assignments | Exams switch, the
// status and Course filters in the URL, and the groups Overdue, This week, Later, Date TBA and Earlier.
import { BookOpen, CalendarCheck, ListChecks } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { groupDeadlines } from "@/lib/deadline-groups";
import { addDays, todayIn } from "@/server/domain/time";
import type { Deadline } from "@/shared/schemas/dashboard";
import { AddMenu } from "./add-menu";
import { CourseFilter } from "./course-filter";
import { DeadlineItem } from "./deadline-item";
import { EmptyState } from "./empty-state";
import type { CourseOption } from "./form";
import { Segmented } from "./segmented";

export type ListKind = "assignments" | "exams";
export type Status = "todo" | "submitted";

/** The list's URL with these filters; the defaults (To do, all Courses) are left out. */
export const listHref = (kind: ListKind, f: { status?: Status; course?: string | null }) => {
  const q = new URLSearchParams();
  if (kind === "assignments" && f.status === "submitted") q.set("status", "submitted");
  if (f.course) q.set("course", f.course);
  return `/${kind}${q.size ? `?${q}` : ""}`;
};

const GROUPS = [
  ["overdue", "Overdue"],
  ["thisWeek", "This week"],
  ["later", "Later"],
  ["tba", "Date TBA"],
  ["earlier", "Earlier"],
] as const;

type Props = { kind: ListKind; status: Status; course: string | null; courses: CourseOption[]; items: Deadline[] };

export function DeadlineList({ kind, status, course, courses, items }: Props) {
  const now = new Date();
  const today = todayIn(now);
  const groups = groupDeadlines(items, now, today);
  const courseName = courses.find((c) => c.id === course)?.code;
  const noun = kind === "assignments" ? (status === "submitted" ? "submitted Assignments" : "Assignments to do") : "Exams";
  const hrefFor = Object.fromEntries([["all", listHref(kind, { status })], ...courses.map((c) => [c.id, listHref(kind, { status, course: c.id })])]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-display">Deadlines</h1>
        {courses.length > 0 && <AddMenu courses={courses} />}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Segmented
          label="Deadlines"
          value={kind}
          options={[
            { value: "assignments", label: "Assignments", href: listHref("assignments", { course }) },
            { value: "exams", label: "Exams", href: listHref("exams", { course }) },
          ]}
        />
        {kind === "assignments" && (
          <Segmented
            label="Status"
            value={status}
            options={[
              { value: "todo", label: "To do", href: listHref(kind, { status: "todo", course }) },
              { value: "submitted", label: "Submitted", href: listHref(kind, { status: "submitted", course }) },
            ]}
          />
        )}
        {courses.length > 0 && <CourseFilter courses={courses} value={course} hrefFor={hrefFor} />}
      </div>

      {courses.length === 0 ? (
        <EmptyState icon={BookOpen} action={<Button asChild><Link href="/courses">Add a Course</Link></Button>}>
          No Courses yet. Assignments and Exams belong to a Course, so add one first.
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={kind === "exams" ? CalendarCheck : ListChecks} action={status === "todo" && <AddMenu courses={courses} />}>
          {course ? `No ${noun} for ${courseName}.` : `No ${noun}.`}{" "}
          {status === "submitted" ? "Assignments you mark Submitted show here." : "New ones from your WhatsApp groups, or ones you add, show here."}
        </EmptyState>
      ) : (
        GROUPS.map(([key, title]) =>
          groups[key].length ? (
            <section key={key} aria-labelledby={`group-${key}`} className="mt-6">
              <h2 id={`group-${key}`} className={`text-title font-semibold ${key === "overdue" ? "text-destructive" : ""}`}>
                {title} <span className="text-muted-foreground">({groups[key].length})</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {groups[key].map((d) => (
                  <DeadlineItem key={`${d.type}-${d.item.id}`} deadline={d} overdue={key === "overdue"} today={today} tomorrow={addDays(today, 1)} courses={courses} />
                ))}
              </ul>
            </section>
          ) : null,
        )
      )}
    </>
  );
}
