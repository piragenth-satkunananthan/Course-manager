import { ChevronLeft, ChevronRight, CalendarX } from "lucide-react";
import Link from "next/link";
import { DeadlineItem } from "@/components/app/deadline-item";
import { EmptyState } from "@/components/app/empty-state";
import type { CourseOption } from "@/components/app/form";
import { AddExtraClass, SessionItem } from "@/components/app/occurrence";
import { type View, ViewSwitch } from "@/components/app/view-switch";
import { WeekGrid } from "@/components/app/week-grid";
import { occurrenceKey } from "@/lib/occurrence-key";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { listDeadlinesIn } from "@/server/data/assessments";
import { listCourseOptions } from "@/server/data/courses";
import { getOccurrences } from "@/server/data/timetable";
import { isHappeningNow } from "@/server/domain/occurrences";
import { addDays, todayIn, weekdayOf } from "@/server/domain/time";
import { requireStudentId } from "@/server/session";
import { IsoDate } from "@/shared/schemas/common";
import type { Deadline } from "@/shared/schemas/dashboard";
import type { Occurrence } from "@/shared/schemas/timetable";

const nav = "inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted md:size-10";
const monday = (d: string) => addDays(d, 1 - weekdayOf(d));
const dayHref = (date: string) => `/timetable?date=${date}`;
const weekHref = (week: string) => `/timetable?view=week&week=${week}`;

function Pager({ label, prev, next, prevLabel, nextLabel, home, homeLabel, current }: { label: string; prev: string; next: string; prevLabel: string; nextLabel: string; home: string; homeLabel: string; current: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <Link href={prev} aria-label={prevLabel} title={prevLabel} className={nav}>
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      <p className="min-w-0 flex-1 text-center font-semibold sm:flex-none sm:min-w-32" aria-live="polite">{label}</p>
      <Link href={next} aria-label={nextLabel} title={nextLabel} className={nav}>
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      <Button asChild variant="outline" className="ml-auto">
        <Link href={home} aria-current={current ? "date" : undefined}>{homeLabel}</Link>
      </Button>
    </div>
  );
}

/** The day list (design-system §6.7): that day's classes, then what's due. */
function DayList({ date, today, occurrences, deadlines, courses }: { date: string; today: string; occurrences: Occurrence[]; deadlines: Deadline[]; courses: CourseOption[] }) {
  const now = new Date();
  return (
    <>
      <Pager
        label={date === today ? `Today · ${formatDate(date)}` : formatDate(date)}
        prev={dayHref(addDays(date, -1))} prevLabel="Previous day" next={dayHref(addDays(date, 1))} nextLabel="Next day"
        home={dayHref(today)} homeLabel="Today" current={date === today}
      />
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

// The timetable (design-system §7.4): the day list everywhere, and from 1024 px the week grid (#19). Month: #20.
export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; week?: string }> }) {
  const studentId = await requireStudentId();
  const today = todayIn();
  const q = await searchParams;
  const view: View = q.view === "week" ? "week" : "day";
  const valid = (d?: string) => (IsoDate.safeParse(d).success ? d! : null);

  if (view === "day") {
    const date = valid(q.date) ?? today;
    const [occurrences, deadlines, courses] = await Promise.all([getOccurrences(studentId, date, date), listDeadlinesIn(studentId, date, date), listCourseOptions(studentId)]);
    return (
      <>
        <Header courses={courses} date={date} view="day" hrefs={{ day: dayHref(date), week: weekHref(monday(date)) }} />
        <DayList date={date} today={today} occurrences={occurrences} deadlines={deadlines} courses={courses} />
      </>
    );
  }

  const week = monday(valid(q.week) ?? today); // any date in the URL means its week
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const focus = days.includes(today) ? today : week; // the day shown below 1024 px
  const [occurrences, deadlines, courses] = await Promise.all([getOccurrences(studentId, week, days[6]!), listDeadlinesIn(studentId, week, days[6]!), listCourseOptions(studentId)]);
  const thisWeek = monday(today);
  return (
    <>
      <Header courses={courses} date={focus} view="week" hrefs={{ day: dayHref(focus), week: weekHref(week) }} />
      <div className="max-lg:hidden">
        <Pager
          label={`${formatDate(week, { weekday: false })} – ${formatDate(days[6]!, { weekday: false, year: true })}`}
          prev={weekHref(addDays(week, -7))} prevLabel="Previous week" next={weekHref(addDays(week, 7))} nextLabel="Next week"
          home={weekHref(thisWeek)} homeLabel="This week" current={week === thisWeek}
        />
        <WeekGrid days={days} occurrences={occurrences} deadlines={deadlines} today={today} courses={courses} />
      </div>
      {/* Under 1024 px there's no week grid: the day list instead (design-system §1). */}
      <div className="lg:hidden">
        <DayList
          date={focus} today={today} courses={courses}
          occurrences={occurrences.filter((o) => o.date === focus)}
          deadlines={deadlines.filter((d) => (d.type === "assignment" ? d.item.dueDate : d.item.date) === focus)}
        />
      </div>
    </>
  );
}

function Header({ courses, date, view, hrefs }: { courses: CourseOption[]; date: string; view: View; hrefs: Record<View, string> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold md:text-display">Timetable</h1>
      <div className="flex flex-wrap items-center gap-2">
        <ViewSwitch view={view} hrefs={hrefs} />
        {courses.length > 0 && <AddExtraClass courses={courses} date={date} />}
      </div>
    </div>
  );
}
