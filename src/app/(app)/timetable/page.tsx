import { ChevronLeft, ChevronRight, CalendarX } from "lucide-react";
import Link from "next/link";
import { DeadlineItem } from "@/components/app/deadline-item";
import { EmptyState } from "@/components/app/empty-state";
import { AddExtraClass, SessionItem } from "@/components/app/occurrence";
import { occurrenceKey } from "@/lib/occurrence-key";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { listDeadlinesOn } from "@/server/data/assessments";
import { listCourseOptions } from "@/server/data/courses";
import { getOccurrences } from "@/server/data/timetable";
import { isHappeningNow } from "@/server/domain/occurrences";
import { addDays, todayIn } from "@/server/domain/time";
import { requireStudentId } from "@/server/session";
import { IsoDate } from "@/shared/schemas/common";

// The day list (design-system §6.7, §7.4): M1a shows Day only; Week and Month arrive in M1b.
export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const studentId = await requireStudentId();
  const today = todayIn();
  const wanted = (await searchParams).date;
  const date = IsoDate.safeParse(wanted).success ? wanted! : today;
  const [occurrences, deadlines, courses] = await Promise.all([getOccurrences(studentId, date, date), listDeadlinesOn(studentId, date), listCourseOptions(studentId)]);
  const now = new Date();
  const nav = "inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted md:size-10";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-display">Timetable</h1>
        {courses.length > 0 && <AddExtraClass courses={courses} date={date} />}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Link href={`/timetable?date=${addDays(date, -1)}`} aria-label="Previous day" title="Previous day" className={nav}>
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <p className="min-w-0 flex-1 text-center font-semibold sm:flex-none sm:min-w-32" aria-live="polite">
          {date === today ? `Today · ${formatDate(date)}` : formatDate(date)}
        </p>
        <Link href={`/timetable?date=${addDays(date, 1)}`} aria-label="Next day" title="Next day" className={nav}>
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
        </Link>
        <Button asChild variant="outline" className="ml-auto">
          <Link href={`/timetable?date=${today}`} aria-current={date === today ? "date" : undefined}>Today</Link>
        </Button>
      </div>

      <section aria-label={`Classes on ${formatDate(date)}`} className="mt-4">
        {occurrences.length === 0 ? (
          <EmptyState icon={CalendarX}>No classes on {formatDate(date)}.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {occurrences.map((o) => (
              <SessionItem key={occurrenceKey(o)} o={o} now={isHappeningNow(o, now)} />
            ))}
          </ul>
        )}
      </section>

      {deadlines.length > 0 && (
        <section aria-labelledby="due-heading" className="mt-6">
          <h2 id="due-heading" className="text-title font-semibold">Due</h2>
          <ul className="mt-2 space-y-2">
            {deadlines.map((d) => (
              <DeadlineItem key={d.item.id} deadline={d} today={today} tomorrow={addDays(today, 1)} courses={courses} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
