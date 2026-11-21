import { BookPlus, CalendarCheck, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { AddMenu } from "@/components/app/add-menu";
import { DeadlineItem } from "@/components/app/deadline-item";
import { EmptyState } from "@/components/app/empty-state";
import { SessionItem } from "@/components/app/occurrence";
import { Button } from "@/components/ui/button";
import { dayLabel, formatDate } from "@/lib/format";
import { listCourseOptions } from "@/server/data/courses";
import { getDashboard } from "@/server/data/dashboard";
import { isHappeningNow } from "@/server/domain/occurrences";
import { addDays, todayIn } from "@/server/domain/time";
import { requireStudentId } from "@/server/session";
import type { Deadline } from "@/shared/schemas/dashboard";

const localDate = (d: Deadline) => (d.type === "assignment" ? d.item.dueDate : d.item.date!);

// The dashboard (design-system §7.1), fixed order: Overdue → Today → Due soon → TBA Exams.
// Check these and Recent changes (#12), and banners (#10, #11) join later.
export default async function DashboardPage() {
  const studentId = await requireStudentId();
  const [courses, dashboard] = await Promise.all([listCourseOptions(studentId), getDashboard(studentId)]);
  const today = todayIn();
  const tomorrow = addDays(today, 1);
  const item = { today, tomorrow, courses };

  if (courses.length === 0)
    return (
      <>
        <h1 className="text-2xl font-bold md:text-display">Dashboard</h1>
        <EmptyState
          icon={BookPlus}
          action={
            <>
              <Button asChild>
                <Link href="/courses">Add Course</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings#whatsapp">
                  <LinkIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                  Link WhatsApp
                </Link>
              </Button>
            </>
          }
        >
          Add your Courses and the Deadlines you already know about.
        </EmptyState>
      </>
    );

  const byDay = Map.groupBy(dashboard.upcoming, localDate);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-display">Dashboard</h1>
        <AddMenu courses={courses} />
      </div>

      {dashboard.overdue.length > 0 && (
        <section aria-labelledby="overdue-heading" className="mt-6">
          <h2 id="overdue-heading" className="text-title font-semibold">
            Overdue <span className="text-destructive">({dashboard.overdue.length})</span>
          </h2>
          <ul className="mt-2 space-y-2">
            {dashboard.overdue.map((d) => (
              <DeadlineItem key={d.item.id} deadline={d} overdue {...item} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="today-heading" className="mt-6">
        <h2 id="today-heading" className="text-title font-semibold">Today · {formatDate(today)}</h2>
        {dashboard.todaySessions.length === 0 ? (
          <p className="mt-2 text-muted-foreground">No classes today.</p>
        ) : (
          <ul className="mt-2 space-y-2" aria-label="Today's classes">
            {dashboard.todaySessions.map((o) => (
              <SessionItem key={`${o.classSessionId ?? o.sessionChangeId}-${o.date}`} o={o} now={isHappeningNow(o, new Date())} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="soon-heading" className="mt-6">
        <h2 id="soon-heading" className="text-title font-semibold">Due soon (next 14 days)</h2>
        {byDay.size === 0 ? (
          <EmptyState icon={CalendarCheck}>Nothing due in the next 14 days.</EmptyState>
        ) : (
          [...byDay].map(([date, deadlines]) => (
            <div key={date} className="mt-3">
              <h3 className="sticky top-0 z-10 bg-background py-1 text-sm font-semibold text-muted-foreground">{dayLabel(date, today)}</h3>
              <ul className="mt-1 space-y-2">
                {deadlines.map((d) => (
                  <DeadlineItem key={d.item.id} deadline={d} {...item} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {dashboard.tbaExams.length > 0 && (
        <details className="mt-6">
          <summary className="flex min-h-11 cursor-pointer items-center text-title font-semibold">Exams with date TBA ({dashboard.tbaExams.length})</summary>
          <ul className="mt-2 space-y-2">
            {dashboard.tbaExams.map((e) => (
              <DeadlineItem key={e.id} deadline={{ type: "exam", item: e }} {...item} />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
